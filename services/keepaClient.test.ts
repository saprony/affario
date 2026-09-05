import assert from "node:assert/strict";
import test from "node:test";

import {
  createKeepaHttpRequester,
  KEEPA_HTTP_TIMEOUT_MS,
  KeepaClientError,
  parseKeepaRuntimeObservation,
  type KeepaHttpRequesterDependencies,
} from "./keepaClient";
import {
  DEFAULT_KEEPA_BACKGROUND_TOKEN_RESERVE,
  parseKeepaBackgroundTokenReserve,
} from "./keepaRuntimeState";

const OBSERVED_AT = new Date("2026-08-29T08:00:00.000Z");
const LEASE_STARTED_AT = "2026-08-29T07:59:59.000Z";
const REQUEST_URL = new URL("https://provider.example.test/product");

function bucketPayload(overrides: Record<string, unknown> = {}) {
  return {
    tokensLeft: 500,
    tokensConsumed: 3,
    refillRate: 20,
    refillIn: 30_000,
    tokenFlowReduction: 0.5,
    processingTimeInMs: 20,
    products: [],
    ...overrides,
  };
}

function createHarness(input: {
  response: () => Promise<Response>;
  acquire?: KeepaHttpRequesterDependencies["acquireBackgroundRequest"];
  record?: KeepaHttpRequesterDependencies["recordObservation"];
}) {
  let requestCalls = 0;
  let acquireCalls = 0;
  const requestInits: RequestInit[] = [];
  const recorded: Array<
    Parameters<KeepaHttpRequesterDependencies["recordObservation"]>[0]
  > = [];
  const released: string[] = [];
  const requester = createKeepaHttpRequester({
    async request(_input, init) {
      requestCalls += 1;
      requestInits.push(init);
      return input.response();
    },
    async acquireBackgroundRequest(estimatedTokenCost, now) {
      acquireCalls += 1;
      return input.acquire
        ? input.acquire(estimatedTokenCost, now)
        : {
            allowed: true,
            budgetStatus: "OK",
            leaseStartedAt: LEASE_STARTED_AT,
          };
    },
    async recordObservation(observation) {
      recorded.push(observation);

      if (input.record) {
        await input.record(observation);
      }
    },
    async releaseBackgroundRequest(leaseStartedAt) {
      released.push(leaseStartedAt);
    },
    clock: () => new Date(OBSERVED_AT),
  });

  return {
    requester,
    recorded,
    released,
    requestInits,
    get acquireCalls() {
      return acquireCalls;
    },
    get requestCalls() {
      return requestCalls;
    },
  };
}

test("una response 200 registra passivamente tutta la telemetria", async () => {
  const harness = createHarness({
    response: async () => Response.json(bucketPayload()),
  });

  const result = await harness.requester(REQUEST_URL, {
    context: "interactive",
    estimatedTokenCost: 10,
  });

  assert.equal(harness.acquireCalls, 0);
  assert.equal(harness.requestCalls, 1);
  assert.deepEqual(result.payload, bucketPayload());
  assert.deepEqual(harness.recorded, [
    {
      observedAt: OBSERVED_AT.toISOString(),
      observation: {
        observedAt: OBSERVED_AT.toISOString(),
        tokensLeft: 500,
        tokensConsumed: 3,
        refillRate: 20,
        refillInMs: 30_000,
        tokenFlowReduction: 0.5,
      },
      context: "interactive",
      rateLimited: false,
      backgroundLeaseStartedAt: null,
    },
  ]);
});

test("ogni HTTP Keepa ha un timeout bounded di 30 secondi", async () => {
  const harness = createHarness({
    response: async () => Response.json(bucketPayload()),
  });

  await harness.requester(REQUEST_URL, {
    context: "interactive",
    estimatedTokenCost: 3,
  });

  const signal = harness.requestInits[0]?.signal;

  assert.equal(KEEPA_HTTP_TIMEOUT_MS, 30_000);
  assert.ok(signal instanceof AbortSignal);
  assert.equal(signal.aborted, false);
});

test("failure telemetria non rompe una response interactive valida", async () => {
  const harness = createHarness({
    response: async () => Response.json(bucketPayload()),
    record: async () => {
      throw new Error("telemetry unavailable");
    },
  });

  const result = await harness.requester(REQUEST_URL, {
    context: "interactive",
    estimatedTokenCost: 10,
  });

  assert.deepEqual(result.payload, bucketPayload());
  assert.equal(harness.requestCalls, 1);
  assert.deepEqual(harness.released, []);
});

test("tokensLeft negativo resta una osservazione valida", () => {
  assert.deepEqual(
    parseKeepaRuntimeObservation(
      bucketPayload({ tokensLeft: -3 }),
      OBSERVED_AT.toISOString()
    ),
    {
      observedAt: OBSERVED_AT.toISOString(),
      tokensLeft: -3,
      tokensConsumed: 3,
      refillRate: 20,
      refillInMs: 30_000,
      tokenFlowReduction: 0.5,
    }
  );
});

test("un 429 interactive registra bucket e contatore prima dell'errore", async () => {
  const harness = createHarness({
    response: async () =>
      Response.json(bucketPayload({ tokensLeft: -3, refillIn: 12_844 }), {
        status: 429,
      }),
  });

  await assert.rejects(
    harness.requester(REQUEST_URL, {
      context: "interactive",
      estimatedTokenCost: 10,
    }),
    (error: unknown) =>
      error instanceof KeepaClientError &&
      error.code === "OUT_OF_TOKENS" &&
      error.retryAfterSeconds === 13 &&
      error.tokenBudgetStatus === "EXHAUSTED"
  );

  assert.equal(harness.recorded[0]?.rateLimited, true);
  assert.equal(harness.recorded[0]?.context, "interactive");
  assert.equal(harness.recorded[0]?.observation?.tokensLeft, -3);
});

test("failure telemetria non nasconde un 429 interactive", async () => {
  const harness = createHarness({
    response: async () =>
      Response.json(bucketPayload({ tokensLeft: -1 }), { status: 429 }),
    record: async () => {
      throw new Error("telemetry unavailable");
    },
  });

  await assert.rejects(
    harness.requester(REQUEST_URL, {
      context: "interactive",
      estimatedTokenCost: 10,
    }),
    (error: unknown) =>
      error instanceof KeepaClientError && error.code === "OUT_OF_TOKENS"
  );

  assert.equal(harness.requestCalls, 1);
});

test("la riserva non viene consultata per richieste interactive", async () => {
  const harness = createHarness({
    response: async () => Response.json(bucketPayload()),
    acquire: async () => ({
      allowed: false,
      budgetStatus: "RESERVE",
      leaseStartedAt: null,
    }),
  });

  await harness.requester(REQUEST_URL, {
    context: "interactive",
    estimatedTokenCost: 10,
  });

  assert.equal(harness.acquireCalls, 0);
  assert.equal(harness.requestCalls, 1);
});

test("background sotto riserva produce zero chiamate HTTP", async () => {
  const harness = createHarness({
    response: async () => Response.json(bucketPayload()),
    acquire: async () => ({
      allowed: false,
      budgetStatus: "RESERVE",
      leaseStartedAt: null,
    }),
  });

  await assert.rejects(
    harness.requester(REQUEST_URL, {
      context: "background_alert",
      estimatedTokenCost: 3,
    }),
    (error: unknown) =>
      error instanceof KeepaClientError &&
      error.code === "BACKGROUND_TOKEN_RESERVE" &&
      error.tokenBudgetStatus === "RESERVE"
  );

  assert.equal(harness.requestCalls, 0);
  assert.equal(harness.recorded.length, 0);
});

test("background fallisce chiuso se budget e lease non sono determinabili", async () => {
  const acquisitionFailure = createHarness({
    response: async () => Response.json(bucketPayload()),
    acquire: async () => {
      throw new Error("budget unavailable");
    },
  });

  await assert.rejects(
    acquisitionFailure.requester(REQUEST_URL, {
      context: "background_alert",
      estimatedTokenCost: 3,
    }),
    (error: unknown) =>
      error instanceof KeepaClientError &&
      error.code === "BACKGROUND_TOKEN_RESERVE" &&
      error.tokenBudgetStatus === "UNKNOWN"
  );
  assert.equal(acquisitionFailure.requestCalls, 0);

  const missingLease = createHarness({
    response: async () => Response.json(bucketPayload()),
    acquire: async () => ({
      allowed: true,
      budgetStatus: "OK",
      leaseStartedAt: null,
    }),
  });

  await assert.rejects(
    missingLease.requester(REQUEST_URL, {
      context: "background_alert",
      estimatedTokenCost: 3,
    }),
    (error: unknown) =>
      error instanceof KeepaClientError &&
      error.code === "BACKGROUND_TOKEN_RESERVE"
  );
  assert.equal(missingLease.requestCalls, 0);
});

test("background fallisce chiuso se la telemetria non viene persistita", async () => {
  const harness = createHarness({
    response: async () => Response.json(bucketPayload()),
    record: async () => {
      throw new Error("telemetry unavailable");
    },
  });

  await assert.rejects(
    harness.requester(REQUEST_URL, {
      context: "background_alert",
      estimatedTokenCost: 3,
    }),
    (error: unknown) =>
      error instanceof KeepaClientError &&
      error.code === "BACKGROUND_TOKEN_RESERVE" &&
      error.tokenBudgetStatus === "UNKNOWN"
  );

  assert.equal(harness.requestCalls, 1);
  assert.deepEqual(harness.released, [LEASE_STARTED_AT]);
});

test("il bootstrap senza telemetria consente al massimo una richiesta", async () => {
  let bootstrapAttempted = false;
  const harness = createHarness({
    response: async () => Response.json({ error: {} }, { status: 500 }),
    acquire: async () => {
      if (bootstrapAttempted) {
        return {
          allowed: false,
          budgetStatus: "UNKNOWN",
          leaseStartedAt: null,
        };
      }

      bootstrapAttempted = true;
      return {
        allowed: true,
        budgetStatus: "UNKNOWN",
        leaseStartedAt: LEASE_STARTED_AT,
      };
    },
  });

  await assert.rejects(
    harness.requester(REQUEST_URL, {
      context: "background_alert",
      estimatedTokenCost: 3,
    }),
    (error: unknown) =>
      error instanceof KeepaClientError &&
      error.code === "KEEPA_HTTP_ERROR"
  );
  await assert.rejects(
    harness.requester(REQUEST_URL, {
      context: "background_alert",
      estimatedTokenCost: 3,
    }),
    (error: unknown) =>
      error instanceof KeepaClientError &&
      error.code === "BACKGROUND_TOKEN_RESERVE" &&
      error.tokenBudgetStatus === "UNKNOWN"
  );

  assert.equal(harness.requestCalls, 1);
});

test("un 429 background registra il contesto e libera il lease atomicamente", async () => {
  const harness = createHarness({
    response: async () =>
      Response.json(bucketPayload({ tokensLeft: -1 }), { status: 429 }),
  });

  await assert.rejects(
    harness.requester(REQUEST_URL, {
      context: "background_alert",
      estimatedTokenCost: 3,
    }),
    (error: unknown) =>
      error instanceof KeepaClientError &&
      error.code === "OUT_OF_TOKENS"
  );

  assert.equal(harness.recorded[0]?.context, "background_alert");
  assert.equal(harness.recorded[0]?.rateLimited, true);
  assert.equal(
    harness.recorded[0]?.backgroundLeaseStartedAt,
    LEASE_STARTED_AT
  );
});

test("reserve assente usa 120, valori invalidi bloccano il background", () => {
  assert.equal(
    parseKeepaBackgroundTokenReserve(undefined),
    DEFAULT_KEEPA_BACKGROUND_TOKEN_RESERVE
  );
  assert.equal(parseKeepaBackgroundTokenReserve("120"), 120);
  assert.equal(parseKeepaBackgroundTokenReserve("-1"), null);
  assert.equal(parseKeepaBackgroundTokenReserve("12.5"), null);
  assert.equal(parseKeepaBackgroundTokenReserve("invalid"), null);
});
