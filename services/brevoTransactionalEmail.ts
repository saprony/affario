import "server-only";

import { createHash } from "node:crypto";

import {
  buildAlertConfirmationEmailMessage,
  type AlertConfirmationEmailDetails,
} from "@/lib/alertConfirmationEmail";
import {
  buildTargetPriceAlertEmailMessage,
  type TargetPriceAlertEmailDetails,
  type TargetPriceAlertEmailMessage,
} from "@/lib/targetPriceAlertEmail";

const BREVO_EMAIL_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const BREVO_EMAIL_EVENTS_ENDPOINT =
  "https://api.brevo.com/v3/smtp/statistics/events";
const BREVO_TARGET_EVENT_LOOKBACK_DAYS = 90;
const UUID_URL_NAMESPACE = "6ba7b8119dad11d180b400c04fd430c8";

type AlertConfirmationEmail = AlertConfirmationEmailDetails & {
  recipientEmail: string;
};

export type TargetPriceAlertEmail = TargetPriceAlertEmailDetails & {
  alertId: number;
  recipientEmail: string;
};

type BrevoTransactionalMessage = Pick<
  TargetPriceAlertEmailMessage,
  "subject" | "htmlContent" | "textContent"
>;

export type TargetEmailSendResult =
  | { status: "accepted" }
  | { status: "rejected" }
  | { status: "unknown" };

export type TargetEmailProviderEventStatus =
  | "accepted"
  | "not-found"
  | "unknown";

export type TargetEmailProviderIdentity = {
  idempotencyKey: string;
  eventTag: string;
};

type BrevoTargetEmailGatewayOptions = {
  requester?: typeof fetch;
  getApiKey?: () => string | undefined;
  clock?: () => Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatUuid(bytes: Buffer): string {
  const hex = bytes.subarray(0, 16).toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function getTargetEmailProviderIdentity(
  alertId: number
): TargetEmailProviderIdentity {
  if (!Number.isSafeInteger(alertId) || alertId <= 0) {
    throw new Error("alertId non valido per l'evento email target.");
  }

  const namespace = Buffer.from(UUID_URL_NAMESPACE, "hex");
  const digest = createHash("sha1")
    .update(namespace)
    .update(`affario:price-alert-target:${alertId}`, "utf8")
    .digest();

  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;

  const idempotencyKey = formatUuid(digest);

  return {
    idempotencyKey,
    eventTag: `affario-target-${idempotencyKey}`,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isDuplicateIdempotencyResponse(payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    payload.code === "duplicate_parameter" ||
    (isRecord(payload.error) &&
      payload.error.code === "duplicate_parameter")
  );
}

function eventContainsTag(event: unknown, eventTag: string): boolean {
  if (!isRecord(event)) {
    return false;
  }

  return (
    event.tag === eventTag ||
    (Array.isArray(event.tags) && event.tags.includes(eventTag))
  );
}

async function sendBrevoTransactionalEmail(
  recipientEmail: string,
  message: BrevoTransactionalMessage,
  requester: typeof fetch,
  apiKey: string
): Promise<void> {
  const response = await requester(BREVO_EMAIL_ENDPOINT, {
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
      to: [{ email: recipientEmail }],
      ...message,
    }),
  });

  if (!response.ok) {
    throw new Error(`Brevo ha risposto con stato ${response.status}`);
  }
}

export function createBrevoTargetEmailGateway(
  options: BrevoTargetEmailGatewayOptions = {}
) {
  const requester = options.requester ?? fetch;
  const getApiKey = options.getApiKey ?? (() => process.env.BREVO_API_KEY);
  const clock = options.clock ?? (() => new Date());

  return {
    async sendTargetEmail(
      alert: TargetPriceAlertEmail
    ): Promise<TargetEmailSendResult> {
      const apiKey = getApiKey();

      if (!apiKey) {
        return { status: "rejected" };
      }

      const message = buildTargetPriceAlertEmailMessage(alert);
      const identity = getTargetEmailProviderIdentity(alert.alertId);
      let response: Response;

      try {
        response = await requester(BREVO_EMAIL_ENDPOINT, {
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
            headers: {
              "Idempotency-Key": identity.idempotencyKey,
            },
            tags: [identity.eventTag],
            ...message,
          }),
        });
      } catch {
        return { status: "unknown" };
      }

      if (response.ok) {
        return { status: "accepted" };
      }

      const payload = await readJson(response);

      if (isDuplicateIdempotencyResponse(payload)) {
        return { status: "accepted" };
      }

      return response.status >= 500
        ? { status: "unknown" }
        : { status: "rejected" };
    },

    async getTargetEmailEventStatus(
      alertId: number,
      claimedAt: string
    ): Promise<TargetEmailProviderEventStatus> {
      const apiKey = getApiKey();
      const claimedAtMilliseconds = Date.parse(claimedAt);
      const nowMilliseconds = clock().getTime();
      const ageMilliseconds = nowMilliseconds - claimedAtMilliseconds;
      const lookbackMilliseconds =
        BREVO_TARGET_EVENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1_000;

      if (
        !apiKey ||
        !Number.isFinite(claimedAtMilliseconds) ||
        !Number.isFinite(nowMilliseconds) ||
        ageMilliseconds < 0 ||
        ageMilliseconds > lookbackMilliseconds
      ) {
        return "unknown";
      }

      const identity = getTargetEmailProviderIdentity(alertId);
      const days = Math.max(
        1,
        Math.min(
          BREVO_TARGET_EVENT_LOOKBACK_DAYS,
          Math.ceil(ageMilliseconds / (24 * 60 * 60 * 1_000)) + 1
        )
      );
      const url = new URL(BREVO_EMAIL_EVENTS_ENDPOINT);
      url.searchParams.set("limit", "10");
      url.searchParams.set("sort", "desc");
      url.searchParams.set("days", String(days));
      url.searchParams.set("tags", JSON.stringify([identity.eventTag]));
      let response: Response;

      try {
        response = await requester(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "api-key": apiKey,
          },
        });
      } catch {
        return "unknown";
      }

      if (!response.ok) {
        return "unknown";
      }

      const payload = await readJson(response);

      if (!isRecord(payload) || !Array.isArray(payload.events)) {
        return "unknown";
      }

      if (
        payload.events.some((event) =>
          eventContainsTag(event, identity.eventTag)
        )
      ) {
        return "accepted";
      }

      return payload.events.length === 0 ? "not-found" : "unknown";
    },
  };
}

const brevoTargetEmailGateway = createBrevoTargetEmailGateway();

export async function sendAlertConfirmationEmail(
  alert: AlertConfirmationEmail
): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new Error("Configurazione Brevo mancante");
  }

  const message = buildAlertConfirmationEmailMessage(alert);

  await sendBrevoTransactionalEmail(
    alert.recipientEmail,
    message,
    fetch,
    apiKey
  );
}

export async function sendTargetPriceAlertEmail(
  alert: TargetPriceAlertEmail
): Promise<TargetEmailSendResult> {
  return brevoTargetEmailGateway.sendTargetEmail(alert);
}

export async function getTargetPriceAlertEmailEventStatus(
  alertId: number,
  claimedAt: string
): Promise<TargetEmailProviderEventStatus> {
  return brevoTargetEmailGateway.getTargetEmailEventStatus(
    alertId,
    claimedAt
  );
}
