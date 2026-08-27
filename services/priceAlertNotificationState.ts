import "server-only";

import { PRICE_ALERT_ACTIVE_STATUS } from "@/lib/affarioPriceAlert";
import { getSupabaseServerClient } from "@/services/supabaseServer";

type NotificationTimestampColumn =
  | "intermediate_notified_at"
  | "notified_at";

type NotificationTimestampRow = {
  intermediate_notified_at?: string | null;
  notified_at?: string | null;
};

type SupabaseServerClient = ReturnType<typeof getSupabaseServerClient>;

type NotificationState =
  | { status: "pending" }
  | { status: "sent"; notifiedAt: string }
  | { status: "not-found" };

type MarkNotificationResult =
  | { status: "marked"; notifiedAt: string }
  | { status: "already-sent"; notifiedAt: string }
  | { status: "not-found" };

export type IntermediateNotificationState = NotificationState;
export type MarkIntermediateNotificationResult = MarkNotificationResult;
export type TargetNotificationState = NotificationState;
export type MarkTargetNotificationResult = MarkNotificationResult;

export type PriceAlertNotificationStateErrorCode =
  | "INVALID_INPUT"
  | "DATABASE_ERROR";

export class PriceAlertNotificationStateError extends Error {
  constructor(
    message: string,
    public readonly code: PriceAlertNotificationStateErrorCode
  ) {
    super(message);
    this.name = "PriceAlertNotificationStateError";
  }
}

function invalidInput(message: string): PriceAlertNotificationStateError {
  return new PriceAlertNotificationStateError(message, "INVALID_INPUT");
}

function databaseError(): PriceAlertNotificationStateError {
  return new PriceAlertNotificationStateError(
    "Non è stato possibile accedere allo stato delle notifiche dell'alert.",
    "DATABASE_ERROR"
  );
}

function validateAlertId(alertId: number): number {
  if (!Number.isSafeInteger(alertId) || alertId <= 0) {
    throw invalidInput("alertId deve essere un intero positivo.");
  }

  return alertId;
}

function normalizeNotifiedAt(notifiedAt: Date | string | undefined): string {
  if (
    notifiedAt !== undefined &&
    typeof notifiedAt !== "string" &&
    !(notifiedAt instanceof Date)
  ) {
    throw invalidInput("notifiedAt deve essere una data valida.");
  }

  const date =
    notifiedAt === undefined
      ? new Date()
      : notifiedAt instanceof Date
        ? notifiedAt
        : new Date(notifiedAt);

  if (!Number.isFinite(date.getTime())) {
    throw invalidInput("notifiedAt deve essere una data valida.");
  }

  return date.toISOString();
}

async function readNotificationState(
  supabase: SupabaseServerClient,
  alertId: number,
  column: NotificationTimestampColumn
): Promise<NotificationState> {
  const { data, error } = await supabase
    .schema("public")
    .from("price_alerts")
    .select(column)
    .eq("id", alertId)
    .eq("status", PRICE_ALERT_ACTIVE_STATUS)
    .maybeSingle<NotificationTimestampRow>();

  if (error) {
    throw databaseError();
  }

  if (!data) {
    return { status: "not-found" };
  }

  const notifiedAt = data[column];

  if (notifiedAt === null) {
    return { status: "pending" };
  }

  if (typeof notifiedAt !== "string") {
    throw databaseError();
  }

  return { status: "sent", notifiedAt };
}

async function getNotificationState(
  alertId: number,
  column: NotificationTimestampColumn
): Promise<NotificationState> {
  const normalizedAlertId = validateAlertId(alertId);
  const supabase = getSupabaseServerClient();

  return readNotificationState(supabase, normalizedAlertId, column);
}

async function markNotificationSent(
  alertId: number,
  column: NotificationTimestampColumn,
  notifiedAt?: Date | string
): Promise<MarkNotificationResult> {
  const normalizedAlertId = validateAlertId(alertId);
  const normalizedNotifiedAt = normalizeNotifiedAt(notifiedAt);
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .schema("public")
    .from("price_alerts")
    .update({ [column]: normalizedNotifiedAt })
    .eq("id", normalizedAlertId)
    .eq("status", PRICE_ALERT_ACTIVE_STATUS)
    .is(column, null)
    .select(column)
    .maybeSingle<NotificationTimestampRow>();

  if (error) {
    throw databaseError();
  }

  const markedAt = data?.[column];

  if (typeof markedAt === "string") {
    return { status: "marked", notifiedAt: markedAt };
  }

  if (data) {
    throw databaseError();
  }

  const currentState = await readNotificationState(
    supabase,
    normalizedAlertId,
    column
  );

  if (currentState.status === "sent") {
    return {
      status: "already-sent",
      notifiedAt: currentState.notifiedAt,
    };
  }

  if (currentState.status === "not-found") {
    return currentState;
  }

  throw databaseError();
}

export async function getIntermediateNotificationState(
  alertId: number
): Promise<IntermediateNotificationState> {
  return getNotificationState(alertId, "intermediate_notified_at");
}

export async function markIntermediateNotificationSent(
  alertId: number,
  notifiedAt?: Date | string
): Promise<MarkIntermediateNotificationResult> {
  return markNotificationSent(
    alertId,
    "intermediate_notified_at",
    notifiedAt
  );
}

export async function getTargetNotificationState(
  alertId: number
): Promise<TargetNotificationState> {
  return getNotificationState(alertId, "notified_at");
}

export async function markTargetNotificationSent(
  alertId: number,
  notifiedAt?: Date | string
): Promise<MarkTargetNotificationResult> {
  return markNotificationSent(alertId, "notified_at", notifiedAt);
}
