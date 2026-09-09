export type AffarioPublicMode = "review" | "full";

export const AFFARIO_REVIEW_ALERT_UNAVAILABLE_MESSAGE =
  "Gli alert automatici saranno disponibili prossimamente.";

type AffarioPublicModeEnvironment = {
  configuredMode?: string;
  nodeEnv?: string;
};

export function resolveAffarioPublicMode({
  configuredMode,
  nodeEnv,
}: AffarioPublicModeEnvironment): AffarioPublicMode {
  if (configuredMode === "review" || configuredMode === "full") {
    return configuredMode;
  }

  return nodeEnv === "production" ? "review" : "full";
}

export function getAffarioPublicMode(): AffarioPublicMode {
  return resolveAffarioPublicMode({
    configuredMode: process.env.NEXT_PUBLIC_AFFARIO_PUBLIC_MODE,
    nodeEnv: process.env.NODE_ENV,
  });
}

export function isAffarioPriceAlertCreationEnabled(
  publicMode: AffarioPublicMode = getAffarioPublicMode()
): boolean {
  return publicMode === "full";
}
