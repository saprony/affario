import "server-only";

import {
  PRICE_ALERT_ACTIVE_STATUS,
  PRICE_ALERT_NOTIFYING_TARGET_STATUS,
  PRICE_ALERT_TARGET_NOTIFIED_STATUS,
} from "@/lib/affarioPriceAlert";
import { getSupabaseServerClient } from "@/services/supabaseServer";

type NotificationTimestampColumn =
  | "intermediate_notified_at"
  | "notified_at";

type NotificationTimestampRow = {
  intermediate_notified_at?: string | null;
  notified_at?: string | null;
};

type TargetNotificationClaimRow = {
  id: number;
};

type TargetNotificationCompletionRow = {
  notified_at: string | null;
};

type TargetReachedOutcomeRow = {
  status: string | null;
  notified_at: string | null;
  target_reached_at: string | null;
  target_reached_price: number | null;
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

export type ClaimTargetNotificationResult =
  | { status: "claimed" }
  | { status: "unavailable" };

export type CompleteTargetNotificationResult =
  | { status: "completed"; notifiedAt: string }
  | { status: "not-claimed" };

export type ReleaseTargetNotificationClaimResult =
  | { status: "released" }
  | { status: "not-claimed" };

export type TargetReachedOutcome = {
  reachedAt: string;
  reachedPrice: number;
};

export type RecordTargetReachedOutcomeResult =
  | ({ status: "recorded" | "existing" } & TargetReachedOutcome)
  | { status: "unavailable" };

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

function normalizeTimestamp(
  value: Date | string | undefined,
  fieldName: string
): string {
  if (
    value !== undefined &&
    typeof value !== "string" &&
    !(value instanceof Date)
  ) {
    throw invalidInput(`${fieldName} deve essere una data valida.`);
  }

  const date =
    value === undefined
      ? new Date()
      : value instanceof Date
        ? value
        : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw invalidInput(`${fieldName} deve essere una data valida.`);
  }

  return date.toISOString();
}

function normalizeNotifiedAt(notifiedAt: Date | string | undefined): string {
  return normalizeTimestamp(notifiedAt, "notifiedAt");
}

function validateReachedPrice(reachedPrice: number): number {
  if (!Number.isFinite(reachedPrice) || reachedPrice <= 0) {
    throw invalidInput("reachedPrice deve essere maggiore di zero.");
  }

  return reachedPrice;
}

async function readNotificationState(
  supabase: SupabaseServerClient,
  alertId: number,
  column: NotificationTimestampColumn
): Promise<NotificationState> {
  let query = supabase
    .schema("public")
    .from("price_alerts")
    .select(column)
    .eq("id", alertId);

  query =
    column === "notified_at"
      ? query.in("status", [
          PRICE_ALERT_ACTIVE_STATUS,
          PRICE_ALERT_TARGET_NOTIFIED_STATUS,
        ])
      : query.eq("status", PRICE_ALERT_ACTIVE_STATUS);

  const { data, error } =
    await query.maybeSingle<NotificationTimestampRow>();

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
  const completion = await completeTargetNotification(alertId, notifiedAt);

  if (completion.status === "completed") {
    return { status: "marked", notifiedAt: completion.notifiedAt };
  }

  const currentState = await getTargetNotificationState(alertId);

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

export async function claimTargetNotification(
  alertId: number,
  claimedAt?: Date | string
): Promise<ClaimTargetNotificationResult> {
  const normalizedAlertId = validateAlertId(alertId);
  const normalizedClaimedAt = normalizeTimestamp(claimedAt, "claimedAt");
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .schema("public")
    .from("price_alerts")
    .update({
      status: PRICE_ALERT_NOTIFYING_TARGET_STATUS,
      target_notification_claimed_at: normalizedClaimedAt,
    })
    .eq("id", normalizedAlertId)
    .eq("status", PRICE_ALERT_ACTIVE_STATUS)
    .is("notified_at", null)
    .is("target_notification_claimed_at", null)
    .not("target_reached_at", "is", null)
    .not("target_reached_price", "is", null)
    .select("id")
    .maybeSingle<TargetNotificationClaimRow>();

  if (error) {
    throw databaseError();
  }

  return data ? { status: "claimed" } : { status: "unavailable" };
}

export async function completeTargetNotification(
  alertId: number,
  notifiedAt?: Date | string
): Promise<CompleteTargetNotificationResult> {
  const normalizedAlertId = validateAlertId(alertId);
  const normalizedNotifiedAt = normalizeNotifiedAt(notifiedAt);
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .schema("public")
    .from("price_alerts")
    .update({
      status: PRICE_ALERT_TARGET_NOTIFIED_STATUS,
      notified_at: normalizedNotifiedAt,
      target_notification_claimed_at: null,
    })
    .eq("id", normalizedAlertId)
    .eq("status", PRICE_ALERT_NOTIFYING_TARGET_STATUS)
    .is("notified_at", null)
    .not("target_notification_claimed_at", "is", null)
    .select("notified_at")
    .maybeSingle<TargetNotificationCompletionRow>();

  if (error) {
    throw databaseError();
  }

  return typeof data?.notified_at === "string"
    ? { status: "completed", notifiedAt: data.notified_at }
    : { status: "not-claimed" };
}

export async function releaseTargetNotificationClaim(
  alertId: number
): Promise<ReleaseTargetNotificationClaimResult> {
  const normalizedAlertId = validateAlertId(alertId);
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .schema("public")
    .from("price_alerts")
    .update({
      status: PRICE_ALERT_ACTIVE_STATUS,
      target_notification_claimed_at: null,
    })
    .eq("id", normalizedAlertId)
    .eq("status", PRICE_ALERT_NOTIFYING_TARGET_STATUS)
    .is("notified_at", null)
    .select("id")
    .maybeSingle<TargetNotificationClaimRow>();

  if (error) {
    throw databaseError();
  }

  return data ? { status: "released" } : { status: "not-claimed" };
}

export async function recordTargetReachedOutcome(
  alertId: number,
  reachedPrice: number,
  reachedAt?: Date | string
): Promise<RecordTargetReachedOutcomeResult> {
  const normalizedAlertId = validateAlertId(alertId);
  const normalizedReachedPrice = validateReachedPrice(reachedPrice);
  const normalizedReachedAt = normalizeTimestamp(reachedAt, "reachedAt");
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .schema("public")
    .from("price_alerts")
    .update({
      target_reached_at: normalizedReachedAt,
      target_reached_price: normalizedReachedPrice,
    })
    .eq("id", normalizedAlertId)
    .eq("status", PRICE_ALERT_ACTIVE_STATUS)
    .is("notified_at", null)
    .is("target_reached_at", null)
    .is("target_reached_price", null)
    .select(
      "status,notified_at,target_reached_at,target_reached_price"
    )
    .maybeSingle<TargetReachedOutcomeRow>();

  if (error) {
    throw databaseError();
  }

  if (
    typeof data?.target_reached_at === "string" &&
    typeof data.target_reached_price === "number"
  ) {
    return {
      status: "recorded",
      reachedAt: data.target_reached_at,
      reachedPrice: data.target_reached_price,
    };
  }

  const { data: existing, error: existingError } = await supabase
    .schema("public")
    .from("price_alerts")
    .select(
      "status,notified_at,target_reached_at,target_reached_price"
    )
    .eq("id", normalizedAlertId)
    .in("status", [
      PRICE_ALERT_ACTIVE_STATUS,
      PRICE_ALERT_NOTIFYING_TARGET_STATUS,
      PRICE_ALERT_TARGET_NOTIFIED_STATUS,
    ])
    .maybeSingle<TargetReachedOutcomeRow>();

  if (existingError) {
    throw databaseError();
  }

  if (
    typeof existing?.target_reached_at === "string" &&
    typeof existing.target_reached_price === "number"
  ) {
    return {
      status: "existing",
      reachedAt: existing.target_reached_at,
      reachedPrice: existing.target_reached_price,
    };
  }

  return { status: "unavailable" };
}
