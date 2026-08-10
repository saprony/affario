export type PotentialSavingsResult = {
  targetPrice: number;
  savings: number;
  safetyMarginPercent: number;
};

export function calculatePotentialSavings(
  currentPrice: number,
  lowestPrice90Days: number
): PotentialSavingsResult {
  const safetyMarginPercent = getSafetyMarginPercent(lowestPrice90Days);

  const rawTargetPrice = lowestPrice90Days * (1 + safetyMarginPercent / 100);
  const targetPrice = roundToNearestFive(rawTargetPrice);

  const rawSavings = currentPrice - targetPrice;
  const savings = rawSavings > 0 ? roundToNearestFive(rawSavings) : 0;

  return {
    targetPrice,
    savings,
    safetyMarginPercent,
  };
}

function getSafetyMarginPercent(lowestPrice90Days: number): number {
  if (lowestPrice90Days <= 100) {
    return 10;
  }

  if (lowestPrice90Days <= 500) {
    return 5;
  }

  return 3;
}

function roundToNearestFive(value: number): number {
  return Math.round(value / 5) * 5;
}