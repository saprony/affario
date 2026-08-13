import type { PriceObservation } from "@/services/priceHistory";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

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

export function analyzePriceHistory(
  observations: readonly PriceObservation[]
): PriceHistoryAnalysis | null {
  if (observations.length === 0) {
    return null;
  }

  let latestObservation = observations[0];
  let latestTimestamp = new Date(latestObservation.observedAt).getTime();
  let oldestTimestamp = latestTimestamp;
  let lowestPrice = latestObservation.price;
  let highestPrice = latestObservation.price;
  let totalPrice = 0;

  for (const observation of observations) {
    const observedAtTimestamp = new Date(observation.observedAt).getTime();

    if (observedAtTimestamp > latestTimestamp) {
      latestObservation = observation;
      latestTimestamp = observedAtTimestamp;
    }

    if (observedAtTimestamp < oldestTimestamp) {
      oldestTimestamp = observedAtTimestamp;
    }

    lowestPrice = Math.min(lowestPrice, observation.price);
    highestPrice = Math.max(highestPrice, observation.price);
    totalPrice += observation.price;
  }

  const latestPrice = latestObservation.price;
  const differenceFromLow = latestPrice - lowestPrice;
  const hasPriceRange = highestPrice !== lowestPrice;

  return {
    productId: latestObservation.productId,
    latestPrice: roundToTwoDecimals(latestPrice),
    latestObservedAt: latestObservation.observedAt,
    lowestPrice90Days: roundToTwoDecimals(lowestPrice),
    highestPrice90Days: roundToTwoDecimals(highestPrice),
    averagePrice90Days: roundToTwoDecimals(totalPrice / observations.length),
    observationCount: observations.length,
    coverageDays: roundToTwoDecimals(
      (latestTimestamp - oldestTimestamp) / MILLISECONDS_PER_DAY
    ),
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
