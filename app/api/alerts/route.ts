import { NextResponse } from "next/server";

import {
  buildPendingPriceAlertInsert,
  normalizePriceAlertEmail,
  PRICE_ALERT_PENDING_STATUS,
  PRICE_ALERT_TARGET_NOTIFIED_STATUS,
  resolveTrustedAffarioPriceAlert,
  type PriceAlertPersistenceStatus,
} from "@/lib/affarioPriceAlert";
import { createAbuseRateLimitFailureResponse } from "@/lib/abuseRateLimitResponse";
import {
  generateAlertManagementToken,
  hashAlertManagementToken,
} from "@/lib/alertManagementToken";
import {
  API_NO_STORE_HEADERS,
  JsonRequestBodyError,
  readJsonRequestBody,
} from "@/lib/jsonRequestBody";
import { preparePendingPriceAlertResend } from "@/lib/pendingPriceAlertResend";
import {
  ABUSE_RATE_LIMIT_POLICIES,
  executeWithAbuseRateLimits,
} from "@/services/abuseRateLimit";
import { buildAffarioProductAdvice } from "@/services/affarioProductAdvice";
import {
  AffarioProductLookupError,
  getAffarioProductByAsin,
} from "@/services/affarioProductLookup";
import { sendAlertConfirmationEmail } from "@/services/brevoTransactionalEmail";
import {
  KeepaClientError,
  normalizeKeepaAsin,
} from "@/services/keepaClient";
import {
  getKeepaRetryAfterSeconds,
  TEMPORARY_PRODUCT_DATA_MESSAGE,
} from "@/services/keepaTemporaryUnavailable";
import { getSupabaseServerClient } from "@/services/supabaseServer";

type AlertErrorCode =
  | "INVALID_ALERT"
  | "ALERT_NOT_AVAILABLE"
  | "PRODUCT_UNAVAILABLE"
  | "SAVE_FAILED";

function errorResponse(
  code: AlertErrorCode,
  message: string,
  status: number,
  retryAfterSeconds?: number
) {
  return NextResponse.json(
    { error: { code, message } },
    {
      status,
      headers: {
        ...API_NO_STORE_HEADERS,
        ...(retryAfterSeconds === undefined
          ? {}
          : { "Retry-After": String(retryAfterSeconds) }),
      },
    }
  );
}

function invalidAlertResponse() {
  return errorResponse(
    "INVALID_ALERT",
    "I dati dell'alert non sono validi.",
    400
  );
}

function saveErrorResponse() {
  return errorResponse(
    "SAVE_FAILED",
    "Non è stato possibile creare l'alert. Riprova.",
    500
  );
}

function alertAlreadyExistsResponse(
  alertStatus: PriceAlertPersistenceStatus,
  retryAfterSeconds?: number
) {
  return NextResponse.json(
    {
      success: true,
      alreadyExists: true,
      confirmationEmailSent: false,
      alertStatus,
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    },
    {
      headers: {
        ...API_NO_STORE_HEADERS,
        ...(retryAfterSeconds === undefined
          ? {}
          : { "Retry-After": String(retryAfterSeconds) }),
      },
    }
  );
}

function getManagementOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const localHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);

  return localHostnames.has(requestUrl.hostname)
    ? requestUrl.origin
    : "https://affario.it";
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await readJsonRequestBody(request);
  } catch (error) {
    if (
      error instanceof JsonRequestBodyError &&
      error.code === "PAYLOAD_TOO_LARGE"
    ) {
      return errorResponse(
        "INVALID_ALERT",
        "I dati dell'alert non sono validi.",
        413
      );
    }

    return invalidAlertResponse();
  }

  if (!body || typeof body !== "object") {
    return invalidAlertResponse();
  }

  const { asin, email } = body as Record<string, unknown>;
  const normalizedEmail = normalizePriceAlertEmail(email);
  let exactAsin: string;

  if (typeof asin !== "string" || normalizedEmail === null) {
    return invalidAlertResponse();
  }

  try {
    exactAsin = normalizeKeepaAsin(asin);
  } catch {
    return invalidAlertResponse();
  }

  const execution = await executeWithAbuseRateLimits(
    request,
    [
      {
        policy: ABUSE_RATE_LIMIT_POLICIES.ALERT_CLIENT,
        subject: { domain: "client" },
      },
      {
        policy: ABUSE_RATE_LIMIT_POLICIES.ALERT_EMAIL,
        subject: { domain: "email", value: normalizedEmail },
      },
    ],
    () => createPriceAlert(request, exactAsin, normalizedEmail)
  );

  if (execution.status !== "completed") {
    return createAbuseRateLimitFailureResponse(execution);
  }

  return execution.value;
}

async function createPriceAlert(
  request: Request,
  exactAsin: string,
  normalizedEmail: string
) {
  let trustedAlert;

  try {
    const result = await getAffarioProductByAsin(exactAsin);
    const advice = buildAffarioProductAdvice(result);

    trustedAlert = resolveTrustedAffarioPriceAlert({
      exactAsin: result.asin,
      productTitle: result.product.title,
      recommendation: advice.recommendation,
      currentPrice: result.buyBox.currentIncludingShippingInEuros,
      savingsPotential: result.potentialSavingsAnalysis.savingsPotential,
    });
  } catch (error) {
    if (error instanceof KeepaClientError && error.code === "OUT_OF_TOKENS") {
      return errorResponse(
        "PRODUCT_UNAVAILABLE",
        TEMPORARY_PRODUCT_DATA_MESSAGE,
        503,
        getKeepaRetryAfterSeconds(error)
      );
    }

    if (
      error instanceof KeepaClientError ||
      error instanceof AffarioProductLookupError
    ) {
      return errorResponse(
        "PRODUCT_UNAVAILABLE",
        "Non è stato possibile verificare il prodotto. Riprova.",
        503
      );
    }

    console.error("Verifica server-side alert AFFARIO fallita.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse(
      "PRODUCT_UNAVAILABLE",
      "Non è stato possibile verificare il prodotto. Riprova.",
      500
    );
  }

  if (!trustedAlert) {
    return errorResponse(
      "ALERT_NOT_AVAILABLE",
      "AFFARIO non dispone di un prezzo obiettivo affidabile per questo alert.",
      409
    );
  }

  const managementToken = generateAlertManagementToken();
  const managementTokenHash = hashAlertManagementToken(managementToken);
  let confirmationToken = managementToken;
  let alreadyExists = false;
  const confirmationRequestedAt = new Date().toISOString();

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("price_alerts")
      .insert(
        buildPendingPriceAlertInsert(
          trustedAlert,
          normalizedEmail,
          managementTokenHash,
          confirmationRequestedAt
        )
      );

    if (error?.code === "23505") {
      const { data: existingAlert, error: existingAlertError } = await supabase
        .from("price_alerts")
        .select("status, confirmation_requested_at, manage_token_hash")
        .eq("product_id", trustedAlert.exactAsin)
        .eq("email", normalizedEmail)
        .eq("target_price", trustedAlert.targetPrice)
        .maybeSingle<{
          status: string | null;
          confirmation_requested_at: string | null;
          manage_token_hash: string | null;
        }>();

      if (existingAlertError || !existingAlert) {
        return saveErrorResponse();
      }

      const duplicateResult = await preparePendingPriceAlertResend({
        existingAlert: {
          status: existingAlert.status,
          confirmationRequestedAt:
            existingAlert.confirmation_requested_at,
          manageTokenHash: existingAlert.manage_token_hash,
        },
        newConfirmationToken: managementToken,
        newTokenHash: managementTokenHash,
        store: {
          async rotatePendingToken(rotation) {
            let rotationQuery = supabase
              .from("price_alerts")
              .update({
                manage_token_hash: rotation.newTokenHash,
                confirmation_requested_at: rotation.requestedAt,
              })
              .eq("product_id", trustedAlert.exactAsin)
              .eq("email", normalizedEmail)
              .eq("target_price", trustedAlert.targetPrice)
              .eq("status", PRICE_ALERT_PENDING_STATUS)
              .eq("manage_token_hash", rotation.expectedTokenHash);

            rotationQuery =
              rotation.expectedConfirmationRequestedAt === null
                ? rotationQuery.is("confirmation_requested_at", null)
                : rotationQuery
                    .eq(
                      "confirmation_requested_at",
                      rotation.expectedConfirmationRequestedAt
                    )
                    .lte(
                      "confirmation_requested_at",
                      rotation.eligibleBefore
                    );

            const { data, error: rotationError } = await rotationQuery
              .select("manage_token_hash")
              .maybeSingle<{ manage_token_hash: string }>();

            if (rotationError) {
              throw rotationError;
            }

            return data !== null;
          },
        },
      });

      if (duplicateResult.status === "active") {
        return alertAlreadyExistsResponse("active");
      }

      if (duplicateResult.status === "target-notified") {
        return alertAlreadyExistsResponse(
          PRICE_ALERT_TARGET_NOTIFIED_STATUS
        );
      }

      if (duplicateResult.status === "cooldown") {
        return alertAlreadyExistsResponse(
          PRICE_ALERT_PENDING_STATUS,
          duplicateResult.retryAfterSeconds
        );
      }

      if (duplicateResult.status === "invalid") {
        return saveErrorResponse();
      }

      alreadyExists = true;
      confirmationToken = duplicateResult.confirmationToken;
    }

    if (error && error.code !== "23505") {
      return saveErrorResponse();
    }
  } catch {
    return saveErrorResponse();
  }

  const confirmationUrl = `${getManagementOrigin(request)}/alert/${encodeURIComponent(
    confirmationToken
  )}`;
  let confirmationEmailSent = false;

  try {
    await sendAlertConfirmationEmail({
      recipientEmail: normalizedEmail,
      productName: trustedAlert.productTitle,
      currentPrice: trustedAlert.currentPrice,
      targetPrice: trustedAlert.targetPrice,
      confirmationUrl,
    });
    confirmationEmailSent = true;
  } catch (error) {
    console.error(
      "Invio email di conferma Brevo fallito.",
      error instanceof Error ? error.message : "Errore sconosciuto"
    );
  }

  return NextResponse.json(
    {
      success: true,
      alreadyExists,
      confirmationEmailSent,
      alertStatus: PRICE_ALERT_PENDING_STATUS,
    },
    {
      status: alreadyExists ? 200 : 201,
      headers: API_NO_STORE_HEADERS,
    }
  );
}
