import { NextResponse } from "next/server";

import { createAbuseRateLimitFailureResponse } from "@/lib/abuseRateLimitResponse";
import { API_NO_STORE_HEADERS } from "@/lib/jsonRequestBody";
import {
  ABUSE_RATE_LIMIT_POLICIES,
  executeWithAbuseRateLimits,
} from "@/services/abuseRateLimit";
import {
  AffarioProductLookupError,
  getAffarioProductByAsin,
} from "@/services/affarioProductLookup";
import { buildAffarioProductAdvice } from "@/services/affarioProductAdvice";
import {
  KeepaClientError,
  normalizeKeepaAsin,
} from "@/services/keepaClient";
import {
  getKeepaRetryAfterSeconds,
  TEMPORARY_PRODUCT_DATA_MESSAGE,
} from "@/services/keepaTemporaryUnavailable";
import type { AffarioAdvice } from "@/types/affarioAdvice";
import type { AffarioSavingsPotential } from "@/types/productAnalysis";

type ProductRouteContext = {
  params: Promise<{ asin: string }>;
};

export type AffarioProductApiErrorCode =
  | "INVALID_ASIN"
  | "PRODUCT_NOT_FOUND"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type AffarioProductApiErrorResponse = {
  error: {
    code: AffarioProductApiErrorCode;
    message: string;
  };
};

export type AffarioProductApiResponse = {
  data: {
    asin: string;
    title: string;
    brand: string | null;
    model: string | null;
    imageUrl: string | null;
    color: string | null;
    size: string | null;
    parentAsin: string | null;
    buyBox: {
      status: "AVAILABLE" | "UNAVAILABLE";
      currentPrice: number | null;
      price: number | null;
      shipping: number | null;
      total: number | null;
      currency: string;
      availabilityMessage: string | null;
      isAmazon: boolean | null;
      isFBA: boolean | null;
      isPrimeEligible: boolean | null;
    };
    lastBuyBoxUpdate: string | null;
    priceHistory90Days: {
      averageBuyBoxPrice: number | null;
      minimumBuyBoxPrice: number | null;
      minimumBuyBoxPriceAt: string | null;
      currency: string;
    };
    advice: AffarioAdvice;
    savingsPotential: AffarioSavingsPotential;
  };
};

function errorResponse(
  code: AffarioProductApiErrorCode,
  message: string,
  status: number,
  retryAfterSeconds?: number
): NextResponse<AffarioProductApiErrorResponse> {
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

function logUnexpectedError(error: unknown): void {
  console.error("Lookup prodotto AFFARIO fallita.", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
}

function mapError(error: unknown): NextResponse<AffarioProductApiErrorResponse> {
  if (error instanceof KeepaClientError) {
    if (error.code === "OUT_OF_TOKENS") {
      return errorResponse(
        "UPSTREAM_UNAVAILABLE",
        TEMPORARY_PRODUCT_DATA_MESSAGE,
        503,
        getKeepaRetryAfterSeconds(error)
      );
    }

    if (error.code === "INVALID_ASIN") {
      return errorResponse(
        "INVALID_ASIN",
        "L'ASIN deve contenere 10 caratteri alfanumerici.",
        400
      );
    }

    if (error.code === "PRODUCT_NOT_FOUND") {
      return errorResponse(
        "PRODUCT_NOT_FOUND",
        "Prodotto non trovato.",
        404
      );
    }

    if (error.code === "INVALID_RESPONSE") {
      return errorResponse(
        "UPSTREAM_UNAVAILABLE",
        "Il servizio prodotto non e temporaneamente disponibile.",
        502
      );
    }

    return errorResponse(
      "UPSTREAM_UNAVAILABLE",
      "Il servizio prodotto non e temporaneamente disponibile.",
      503
    );
  }

  if (error instanceof AffarioProductLookupError) {
    return errorResponse(
      "UPSTREAM_UNAVAILABLE",
      "Il servizio prodotto non e temporaneamente disponibile.",
      503
    );
  }

  logUnexpectedError(error);
  return errorResponse(
    "INTERNAL_ERROR",
    "Non e stato possibile recuperare il prodotto.",
    500
  );
}

export async function GET(
  request: Request,
  context: ProductRouteContext
) {
  const { asin } = await context.params;
  let normalizedAsin: string;

  try {
    normalizedAsin = normalizeKeepaAsin(asin);
  } catch (error) {
    return mapError(error);
  }

  const execution = await executeWithAbuseRateLimits(
    request,
    [
      {
        policy: ABUSE_RATE_LIMIT_POLICIES.PRODUCT_CLIENT,
        subject: { domain: "client" },
      },
    ],
    async () => {
      try {
        const result = await getAffarioProductByAsin(normalizedAsin);
        const currentPrice =
          result.buyBox.currentIncludingShippingInEuros;
        const advice = buildAffarioProductAdvice(result);

        return NextResponse.json(
          {
            data: {
              asin: result.asin,
              title: result.product.title,
              brand: result.product.brand,
              model: result.product.model,
              imageUrl: result.product.imageUrl,
              color: result.product.color,
              size: result.product.size,
              parentAsin: result.product.parentAsin,
              buyBox: {
                status:
                  currentPrice === null ? "UNAVAILABLE" : "AVAILABLE",
                currentPrice,
                price: result.buyBox.priceInEuros,
                shipping: result.buyBox.shippingInEuros,
                total: result.buyBox.totalInEuros,
                currency: result.currency,
                availabilityMessage: result.buyBox.availabilityMessage,
                isAmazon: result.buyBox.isAmazon,
                isFBA: result.buyBox.isFBA,
                isPrimeEligible: result.buyBox.isPrimeEligible,
              },
              lastBuyBoxUpdate: result.lastBuyBoxUpdate,
              priceHistory90Days: {
                averageBuyBoxPrice: result.buyBox90Days.averageInEuros,
                minimumBuyBoxPrice: result.buyBox90Days.minimumInEuros,
                minimumBuyBoxPriceAt:
                  result.buyBox90Days.minimumObservedAt,
                currency: result.currency,
              },
              advice,
              savingsPotential:
                result.potentialSavingsAnalysis.savingsPotential,
            },
          },
          { headers: API_NO_STORE_HEADERS }
        );
      } catch (error) {
        return mapError(error);
      }
    }
  );

  if (execution.status !== "completed") {
    return createAbuseRateLimitFailureResponse(execution);
  }

  return execution.value;
}
