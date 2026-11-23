import "server-only";

import { getSupabaseServerClient } from "./supabaseServer";

export type AffarioPilotMetric = "search" | "analysis";

const AFFARIO_PILOT_METRIC_WARNING =
  "Contatore metriche pilot AFFARIO non disponibile.";

function warnAffarioPilotMetricUnavailable(): void {
  try {
    console.warn(AFFARIO_PILOT_METRIC_WARNING);
  } catch {
    // La telemetria non deve mai influire sulla risposta applicativa.
  }
}

type AffarioPilotMetricRecorderDependencies = Readonly<{
  getNodeEnvironment: () => string | undefined;
  getVercelEnvironment: () => string | undefined;
  incrementMetric: (metric: AffarioPilotMetric) => Promise<void>;
  warn: () => void;
}>;

export type AffarioPilotMetricScheduler = (
  callback: () => void | Promise<void>
) => void;

export function isAffarioPilotMetricsEnabled(
  nodeEnvironment: string | undefined,
  vercelEnvironment: string | undefined
): boolean {
  return (
    nodeEnvironment === "production" &&
    vercelEnvironment === "production"
  );
}

export function createAffarioPilotMetricRecorder(
  dependencies: AffarioPilotMetricRecorderDependencies
) {
  return async function recordPilotMetric(
    metric: AffarioPilotMetric
  ): Promise<void> {
    if (
      !isAffarioPilotMetricsEnabled(
        dependencies.getNodeEnvironment(),
        dependencies.getVercelEnvironment()
      )
    ) {
      return;
    }

    try {
      await dependencies.incrementMetric(metric);
    } catch {
      dependencies.warn();
    }
  };
}

async function incrementAffarioPilotMetric(
  metric: AffarioPilotMetric
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.rpc(
    "increment_affario_pilot_metric",
    { p_metric_name: metric }
  );

  if (error) {
    throw new Error("AFFARIO pilot metric RPC unavailable");
  }
}

export const recordAffarioPilotMetric = createAffarioPilotMetricRecorder({
  getNodeEnvironment: () => process.env.NODE_ENV,
  getVercelEnvironment: () => process.env.VERCEL_ENV,
  incrementMetric: incrementAffarioPilotMetric,
  warn: warnAffarioPilotMetricUnavailable,
});

export function scheduleAffarioPilotMetric(
  metric: AffarioPilotMetric,
  successful: boolean,
  schedule: AffarioPilotMetricScheduler,
  recordMetric: (
    metric: AffarioPilotMetric
  ) => Promise<void> = recordAffarioPilotMetric
): void {
  if (!successful) {
    return;
  }

  try {
    schedule(() => recordMetric(metric));
  } catch {
    warnAffarioPilotMetricUnavailable();
  }
}
