import { NextResponse } from "next/server";
import { products } from "@/data/products";
import {
  generateAlertManagementToken,
  hashAlertManagementToken,
} from "@/lib/alertManagementToken";
import { sendAlertConfirmationEmail } from "@/services/brevoTransactionalEmail";
import { getSupabaseServerClient } from "@/services/supabaseServer";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invalidAlertResponse() {
  return NextResponse.json(
    { message: "I dati dell'alert non sono validi." },
    { status: 400 }
  );
}

function saveErrorResponse() {
  return NextResponse.json(
    { message: "Non è stato possibile attivare l'alert. Riprova." },
    { status: 500 }
  );
}

function alertAlreadyExistsResponse() {
  return NextResponse.json(
    {
      success: true,
      alreadyExists: true,
      confirmationEmailSent: false,
    },
    { status: 200 }
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
    body = await request.json();
  } catch {
    return invalidAlertResponse();
  }

  if (!body || typeof body !== "object") {
    return invalidAlertResponse();
  }

  const { productId, email, targetPrice } = body as Record<string, unknown>;

  if (
    typeof productId !== "string" ||
    typeof email !== "string" ||
    typeof targetPrice !== "number" ||
    !Number.isFinite(targetPrice)
  ) {
    return invalidAlertResponse();
  }

  const normalizedProductId = productId.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const product = products.find((item) => item.id === normalizedProductId);

  if (
    !product ||
    !EMAIL_PATTERN.test(normalizedEmail) ||
    targetPrice <= 0 ||
    targetPrice >= product.currentPrice
  ) {
    return invalidAlertResponse();
  }

  const managementToken = generateAlertManagementToken();
  const managementTokenHash = hashAlertManagementToken(managementToken);

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("price_alerts").insert({
      product_id: product.id,
      product_title: product.title,
      email: normalizedEmail,
      target_price: targetPrice,
      current_price: product.currentPrice,
      manage_token_hash: managementTokenHash,
    });

    if (error?.code === "23505") {
      return alertAlreadyExistsResponse();
    }

    if (error) {
      return saveErrorResponse();
    }
  } catch {
    return saveErrorResponse();
  }

  let confirmationEmailSent = false;
  const managementUrl = `${getManagementOrigin(request)}/alert/${encodeURIComponent(
    managementToken
  )}`;

  try {
    await sendAlertConfirmationEmail({
      recipientEmail: normalizedEmail,
      productName: product.title,
      currentPrice: product.currentPrice,
      targetPrice,
      managementUrl,
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
      message: confirmationEmailSent
        ? "Alert registrato ed email di conferma inviata correttamente."
        : "Alert registrato correttamente. Non siamo riusciti a inviare l'email di conferma.",
      confirmationEmailSent,
    },
    { status: 201 }
  );
}
