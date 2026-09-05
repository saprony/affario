import {
  createPriceAlertMonitoringEndpoint,
  PRICE_ALERT_MONITORING_LEASE_SECONDS,
  PRICE_ALERT_MONITORING_RESOURCE_KEY,
  PRICE_ALERT_MONITORING_RESOURCE_TYPE,
} from "@/services/priceAlertMonitoringEndpoint";
import { runPriceAlertCheck } from "@/services/priceAlertMonitoringEngine";
import {
  releaseDistributedLease,
  tryClaimDistributedLease,
} from "@/services/distributedLease";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const endpoint = createPriceAlertMonitoringEndpoint({
  runMonitoring: runPriceAlertCheck,
  getEnvironment: () => ({
    cronSecret: process.env.ALERT_MONITORING_CRON_SECRET,
    enabled: process.env.ALERT_MONITORING_ENABLED,
    maxAsinsPerRun: process.env.ALERT_MONITORING_MAX_ASINS_PER_RUN,
  }),
  tryClaimMonitoringLease: () =>
    tryClaimDistributedLease({
      resourceType: PRICE_ALERT_MONITORING_RESOURCE_TYPE,
      resourceKey: PRICE_ALERT_MONITORING_RESOURCE_KEY,
      leaseSeconds: PRICE_ALERT_MONITORING_LEASE_SECONDS,
    }),
  releaseMonitoringLease: releaseDistributedLease,
});

export const GET = endpoint.GET;
export const POST = endpoint.POST;
