import "server-only";

import type { AbuseRateLimitedOperationResult } from "@/services/abuseRateLimit";

import {
  SERVICE_TEMPORARILY_UNAVAILABLE_MESSAGE,
  TOO_MANY_REQUESTS_MESSAGE,
} from "./consumerServiceMessages";
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
          message: TOO_MANY_REQUESTS_MESSAGE,
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
        message: SERVICE_TEMPORARILY_UNAVAILABLE_MESSAGE,
      },
    },
    { status: 503, headers: API_NO_STORE_HEADERS }
  );
}
