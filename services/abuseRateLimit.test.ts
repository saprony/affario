import assert from "node:assert/strict";
import test from "node:test";

import { normalizePriceAlertEmail } from "../lib/affarioPriceAlert";
import { createAbuseRateLimitFailureResponse } from "../lib/abuseRateLimitResponse";
import {
  ABUSE_RATE_LIMIT_HMAC_MIN_BYTES,
  ABUSE_RATE_LIMIT_POLICIES,
  createAbuseRateLimitExecutor,
  createAbuseRateLimitSubjectHash,
  extractAbuseRateLimitClientSubject,
  hasValidAbuseRateLimitHmacSecret,
  type AbuseRateLimitPolicy,
  type AbuseRateLimitRule,
  type AbuseRateLimitStore,
  type AbuseRateLimitStoreInput,
} from "./abuseRateLimit";

const HMAC_SECRET = "s".repeat(ABUSE_RATE_LIMIT_HMAC_MIN_BYTES);

type FixedWindowRow = {
  windowStartedAt: number;
  requestCount: number;
};

class TestFixedWindowStore implements AbuseRateLimitStore {
  readonly calls: AbuseRateLimitStoreInput[][] = [];
  private readonly rows = new Map<string, FixedWindowRow>();

  constructor(
    private nowMilliseconds = Date.parse("2026-09-02T10:00:00.000Z"),
    private readonly shouldFail = false
  ) {}

  advance(seconds: number): void {
    this.nowMilliseconds += seconds * 1_000;
  }

  async consume(inputs: readonly AbuseRateLimitStoreInput[]) {
    const batch = inputs.map((input) => ({ ...input }));
    this.calls.push(batch);

    if (this.shouldFail) {
      throw new Error("store unavailable");
    }

    const results = batch.map((input) => {
      const key = `${input.scope}:${input.subjectHash}`;
      const current = this.rows.get(key);
      const windowMilliseconds = input.windowSeconds * 1_000;
      const isNewWindow =
        !current ||
        current.windowStartedAt + windowMilliseconds <=
          this.nowMilliseconds;
      const row = isNewWindow
        ? { windowStartedAt: this.nowMilliseconds, requestCount: 1 }
        : {
            windowStartedAt: current.windowStartedAt,
            requestCount: Math.min(
              current.requestCount + 1,
              input.limit + 1
            ),
          };

      this.rows.set(key, row);

      const allowed = row.requestCount <= input.limit;
      const windowRemainingSeconds = Math.max(
        1,
        Math.ceil(
          (row.windowStartedAt +
            windowMilliseconds -
            this.nowMilliseconds) /
            1_000
        )
      );

      return {
        allowed,
        isAtCapacity: row.requestCount >= input.limit,
        windowRemainingSeconds,
      };
    });

    const allowed = results.every((result) => result.allowed);

    return {
      allowed,
      retryAfterSeconds: allowed
        ? 0
        : Math.max(
            ...results
              .filter(({ isAtCapacity }) => isAtCapacity)
              .map(({ windowRemainingSeconds }) => windowRemainingSeconds)
          ),
    };
  }
}

function requestFor(ip?: string): Request {
  return new Request("https://affario.it/api/test", {
    headers: ip ? { "x-forwarded-for": ip } : undefined,
  });
}

function clientRule(policy: AbuseRateLimitPolicy): AbuseRateLimitRule {
  return { policy, subject: { domain: "client" } };
}

function emailRule(
  policy: AbuseRateLimitPolicy,
  normalizedEmail: string
): AbuseRateLimitRule {
  return {
    policy,
    subject: { domain: "email", value: normalizedEmail },
  };
}

function tokenRule(
  policy: AbuseRateLimitPolicy,
  token: string
): AbuseRateLimitRule {
  return { policy, subject: { domain: "token", value: token } };
}

function createExecutor(
  store: AbuseRateLimitStore,
  options: {
    secret?: string;
    nodeEnvironment?: string;
  } = {}
) {
  return createAbuseRateLimitExecutor({
    store,
    getHmacSecret: () => options.secret ?? HMAC_SECRET,
    getNodeEnvironment: () => options.nodeEnvironment ?? "production",
    extractClientSubject: extractAbuseRateLimitClientSubject,
  });
}

test("centralizza le policy numeriche V1", () => {
  assert.deepEqual(ABUSE_RATE_LIMIT_POLICIES.SEARCH_CLIENT, {
    scope: "search_client_v1",
    limit: 20,
    windowSeconds: 300,
  });
  assert.deepEqual(ABUSE_RATE_LIMIT_POLICIES.PRODUCT_CLIENT, {
    scope: "product_client_v1",
    limit: 30,
    windowSeconds: 600,
  });
  assert.deepEqual(ABUSE_RATE_LIMIT_POLICIES.ALERT_CLIENT, {
    scope: "alert_client_v1",
    limit: 10,
    windowSeconds: 3_600,
  });
  assert.deepEqual(ABUSE_RATE_LIMIT_POLICIES.ALERT_EMAIL, {
    scope: "alert_email_v1",
    limit: 5,
    windowSeconds: 3_600,
  });
  assert.deepEqual(ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_CLIENT, {
    scope: "alert_management_client_v1",
    limit: 20,
    windowSeconds: 300,
  });
  assert.deepEqual(ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_TOKEN, {
    scope: "alert_management_token_v1",
    limit: 10,
    windowSeconds: 300,
  });
});

test("ogni route consumer usa una sola chiamata store anche con due quote", async () => {
  const normalizedEmail = normalizePriceAlertEmail("target@example.test");
  assert.ok(normalizedEmail);
  const token = Buffer.alloc(32, 7).toString("base64url");
  const routeRules = [
    {
      name: "search",
      rules: [clientRule(ABUSE_RATE_LIMIT_POLICIES.SEARCH_CLIENT)],
      expectedChecks: 1,
    },
    {
      name: "product",
      rules: [clientRule(ABUSE_RATE_LIMIT_POLICIES.PRODUCT_CLIENT)],
      expectedChecks: 1,
    },
    {
      name: "alerts",
      rules: [
        clientRule(ABUSE_RATE_LIMIT_POLICIES.ALERT_CLIENT),
        emailRule(ABUSE_RATE_LIMIT_POLICIES.ALERT_EMAIL, normalizedEmail),
      ],
      expectedChecks: 2,
    },
    {
      name: "confirm",
      rules: [
        clientRule(ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_CLIENT),
        tokenRule(ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_TOKEN, token),
      ],
      expectedChecks: 2,
    },
    {
      name: "manage",
      rules: [
        clientRule(ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_CLIENT),
        tokenRule(ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_TOKEN, token),
      ],
      expectedChecks: 2,
    },
  ] as const;

  for (const route of routeRules) {
    const store = new TestFixedWindowStore();
    const result = await createExecutor(store)(
      requestFor("192.0.2.100"),
      route.rules,
      async () => route.name
    );

    assert.equal(result.status, "completed", route.name);
    assert.equal(store.calls.length, 1, route.name);
    assert.equal(store.calls[0].length, route.expectedChecks, route.name);
  }
});

test("richiede un secret HMAC di almeno 32 byte senza fallback", async () => {
  assert.equal(hasValidAbuseRateLimitHmacSecret(undefined), false);
  assert.equal(
    hasValidAbuseRateLimitHmacSecret(
      "x".repeat(ABUSE_RATE_LIMIT_HMAC_MIN_BYTES - 1)
    ),
    false
  );
  assert.equal(hasValidAbuseRateLimitHmacSecret(HMAC_SECRET), true);

  let operationCalls = 0;
  const result = await createExecutor(new TestFixedWindowStore(), {
    secret: "x".repeat(ABUSE_RATE_LIMIT_HMAC_MIN_BYTES - 1),
  })(
    requestFor("192.0.2.1"),
    [clientRule(ABUSE_RATE_LIMIT_POLICIES.SEARCH_CLIENT)],
    async () => {
      operationCalls += 1;
    }
  );

  assert.equal(result.status, "unavailable");
  assert.equal(operationCalls, 0);
});

test("HMAC e stabile per soggetto e separato tra client email e token", () => {
  const subject = "same-value";
  const clientHash = createAbuseRateLimitSubjectHash(
    HMAC_SECRET,
    "client",
    subject
  );

  assert.equal(
    clientHash,
    createAbuseRateLimitSubjectHash(HMAC_SECRET, "client", subject)
  );
  assert.match(clientHash, /^[a-f0-9]{64}$/);
  assert.notEqual(
    clientHash,
    createAbuseRateLimitSubjectHash(HMAC_SECRET, "email", subject)
  );
  assert.notEqual(
    clientHash,
    createAbuseRateLimitSubjectHash(HMAC_SECRET, "token", subject)
  );
  assert.notEqual(
    createAbuseRateLimitSubjectHash(HMAC_SECRET, "email", subject),
    createAbuseRateLimitSubjectHash(HMAC_SECRET, "token", subject)
  );
});

test("in Production un IP assente o ambiguo fallisce senza bypass", async () => {
  for (const request of [requestFor(), requestFor("192.0.2.1, 198.51.100.2")]) {
    let operationCalls = 0;
    const result = await createExecutor(new TestFixedWindowStore())(
      request,
      [clientRule(ABUSE_RATE_LIMIT_POLICIES.SEARCH_CLIENT)],
      async () => {
        operationCalls += 1;
      }
    );

    assert.equal(result.status, "unavailable");
    assert.equal(operationCalls, 0);
  }
});

test("in sviluppo il soggetto locale e deterministico", async () => {
  const store = new TestFixedWindowStore();
  const execute = createExecutor(store, { nodeEnvironment: "development" });

  for (let index = 0; index < 2; index += 1) {
    const result = await execute(
      requestFor(),
      [clientRule(ABUSE_RATE_LIMIT_POLICIES.SEARCH_CLIENT)],
      async () => "ok"
    );
    assert.equal(result.status, "completed");
  }

  assert.equal(
    store.calls[0][0].subjectHash,
    store.calls[1][0].subjectHash
  );
});

test("consente sotto quota e al limite, poi 429, poi una nuova finestra", async () => {
  const policy = { scope: "boundary_v1", limit: 3, windowSeconds: 60 };
  const store = new TestFixedWindowStore();
  const execute = createExecutor(store);
  let operationCalls = 0;

  for (let index = 0; index < policy.limit; index += 1) {
    const result = await execute(
      requestFor("192.0.2.2"),
      [clientRule(policy)],
      async () => {
        operationCalls += 1;
      }
    );
    assert.equal(result.status, "completed");
  }

  const limited = await execute(
    requestFor("192.0.2.2"),
    [clientRule(policy)],
    async () => {
      operationCalls += 1;
    }
  );

  assert.deepEqual(limited, {
    status: "rate-limited",
    retryAfterSeconds: 60,
  });
  assert.equal(operationCalls, policy.limit);

  store.advance(60);
  const nextWindow = await execute(
    requestFor("192.0.2.2"),
    [clientRule(policy)],
    async () => {
      operationCalls += 1;
    }
  );

  assert.equal(nextWindow.status, "completed");
  assert.equal(operationCalls, policy.limit + 1);
});

test("due richieste concorrenti al boundary non superano la quota", async () => {
  const policy = { scope: "concurrency_v1", limit: 10, windowSeconds: 60 };
  const store = new TestFixedWindowStore();
  const execute = createExecutor(store);
  let operationCalls = 0;

  for (let index = 0; index < policy.limit - 1; index += 1) {
    await execute(
      requestFor("192.0.2.3"),
      [clientRule(policy)],
      async () => {
        operationCalls += 1;
      }
    );
  }

  const results = await Promise.all([
    execute(
      requestFor("192.0.2.3"),
      [clientRule(policy)],
      async () => {
        operationCalls += 1;
      }
    ),
    execute(
      requestFor("192.0.2.3"),
      [clientRule(policy)],
      async () => {
        operationCalls += 1;
      }
    ),
  ]);

  assert.equal(
    results.filter(({ status }) => status === "completed").length,
    1
  );
  assert.equal(
    results.filter(({ status }) => status === "rate-limited").length,
    1
  );
  assert.equal(operationCalls, policy.limit);
});

test("due quote sono consumate atomicamente con retry massimo", async () => {
  const clientPolicy = {
    scope: "multi_client_v1",
    limit: 1,
    windowSeconds: 30,
  };
  const emailPolicy = {
    scope: "multi_email_v1",
    limit: 2,
    windowSeconds: 60,
  };
  const store = new TestFixedWindowStore();
  const execute = createExecutor(store);
  const rules = [
    clientRule(clientPolicy),
    emailRule(emailPolicy, "target@example.test"),
  ];
  let operationCalls = 0;

  const first = await execute(
    requestFor("192.0.2.4"),
    rules,
    async () => {
      operationCalls += 1;
    }
  );
  assert.equal(first.status, "completed");

  store.advance(5);
  const clientDenied = await execute(
    requestFor("192.0.2.4"),
    rules,
    async () => {
      operationCalls += 1;
    }
  );
  assert.deepEqual(clientDenied, {
    status: "rate-limited",
    retryAfterSeconds: 55,
  });

  const bothDenied = await execute(
    requestFor("192.0.2.4"),
    rules,
    async () => {
      operationCalls += 1;
    }
  );
  assert.deepEqual(bothDenied, {
    status: "rate-limited",
    retryAfterSeconds: 55,
  });
  assert.equal(operationCalls, 1);
  assert.equal(store.calls.length, 3);
  assert.ok(store.calls.every((batch) => batch.length === 2));
});

test("concorrenza multi-quota al boundary non produce overrun", async () => {
  const clientPolicy = {
    scope: "concurrent_multi_client_v1",
    limit: 10,
    windowSeconds: 60,
  };
  const tokenPolicy = {
    scope: "concurrent_multi_token_v1",
    limit: 10,
    windowSeconds: 60,
  };
  const store = new TestFixedWindowStore();
  const execute = createExecutor(store);
  const rules = [
    clientRule(clientPolicy),
    tokenRule(tokenPolicy, "valid-test-token"),
  ];
  let operationCalls = 0;

  for (let index = 0; index < clientPolicy.limit - 1; index += 1) {
    await execute(requestFor("192.0.2.5"), rules, async () => {
      operationCalls += 1;
    });
  }

  const results = await Promise.all([
    execute(requestFor("192.0.2.5"), rules, async () => {
      operationCalls += 1;
    }),
    execute(requestFor("192.0.2.5"), rules, async () => {
      operationCalls += 1;
    }),
  ]);

  assert.equal(
    results.filter(({ status }) => status === "completed").length,
    1
  );
  assert.equal(
    results.filter(({ status }) => status === "rate-limited").length,
    1
  );
  assert.equal(operationCalls, clientPolicy.limit);
  assert.ok(store.calls.every((batch) => batch.length === 2));
});

test("search e product fermano il lavoro successivo oltre quota", async () => {
  for (const [policy, ip] of [
    [ABUSE_RATE_LIMIT_POLICIES.SEARCH_CLIENT, "192.0.2.10"],
    [ABUSE_RATE_LIMIT_POLICIES.PRODUCT_CLIENT, "192.0.2.11"],
  ] as const) {
    const store = new TestFixedWindowStore();
    const execute = createExecutor(store);
    let downstreamCalls = 0;

    for (let index = 0; index <= policy.limit; index += 1) {
      await execute(requestFor(ip), [clientRule(policy)], async () => {
        downstreamCalls += 1;
      });
    }

    assert.equal(downstreamCalls, policy.limit);
  }
});

test("email diverse non aggirano il limite IP della creazione alert", async () => {
  const store = new TestFixedWindowStore();
  const execute = createExecutor(store);
  let downstreamCalls = 0;
  let lastStatus = "";

  for (
    let index = 0;
    index <= ABUSE_RATE_LIMIT_POLICIES.ALERT_CLIENT.limit;
    index += 1
  ) {
    const normalizedEmail = normalizePriceAlertEmail(
      `recipient-${index}@example.test`
    );
    assert.ok(normalizedEmail);
    const result = await execute(
      requestFor("192.0.2.20"),
      [
        clientRule(ABUSE_RATE_LIMIT_POLICIES.ALERT_CLIENT),
        emailRule(ABUSE_RATE_LIMIT_POLICIES.ALERT_EMAIL, normalizedEmail),
      ],
      async () => {
        downstreamCalls += 1;
      }
    );
    lastStatus = result.status;
  }

  assert.equal(lastStatus, "rate-limited");
  assert.equal(downstreamCalls, ABUSE_RATE_LIMIT_POLICIES.ALERT_CLIENT.limit);
});

test("IP diversi non aggirano il limite email della creazione alert", async () => {
  const normalizedEmail = normalizePriceAlertEmail("target@example.test");
  assert.ok(normalizedEmail);
  const store = new TestFixedWindowStore();
  const execute = createExecutor(store);
  let downstreamCalls = 0;
  let lastStatus = "";

  for (
    let index = 0;
    index <= ABUSE_RATE_LIMIT_POLICIES.ALERT_EMAIL.limit;
    index += 1
  ) {
    const result = await execute(
      requestFor(`192.0.2.${30 + index}`),
      [
        clientRule(ABUSE_RATE_LIMIT_POLICIES.ALERT_CLIENT),
        emailRule(ABUSE_RATE_LIMIT_POLICIES.ALERT_EMAIL, normalizedEmail),
      ],
      async () => {
        downstreamCalls += 1;
      }
    );
    lastStatus = result.status;
  }

  assert.equal(lastStatus, "rate-limited");
  assert.equal(downstreamCalls, ABUSE_RATE_LIMIT_POLICIES.ALERT_EMAIL.limit);
});

test("confirm e manage condividono il limite client e token", async () => {
  const store = new TestFixedWindowStore();
  const execute = createExecutor(store);
  const token = Buffer.alloc(32, 7).toString("base64url");
  let unchangedOperationCalls = 0;
  let lastStatus = "";

  for (
    let index = 0;
    index <= ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_TOKEN.limit;
    index += 1
  ) {
    const result = await execute(
      requestFor("192.0.2.40"),
      [
        clientRule(ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_CLIENT),
        tokenRule(ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_TOKEN, token),
      ],
      async () => {
        unchangedOperationCalls += 1;
        return "existing-semantics";
      }
    );
    lastStatus = result.status;

    if (index === 0) {
      assert.deepEqual(result, {
        status: "completed",
        value: "existing-semantics",
      });
    }
  }

  assert.equal(lastStatus, "rate-limited");
  assert.equal(
    unchangedOperationCalls,
    ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_TOKEN.limit
  );
});

test("failure dello store resta fail-closed per tutte le API", async () => {
  for (const rules of [
    [clientRule(ABUSE_RATE_LIMIT_POLICIES.SEARCH_CLIENT)],
    [clientRule(ABUSE_RATE_LIMIT_POLICIES.PRODUCT_CLIENT)],
    [
      clientRule(ABUSE_RATE_LIMIT_POLICIES.ALERT_CLIENT),
      emailRule(ABUSE_RATE_LIMIT_POLICIES.ALERT_EMAIL, "target@example.test"),
    ],
    [
      clientRule(ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_CLIENT),
      tokenRule(
        ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_TOKEN,
        Buffer.alloc(32, 7).toString("base64url")
      ),
    ],
  ]) {
    let downstreamCalls = 0;
    const store = new TestFixedWindowStore(undefined, true);
    const result = await createExecutor(store)(
      requestFor("192.0.2.50"),
      rules,
      async () => {
      downstreamCalls += 1;
      }
    );

    assert.equal(result.status, "unavailable");
    assert.equal(downstreamCalls, 0);
    assert.equal(store.calls.length, 1);
  }
});

test("quota alert negata non esegue Keepa Brevo o store applicativo", async () => {
  const normalizedEmail = normalizePriceAlertEmail("target@example.test");
  assert.ok(normalizedEmail);
  const store = new TestFixedWindowStore();
  const execute = createExecutor(store);
  const rules = [
    clientRule({ scope: "blocked_client_v1", limit: 1, windowSeconds: 60 }),
    emailRule(
      { scope: "blocked_email_v1", limit: 1, windowSeconds: 60 },
      normalizedEmail
    ),
  ];
  let keepaCalls = 0;
  let brevoCalls = 0;
  let applicationStoreCalls = 0;
  const operation = async () => {
    keepaCalls += 1;
    applicationStoreCalls += 1;
    brevoCalls += 1;
  };

  await execute(requestFor("192.0.2.51"), rules, operation);
  const denied = await execute(
    requestFor("192.0.2.51"),
    rules,
    operation
  );

  assert.equal(denied.status, "rate-limited");
  assert.equal(store.calls.length, 2);
  assert.equal(keepaCalls, 1);
  assert.equal(applicationStoreCalls, 1);
  assert.equal(brevoCalls, 1);
});

test("lo store riceve solo digest e mai IP email o token raw", async () => {
  const store = new TestFixedWindowStore();
  const execute = createExecutor(store);
  const ip = "192.0.2.60";
  const email = "private-recipient@example.test";
  const token = "raw-management-token-value";

  await execute(
    requestFor(ip),
    [
      clientRule(ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_CLIENT),
      emailRule(ABUSE_RATE_LIMIT_POLICIES.ALERT_EMAIL, email),
      tokenRule(ABUSE_RATE_LIMIT_POLICIES.MANAGEMENT_TOKEN, token),
    ],
    async () => undefined
  );

  assert.equal(store.calls.length, 1);
  assert.equal(store.calls[0].length, 3);
  const serializedInputs = JSON.stringify(store.calls);
  assert.doesNotMatch(serializedInputs, new RegExp(ip.replaceAll(".", "\\.")));
  assert.doesNotMatch(serializedInputs, /private-recipient/i);
  assert.doesNotMatch(serializedInputs, /raw-management-token-value/i);

  for (const input of store.calls[0]) {
    assert.match(input.subjectHash, /^[a-f0-9]{64}$/);
  }
});

test("429 e 503 sono sanitizzati e non memorizzabili", async () => {
  const limitedResponse = createAbuseRateLimitFailureResponse({
    status: "rate-limited",
    retryAfterSeconds: 17,
  });
  const limitedBody = JSON.stringify(await limitedResponse.json());

  assert.equal(limitedResponse.status, 429);
  assert.equal(limitedResponse.headers.get("retry-after"), "17");
  assert.equal(
    limitedResponse.headers.get("cache-control"),
    "no-store, max-age=0"
  );
  assert.equal(limitedResponse.headers.get("pragma"), "no-cache");
  assert.equal(limitedResponse.headers.get("x-content-type-options"), "nosniff");
  assert.doesNotMatch(
    limitedBody,
    /supabase|keepa|brevo|rpc|digest|email|192\.0\.2/i
  );

  const unavailableResponse = createAbuseRateLimitFailureResponse({
    status: "unavailable",
  });
  const unavailableBody = JSON.stringify(await unavailableResponse.json());

  assert.equal(unavailableResponse.status, 503);
  assert.equal(unavailableResponse.headers.get("retry-after"), null);
  assert.doesNotMatch(
    unavailableBody,
    /supabase|keepa|brevo|rpc|digest|email|secret/i
  );
});
