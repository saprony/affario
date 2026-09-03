import "server-only";

import type { AbuseRateLimitedOperationResult } from "@/services/abuseRateLimit";

import { API_NO_STORE_HEADERS } from "./jsonRequestBody";

type AbuseRateLimitFailure = Exclude<
  AbuseRateLimitedOperationResult<never>,
  { status: "completed" }
>;

export function createAbuseRateLimitFailureResponse(
  result: AbuseRateLimitFailure
): Response {
  if (result.status === "rate-limited") {
    return Response.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Troppe richieste. Riprova tra qualche istante.",
        },
      },
      {
        status: 429,
        headers: {
          ...API_NO_STORE_HEADERS,
          "Retry-After": String(result.retryAfterSeconds),
        },
      }
    );
  }

  return Response.json(
    {
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Servizio temporaneamente non disponibile. Riprova.",
      },
    },
    { status: 503, headers: API_NO_STORE_HEADERS }
  );
}
