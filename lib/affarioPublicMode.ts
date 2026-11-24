import "server-only";

export type AffarioPublicMode = "review" | "full";

export const AFFARIO_PRICE_ALERT_UNAVAILABLE_MESSAGE =
  "Gli alert automatici non sono attualmente disponibili.";

type AffarioPublicModeEnvironment = {
  configuredMode?: string;
  nodeEnv?: string;
};

type AffarioPriceAlertCreationEnvironment = {
  publicMode: AffarioPublicMode;
  configuredFlag?: string;
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

export function resolveAffarioPriceAlertCreationEnabled({
  publicMode,
  configuredFlag,
}: AffarioPriceAlertCreationEnvironment): boolean {
  return publicMode === "full" && configuredFlag === "true";
}

export function isAffarioPriceAlertCreationEnabled(
  publicMode: AffarioPublicMode = getAffarioPublicMode()
): boolean {
  return resolveAffarioPriceAlertCreationEnabled({
    publicMode,
    configuredFlag: process.env.AFFARIO_PRICE_ALERTS_ENABLED,
  });
}
