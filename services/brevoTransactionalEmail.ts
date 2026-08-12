import "server-only";

const BREVO_EMAIL_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

type AlertConfirmationEmail = {
  recipientEmail: string;
  productName: string;
  currentPrice: number;
  targetPrice: number;
  managementUrl: string;
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

function createHtmlContent({
  productName,
  currentPrice,
  targetPrice,
  managementUrl,
}: Omit<AlertConfirmationEmail, "recipientEmail">): string {
  const safeProductName = escapeHtml(productName);
  const safeManagementUrl = escapeHtml(managementUrl);
  const formattedCurrentPrice = formatPrice(currentPrice);
  const formattedTargetPrice = formatPrice(targetPrice);

  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>La tua richiesta di alert è stata registrata</title>
  </head>
  <body style="margin:0;background-color:#f3f4f6;color:#111827;font-family:Arial,sans-serif;">
    <div style="padding:24px 12px;">
      <div style="max-width:600px;margin:0 auto;overflow:hidden;border-radius:16px;background-color:#ffffff;">
        <div style="background-color:#166534;padding:22px 24px;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:0.04em;">
          AFFARIO
        </div>
        <div style="padding:28px 24px;">
          <h1 style="margin:0;font-size:26px;line-height:1.25;color:#111827;">
            La tua richiesta di alert è stata registrata
          </h1>
          <p style="margin:20px 0 0;font-size:16px;line-height:1.6;">
            Abbiamo registrato correttamente la tua richiesta di alert prezzo.
          </p>

          <div style="margin-top:24px;border:1px solid #d1d5db;border-radius:12px;padding:18px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;color:#6b7280;">Prodotto</p>
            <p style="margin:0;font-size:18px;font-weight:700;line-height:1.4;">${safeProductName}</p>
            <p style="margin:18px 0 0;font-size:14px;color:#4b5563;">Prezzo al momento della registrazione</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:700;">${formattedCurrentPrice}</p>
            <p style="margin:18px 0 0;font-size:14px;color:#4b5563;">Prezzo desiderato</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#166534;">${formattedTargetPrice}</p>
          </div>

          <div style="margin-top:24px;border-radius:12px;background-color:#fefce8;padding:18px;color:#713f12;">
            <p style="margin:0;font-size:15px;line-height:1.6;">
              Il sistema di monitoraggio automatico dei prezzi è in fase di attivazione.
              Riceverai le notifiche di prezzo quando il servizio sarà operativo.
            </p>
          </div>

          <div style="margin-top:24px;border:1px solid #d1d5db;border-radius:12px;padding:18px;">
            <p style="margin:0;font-size:17px;font-weight:700;color:#111827;">Gestisci questo alert</p>
            <p style="margin:10px 0 0;font-size:14px;line-height:1.5;color:#4b5563;">
              Usa il tuo link personale per visualizzare o eliminare questa richiesta di alert.
            </p>
            <p style="margin:18px 0 0;">
              <a href="${safeManagementUrl}" style="display:inline-block;border-radius:10px;background-color:#166534;padding:12px 18px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Gestisci o elimina alert</a>
            </p>
          </div>

          <p style="margin:26px 0 0;font-size:17px;font-weight:700;line-height:1.5;color:#166534;">
            Gli affari non si trovano... si aspettano!
          </p>
          <p style="margin:22px 0 0;font-size:14px;line-height:1.5;">
            <a href="https://affario.it/privacy" style="color:#166534;text-decoration:underline;">Informativa Privacy</a>
          </p>
          <p style="margin:26px 0 0;border-top:1px solid #e5e7eb;padding-top:18px;font-size:12px;line-height:1.5;color:#6b7280;">
            Hai ricevuto questa email perché hai richiesto un alert prezzo su AFFARIO.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function createTextContent({
  productName,
  currentPrice,
  targetPrice,
  managementUrl,
}: Omit<AlertConfirmationEmail, "recipientEmail">): string {
  return `AFFARIO

La tua richiesta di alert è stata registrata

Abbiamo registrato correttamente la tua richiesta di alert prezzo.

Prodotto: ${productName}
Prezzo al momento della registrazione: ${formatPrice(currentPrice)}
Prezzo desiderato: ${formatPrice(targetPrice)}

Il sistema di monitoraggio automatico dei prezzi è in fase di attivazione.
Riceverai le notifiche di prezzo quando il servizio sarà operativo.

Gestisci questo alert
Gestisci o elimina alert: ${managementUrl}

Gli affari non si trovano... si aspettano!

Informativa Privacy: https://affario.it/privacy

Hai ricevuto questa email perché hai richiesto un alert prezzo su AFFARIO.`;
}

export async function sendAlertConfirmationEmail(
  alert: AlertConfirmationEmail
): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new Error("Configurazione Brevo mancante");
  }

  const response = await fetch(BREVO_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: {
        name: "AFFARIO",
        email: "alert@notify.affario.it",
      },
      to: [{ email: alert.recipientEmail }],
      replyTo: {
        email: "saporitof@gmail.com",
      },
      subject: `Alert AFFARIO registrato — ${alert.productName}`,
      htmlContent: createHtmlContent(alert),
      textContent: createTextContent(alert),
    }),
  });

  if (!response.ok) {
    throw new Error(`Brevo ha risposto con stato ${response.status}`);
  }
}
