import "server-only";

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
