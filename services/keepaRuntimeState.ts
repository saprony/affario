import "server-only";

import { getSupabaseServerClient } from "@/services/supabaseServer";

export const DEFAULT_KEEPA_BACKGROUND_TOKEN_RESERVE = 120;
export const KEEPA_BACKGROUND_REQUEST_LEASE_MS = 300_000;

export type KeepaRequestContext = "interactive" | "background_alert";

export type KeepaTokenBudgetStatus =
  | "OK"
  | "RESERVE"
  | "EXHAUSTED"
  | "UNKNOWN";

export type KeepaRuntimeObservation = {
  observedAt: string;
  tokensLeft: number;
  tokensConsumed: number;
  refillRate: number;
  refillInMs: number;
  tokenFlowReduction: number;
};

export type KeepaBackgroundRequestAcquisition = {
  allowed: boolean;
  budgetStatus: KeepaTokenBudgetStatus;
  leaseStartedAt: string | null;
};

const TOKEN_BUDGET_STATUSES = new Set<KeepaTokenBudgetStatus>([
  "OK",
  "RESERVE",
  "EXHAUSTED",
  "UNKNOWN",
]);

export function parseKeepaBackgroundTokenReserve(
  value: string | undefined
): number | null {
  if (value === undefined || value === "") {
    return DEFAULT_KEEPA_BACKGROUND_TOKEN_RESERVE;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isValidIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export async function tryAcquireKeepaBackgroundRequest(
  estimatedTokenCost: number,
  now: Date
): Promise<KeepaBackgroundRequestAcquisition> {
  const reserve = parseKeepaBackgroundTokenReserve(
    process.env.KEEPA_BACKGROUND_TOKEN_RESERVE
  );

  if (reserve === null) {
    return {
      allowed: false,
      budgetStatus: "UNKNOWN",
      leaseStartedAt: null,
    };
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "affario_keepa_try_acquire_background_request",
    {
      p_estimated_cost: estimatedTokenCost,
      p_reserve: reserve,
      p_now: now.toISOString(),
      p_lease_duration_ms: KEEPA_BACKGROUND_REQUEST_LEASE_MS,
    }
  );

  if (error) {
    throw new Error("Controllo budget Keepa background non disponibile.");
  }

  const row = Array.isArray(data) ? data[0] : null;

  if (
    !row ||
    typeof row.allowed !== "boolean" ||
    typeof row.budget_status !== "string" ||
    !TOKEN_BUDGET_STATUSES.has(
      row.budget_status as KeepaTokenBudgetStatus
    ) ||
    (row.allowed && !isValidIsoTimestamp(row.lease_started_at)) ||
    (!row.allowed && row.lease_started_at !== null)
  ) {
    throw new Error("Risposta controllo budget Keepa non valida.");
  }

  return {
    allowed: row.allowed,
    budgetStatus: row.budget_status as KeepaTokenBudgetStatus,
    leaseStartedAt: row.lease_started_at,
  };
}

export async function recordKeepaRuntimeObservation(input: {
  observedAt: string;
  observation: KeepaRuntimeObservation | null;
  context: KeepaRequestContext;
  rateLimited: boolean;
  backgroundLeaseStartedAt: string | null;
}): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { observation } = input;
  const { error } = await supabase.rpc(
    "affario_keepa_record_runtime_observation",
    {
      p_observed_at: input.observedAt,
      p_has_observation: observation !== null,
      p_tokens_left: observation?.tokensLeft ?? null,
      p_tokens_consumed: observation?.tokensConsumed ?? null,
      p_refill_rate: observation?.refillRate ?? null,
      p_refill_in_ms: observation?.refillInMs ?? null,
      p_token_flow_reduction: observation?.tokenFlowReduction ?? null,
      p_context: input.context,
      p_rate_limited: input.rateLimited,
      p_background_lease_started_at: input.backgroundLeaseStartedAt,
    }
  );

  if (error) {
    throw new Error("Aggiornamento telemetria Keepa non disponibile.");
  }
}

export async function releaseKeepaBackgroundRequest(
  leaseStartedAt: string
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.rpc(
    "affario_keepa_release_background_request",
    { p_lease_started_at: leaseStartedAt }
  );

  if (error) {
    throw new Error("Rilascio controllo budget Keepa non disponibile.");
  }
}
