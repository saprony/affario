import "server-only";

import { getSupabaseServerClient } from "@/services/supabaseServer";

type IntermediateNotificationRow = {
  intermediate_notified_at: string | null;
};

export type IntermediateNotificationState =
  | { status: "pending" }
  | { status: "sent"; notifiedAt: string }
  | { status: "not-found" };

export type MarkIntermediateNotificationResult =
  | { status: "marked"; notifiedAt: string }
  | { status: "already-sent"; notifiedAt: string }
  | { status: "not-found" };

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
    "Non è stato possibile accedere allo stato della notifica intermedia.",
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

export async function getIntermediateNotificationState(
  alertId: number
): Promise<IntermediateNotificationState> {
  const normalizedAlertId = validateAlertId(alertId);
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .schema("public")
    .from("price_alerts")
    .select("intermediate_notified_at")
    .eq("id", normalizedAlertId)
    .maybeSingle<IntermediateNotificationRow>();

  if (error) {
    throw databaseError();
  }

  if (!data) {
    return { status: "not-found" };
  }

  if (data.intermediate_notified_at === null) {
    return { status: "pending" };
  }

  return {
    status: "sent",
    notifiedAt: data.intermediate_notified_at,
  };
}

export async function markIntermediateNotificationSent(
  alertId: number,
  notifiedAt?: Date | string
): Promise<MarkIntermediateNotificationResult> {
  const normalizedAlertId = validateAlertId(alertId);
  const normalizedNotifiedAt = normalizeNotifiedAt(notifiedAt);
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .schema("public")
    .from("price_alerts")
    .update({ intermediate_notified_at: normalizedNotifiedAt })
    .eq("id", normalizedAlertId)
    .is("intermediate_notified_at", null)
    .select("intermediate_notified_at")
    .maybeSingle<IntermediateNotificationRow>();

  if (error) {
    throw databaseError();
  }

  if (data?.intermediate_notified_at) {
    return {
      status: "marked",
      notifiedAt: data.intermediate_notified_at,
    };
  }

  const currentState = await getIntermediateNotificationState(
    normalizedAlertId
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
