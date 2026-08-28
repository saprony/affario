export type TargetPriceAlertEmailDetails = {
  productName: string;
  currentPrice: number;
  targetPrice: number;
  amazonUrl: string;
};

export type TargetPriceAlertEmailMessage = {
  subject: string;
  htmlContent: string;
  textContent: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function validatePrice(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} deve essere maggiore di zero.`);
  }
}

export function buildTargetPriceAlertEmailMessage({
  productName,
  currentPrice,
  targetPrice,
  amazonUrl,
}: TargetPriceAlertEmailDetails): TargetPriceAlertEmailMessage {
  validatePrice(currentPrice, "currentPrice");
  validatePrice(targetPrice, "targetPrice");

  if (!productName.trim() || !amazonUrl.trim()) {
    throw new Error("Prodotto e URL Amazon sono obbligatori.");
  }

  const safeProductName = escapeHtml(productName.trim());
  const safeAmazonUrl = escapeHtml(amazonUrl);
  const formattedCurrentPrice = formatPrice(currentPrice);
  const formattedTargetPrice = formatPrice(targetPrice);
  const saving = targetPrice - currentPrice;
  const savingHtml =
    saving > 0
      ? `<p style="margin:18px 0 0;font-size:14px;color:#4b5563;">Differenza sotto il target</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#166534;">${formatPrice(saving)}</p>`
      : "";
  const savingText =
    saving > 0
      ? `\nDifferenza sotto il target: ${formatPrice(saving)}`
      : "";

  return {
    subject: `Il prezzo che aspettavi è arrivato — ${productName.trim()}`,
    htmlContent: `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Il prezzo che aspettavi è arrivato</title>
  </head>
  <body style="margin:0;background-color:#f3f4f6;color:#111827;font-family:Arial,sans-serif;">
    <div style="padding:24px 12px;">
      <div style="max-width:600px;margin:0 auto;overflow:hidden;border-radius:16px;background-color:#ffffff;">
        <div style="background-color:#166534;padding:22px 24px;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:0.04em;">
          AFFARIO
        </div>
        <div style="padding:28px 24px;">
          <h1 style="margin:0;font-size:26px;line-height:1.25;color:#111827;">
            Il prezzo che aspettavi è arrivato
          </h1>
          <p style="margin:20px 0 0;font-size:16px;line-height:1.6;">
            AFFARIO ha rilevato che questa variante ha raggiunto o superato in meglio il tuo Prezzo Obiettivo.
          </p>

          <div style="margin-top:24px;border:1px solid #d1d5db;border-radius:12px;padding:18px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;color:#6b7280;">Prodotto</p>
            <p style="margin:0;font-size:18px;font-weight:700;line-height:1.4;">${safeProductName}</p>
            <p style="margin:18px 0 0;font-size:14px;color:#4b5563;">Prezzo attuale rilevato</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:700;">${formattedCurrentPrice}</p>
            <p style="margin:18px 0 0;font-size:14px;color:#4b5563;">Prezzo Obiettivo AFFARIO</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#166534;">${formattedTargetPrice}</p>
            ${savingHtml}
          </div>

          <p style="margin:24px 0 0;">
            <a href="${safeAmazonUrl}" style="display:inline-block;border-radius:10px;background-color:#166534;padding:12px 18px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Vedi questa variante su Amazon</a>
          </p>
          <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#6b7280;">
            I prezzi possono cambiare rapidamente.
          </p>
          <p style="margin:26px 0 0;border-top:1px solid #e5e7eb;padding-top:18px;font-size:12px;line-height:1.5;color:#6b7280;">
            Hai ricevuto questa email perché hai attivato questo alert prezzo su AFFARIO. Non è una newsletter né una comunicazione di marketing.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`,
    textContent: `AFFARIO

Il prezzo che aspettavi è arrivato

AFFARIO ha rilevato che questa variante ha raggiunto o superato in meglio il tuo Prezzo Obiettivo.

Prodotto: ${productName.trim()}
Prezzo attuale rilevato: ${formattedCurrentPrice}
Prezzo Obiettivo AFFARIO: ${formattedTargetPrice}${savingText}

Vedi questa variante su Amazon: ${amazonUrl}

I prezzi possono cambiare rapidamente.

Hai ricevuto questa email perché hai attivato questo alert prezzo su AFFARIO. Non è una newsletter né una comunicazione di marketing.`,
  };
}
