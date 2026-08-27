import "server-only";

import {
  buildAlertConfirmationEmailMessage,
  type AlertConfirmationEmailDetails,
} from "@/lib/alertConfirmationEmail";

const BREVO_EMAIL_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

type AlertConfirmationEmail = AlertConfirmationEmailDetails & {
  recipientEmail: string;
};

export async function sendAlertConfirmationEmail(
  alert: AlertConfirmationEmail
): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new Error("Configurazione Brevo mancante");
  }

  const message = buildAlertConfirmationEmailMessage(alert);
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
      ...message,
    }),
  });

  if (!response.ok) {
    throw new Error(`Brevo ha risposto con stato ${response.status}`);
  }
}
