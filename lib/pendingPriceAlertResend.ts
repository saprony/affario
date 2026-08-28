import {
  PRICE_ALERT_ACTIVE_STATUS,
  PRICE_ALERT_NOTIFYING_TARGET_STATUS,
  PRICE_ALERT_PENDING_STATUS,
  PRICE_ALERT_TARGET_NOTIFIED_STATUS,
} from "./affarioPriceAlert";

export const PRICE_ALERT_RESEND_COOLDOWN_MS = 15 * 60 * 1_000;

type ExistingPriceAlert = {
  status: string | null;
  confirmationRequestedAt: string | null;
  manageTokenHash: string | null;
};

type PendingTokenRotation = {
  expectedTokenHash: string;
  newTokenHash: string;
  requestedAt: string;
  eligibleBefore: string;
  expectedConfirmationRequestedAt: string | null;
};

export type PendingPriceAlertResendStore = {
  rotatePendingToken: (rotation: PendingTokenRotation) => Promise<boolean>;
};

export type PendingPriceAlertResendResult =
  | { status: "active" }
  | { status: "target-notified" }
  | { status: "cooldown"; retryAfterSeconds: number }
  | { status: "resend"; confirmationToken: string }
  | { status: "invalid" };

function getRetryAfterSeconds(elapsedMs: number): number {
  const remainingMs = PRICE_ALERT_RESEND_COOLDOWN_MS - Math.max(0, elapsedMs);

  return Math.max(1, Math.ceil(remainingMs / 1_000));
}

export async function preparePendingPriceAlertResend({
  existingAlert,
  newConfirmationToken,
  newTokenHash,
  store,
  now = new Date(),
}: {
  existingAlert: ExistingPriceAlert;
  newConfirmationToken: string;
  newTokenHash: string;
  store: PendingPriceAlertResendStore;
  now?: Date;
}): Promise<PendingPriceAlertResendResult> {
  if (
    existingAlert.status === PRICE_ALERT_ACTIVE_STATUS ||
    existingAlert.status === PRICE_ALERT_NOTIFYING_TARGET_STATUS
  ) {
    return { status: "active" };
  }

  if (existingAlert.status === PRICE_ALERT_TARGET_NOTIFIED_STATUS) {
    return { status: "target-notified" };
  }

  const confirmationRequestedAtMs =
    existingAlert.confirmationRequestedAt === null
      ? null
      : Date.parse(existingAlert.confirmationRequestedAt);
  const nowMs = now.getTime();

  if (
    existingAlert.status !== PRICE_ALERT_PENDING_STATUS ||
    (confirmationRequestedAtMs !== null &&
      !Number.isFinite(confirmationRequestedAtMs)) ||
    !Number.isFinite(nowMs) ||
    !existingAlert.manageTokenHash ||
    !/^[a-f0-9]{64}$/.test(existingAlert.manageTokenHash) ||
    !/^[a-f0-9]{64}$/.test(newTokenHash)
  ) {
    return { status: "invalid" };
  }

  const elapsedMs =
    confirmationRequestedAtMs === null
      ? PRICE_ALERT_RESEND_COOLDOWN_MS
      : nowMs - confirmationRequestedAtMs;

  if (elapsedMs < PRICE_ALERT_RESEND_COOLDOWN_MS) {
    return {
      status: "cooldown",
      retryAfterSeconds: getRetryAfterSeconds(elapsedMs),
    };
  }

  const requestedAt = now.toISOString();
  const eligibleBefore = new Date(
    nowMs - PRICE_ALERT_RESEND_COOLDOWN_MS
  ).toISOString();
  const wasRotated = await store.rotatePendingToken({
    expectedTokenHash: existingAlert.manageTokenHash,
    newTokenHash,
    requestedAt,
    eligibleBefore,
    expectedConfirmationRequestedAt:
      existingAlert.confirmationRequestedAt,
  });

  if (!wasRotated) {
    return {
      status: "cooldown",
      retryAfterSeconds: PRICE_ALERT_RESEND_COOLDOWN_MS / 1_000,
    };
  }

  return {
    status: "resend",
    confirmationToken: newConfirmationToken,
  };
}
