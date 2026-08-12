import { NextResponse } from "next/server";
import { products } from "@/data/products";
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

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("price_alerts").insert({
      product_id: product.id,
      product_title: product.title,
      email: normalizedEmail,
      target_price: targetPrice,
      current_price: product.currentPrice,
    });

    if (error) {
      return saveErrorResponse();
    }
  } catch {
    return saveErrorResponse();
  }

  let confirmationEmailSent = false;

  try {
    await sendAlertConfirmationEmail({
      recipientEmail: normalizedEmail,
      productName: product.title,
      currentPrice: product.currentPrice,
      targetPrice,
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
