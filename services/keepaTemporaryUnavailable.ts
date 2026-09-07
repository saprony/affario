import "server-only";

import type { KeepaClientError } from "@/services/keepaClient";
import { SERVICE_TEMPORARILY_UNAVAILABLE_MESSAGE } from "@/lib/consumerServiceMessages";

export const TEMPORARY_PRODUCT_DATA_MESSAGE =
  SERVICE_TEMPORARILY_UNAVAILABLE_MESSAGE;

export function getKeepaRetryAfterSeconds(
  error: KeepaClientError
): number | undefined {
  return error.code === "OUT_OF_TOKENS" &&
    Number.isSafeInteger(error.retryAfterSeconds) &&
    (error.retryAfterSeconds ?? 0) > 0
    ? error.retryAfterSeconds
    : undefined;
}
