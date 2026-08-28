export const PRICE_ALERT_CHECK_INTERVAL_MS = {
  FAR: 12 * 60 * 60 * 1_000,
  MEDIUM: 6 * 60 * 60 * 1_000,
  NEAR: 3 * 60 * 60 * 1_000,
  IMMINENT: 60 * 60 * 1_000,
} as const;

export type PriceAlertSchedulingTarget = {
  targetPrice: number;
};

function validatePrice(price: number, fieldName: string): void {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`${fieldName} deve essere maggiore di zero.`);
  }
}

export function getPriceAlertCheckIntervalMs(
  currentPrice: number,
  targetPrice: number
): number {
  validatePrice(currentPrice, "currentPrice");
  validatePrice(targetPrice, "targetPrice");

  if (currentPrice <= targetPrice) {
    return PRICE_ALERT_CHECK_INTERVAL_MS.IMMINENT;
  }

  const distancePercent =
    ((currentPrice - targetPrice) / targetPrice) * 100;

  if (distancePercent > 15) {
    return PRICE_ALERT_CHECK_INTERVAL_MS.FAR;
  }

  if (distancePercent > 8) {
    return PRICE_ALERT_CHECK_INTERVAL_MS.MEDIUM;
  }

  if (distancePercent > 3) {
    return PRICE_ALERT_CHECK_INTERVAL_MS.NEAR;
  }

  return PRICE_ALERT_CHECK_INTERVAL_MS.IMMINENT;
}

export function getPriceAlertGroupIntervalMs(
  currentPrice: number | null,
  alerts: readonly PriceAlertSchedulingTarget[]
): number {
  if (alerts.length === 0) {
    throw new Error("Il gruppo alert non può essere vuoto.");
  }

  if (
    currentPrice === null ||
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0
  ) {
    return PRICE_ALERT_CHECK_INTERVAL_MS.IMMINENT;
  }

  return alerts.reduce(
    (shortestInterval, alert) =>
      Math.min(
        shortestInterval,
        getPriceAlertCheckIntervalMs(currentPrice, alert.targetPrice)
      ),
    PRICE_ALERT_CHECK_INTERVAL_MS.FAR
  );
}

export function isPriceAlertGroupDue(input: {
  requestedAt: string | null;
  intervalMs: number;
  now: Date;
}): boolean {
  if (!Number.isFinite(input.intervalMs) || input.intervalMs < 0) {
    throw new Error("intervalMs non è valido.");
  }

  const nowMilliseconds = input.now.getTime();

  if (!Number.isFinite(nowMilliseconds)) {
    throw new Error("now non è una data valida.");
  }

  if (input.requestedAt === null) {
    return true;
  }

  const requestedAtMilliseconds = Date.parse(input.requestedAt);

  if (!Number.isFinite(requestedAtMilliseconds)) {
    return true;
  }

  return nowMilliseconds - requestedAtMilliseconds >= input.intervalMs;
}
