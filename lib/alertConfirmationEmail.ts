export type AlertConfirmationEmailDetails = {
  productName: string;
  currentPrice: number;
  targetPrice: number;
  confirmationUrl: string;
};

export type AlertConfirmationEmailMessage = {
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

export function buildAlertConfirmationEmailMessage({
  productName,
  currentPrice,
  targetPrice,
  confirmationUrl,
}: AlertConfirmationEmailDetails): AlertConfirmationEmailMessage {
  const safeProductName = escapeHtml(productName);
  const safeConfirmationUrl = escapeHtml(confirmationUrl);
  const formattedCurrentPrice = formatPrice(currentPrice);
  const formattedTargetPrice = formatPrice(targetPrice);

  return {
    subject: `Conferma il tuo alert AFFARIO — ${productName}`,
    htmlContent: `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Conferma il tuo alert AFFARIO</title>
  </head>
  <body style="margin:0;background-color:#f3f4f6;color:#111827;font-family:Arial,sans-serif;">
    <div style="padding:24px 12px;">
      <div style="max-width:600px;margin:0 auto;overflow:hidden;border-radius:16px;background-color:#ffffff;">
        <div style="background-color:#166534;padding:22px 24px;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:0.04em;">
          AFFARIO
        </div>
        <div style="padding:28px 24px;">
          <h1 style="margin:0;font-size:26px;line-height:1.25;color:#111827;">
            Conferma il tuo alert AFFARIO
          </h1>
          <p style="margin:20px 0 0;font-size:16px;line-height:1.6;">
            Hai richiesto di essere avvisato quando questa variante raggiunge il Prezzo Obiettivo AFFARIO.
          </p>

          <div style="margin-top:24px;border:1px solid #d1d5db;border-radius:12px;padding:18px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;color:#6b7280;">Prodotto</p>
            <p style="margin:0;font-size:18px;font-weight:700;line-height:1.4;">${safeProductName}</p>
            <p style="margin:18px 0 0;font-size:14px;color:#4b5563;">Prezzo al momento della richiesta</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:700;">${formattedCurrentPrice}</p>
            <p style="margin:18px 0 0;font-size:14px;color:#4b5563;">Prezzo obiettivo AFFARIO</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#166534;">${formattedTargetPrice}</p>
          </div>

          <div style="margin-top:24px;border-radius:12px;background-color:#fefce8;padding:18px;color:#713f12;">
            <p style="margin:0;font-size:15px;line-height:1.6;">
              Il tuo alert non è ancora attivo. Apri il link e seleziona “Conferma alert”.
            </p>
          </div>

          <p style="margin:24px 0 0;">
            <a href="${safeConfirmationUrl}" style="display:inline-block;border-radius:10px;background-color:#166534;padding:12px 18px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Conferma alert</a>
          </p>

          <p style="margin:26px 0 0;font-size:17px;font-weight:700;line-height:1.5;color:#166534;">
            Gli affari non si trovano... si aspettano!
          </p>
          <p style="margin:22px 0 0;font-size:14px;line-height:1.5;">
            <a href="https://affario.it/privacy" style="color:#166534;text-decoration:underline;">Informativa Privacy</a>
          </p>
          <p style="margin:26px 0 0;border-top:1px solid #e5e7eb;padding-top:18px;font-size:12px;line-height:1.5;color:#6b7280;">
            Hai ricevuto questa email perché hai richiesto questo alert prezzo su AFFARIO. Non è una newsletter né una comunicazione di marketing.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`,
    textContent: `AFFARIO

Conferma il tuo alert AFFARIO

Hai richiesto di essere avvisato quando questa variante raggiunge il Prezzo Obiettivo AFFARIO.

Prodotto: ${productName}
Prezzo al momento della richiesta: ${formatPrice(currentPrice)}
Prezzo obiettivo AFFARIO: ${formatPrice(targetPrice)}

Il tuo alert non è ancora attivo. Apri il link e seleziona "Conferma alert".

Conferma alert: ${confirmationUrl}

Gli affari non si trovano... si aspettano!

Informativa Privacy: https://affario.it/privacy

Hai ricevuto questa email perché hai richiesto questo alert prezzo su AFFARIO. Non è una newsletter né una comunicazione di marketing.`,
  };
}
