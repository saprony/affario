import type {
  AffarioAdvice,
  AffarioAdviceLabel,
  AffarioPriceHighlight,
  AffarioAdviceRecommendation,
  AffarioAdviceTone,
} from "../types/affarioAdvice";

export const AFFARIO_MINIMUM_HISTORY_OBSERVATIONS = 4;
export const AFFARIO_MINIMUM_HISTORY_COVERAGE_DAYS = 7;
export const AFFARIO_LOWEST_12_MONTHS_LABEL =
  "🏆 PREZZO PIÙ BASSO DEGLI ULTIMI 12 MESI";
export const AFFARIO_LOWEST_SINCE_AVAILABLE_LABEL =
  "🏆 PREZZO PIÙ BASSO DI SEMPRE";

export type AffarioAdviceInput = {
  currentPrice: number | null;
  minimumPrice90Days: number | null;
  averagePrice90Days: number | null;
  observationCount: number;
  coverageDays: number;
  minimumPrice365Days: number | null;
  hasReliable365DayCoverage: boolean;
  minimumPriceSinceAvailable: number | null;
  hasReliableSinceAvailableCoverage: boolean;
};

export type AffarioAdviceBand = {
  label: Exclude<AffarioAdviceLabel, "Dati insufficienti">;
  tone: Exclude<AffarioAdviceTone, "MUTED">;
};

const INSUFFICIENT_DATA_MESSAGE =
  "AFFARIO non ha ancora abbastanza storico per esprimere un consiglio affidabile.";

function isPositiveFiniteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function calculateAffarioScore(
  currentPrice: number | null,
  minimumPrice90Days: number | null,
  averagePrice90Days: number | null
): number | null {
  if (
    !isPositiveFiniteNumber(currentPrice) ||
    !isPositiveFiniteNumber(minimumPrice90Days) ||
    !isPositiveFiniteNumber(averagePrice90Days) ||
    minimumPrice90Days > averagePrice90Days
  ) {
    return null;
  }

  if (currentPrice <= minimumPrice90Days) {
    return 100;
  }

  if (currentPrice < averagePrice90Days) {
    const priceRange = averagePrice90Days - minimumPrice90Days;

    if (priceRange <= 0) {
      return null;
    }

    return clampScore(
      50 +
        50 *
          ((averagePrice90Days - currentPrice) / priceRange)
    );
  }

  if (currentPrice === averagePrice90Days) {
    return 50;
  }

  return clampScore(
    50 *
      (1 -
        (currentPrice - averagePrice90Days) /
          (averagePrice90Days * 0.2))
  );
}

export function getAffarioAdviceBand(
  score: number
): AffarioAdviceBand | null {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    return null;
  }

  if (score >= 80) {
    return { label: "Ottimo momento", tone: "POSITIVE" };
  }

  if (score >= 65) {
    return { label: "Buon prezzo", tone: "POSITIVE" };
  }

  if (score >= 50) {
    return { label: "Prezzo nella media", tone: "NEUTRAL" };
  }

  return { label: "Conviene aspettare", tone: "NEGATIVE" };
}

export function getAffarioAdviceRecommendation(
  score: number | null
): AffarioAdviceRecommendation {
  if (score === null || !Number.isInteger(score) || score < 0 || score > 100) {
    return "NONE";
  }

  if (score >= 80) {
    return "BUY_NOW";
  }

  if (score >= 65) {
    return "BUY";
  }

  if (score >= 50) {
    return "NEUTRAL";
  }

  return "WAIT";
}

function getAdviceMessage(
  score: number,
  currentPrice: number,
  minimumPrice90Days: number
): string {
  if (currentPrice <= minimumPrice90Days) {
    return "Il prezzo attuale è al minimo degli ultimi 90 giorni.";
  }

  if (score >= 80) {
    return "Il prezzo attuale è molto vicino ai minimi recenti e sotto la media degli ultimi 90 giorni.";
  }

  if (score >= 65) {
    return "Il prezzo attuale è sotto la media degli ultimi 90 giorni, anche se non è ai minimi recenti.";
  }

  if (score >= 50) {
    return "Il prezzo attuale è in linea con la media recente.";
  }

  return "Il prezzo attuale è sopra la media degli ultimi 90 giorni. AFFARIO suggerisce di aspettare.";
}

function getInsufficientDataAdvice(
  priceHighlight: AffarioPriceHighlight = null
): AffarioAdvice {
  return {
    status: "INSUFFICIENT_DATA",
    score: null,
    label: "Dati insufficienti",
    message: INSUFFICIENT_DATA_MESSAGE,
    tone: "MUTED",
    recommendation: "NONE",
    priceHighlight,
  };
}

export function getAffarioPriceHighlight(input: {
  currentPrice: number | null;
  minimumPrice365Days: number | null;
  hasReliable365DayCoverage: boolean;
  minimumPriceSinceAvailable: number | null;
  hasReliableSinceAvailableCoverage: boolean;
}): AffarioPriceHighlight {
  if (!isPositiveFiniteNumber(input.currentPrice)) {
    return null;
  }

  if (
    input.hasReliable365DayCoverage &&
    isPositiveFiniteNumber(input.minimumPrice365Days) &&
    input.currentPrice <= input.minimumPrice365Days
  ) {
    return "LOWEST_12_MONTHS";
  }

  if (
    input.hasReliableSinceAvailableCoverage &&
    isPositiveFiniteNumber(input.minimumPriceSinceAvailable) &&
    input.currentPrice <= input.minimumPriceSinceAvailable
  ) {
    return "LOWEST_SINCE_AVAILABLE";
  }

  return null;
}

export function createAffarioAdvice(
  input: AffarioAdviceInput
): AffarioAdvice {
  const priceHighlight = getAffarioPriceHighlight(input);

  if (
    !Number.isInteger(input.observationCount) ||
    input.observationCount < AFFARIO_MINIMUM_HISTORY_OBSERVATIONS ||
    !Number.isFinite(input.coverageDays) ||
    input.coverageDays < AFFARIO_MINIMUM_HISTORY_COVERAGE_DAYS
  ) {
    return getInsufficientDataAdvice(priceHighlight);
  }

  const score = calculateAffarioScore(
    input.currentPrice,
    input.minimumPrice90Days,
    input.averagePrice90Days
  );
  const band = score === null ? null : getAffarioAdviceBand(score);

  if (
    score === null ||
    !band ||
    input.currentPrice === null ||
    input.minimumPrice90Days === null
  ) {
    return getInsufficientDataAdvice(priceHighlight);
  }

  return {
    status: "AVAILABLE",
    score,
    label: band.label,
    message: getAdviceMessage(
      score,
      input.currentPrice,
      input.minimumPrice90Days
    ),
    tone: band.tone,
    recommendation: getAffarioAdviceRecommendation(score),
    priceHighlight,
  };
}
