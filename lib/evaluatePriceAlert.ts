export const INTERMEDIATE_PROGRESS_THRESHOLD = 50;
export const INTERMEDIATE_MIN_DROP_PERCENT = 3;

export type PriceAlertEvaluationMetrics = {
  initialPrice: number;
  targetPrice: number;
  currentPrice: number;
  priceDrop: number;
  dropPercent: number;
  totalDistance: number;
  progressToTargetPercent: number;
  remainingToTarget: number;
};

export type PriceAlertEvaluation = PriceAlertEvaluationMetrics &
  (
    | { status: "no-action" }
    | { status: "intermediate" }
    | { status: "target-reached" }
  );

export class PriceAlertEvaluationError extends Error {
  readonly code = "INVALID_INPUT";

  constructor(message: string) {
    super(message);
    this.name = "PriceAlertEvaluationError";
  }
}

export function evaluatePriceAlert(
  initialPrice: number,
  targetPrice: number,
  currentPrice: number
): PriceAlertEvaluation {
  validatePrice(initialPrice, "initialPrice");
  validatePrice(targetPrice, "targetPrice");
  validatePrice(currentPrice, "currentPrice");

  if (targetPrice >= initialPrice) {
    throw new PriceAlertEvaluationError(
      "targetPrice deve essere inferiore a initialPrice."
    );
  }

  const totalDistance = initialPrice - targetPrice;
  const priceDrop = initialPrice - currentPrice;
  const progressToTargetPercent = (priceDrop / totalDistance) * 100;
  const dropPercent = (priceDrop / initialPrice) * 100;
  const remainingToTarget = Math.max(currentPrice - targetPrice, 0);
  const metrics: PriceAlertEvaluationMetrics = {
    initialPrice,
    targetPrice,
    currentPrice,
    priceDrop,
    dropPercent,
    totalDistance,
    progressToTargetPercent,
    remainingToTarget,
  };

  if (currentPrice <= targetPrice) {
    return { status: "target-reached", ...metrics };
  }

  if (
    currentPrice > targetPrice &&
    progressToTargetPercent >= INTERMEDIATE_PROGRESS_THRESHOLD &&
    dropPercent >= INTERMEDIATE_MIN_DROP_PERCENT
  ) {
    return { status: "intermediate", ...metrics };
  }

  return { status: "no-action", ...metrics };
}

function validatePrice(price: number, fieldName: string): void {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    throw new PriceAlertEvaluationError(
      `${fieldName} deve essere un numero finito maggiore di zero.`
    );
  }
}
