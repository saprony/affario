import { createPriceAlertMonitoringEndpoint } from "@/services/priceAlertMonitoringEndpoint";
import { runPriceAlertCheck } from "@/services/priceAlertMonitoringEngine";

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
});

export const GET = endpoint.GET;
export const POST = endpoint.POST;
