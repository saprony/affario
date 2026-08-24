import type { PriceObservation } from "@/services/priceHistory";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export const MINIMUM_SINCE_AVAILABLE_HISTORY_OBSERVATIONS = 4;
export const MINIMUM_SINCE_AVAILABLE_HISTORY_COVERAGE_DAYS = 30;
export const FULL_YEAR_HISTORY_COVERAGE_DAYS = 365;

export type PriceHistoryQualityPoint = {
  price: number;
  observedAt: string;
};

export type PriceHistoryQuality = {
  observationCount: number;
  coverageDays: number;
};

export type PriceHistoryWindowPoint = {
  price: number | null;
  observedAt: string;
};

export type PriceHistoryWindowMinimum = {
  minimumPrice: number | null;
  hasReliableCoverage: boolean;
};

export type PriceHistorySinceAvailableMinimum =
  PriceHistoryWindowMinimum & {
    observationCount: number;
    coverageDays: number;
  };

export type PriceHistoryAnalysis = {
  productId: string;
  latestPrice: number;
  latestObservedAt: string;
  lowestPrice90Days: number;
  highestPrice90Days: number;
  averagePrice90Days: number;
  observationCount: number;
  coverageDays: number;
  differenceFromLow: number;
  differenceFromLowPercent: number;
  rangePositionPercent: number | null;
};

export function analyzePriceHistoryQuality(
  observations: readonly PriceHistoryQualityPoint[]
): PriceHistoryQuality {
  let observationCount = 0;
  let oldestTimestamp = Number.POSITIVE_INFINITY;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (const observation of observations) {
    const observedAtTimestamp = Date.parse(observation.observedAt);

    if (
      !Number.isFinite(observation.price) ||
      observation.price <= 0 ||
      !Number.isFinite(observedAtTimestamp)
    ) {
      continue;
    }

    observationCount += 1;
    oldestTimestamp = Math.min(oldestTimestamp, observedAtTimestamp);
    latestTimestamp = Math.max(latestTimestamp, observedAtTimestamp);
  }

  return {
    observationCount,
    coverageDays:
      observationCount === 0
        ? 0
        : (latestTimestamp - oldestTimestamp) / MILLISECONDS_PER_DAY,
  };
}

export function analyzePriceHistoryWindowMinimum(input: {
  observations: readonly PriceHistoryWindowPoint[];
  windowStart: string;
  windowEnd: string;
  isTruncated: boolean;
}): PriceHistoryWindowMinimum {
  const windowStartTimestamp = Date.parse(input.windowStart);
  const windowEndTimestamp = Date.parse(input.windowEnd);

  if (
    input.isTruncated ||
    !Number.isFinite(windowStartTimestamp) ||
    !Number.isFinite(windowEndTimestamp) ||
    windowStartTimestamp >= windowEndTimestamp
  ) {
    return { minimumPrice: null, hasReliableCoverage: false };
  }

  let startStateTimestamp = Number.NEGATIVE_INFINITY;
  let startStatePrice: number | null = null;
  let hasStartState = false;
  let minimumPrice = Number.POSITIVE_INFINITY;

  for (const observation of input.observations) {
    const observedAtTimestamp = Date.parse(observation.observedAt);

    if (
      !Number.isFinite(observedAtTimestamp) ||
      observedAtTimestamp > windowEndTimestamp
    ) {
      continue;
    }

    if (observedAtTimestamp <= windowStartTimestamp) {
      if (observedAtTimestamp >= startStateTimestamp) {
        startStateTimestamp = observedAtTimestamp;
        startStatePrice = observation.price;
        hasStartState = true;
      }

      continue;
    }

    if (
      typeof observation.price === "number" &&
      Number.isFinite(observation.price) &&
      observation.price > 0
    ) {
      minimumPrice = Math.min(minimumPrice, observation.price);
    }
  }

  if (!hasStartState) {
    return { minimumPrice: null, hasReliableCoverage: false };
  }

  if (
    typeof startStatePrice === "number" &&
    Number.isFinite(startStatePrice) &&
    startStatePrice > 0
  ) {
    minimumPrice = Math.min(minimumPrice, startStatePrice);
  }

  return {
    minimumPrice:
      minimumPrice === Number.POSITIVE_INFINITY ? null : minimumPrice,
    hasReliableCoverage: true,
  };
}

export function analyzePriceHistorySinceAvailableMinimum(input: {
  observations: readonly PriceHistoryWindowPoint[];
  trackingStartedAt: string | null;
  listedAt: string | null;
  windowEnd: string;
  isCompleteSeries: boolean;
  isTruncated: boolean;
}): PriceHistorySinceAvailableMinimum {
  const trackingStartedAtTimestamp = Date.parse(
    input.trackingStartedAt ?? ""
  );
  const listedAtTimestamp = Date.parse(input.listedAt ?? "");
  const windowEndTimestamp = Date.parse(input.windowEnd);
  const unavailable = {
    minimumPrice: null,
    hasReliableCoverage: false,
    observationCount: 0,
    coverageDays: 0,
  };

  if (
    input.isTruncated ||
    !input.isCompleteSeries ||
    !Number.isFinite(trackingStartedAtTimestamp) ||
    !Number.isFinite(listedAtTimestamp) ||
    !Number.isFinite(windowEndTimestamp) ||
    trackingStartedAtTimestamp > listedAtTimestamp ||
    listedAtTimestamp >= windowEndTimestamp
  ) {
    return unavailable;
  }

  const coverageDays =
    (windowEndTimestamp - listedAtTimestamp) / MILLISECONDS_PER_DAY;

  if (
    coverageDays < MINIMUM_SINCE_AVAILABLE_HISTORY_COVERAGE_DAYS ||
    coverageDays >= FULL_YEAR_HISTORY_COVERAGE_DAYS
  ) {
    return { ...unavailable, coverageDays };
  }

  let observationCount = 0;
  let minimumPrice = Number.POSITIVE_INFINITY;

  for (const observation of input.observations) {
    const observedAtTimestamp = Date.parse(observation.observedAt);

    if (
      !Number.isFinite(observedAtTimestamp) ||
      observedAtTimestamp < listedAtTimestamp ||
      observedAtTimestamp > windowEndTimestamp ||
      typeof observation.price !== "number" ||
      !Number.isFinite(observation.price) ||
      observation.price <= 0
    ) {
      continue;
    }

    observationCount += 1;
    minimumPrice = Math.min(minimumPrice, observation.price);
  }

  if (
    observationCount < MINIMUM_SINCE_AVAILABLE_HISTORY_OBSERVATIONS
  ) {
    return {
      ...unavailable,
      observationCount,
      coverageDays,
    };
  }

  return {
    minimumPrice,
    hasReliableCoverage: true,
    observationCount,
    coverageDays,
  };
}

export function analyzePriceHistory(
  observations: readonly PriceObservation[]
): PriceHistoryAnalysis | null {
  if (observations.length === 0) {
    return null;
  }

  let latestObservation = observations[0];
  let latestTimestamp = new Date(latestObservation.observedAt).getTime();
  let lowestPrice = latestObservation.price;
  let highestPrice = latestObservation.price;
  let totalPrice = 0;

  for (const observation of observations) {
    const observedAtTimestamp = new Date(observation.observedAt).getTime();

    if (observedAtTimestamp > latestTimestamp) {
      latestObservation = observation;
      latestTimestamp = observedAtTimestamp;
    }

    lowestPrice = Math.min(lowestPrice, observation.price);
    highestPrice = Math.max(highestPrice, observation.price);
    totalPrice += observation.price;
  }

  const latestPrice = latestObservation.price;
  const differenceFromLow = latestPrice - lowestPrice;
  const hasPriceRange = highestPrice !== lowestPrice;
  const quality = analyzePriceHistoryQuality(observations);

  return {
    productId: latestObservation.productId,
    latestPrice: roundToTwoDecimals(latestPrice),
    latestObservedAt: latestObservation.observedAt,
    lowestPrice90Days: roundToTwoDecimals(lowestPrice),
    highestPrice90Days: roundToTwoDecimals(highestPrice),
    averagePrice90Days: roundToTwoDecimals(totalPrice / observations.length),
    observationCount: quality.observationCount,
    coverageDays: roundToTwoDecimals(quality.coverageDays),
    differenceFromLow: roundToTwoDecimals(differenceFromLow),
    differenceFromLowPercent: roundToTwoDecimals(
      (differenceFromLow / lowestPrice) * 100
    ),
    rangePositionPercent: hasPriceRange
      ? roundToTwoDecimals(
          (differenceFromLow / (highestPrice - lowestPrice)) * 100
        )
      : null,
  };
}

function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2));
}
