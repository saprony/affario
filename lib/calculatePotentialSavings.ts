import {
  AFFARIO_MINIMUM_HISTORY_COVERAGE_DAYS,
  AFFARIO_MINIMUM_HISTORY_OBSERVATIONS,
} from "./affarioAdvice";
import { analyzePriceHistoryQuality } from "./analyzePriceHistory";
import type { AffarioSavingsPotential } from "../types/productAnalysis";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;
const AFFARIO_TARGET_PERCENTILE = 0.25;

export const AFFARIO_SAVINGS_POTENTIAL_MESSAGE =
  "Stima basata sui prezzi favorevoli realmente osservati negli ultimi 90 giorni.";

export type TimeWeightedBuyBoxPoint = {
  price: number | null;
  observedAt: string;
};

export type AffarioPotentialSavingsAnalysis = {
  weightedPercentile25: number | null;
  targetPrice: number | null;
  potentialSavings: number | null;
  validPriceDurationDays: number;
  calendarCoverageDays: number;
  savingsPotential: AffarioSavingsPotential;
};

export type AffarioPotentialSavingsInput = {
  currentPrice: number | null;
  observations: readonly TimeWeightedBuyBoxPoint[];
  windowStart: string;
  windowEnd: string;
  isTruncated: boolean;
};

type TimestampedBuyBoxPoint = {
  price: number | null;
  observedAt: string;
  timestamp: number;
};

function insufficientAnalysis(
  calendarCoverageDays = 0,
  validPriceDurationDays = 0
): AffarioPotentialSavingsAnalysis {
  return {
    weightedPercentile25: null,
    targetPrice: null,
    potentialSavings: null,
    validPriceDurationDays,
    calendarCoverageDays,
    savingsPotential: {
      status: "INSUFFICIENT_DATA",
      amount: null,
      targetPrice: null,
      message: null,
    },
  };
}

function notApplicableAnalysis(input: {
  weightedPercentile25: number;
  targetPrice: number;
  validPriceDurationDays: number;
  calendarCoverageDays: number;
}): AffarioPotentialSavingsAnalysis {
  return {
    ...input,
    potentialSavings: null,
    savingsPotential: {
      status: "NOT_APPLICABLE",
      amount: null,
      targetPrice: null,
      message: null,
    },
  };
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function roundAffarioAmountToNearestFive(
  value: number
): number | null {
  if (!isPositiveFiniteNumber(value)) {
    return null;
  }

  return Math.floor(value / 5 + 0.5) * 5;
}

function normalizeObservations(
  observations: readonly TimeWeightedBuyBoxPoint[]
): TimestampedBuyBoxPoint[] | null {
  const normalized: TimestampedBuyBoxPoint[] = [];

  for (const observation of observations) {
    const timestamp = Date.parse(observation.observedAt);

    if (
      !Number.isFinite(timestamp) ||
      (observation.price !== null &&
        !isPositiveFiniteNumber(observation.price))
    ) {
      return null;
    }

    normalized.push({ ...observation, timestamp });
  }

  normalized.sort((left, right) => left.timestamp - right.timestamp);

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].timestamp === normalized[index].timestamp) {
      return null;
    }
  }

  return normalized;
}

function addPriceDuration(
  durationsByPrice: Map<number, number>,
  price: number | null,
  durationMilliseconds: number
): number {
  if (price === null || durationMilliseconds <= 0) {
    return 0;
  }

  durationsByPrice.set(
    price,
    (durationsByPrice.get(price) ?? 0) + durationMilliseconds
  );

  return durationMilliseconds;
}

function getWeightedPercentile25(
  durationsByPrice: ReadonlyMap<number, number>,
  totalValidDurationMilliseconds: number
): number | null {
  if (totalValidDurationMilliseconds <= 0) {
    return null;
  }

  const threshold =
    totalValidDurationMilliseconds * AFFARIO_TARGET_PERCENTILE;
  let cumulativeDuration = 0;

  for (const [price, duration] of [...durationsByPrice].sort(
    ([leftPrice], [rightPrice]) => leftPrice - rightPrice
  )) {
    cumulativeDuration += duration;

    if (cumulativeDuration >= threshold) {
      return price;
    }
  }

  return null;
}

export function calculatePotentialSavings(
  input: AffarioPotentialSavingsInput
): AffarioPotentialSavingsAnalysis {
  const windowStartTimestamp = Date.parse(input.windowStart);
  const windowEndTimestamp = Date.parse(input.windowEnd);

  if (
    input.isTruncated ||
    !isPositiveFiniteNumber(input.currentPrice) ||
    !Number.isFinite(windowStartTimestamp) ||
    !Number.isFinite(windowEndTimestamp) ||
    windowStartTimestamp >= windowEndTimestamp
  ) {
    return insufficientAnalysis();
  }

  const calendarCoverageDays =
    (windowEndTimestamp - windowStartTimestamp) / MILLISECONDS_PER_DAY;
  const observations = normalizeObservations(input.observations);

  if (!observations) {
    return insufficientAnalysis(calendarCoverageDays);
  }

  let hasStartState = false;
  let currentState: number | null = null;

  for (const observation of observations) {
    if (observation.timestamp > windowStartTimestamp) {
      break;
    }

    hasStartState = true;
    currentState = observation.price;
  }

  if (!hasStartState) {
    return insufficientAnalysis(calendarCoverageDays);
  }

  const observationsInWindow = observations.filter(
    (observation) =>
      observation.timestamp >= windowStartTimestamp &&
      observation.timestamp <= windowEndTimestamp
  );
  const quality = analyzePriceHistoryQuality(
    observationsInWindow
      .filter((observation) => observation.price !== null)
      .map((observation) => ({
        price: observation.price as number,
        observedAt: observation.observedAt,
      }))
  );

  if (
    quality.observationCount < AFFARIO_MINIMUM_HISTORY_OBSERVATIONS ||
    quality.coverageDays < AFFARIO_MINIMUM_HISTORY_COVERAGE_DAYS
  ) {
    return insufficientAnalysis(calendarCoverageDays);
  }

  const durationsByPrice = new Map<number, number>();
  let cursorTimestamp = windowStartTimestamp;
  let validPriceDurationMilliseconds = 0;

  for (const observation of observations) {
    if (
      observation.timestamp <= windowStartTimestamp ||
      observation.timestamp > windowEndTimestamp
    ) {
      continue;
    }

    validPriceDurationMilliseconds += addPriceDuration(
      durationsByPrice,
      currentState,
      observation.timestamp - cursorTimestamp
    );
    currentState = observation.price;
    cursorTimestamp = observation.timestamp;
  }

  validPriceDurationMilliseconds += addPriceDuration(
    durationsByPrice,
    currentState,
    windowEndTimestamp - cursorTimestamp
  );

  const validPriceDurationDays =
    validPriceDurationMilliseconds / MILLISECONDS_PER_DAY;

  if (
    validPriceDurationDays < AFFARIO_MINIMUM_HISTORY_COVERAGE_DAYS
  ) {
    return insufficientAnalysis(
      calendarCoverageDays,
      validPriceDurationDays
    );
  }

  const weightedPercentile25 = getWeightedPercentile25(
    durationsByPrice,
    validPriceDurationMilliseconds
  );
  const targetPrice =
    weightedPercentile25 === null
      ? null
      : roundAffarioAmountToNearestFive(weightedPercentile25);

  if (weightedPercentile25 === null || targetPrice === null) {
    return insufficientAnalysis(
      calendarCoverageDays,
      validPriceDurationDays
    );
  }

  const potentialSavingsRaw = input.currentPrice - targetPrice;

  if (potentialSavingsRaw <= 0) {
    return notApplicableAnalysis({
      weightedPercentile25,
      targetPrice,
      validPriceDurationDays,
      calendarCoverageDays,
    });
  }

  const potentialSavings = roundAffarioAmountToNearestFive(
    potentialSavingsRaw
  );

  if (potentialSavings === null || potentialSavings <= 0) {
    return notApplicableAnalysis({
      weightedPercentile25,
      targetPrice,
      validPriceDurationDays,
      calendarCoverageDays,
    });
  }

  return {
    weightedPercentile25,
    targetPrice,
    potentialSavings,
    validPriceDurationDays,
    calendarCoverageDays,
    savingsPotential: {
      status: "AVAILABLE",
      amount: potentialSavings,
      targetPrice,
      message: AFFARIO_SAVINGS_POTENTIAL_MESSAGE,
    },
  };
}
