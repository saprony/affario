import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { getSupabaseServerClient } from "./supabaseServer";

export const ABUSE_RATE_LIMIT_HMAC_MIN_BYTES = 32;

export type AbuseRateLimitPolicy = Readonly<{
  scope: string;
  limit: number;
  windowSeconds: number;
}>;

export const ABUSE_RATE_LIMIT_POLICIES = {
  SEARCH_CLIENT: {
    scope: "search_client_v1",
    limit: 20,
    windowSeconds: 5 * 60,
  },
  PRODUCT_CLIENT: {
    scope: "product_client_v1",
    limit: 30,
    windowSeconds: 10 * 60,
  },
  ALERT_CLIENT: {
    scope: "alert_client_v1",
    limit: 10,
    windowSeconds: 60 * 60,
  },
  ALERT_EMAIL: {
    scope: "alert_email_v1",
    limit: 5,
    windowSeconds: 60 * 60,
  },
  MANAGEMENT_CLIENT: {
    scope: "alert_management_client_v1",
    limit: 20,
    windowSeconds: 5 * 60,
  },
  MANAGEMENT_TOKEN: {
    scope: "alert_management_token_v1",
    limit: 10,
    windowSeconds: 5 * 60,
  },
} as const satisfies Record<string, AbuseRateLimitPolicy>;

export type AbuseRateLimitSubjectDomain = "client" | "email" | "token";

export type AbuseRateLimitRule = Readonly<{
  policy: AbuseRateLimitPolicy;
  subject:
    | Readonly<{ domain: "client" }>
    | Readonly<{ domain: "email" | "token"; value: string }>;
}>;

export type AbuseRateLimitStoreInput = Readonly<{
  scope: string;
  subjectHash: string;
  limit: number;
  windowSeconds: number;
}>;

export type AbuseRateLimitStoreResult = Readonly<{
  allowed: boolean;
  retryAfterSeconds: number;
}>;

export type AbuseRateLimitStore = Readonly<{
  consume: (
    inputs: readonly AbuseRateLimitStoreInput[]
  ) => Promise<AbuseRateLimitStoreResult>;
}>;

export type AbuseRateLimitedOperationResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{ status: "rate-limited"; retryAfterSeconds: number }>
  | Readonly<{ status: "unavailable" }>;

type ClientSubjectExtractor = (
  request: Request,
  nodeEnvironment: string | undefined
) => string | null;

type AbuseRateLimitExecutorDependencies = Readonly<{
  store: AbuseRateLimitStore;
  getHmacSecret: () => string | undefined;
  getNodeEnvironment: () => string | undefined;
  extractClientSubject: ClientSubjectExtractor;
}>;

type AbuseRateLimitRpcRow = {
  allowed: boolean;
  retry_after_seconds: number;
};

export function hasValidAbuseRateLimitHmacSecret(
  secret: string | undefined
): secret is string {
  return (
    typeof secret === "string" &&
    new TextEncoder().encode(secret).byteLength >=
      ABUSE_RATE_LIMIT_HMAC_MIN_BYTES
  );
}

export function createAbuseRateLimitSubjectHash(
  secret: string,
  domain: AbuseRateLimitSubjectDomain,
  subject: string
): string {
  if (!hasValidAbuseRateLimitHmacSecret(secret)) {
    throw new Error("Invalid abuse rate limit HMAC secret");
  }

  return createHmac("sha256", secret)
    .update("affario-abuse-rate-limit:v1\0", "utf8")
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(subject, "utf8")
    .digest("hex");
}

export function extractAbuseRateLimitClientSubject(
  request: Request,
  nodeEnvironment: string | undefined
): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for")?.trim();

  if (
    forwardedFor &&
    forwardedFor.length <= 45 &&
    isIP(forwardedFor) !== 0
  ) {
    return forwardedFor;
  }

  return nodeEnvironment === "production"
    ? null
    : "affario-local-development-client";
}

export const supabaseAbuseRateLimitStore: AbuseRateLimitStore = {
  async consume(inputs) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .rpc("affario_consume_abuse_rate_limit", {
        p_checks: inputs.map((input) => ({
          scope: input.scope,
          subject_hash: input.subjectHash,
          request_limit: input.limit,
          window_seconds: input.windowSeconds,
        })),
      })
      .single<AbuseRateLimitRpcRow>();

    if (error || !data) {
      throw new Error("Abuse rate limit store unavailable");
    }

    return {
      allowed: data.allowed,
      retryAfterSeconds: data.retry_after_seconds,
    };
  },
};

function isValidStoreResult(
  result: AbuseRateLimitStoreResult
): boolean {
  return (
    typeof result.allowed === "boolean" &&
    Number.isSafeInteger(result.retryAfterSeconds) &&
    (result.allowed
      ? result.retryAfterSeconds === 0
      : result.retryAfterSeconds >= 1)
  );
}

function resolveSubject(
  rule: AbuseRateLimitRule,
  request: Request,
  nodeEnvironment: string | undefined,
  extractClientSubject: ClientSubjectExtractor
): string | null {
  if (rule.subject.domain === "client") {
    return extractClientSubject(request, nodeEnvironment);
  }

  return rule.subject.value || null;
}

export function createAbuseRateLimitExecutor(
  dependencies: AbuseRateLimitExecutorDependencies
) {
  return async function executeWithAbuseRateLimits<T>(
    request: Request,
    rules: readonly AbuseRateLimitRule[],
    operation: () => Promise<T>
  ): Promise<AbuseRateLimitedOperationResult<T>> {
    const secret = dependencies.getHmacSecret();

    if (!hasValidAbuseRateLimitHmacSecret(secret)) {
      return { status: "unavailable" };
    }

    const nodeEnvironment = dependencies.getNodeEnvironment();

    const inputs: AbuseRateLimitStoreInput[] = [];

    for (const rule of rules) {
      const subject = resolveSubject(
        rule,
        request,
        nodeEnvironment,
        dependencies.extractClientSubject
      );

      if (!subject) {
        return { status: "unavailable" };
      }

      inputs.push({
        scope: rule.policy.scope,
        subjectHash: createAbuseRateLimitSubjectHash(
          secret,
          rule.subject.domain,
          subject
        ),
        limit: rule.policy.limit,
        windowSeconds: rule.policy.windowSeconds,
      });
    }

    if (inputs.length === 0) {
      return { status: "unavailable" };
    }

    let storeResult: AbuseRateLimitStoreResult;

    try {
      storeResult = await dependencies.store.consume(inputs);
    } catch {
      return { status: "unavailable" };
    }

    if (!isValidStoreResult(storeResult)) {
      return { status: "unavailable" };
    }

    if (!storeResult.allowed) {
      return {
        status: "rate-limited",
        retryAfterSeconds: storeResult.retryAfterSeconds,
      };
    }

    return {
      status: "completed",
      value: await operation(),
    };
  };
}

export const executeWithAbuseRateLimits = createAbuseRateLimitExecutor({
  store: supabaseAbuseRateLimitStore,
  getHmacSecret: () => process.env.ABUSE_RATE_LIMIT_HMAC_SECRET,
  getNodeEnvironment: () => process.env.NODE_ENV,
  extractClientSubject: extractAbuseRateLimitClientSubject,
});
