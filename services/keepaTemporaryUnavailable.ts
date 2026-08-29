import "server-only";

import type { KeepaClientError } from "@/services/keepaClient";

export const TEMPORARY_PRODUCT_DATA_MESSAGE =
  "Stiamo aggiornando i dati del prodotto. Riprova tra qualche istante.";

export function getKeepaRetryAfterSeconds(
  error: KeepaClientError
): number | undefined {
  return error.code === "OUT_OF_TOKENS" &&
    Number.isSafeInteger(error.retryAfterSeconds) &&
    (error.retryAfterSeconds ?? 0) > 0
    ? error.retryAfterSeconds
    : undefined;
}
