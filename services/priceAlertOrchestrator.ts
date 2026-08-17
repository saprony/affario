import "server-only";

import {
  evaluatePriceAlert,
  type PriceAlertEvaluation,
} from "@/lib/evaluatePriceAlert";
import {
  getIntermediateNotificationState,
  getTargetNotificationState,
  type IntermediateNotificationState,
  type TargetNotificationState,
} from "@/services/priceAlertNotificationState";

type NoActionEvaluation = Extract<
  PriceAlertEvaluation,
  { status: "no-action" }
>;
type IntermediateEvaluation = Extract<
  PriceAlertEvaluation,
  { status: "intermediate" }
>;
type TargetReachedEvaluation = Extract<
  PriceAlertEvaluation,
  { status: "target-reached" }
>;
type CommunicationEvaluation =
  | IntermediateEvaluation
  | TargetReachedEvaluation;

export type PriceAlertHandledReason =
  | "intermediate-already-sent"
  | "target-already-sent";

export type PriceAlertAction =
  | { action: "no-action"; evaluation: NoActionEvaluation }
  | { action: "send-intermediate"; evaluation: IntermediateEvaluation }
  | { action: "send-target"; evaluation: TargetReachedEvaluation }
  | {
      action: "already-handled";
      reason: "intermediate-already-sent";
      evaluation: IntermediateEvaluation;
    }
  | {
      action: "already-handled";
      reason: "target-already-sent";
      evaluation: CommunicationEvaluation;
    }
  | { action: "not-found"; evaluation: CommunicationEvaluation };

export type PriceAlertNotificationStateReaders = {
  getIntermediateNotificationState: (
    alertId: number
  ) => Promise<IntermediateNotificationState>;
  getTargetNotificationState: (
    alertId: number
  ) => Promise<TargetNotificationState>;
};

export type PriceAlertActionResolver = (
  alertId: number,
  initialPrice: number,
  targetPrice: number,
  currentPrice: number
) => Promise<PriceAlertAction>;

export function createPriceAlertActionResolver(
  stateReaders: PriceAlertNotificationStateReaders
): PriceAlertActionResolver {
  return async (alertId, initialPrice, targetPrice, currentPrice) => {
    const evaluation = evaluatePriceAlert(
      initialPrice,
      targetPrice,
      currentPrice
    );

    if (evaluation.status === "no-action") {
      return { action: "no-action", evaluation };
    }

    const targetState =
      await stateReaders.getTargetNotificationState(alertId);

    if (targetState.status === "not-found") {
      return { action: "not-found", evaluation };
    }

    if (targetState.status === "sent") {
      return {
        action: "already-handled",
        reason: "target-already-sent",
        evaluation,
      };
    }

    if (evaluation.status === "target-reached") {
      return { action: "send-target", evaluation };
    }

    const intermediateState =
      await stateReaders.getIntermediateNotificationState(alertId);

    if (intermediateState.status === "not-found") {
      return { action: "not-found", evaluation };
    }

    if (intermediateState.status === "sent") {
      return {
        action: "already-handled",
        reason: "intermediate-already-sent",
        evaluation,
      };
    }

    return { action: "send-intermediate", evaluation };
  };
}

const resolvePriceAlertAction = createPriceAlertActionResolver({
  getIntermediateNotificationState,
  getTargetNotificationState,
});

export async function getPriceAlertAction(
  alertId: number,
  initialPrice: number,
  targetPrice: number,
  currentPrice: number
): Promise<PriceAlertAction> {
  return resolvePriceAlertAction(
    alertId,
    initialPrice,
    targetPrice,
    currentPrice
  );
}
