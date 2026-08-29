import "server-only";

import {
  isExactPriceAlertAsin,
  normalizePriceAlertEmail,
  PRICE_ALERT_ACTIVE_STATUS,
  PRICE_ALERT_NOTIFYING_TARGET_STATUS,
} from "@/lib/affarioPriceAlert";
import { buildAmazonAffiliateProductUrl } from "@/lib/amazonAffiliateLink";
import { evaluatePriceAlert } from "@/lib/evaluatePriceAlert";
import {
  getPriceAlertGroupIntervalMs,
  isPriceAlertGroupDue,
} from "@/lib/priceAlertMonitoring";
import { getAffarioProductByAsin } from "@/services/affarioProductLookup";
import {
  KeepaClientError,
  type KeepaTokenBudgetStatus,
} from "@/services/keepaClient";
import {
  getTargetPriceAlertEmailEventStatus,
  sendTargetPriceAlertEmail,
} from "@/services/brevoTransactionalEmail";
import {
  claimTargetNotification,
  completeTargetNotification,
  recordTargetReachedOutcome,
  releaseTargetNotificationClaim,
} from "@/services/priceAlertNotificationState";
import {
  getLatestPriceAlertProductCheck,
  loadActivePriceAlerts,
  loadStaleTargetNotificationClaims,
  type StoredActivePriceAlert,
} from "@/services/priceAlertMonitoringStore";

export const TARGET_NOTIFICATION_CLAIM_LEASE_MS = 60 * 60 * 1_000;

export type PriceAlertMonitoringRecord = {
  id: number;
  productId: string;
  productTitle: string;
  email: string;
  initialPrice: number;
  targetPrice: number;
  status: string;
  notifiedAt: string | null;
  targetNotificationClaimedAt: string | null;
  targetReachedAt: string | null;
  targetReachedPrice: number | null;
};

export type PriceAlertProductCheck = {
  requestedAt: string;
  currentPrice: number | null;
};

export type PriceAlertProductLookup = {
  exactAsin: string;
  currentPrice: number | null;
  cacheHit: boolean;
  tokenBudgetStatus: KeepaTokenBudgetStatus;
};

export class PriceAlertMonitoringLookupControlError extends Error {
  constructor(
    public readonly reason: "TOKEN_RESERVE" | "RATE_LIMITED",
    public readonly tokenBudgetStatus: KeepaTokenBudgetStatus
  ) {
    super("Price alert product lookup was stopped by provider capacity.");
    this.name = "PriceAlertMonitoringLookupControlError";
  }
}

export type TargetReachedOutcome = {
  status: "recorded" | "existing";
  reachedAt: string;
  reachedPrice: number;
};

export type TargetPriceAlertDelivery = {
  alertId: number;
  recipientEmail: string;
  exactAsin: string;
  productName: string;
  currentPrice: number;
  targetPrice: number;
  amazonUrl: string;
};

export type TargetEmailSendResult =
  | { status: "accepted" }
  | { status: "rejected" }
  | { status: "unknown" };

export type TargetEmailProviderEventStatus =
  | "accepted"
  | "not-found"
  | "unknown";

export type PriceAlertCheckOptions = {
  maxAsins?: number;
};

export type PriceAlertMonitoringDependencies = {
  loadAlerts: () => Promise<readonly PriceAlertMonitoringRecord[]>;
  loadStaleClaims: (
    staleBefore: string
  ) => Promise<readonly PriceAlertMonitoringRecord[]>;
  getLatestProductCheck: (
    exactAsin: string
  ) => Promise<PriceAlertProductCheck | null>;
  lookupProduct: (
    exactAsin: string
  ) => Promise<PriceAlertProductLookup>;
  recordTargetOutcome: (
    alertId: number,
    reachedPrice: number,
    reachedAt: Date
  ) => Promise<TargetReachedOutcome | null>;
  claimTarget: (alertId: number, claimedAt: Date) => Promise<boolean>;
  completeTarget: (alertId: number, notifiedAt: Date) => Promise<boolean>;
  releaseTarget: (alertId: number) => Promise<boolean>;
  sendTargetEmail: (
    delivery: TargetPriceAlertDelivery
  ) => Promise<TargetEmailSendResult>;
  getTargetEmailEventStatus: (
    alertId: number,
    claimedAt: string
  ) => Promise<TargetEmailProviderEventStatus>;
  clock: () => Date;
};

export type PriceAlertCheckReport = {
  activeAlerts: number;
  eligibleAlerts: number;
  excludedAlerts: number;
  invalidAlerts: number;
  uniqueAsins: number;
  dueAsins: number;
  deferredAsins: number;
  backgroundDeferredForRunLimit: number;
  productLookups: number;
  cacheHits: number;
  refreshedProducts: number;
  targetsReached: number;
  outcomesRecorded: number;
  outcomeFailures: number;
  notificationsSent: number;
  notificationFailures: number;
  ambiguousNotifications: number;
  claimConflicts: number;
  claimFailures: number;
  claimReleaseFailures: number;
  finalizationFailures: number;
  staleClaims: number;
  staleClaimsRecovered: number;
  staleClaimsRetried: number;
  staleClaimsUnknown: number;
  invalidStaleClaims: number;
  skippedNotDue: number;
  schedulingFailures: number;
  lookupFailures: number;
  unavailablePrices: number;
  tokenBudgetStatus: KeepaTokenBudgetStatus;
  backgroundSkippedForReserve: number;
  keepaRateLimited: number;
};

type EligiblePriceAlert = PriceAlertMonitoringRecord & {
  status: typeof PRICE_ALERT_ACTIVE_STATUS;
};

type StaleTargetClaim = PriceAlertMonitoringRecord & {
  status: typeof PRICE_ALERT_NOTIFYING_TARGET_STATUS;
  targetNotificationClaimedAt: string;
  targetReachedAt: string;
  targetReachedPrice: number;
};

type ScheduledPriceAlertGroup = {
  exactAsin: string;
  alerts: EligiblePriceAlert[];
  latestCheck: PriceAlertProductCheck | null;
  dueAtMilliseconds: number | null;
};

function isPositivePrice(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function hasValidOutcomePair(alert: PriceAlertMonitoringRecord): boolean {
  if (
    alert.targetReachedAt === null &&
    alert.targetReachedPrice === null
  ) {
    return true;
  }

  return (
    typeof alert.targetReachedAt === "string" &&
    Number.isFinite(Date.parse(alert.targetReachedAt)) &&
    typeof alert.targetReachedPrice === "number" &&
    isPositivePrice(alert.targetReachedPrice) &&
    alert.targetReachedPrice <= alert.targetPrice
  );
}

function hasTargetOutcome(
  alert: PriceAlertMonitoringRecord
): alert is PriceAlertMonitoringRecord & {
  targetReachedAt: string;
  targetReachedPrice: number;
} {
  return (
    typeof alert.targetReachedAt === "string" &&
    typeof alert.targetReachedPrice === "number"
  );
}

function hasValidBaseFields(alert: PriceAlertMonitoringRecord): boolean {
  return (
    Number.isSafeInteger(alert.id) &&
    alert.id > 0 &&
    isExactPriceAlertAsin(alert.productId) &&
    Boolean(alert.productTitle.trim()) &&
    normalizePriceAlertEmail(alert.email) !== null &&
    isPositivePrice(alert.initialPrice) &&
    isPositivePrice(alert.targetPrice) &&
    alert.targetPrice < alert.initialPrice &&
    hasValidOutcomePair(alert)
  );
}

function isEligibleAlert(
  alert: PriceAlertMonitoringRecord
): alert is EligiblePriceAlert {
  return (
    hasValidBaseFields(alert) &&
    alert.status === PRICE_ALERT_ACTIVE_STATUS &&
    alert.notifiedAt === null &&
    alert.targetNotificationClaimedAt === null
  );
}

function isStaleTargetClaim(
  alert: PriceAlertMonitoringRecord
): alert is StaleTargetClaim {
  return (
    hasValidBaseFields(alert) &&
    alert.status === PRICE_ALERT_NOTIFYING_TARGET_STATUS &&
    alert.notifiedAt === null &&
    typeof alert.targetNotificationClaimedAt === "string" &&
    Number.isFinite(Date.parse(alert.targetNotificationClaimedAt)) &&
    hasTargetOutcome(alert)
  );
}

function groupAlertsByExactAsin(
  alerts: readonly EligiblePriceAlert[]
): Map<string, EligiblePriceAlert[]> {
  const groups = new Map<string, EligiblePriceAlert[]>();

  for (const alert of alerts) {
    const group = groups.get(alert.productId);

    if (group) {
      group.push(alert);
    } else {
      groups.set(alert.productId, [alert]);
    }
  }

  return groups;
}

function compareScheduledGroups(
  left: ScheduledPriceAlertGroup,
  right: ScheduledPriceAlertGroup
): number {
  const leftNeverChecked = left.dueAtMilliseconds === null;
  const rightNeverChecked = right.dueAtMilliseconds === null;

  if (leftNeverChecked !== rightNeverChecked) {
    return leftNeverChecked ? -1 : 1;
  }

  if (
    left.dueAtMilliseconds !== null &&
    right.dueAtMilliseconds !== null &&
    left.dueAtMilliseconds !== right.dueAtMilliseconds
  ) {
    return left.dueAtMilliseconds - right.dueAtMilliseconds;
  }

  return left.exactAsin.localeCompare(right.exactAsin);
}

function createEmptyReport(): PriceAlertCheckReport {
  return {
    activeAlerts: 0,
    eligibleAlerts: 0,
    excludedAlerts: 0,
    invalidAlerts: 0,
    uniqueAsins: 0,
    dueAsins: 0,
    deferredAsins: 0,
    backgroundDeferredForRunLimit: 0,
    productLookups: 0,
    cacheHits: 0,
    refreshedProducts: 0,
    targetsReached: 0,
    outcomesRecorded: 0,
    outcomeFailures: 0,
    notificationsSent: 0,
    notificationFailures: 0,
    ambiguousNotifications: 0,
    claimConflicts: 0,
    claimFailures: 0,
    claimReleaseFailures: 0,
    finalizationFailures: 0,
    staleClaims: 0,
    staleClaimsRecovered: 0,
    staleClaimsRetried: 0,
    staleClaimsUnknown: 0,
    invalidStaleClaims: 0,
    skippedNotDue: 0,
    schedulingFailures: 0,
    lookupFailures: 0,
    unavailablePrices: 0,
    tokenBudgetStatus: "UNKNOWN",
    backgroundSkippedForReserve: 0,
    keepaRateLimited: 0,
  };
}

function validateOptions(options: PriceAlertCheckOptions): void {
  if (
    options.maxAsins !== undefined &&
    (!Number.isSafeInteger(options.maxAsins) || options.maxAsins <= 0)
  ) {
    throw new Error("maxAsins deve essere un intero positivo.");
  }
}

function getStoredOutcome(alert: StaleTargetClaim | EligiblePriceAlert) {
  if (!hasTargetOutcome(alert)) {
    return null;
  }

  return {
    status: "existing" as const,
    reachedAt: alert.targetReachedAt,
    reachedPrice: alert.targetReachedPrice,
  };
}

export function createPriceAlertCheckRunner(
  dependencies: PriceAlertMonitoringDependencies
): (options?: PriceAlertCheckOptions) => Promise<PriceAlertCheckReport> {
  async function releaseClaim(
    alertId: number,
    report: PriceAlertCheckReport
  ): Promise<boolean> {
    try {
      const released = await dependencies.releaseTarget(alertId);

      if (!released) {
        report.claimReleaseFailures += 1;
      }

      return released;
    } catch {
      report.claimReleaseFailures += 1;
      return false;
    }
  }

  async function completeClaim(
    alertId: number,
    report: PriceAlertCheckReport
  ): Promise<void> {
    try {
      if (!(await dependencies.completeTarget(alertId, dependencies.clock()))) {
        report.finalizationFailures += 1;
      }
    } catch {
      report.finalizationFailures += 1;
    }
  }

  async function sendClaimedTarget(
    alert: EligiblePriceAlert | StaleTargetClaim,
    outcome: TargetReachedOutcome,
    report: PriceAlertCheckReport
  ): Promise<void> {
    const amazonUrl = buildAmazonAffiliateProductUrl(alert.productId);

    if (!amazonUrl) {
      report.notificationFailures += 1;
      await releaseClaim(alert.id, report);
      return;
    }

    let sendResult: TargetEmailSendResult;

    try {
      sendResult = await dependencies.sendTargetEmail({
        alertId: alert.id,
        recipientEmail: alert.email,
        exactAsin: alert.productId,
        productName: alert.productTitle,
        currentPrice: outcome.reachedPrice,
        targetPrice: alert.targetPrice,
        amazonUrl,
      });
    } catch {
      sendResult = { status: "unknown" };
    }

    if (sendResult.status === "accepted") {
      report.notificationsSent += 1;
      await completeClaim(alert.id, report);
      return;
    }

    if (sendResult.status === "rejected") {
      report.notificationFailures += 1;
      await releaseClaim(alert.id, report);
      return;
    }

    report.ambiguousNotifications += 1;
  }

  async function claimAndSend(
    alert: EligiblePriceAlert | StaleTargetClaim,
    outcome: TargetReachedOutcome,
    report: PriceAlertCheckReport
  ): Promise<void> {
    let claimed: boolean;

    try {
      claimed = await dependencies.claimTarget(
        alert.id,
        dependencies.clock()
      );
    } catch {
      report.claimFailures += 1;
      return;
    }

    if (!claimed) {
      report.claimConflicts += 1;
      return;
    }

    await sendClaimedTarget(alert, outcome, report);
  }

  async function recoverStaleClaim(
    alert: StaleTargetClaim,
    report: PriceAlertCheckReport
  ): Promise<void> {
    let providerStatus: TargetEmailProviderEventStatus;

    try {
      providerStatus = await dependencies.getTargetEmailEventStatus(
        alert.id,
        alert.targetNotificationClaimedAt
      );
    } catch {
      providerStatus = "unknown";
    }

    if (providerStatus === "accepted") {
      report.staleClaimsRecovered += 1;
      await completeClaim(alert.id, report);
      return;
    }

    if (providerStatus === "unknown") {
      report.staleClaimsUnknown += 1;
      return;
    }

    const outcome = getStoredOutcome(alert);

    if (!outcome || !(await releaseClaim(alert.id, report))) {
      return;
    }

    report.staleClaimsRetried += 1;
    await claimAndSend(alert, outcome, report);
  }

  return async (options = {}) => {
    validateOptions(options);

    const report = createEmptyReport();
    const startedAt = dependencies.clock();
    const staleBefore = new Date(
      startedAt.getTime() - TARGET_NOTIFICATION_CLAIM_LEASE_MS
    ).toISOString();
    const loadedStaleClaims = await dependencies.loadStaleClaims(staleBefore);

    report.staleClaims = loadedStaleClaims.length;

    for (const alert of loadedStaleClaims) {
      if (!isStaleTargetClaim(alert)) {
        report.invalidStaleClaims += 1;
        continue;
      }

      await recoverStaleClaim(alert, report);
    }

    const loadedAlerts = await dependencies.loadAlerts();
    const activeAlerts = loadedAlerts.filter(
      (alert) =>
        alert.status === PRICE_ALERT_ACTIVE_STATUS &&
        alert.notifiedAt === null
    );
    const eligibleAlerts = activeAlerts.filter(isEligibleAlert);
    const alertsWithOutcome = eligibleAlerts.filter(hasTargetOutcome);
    const alertsToMonitor = eligibleAlerts.filter(
      (alert) => !hasTargetOutcome(alert)
    );
    const groupedAlerts = groupAlertsByExactAsin(alertsToMonitor);

    report.activeAlerts = activeAlerts.length;
    report.eligibleAlerts = eligibleAlerts.length;
    report.excludedAlerts = loadedAlerts.length - activeAlerts.length;
    report.invalidAlerts = activeAlerts.length - eligibleAlerts.length;
    report.uniqueAsins = new Set(
      eligibleAlerts.map((alert) => alert.productId)
    ).size;

    for (const alert of alertsWithOutcome) {
      const outcome = getStoredOutcome(alert);

      if (outcome) {
        await claimAndSend(alert, outcome, report);
      }
    }

    const dueGroups: ScheduledPriceAlertGroup[] = [];

    for (const [exactAsin, alerts] of groupedAlerts) {
      let latestCheck: PriceAlertProductCheck | null;

      try {
        latestCheck = await dependencies.getLatestProductCheck(exactAsin);
      } catch {
        report.schedulingFailures += 1;
        continue;
      }

      const groupIntervalMs = getPriceAlertGroupIntervalMs(
        latestCheck?.currentPrice ?? null,
        alerts.map((alert) => ({ targetPrice: alert.targetPrice }))
      );
      const due = isPriceAlertGroupDue({
        requestedAt: latestCheck?.requestedAt ?? null,
        intervalMs: groupIntervalMs,
        now: startedAt,
      });

      if (!due) {
        report.skippedNotDue += 1;
        continue;
      }

      const requestedAtMilliseconds = latestCheck
        ? Date.parse(latestCheck.requestedAt)
        : Number.NaN;

      dueGroups.push({
        exactAsin,
        alerts,
        latestCheck,
        dueAtMilliseconds: Number.isFinite(requestedAtMilliseconds)
          ? requestedAtMilliseconds + groupIntervalMs
          : null,
      });
    }

    dueGroups.sort(compareScheduledGroups);

    const groupsToProcess =
      options.maxAsins === undefined
        ? dueGroups
        : dueGroups.slice(0, options.maxAsins);

    report.backgroundDeferredForRunLimit =
      dueGroups.length - groupsToProcess.length;
    report.deferredAsins = report.backgroundDeferredForRunLimit;

    for (let groupIndex = 0; groupIndex < groupsToProcess.length; groupIndex += 1) {
      const { exactAsin, alerts } = groupsToProcess[groupIndex];

      report.dueAsins += 1;
      report.productLookups += 1;

      let product: PriceAlertProductLookup;

      try {
        product = await dependencies.lookupProduct(exactAsin);
      } catch (error) {
        if (error instanceof PriceAlertMonitoringLookupControlError) {
          report.tokenBudgetStatus = error.tokenBudgetStatus;

          if (error.reason === "RATE_LIMITED") {
            report.keepaRateLimited += 1;
          } else {
            report.backgroundSkippedForReserve += 1;
          }

          break;
        }

        report.lookupFailures += 1;
        continue;
      }

      if (product.exactAsin !== exactAsin) {
        report.lookupFailures += 1;
        continue;
      }

      if (product.cacheHit) {
        report.cacheHits += 1;
      } else {
        report.refreshedProducts += 1;
        report.tokenBudgetStatus = product.tokenBudgetStatus;
      }

      if (
        product.currentPrice === null ||
        !isPositivePrice(product.currentPrice)
      ) {
        report.unavailablePrices += 1;
        continue;
      }

      for (const alert of alerts) {
        const evaluation = evaluatePriceAlert(
          alert.initialPrice,
          alert.targetPrice,
          product.currentPrice
        );

        if (evaluation.status !== "target-reached") {
          continue;
        }

        report.targetsReached += 1;
        let outcome: TargetReachedOutcome | null;

        try {
          outcome = await dependencies.recordTargetOutcome(
            alert.id,
            product.currentPrice,
            dependencies.clock()
          );
        } catch {
          outcome = null;
        }

        if (!outcome) {
          report.outcomeFailures += 1;
          continue;
        }

        if (outcome.status === "recorded") {
          report.outcomesRecorded += 1;
        }

        await claimAndSend(alert, outcome, report);
      }
    }

    return report;
  };
}

function mapStoredAlert(
  alert: StoredActivePriceAlert
): PriceAlertMonitoringRecord {
  return {
    id: alert.id,
    productId: alert.product_id,
    productTitle: alert.product_title,
    email: alert.email,
    initialPrice: alert.current_price,
    targetPrice: alert.target_price,
    status: alert.status,
    notifiedAt: alert.notified_at,
    targetNotificationClaimedAt: alert.target_notification_claimed_at,
    targetReachedAt: alert.target_reached_at,
    targetReachedPrice: alert.target_reached_price,
  };
}

const runProductionPriceAlertCheck = createPriceAlertCheckRunner({
  async loadAlerts() {
    return (await loadActivePriceAlerts()).map(mapStoredAlert);
  },
  async loadStaleClaims(staleBefore) {
    return (await loadStaleTargetNotificationClaims(staleBefore)).map(
      mapStoredAlert
    );
  },
  async getLatestProductCheck(exactAsin) {
    const snapshot = await getLatestPriceAlertProductCheck(exactAsin);

    return snapshot
      ? {
          requestedAt: snapshot.requested_at,
          currentPrice:
            snapshot.buybox_current_cents === null
              ? null
              : snapshot.buybox_current_cents / 100,
        }
      : null;
  },
  async lookupProduct(exactAsin) {
    let result: Awaited<ReturnType<typeof getAffarioProductByAsin>>;

    try {
      result = await getAffarioProductByAsin(exactAsin, {
        context: "background_alert",
      });
    } catch (error) {
      if (
        error instanceof KeepaClientError &&
        error.code === "BACKGROUND_TOKEN_RESERVE"
      ) {
        throw new PriceAlertMonitoringLookupControlError(
          "TOKEN_RESERVE",
          error.tokenBudgetStatus ?? "UNKNOWN"
        );
      }

      if (
        error instanceof KeepaClientError &&
        error.code === "OUT_OF_TOKENS"
      ) {
        throw new PriceAlertMonitoringLookupControlError(
          "RATE_LIMITED",
          "EXHAUSTED"
        );
      }

      throw error;
    }

    return {
      exactAsin: result.asin,
      currentPrice: result.buyBox.currentIncludingShippingInEuros,
      cacheHit: result.cacheHit,
      tokenBudgetStatus: result.tokenBudgetStatus,
    };
  },
  async recordTargetOutcome(alertId, reachedPrice, reachedAt) {
    const result = await recordTargetReachedOutcome(
      alertId,
      reachedPrice,
      reachedAt
    );

    return result.status === "unavailable" ? null : result;
  },
  async claimTarget(alertId, claimedAt) {
    return (
      (await claimTargetNotification(alertId, claimedAt)).status ===
      "claimed"
    );
  },
  async completeTarget(alertId, notifiedAt) {
    return (
      (await completeTargetNotification(alertId, notifiedAt)).status ===
      "completed"
    );
  },
  async releaseTarget(alertId) {
    return (
      (await releaseTargetNotificationClaim(alertId)).status ===
      "released"
    );
  },
  sendTargetEmail: sendTargetPriceAlertEmail,
  getTargetEmailEventStatus: getTargetPriceAlertEmailEventStatus,
  clock: () => new Date(),
});

export async function runPriceAlertCheck(
  options?: PriceAlertCheckOptions
): Promise<PriceAlertCheckReport> {
  return runProductionPriceAlertCheck(options);
}
