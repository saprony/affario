import type { AffarioAdviceRecommendation } from "../types/affarioAdvice";
import type { AffarioSavingsPotential } from "../types/productAnalysis";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXACT_ASIN_PATTERN = /^[A-Z0-9]{10}$/;

export const PRICE_ALERT_PENDING_STATUS = "pending_confirmation" as const;
export const PRICE_ALERT_ACTIVE_STATUS = "active" as const;

export type PriceAlertPersistenceStatus =
  | typeof PRICE_ALERT_PENDING_STATUS
  | typeof PRICE_ALERT_ACTIVE_STATUS;

export type AffarioPriceAlertOpportunity = {
  priority: "PRIMARY" | "SECONDARY";
  label: "Avvisami quando conviene" | "Avvisami se il prezzo migliora";
};

type AlertOpportunityInput = {
  recommendation: AffarioAdviceRecommendation;
  currentPrice: number | null;
  savingsPotential: AffarioSavingsPotential;
};

export type TrustedAffarioPriceAlert = {
  exactAsin: string;
  productTitle: string;
  currentPrice: number;
  targetPrice: number;
};

type TrustedAlertInput = AlertOpportunityInput & {
  exactAsin: string;
  productTitle: string;
};

export type PriceAlertRequestGate = {
  inFlight: boolean;
};

export type PriceAlertHttpResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

export type PriceAlertRequester = (
  input: string,
  init: RequestInit
) => Promise<PriceAlertHttpResponse>;

export type PriceAlertRequestResult = {
  alreadyExists: boolean;
  confirmationEmailSent: boolean;
  alertStatus: PriceAlertPersistenceStatus;
};

export type PendingPriceAlertInsert = {
  product_id: string;
  product_title: string;
  email: string;
  target_price: number;
  current_price: number;
  status: typeof PRICE_ALERT_PENDING_STATUS;
  manage_token_hash: string;
  confirmation_requested_at: string;
};

export class PriceAlertRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriceAlertRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getAffarioPriceAlertOpportunity({
  recommendation,
  currentPrice,
  savingsPotential,
}: AlertOpportunityInput): AffarioPriceAlertOpportunity | null {
  if (
    currentPrice === null ||
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    savingsPotential.status !== "AVAILABLE" ||
    savingsPotential.targetPrice >= currentPrice
  ) {
    return null;
  }

  if (recommendation === "WAIT") {
    return { priority: "PRIMARY", label: "Avvisami quando conviene" };
  }

  if (recommendation === "NEUTRAL" || recommendation === "BUY") {
    return {
      priority: "SECONDARY",
      label: "Avvisami se il prezzo migliora",
    };
  }

  return null;
}

export function resolveTrustedAffarioPriceAlert({
  exactAsin,
  productTitle,
  recommendation,
  currentPrice,
  savingsPotential,
}: TrustedAlertInput): TrustedAffarioPriceAlert | null {
  const opportunity = getAffarioPriceAlertOpportunity({
    recommendation,
    currentPrice,
    savingsPotential,
  });

  if (
    !opportunity ||
    !EXACT_ASIN_PATTERN.test(exactAsin) ||
    !productTitle.trim() ||
    currentPrice === null ||
    savingsPotential.status !== "AVAILABLE"
  ) {
    return null;
  }

  return {
    exactAsin,
    productTitle: productTitle.trim(),
    currentPrice,
    targetPrice: savingsPotential.targetPrice,
  };
}

export function normalizePriceAlertEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedEmail = value.trim().toLowerCase();

  return EMAIL_PATTERN.test(normalizedEmail) ? normalizedEmail : null;
}

export function isPriceAlertPersistenceStatus(
  value: unknown
): value is PriceAlertPersistenceStatus {
  return (
    value === PRICE_ALERT_PENDING_STATUS ||
    value === PRICE_ALERT_ACTIVE_STATUS
  );
}

export function isActivePriceAlertStatus(value: unknown): boolean {
  return value === PRICE_ALERT_ACTIVE_STATUS;
}

export function buildPendingPriceAlertInsert(
  alert: TrustedAffarioPriceAlert,
  email: string,
  managementTokenHash: string,
  confirmationRequestedAt: string
): PendingPriceAlertInsert {
  return {
    product_id: alert.exactAsin,
    product_title: alert.productTitle,
    email,
    target_price: alert.targetPrice,
    current_price: alert.currentPrice,
    status: PRICE_ALERT_PENDING_STATUS,
    manage_token_hash: managementTokenHash,
    confirmation_requested_at: confirmationRequestedAt,
  };
}

function getApiErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }

  return isRecord(payload.error) &&
    typeof payload.error.message === "string" &&
    payload.error.message.trim()
    ? payload.error.message
    : null;
}

async function requestAffarioPriceAlert(
  exactAsin: string,
  email: string,
  requester: PriceAlertRequester
): Promise<PriceAlertRequestResult> {
  const normalizedEmail = normalizePriceAlertEmail(email);

  if (!EXACT_ASIN_PATTERN.test(exactAsin) || normalizedEmail === null) {
    throw new PriceAlertRequestError(
      "Inserisci un indirizzo email valido."
    );
  }

  const response = await requester("/api/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asin: exactAsin, email: normalizedEmail }),
  });
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new PriceAlertRequestError(
      "Non è stato possibile creare l'alert. Riprova."
    );
  }

  if (!response.ok) {
    throw new PriceAlertRequestError(
      getApiErrorMessage(payload) ??
        "Non è stato possibile creare l'alert. Riprova."
    );
  }

  if (
    !isRecord(payload) ||
    payload.success !== true ||
    typeof payload.alreadyExists !== "boolean" ||
    typeof payload.confirmationEmailSent !== "boolean" ||
    !isPriceAlertPersistenceStatus(payload.alertStatus)
  ) {
    throw new PriceAlertRequestError(
      "Non è stato possibile creare l'alert. Riprova."
    );
  }

  return {
    alreadyExists: payload.alreadyExists,
    confirmationEmailSent: payload.confirmationEmailSent,
    alertStatus: payload.alertStatus,
  };
}

export function requestAffarioPriceAlertOnce(
  exactAsin: string,
  email: string,
  gate: PriceAlertRequestGate,
  requester: PriceAlertRequester = (input, init) => fetch(input, init)
): Promise<PriceAlertRequestResult> | null {
  if (gate.inFlight) {
    return null;
  }

  gate.inFlight = true;

  return requestAffarioPriceAlert(exactAsin, email, requester).finally(() => {
    gate.inFlight = false;
  });
}
