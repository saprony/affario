import "server-only";

import { PRICE_ALERT_PENDING_STATUS } from "@/lib/affarioPriceAlert";
import {
  hashAlertManagementToken,
  isValidAlertManagementToken,
} from "@/lib/alertManagementToken";
import {
  readPriceAlertByToken,
  type ManagedPriceAlert,
} from "@/lib/priceAlertManagement";
import {
  ABUSE_RATE_LIMIT_POLICIES,
  executeWithAbuseRateLimits,
  type AbuseRateLimitedOperationResult,
  type AbuseRateLimitRule,
} from "@/services/abuseRateLimit";
import { priceAlertManagementStore } from "@/services/priceAlertManagementStore";

export type PriceAlertManagementPageAccessResult =
  | { status: "found"; alert: ManagedPriceAlert }
  | { status: "not-found" }
  | { status: "rate-limited" }
  | { status: "unavailable" };

type RateLimitExecutor = <T>(
  request: Request,
  rules: readonly AbuseRateLimitRule[],
  operation: () => Promise<T>
) => Promise<AbuseRateLimitedOperationResult<T>>;

type PriceAlertManagementPageAccessDependencies = {
  isValidToken: (token: unknown) => token is string;
  executeRateLimited: RateLimitExecutor;
  readAlert: (token: string) => Promise<ManagedPriceAlert | null>;
};

type PriceAlertManagementPageAccess = (
  request: Request,
  token: unknown
) => Promise<PriceAlertManagementPageAccessResult>;

type DevelopmentPreviewDependencies = {
  getNodeEnvironment: () => string | undefined;
  getProductionAccess: PriceAlertManagementPageAccess;
};

const DEVELOPMENT_ALERT_PREVIEWS: Record<
  string,
  PriceAlertManagementPageAccessResult
> = {
  "preview-alert": {
    status: "found",
    alert: {
      product_title:
        "realme GT 8 Pro Smartphone 5G 16+512GB Snapdragon versione dimostrativa con titolo Amazon molto lungo",
      current_price: 859.99,
      target_price: 830,
      status: PRICE_ALERT_PENDING_STATUS,
    },
  },
  "preview-rate-limited": { status: "rate-limited" },
  "preview-unavailable": { status: "unavailable" },
};

export function createPriceAlertManagementPageAccess(
  dependencies: PriceAlertManagementPageAccessDependencies
) {
  return async function getPriceAlertManagementPageAccess(
    request: Request,
    token: unknown
  ): Promise<PriceAlertManagementPageAccessResult> {
    if (!dependencies.isValidToken(token)) {
      return { status: "not-found" };
    }

    try {
      const result = await dependencies.executeRateLimited(
        request,
        [
          {
            policy: ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_CLIENT,
            subject: { domain: "client" },
          },
          {
            policy: ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_TOKEN,
            subject: { domain: "token", value: token },
          },
        ],
        () => dependencies.readAlert(token)
      );

      if (result.status === "rate-limited") {
        return { status: "rate-limited" };
      }

      if (result.status === "unavailable") {
        return { status: "unavailable" };
      }

      return result.value
        ? { status: "found", alert: result.value }
        : { status: "not-found" };
    } catch {
      return { status: "unavailable" };
    }
  };
}

export const getPriceAlertManagementPageAccess =
  createPriceAlertManagementPageAccess({
    isValidToken: isValidAlertManagementToken,
    executeRateLimited: executeWithAbuseRateLimits,
    readAlert: (token) =>
      readPriceAlertByToken(
        token,
        {
          isValid: isValidAlertManagementToken,
          hash: hashAlertManagementToken,
        },
        priceAlertManagementStore
      ),
  });

export function createPriceAlertManagementPageAccessWithDevelopmentPreviews(
  dependencies: DevelopmentPreviewDependencies
): PriceAlertManagementPageAccess {
  return async function getPriceAlertManagementPageAccessWithDevelopmentPreviews(
    request: Request,
    token: unknown
  ): Promise<PriceAlertManagementPageAccessResult> {
    if (
      dependencies.getNodeEnvironment() === "development" &&
      typeof token === "string"
    ) {
      const preview = DEVELOPMENT_ALERT_PREVIEWS[token];

      if (preview) {
        return preview;
      }
    }

    return dependencies.getProductionAccess(request, token);
  };
}

export const getPriceAlertManagementPageAccessWithDevelopmentPreviews =
  createPriceAlertManagementPageAccessWithDevelopmentPreviews({
    getNodeEnvironment: () => process.env.NODE_ENV,
    getProductionAccess: getPriceAlertManagementPageAccess,
  });
