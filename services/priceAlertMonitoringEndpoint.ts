import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import {
  MAX_ALERT_MONITORING_ASINS_PER_RUN,
  type PriceAlertCheckOptions,
  type PriceAlertCheckReport,
} from "@/services/priceAlertMonitoringEngine";
import type {
  DistributedLease,
  DistributedLeaseClaimResult,
} from "@/services/distributedLease";

export const DEFAULT_ALERT_MONITORING_MAX_ASINS_PER_RUN = 5;
export { MAX_ALERT_MONITORING_ASINS_PER_RUN };
export const MIN_ALERT_MONITORING_CRON_SECRET_BYTES = 32;
export const PRICE_ALERT_MONITORING_LEASE_SECONDS = 360;
export const PRICE_ALERT_MONITORING_RESOURCE_TYPE = "monitoring_run";
export const PRICE_ALERT_MONITORING_RESOURCE_KEY =
  "price-alert-monitoring";

type PriceAlertMonitoringRunner = (
  options?: PriceAlertCheckOptions
) => Promise<PriceAlertCheckReport>;

type PriceAlertMonitoringEnvironment = {
  cronSecret: string | undefined;
  enabled: string | undefined;
  maxAsinsPerRun: string | undefined;
};

type PriceAlertMonitoringEndpointDependencies = {
  runMonitoring: PriceAlertMonitoringRunner;
  getEnvironment: () => PriceAlertMonitoringEnvironment;
  tryClaimMonitoringLease: () => Promise<DistributedLeaseClaimResult>;
  releaseMonitoringLease: (lease: DistributedLease) => Promise<boolean>;
};

type SanitizedPriceAlertMonitoringReport = Pick<
  PriceAlertCheckReport,
  | "activeAlerts"
  | "uniqueAsins"
  | "dueAsins"
  | "productLookups"
  | "cacheHits"
  | "refreshedProducts"
  | "targetsReached"
  | "notificationsSent"
  | "notificationFailures"
  | "backgroundDeferredForRunLimit"
  | "tokenBudgetStatus"
  | "backgroundSkippedForReserve"
  | "keepaRateLimited"
  | "productRefreshLockContended"
>;

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: RESPONSE_HEADERS,
  });
}

function digestSecret(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function hasValidBearerSecret(
  authorizationHeader: string | null,
  configuredSecret: string | undefined
): boolean {
  if (
    !configuredSecret ||
    new TextEncoder().encode(configuredSecret).byteLength <
      MIN_ALERT_MONITORING_CRON_SECRET_BYTES ||
    !authorizationHeader
  ) {
    return false;
  }

  const match = /^Bearer ([^\s]+)$/.exec(authorizationHeader);

  if (!match) {
    return false;
  }

  return timingSafeEqual(
    digestSecret(match[1]),
    digestSecret(configuredSecret)
  );
}

function parseMaxAsinsPerRun(value: string | undefined): number | null {
  if (value === undefined || value === "") {
    return DEFAULT_ALERT_MONITORING_MAX_ASINS_PER_RUN;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed)
    ? Math.min(parsed, MAX_ALERT_MONITORING_ASINS_PER_RUN)
    : null;
}

function sanitizeReport(
  report: PriceAlertCheckReport
): SanitizedPriceAlertMonitoringReport {
  return {
    activeAlerts: report.activeAlerts,
    uniqueAsins: report.uniqueAsins,
    dueAsins: report.dueAsins,
    productLookups: report.productLookups,
    cacheHits: report.cacheHits,
    refreshedProducts: report.refreshedProducts,
    targetsReached: report.targetsReached,
    notificationsSent: report.notificationsSent,
    notificationFailures: report.notificationFailures,
    backgroundDeferredForRunLimit:
      report.backgroundDeferredForRunLimit,
    tokenBudgetStatus: report.tokenBudgetStatus,
    backgroundSkippedForReserve: report.backgroundSkippedForReserve,
    keepaRateLimited: report.keepaRateLimited,
    productRefreshLockContended:
      report.productRefreshLockContended,
  };
}

export function createPriceAlertMonitoringEndpoint(
  dependencies: PriceAlertMonitoringEndpointDependencies
) {
  return {
    async GET(): Promise<Response> {
      return jsonResponse(
        {
          error: {
            code: "METHOD_NOT_ALLOWED",
            message: "Method not allowed.",
          },
        },
        405
      );
    },

    async POST(request: Request): Promise<Response> {
      const environment = dependencies.getEnvironment();

      if (
        !hasValidBearerSecret(
          request.headers.get("authorization"),
          environment.cronSecret
        )
      ) {
        return jsonResponse(
          {
            error: {
              code: "UNAUTHORIZED",
              message: "Unauthorized.",
            },
          },
          401
        );
      }

      if (environment.enabled !== "true") {
        return jsonResponse({ status: "disabled" });
      }

      const maxAsins = parseMaxAsinsPerRun(environment.maxAsinsPerRun);

      if (maxAsins === null) {
        return jsonResponse(
          {
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Monitoring is not available.",
            },
          },
          503
        );
      }

      let monitoringClaim: DistributedLeaseClaimResult;

      try {
        monitoringClaim = await dependencies.tryClaimMonitoringLease();
      } catch {
        return jsonResponse(
          {
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Monitoring is not available.",
            },
          },
          503
        );
      }

      if (monitoringClaim.status === "contended") {
        return jsonResponse({
          status: "skipped",
          report: { monitoringRunSkippedAlreadyRunning: true },
        });
      }

      try {
        const report = await dependencies.runMonitoring({ maxAsins });

        return jsonResponse({
          status: "completed",
          report: sanitizeReport(report),
        });
      } catch {
        return jsonResponse(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Monitoring run failed.",
            },
          },
          500
        );
      } finally {
        try {
          await dependencies.releaseMonitoringLease(
            monitoringClaim.lease
          );
        } catch {
          // The lease expires after the function execution safety margin.
        }
      }
    },
  };
}
