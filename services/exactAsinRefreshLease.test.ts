import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type {
  DistributedLease,
  DistributedLeaseClaimResult,
} from "./distributedLease";
import {
  createExactAsinRefreshCoordinator,
  ExactAsinRefreshLeaseError,
  EXACT_ASIN_REFRESH_LEASE_SECONDS,
} from "./exactAsinRefreshLease";

const PRIMARY_ASIN = "B0FQGPJCJK";
const SECONDARY_ASIN = "B000000001";

function createDeferred() {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

function createCoordinatorHarness(input?: {
  waitBeforeContentionReread?: () => Promise<void>;
}) {
  const owners = new Map<string, DistributedLease>();
  let claimCalls = 0;
  let releaseCalls = 0;
  let tokenSequence = 0;

  const coordinator = createExactAsinRefreshCoordinator({
    async tryClaim(claimInput): Promise<DistributedLeaseClaimResult> {
      claimCalls += 1;

      if (owners.has(claimInput.resourceKey)) {
        return { status: "contended" };
      }

      tokenSequence += 1;
      const lease = {
        resourceType: claimInput.resourceType,
        resourceKeyHash: createHash("sha256")
          .update(claimInput.resourceKey)
          .digest("hex"),
        ownerToken: tokenSequence.toString(36).padStart(43, "a"),
      };
      owners.set(claimInput.resourceKey, lease);
      return { status: "acquired", lease };
    },
    async release(lease) {
      releaseCalls += 1;
      const entry = [...owners.entries()].find(
        ([, owner]) => owner.ownerToken === lease.ownerToken
      );

      if (!entry) {
        return false;
      }

      owners.delete(entry[0]);
      return true;
    },
    waitBeforeContentionReread:
      input?.waitBeforeContentionReread ?? (async () => {}),
  });

  return {
    coordinator,
    owners,
    get claimCalls() {
      return claimCalls;
    },
    get releaseCalls() {
      return releaseCalls;
    },
  };
}

test("cache fresca usa zero RPC lock e zero refresh", async () => {
  const harness = createCoordinatorHarness();
  let refreshCalls = 0;

  const result = await harness.coordinator({
    exactAsin: PRIMARY_ASIN,
    context: "interactive",
    readFreshCache: async () => "fresh",
    refresh: async () => {
      refreshCalls += 1;
      return "refreshed";
    },
  });

  assert.equal(result, "fresh");
  assert.equal(harness.claimCalls, 0);
  assert.equal(harness.releaseCalls, 0);
  assert.equal(refreshCalls, 0);
});

test("cache fresca resta disponibile anche se lo store lease sarebbe indisponibile", async () => {
  let claimCalls = 0;
  const coordinator = createExactAsinRefreshCoordinator({
    async tryClaim() {
      claimCalls += 1;
      throw new Error("store unavailable");
    },
    async release() {
      return false;
    },
    async waitBeforeContentionReread() {},
  });

  const result = await coordinator({
    exactAsin: PRIMARY_ASIN,
    context: "interactive",
    readFreshCache: async () => "fresh",
    refresh: async () => "unexpected",
  });

  assert.equal(result, "fresh");
  assert.equal(claimCalls, 0);
});

test("cache stale esegue una claim e una release intorno al refresh", async () => {
  const harness = createCoordinatorHarness();
  let refreshCalls = 0;

  const result = await harness.coordinator({
    exactAsin: PRIMARY_ASIN,
    context: "interactive",
    readFreshCache: async () => null,
    refresh: async () => {
      refreshCalls += 1;
      return "refreshed";
    },
  });

  assert.equal(result, "refreshed");
  assert.equal(harness.claimCalls, 1);
  assert.equal(harness.releaseCalls, 1);
  assert.equal(refreshCalls, 1);
  assert.equal(EXACT_ASIN_REFRESH_LEASE_SECONDS, 60);
});

test("due richieste sullo stesso ASIN producono un solo refresh", async () => {
  let cache: string | null = null;
  const refreshStarted = createDeferred();
  const refreshFinished = createDeferred();
  const providerGate = createDeferred();
  const harness = createCoordinatorHarness({
    waitBeforeContentionReread: () => refreshFinished.promise,
  });
  let refreshCalls = 0;
  const createRequest = () =>
    harness.coordinator({
      exactAsin: PRIMARY_ASIN,
      context: "interactive" as const,
      readFreshCache: async () => cache,
      refresh: async () => {
        refreshCalls += 1;
        refreshStarted.resolve();
        await providerGate.promise;
        cache = "fresh";
        refreshFinished.resolve();
        return "fresh";
      },
    });

  const first = createRequest();
  await refreshStarted.promise;
  const second = createRequest();
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(harness.claimCalls, 2);
  providerGate.resolve();

  assert.deepEqual(await Promise.all([first, second]), ["fresh", "fresh"]);
  assert.equal(refreshCalls, 1);
  assert.equal(harness.claimCalls, 2);
  assert.equal(harness.releaseCalls, 1);
});

test("ASIN differenti acquisiscono lease indipendenti", async () => {
  const harness = createCoordinatorHarness();
  const started: string[] = [];
  const providersReleased = createDeferred();
  const run = (exactAsin: string) =>
    harness.coordinator({
      exactAsin,
      context: "interactive" as const,
      readFreshCache: async () => null,
      refresh: async () => {
        started.push(exactAsin);
        await providersReleased.promise;
        return exactAsin;
      },
    });

  const first = run(PRIMARY_ASIN);
  const second = run(SECONDARY_ASIN);
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  assert.deepEqual(new Set(started), new Set([PRIMARY_ASIN, SECONDARY_ASIN]));
  providersReleased.resolve();
  assert.deepEqual(await Promise.all([first, second]), [
    PRIMARY_ASIN,
    SECONDARY_ASIN,
  ]);
});

test("background che perde la lease salta senza refresh", async () => {
  const harness = createCoordinatorHarness();
  harness.owners.set(PRIMARY_ASIN, {
    resourceType: "keepa_product_refresh",
    resourceKeyHash: "a".repeat(64),
    ownerToken: "a".repeat(43),
  });
  let refreshCalls = 0;

  await assert.rejects(
    harness.coordinator({
      exactAsin: PRIMARY_ASIN,
      context: "background_alert",
      readFreshCache: async () => null,
      refresh: async () => {
        refreshCalls += 1;
        return "unexpected";
      },
    }),
    (error: unknown) =>
      error instanceof ExactAsinRefreshLeaseError &&
      error.code === "CONTENDED"
  );

  assert.equal(refreshCalls, 0);
  assert.equal(harness.claimCalls, 1);
  assert.equal(harness.releaseCalls, 0);
});

test("interactive contesa usa l'unica rilettura se la cache diventa fresca", async () => {
  let fresh = false;
  const harness = createCoordinatorHarness({
    waitBeforeContentionReread: async () => {
      fresh = true;
    },
  });
  harness.owners.set(PRIMARY_ASIN, {
    resourceType: "keepa_product_refresh",
    resourceKeyHash: "a".repeat(64),
    ownerToken: "a".repeat(43),
  });
  const readReasons: string[] = [];

  const result = await harness.coordinator({
    exactAsin: PRIMARY_ASIN,
    context: "interactive",
    readFreshCache: async (reason) => {
      readReasons.push(reason);
      return fresh ? "fresh" : null;
    },
    refresh: async () => "unexpected",
  });

  assert.equal(result, "fresh");
  assert.deepEqual(readReasons, ["initial", "contention"]);
});

test("interactive contesa senza cache fresca fallisce temporaneamente senza refresh", async () => {
  const harness = createCoordinatorHarness();
  harness.owners.set(PRIMARY_ASIN, {
    resourceType: "keepa_product_refresh",
    resourceKeyHash: "a".repeat(64),
    ownerToken: "a".repeat(43),
  });
  let reads = 0;
  let refreshCalls = 0;

  await assert.rejects(
    harness.coordinator({
      exactAsin: PRIMARY_ASIN,
      context: "interactive",
      readFreshCache: async () => {
        reads += 1;
        return null;
      },
      refresh: async () => {
        refreshCalls += 1;
        return "unexpected";
      },
    }),
    (error: unknown) =>
      error instanceof ExactAsinRefreshLeaseError &&
      error.code === "CONTENDED"
  );

  assert.equal(reads, 2);
  assert.equal(refreshCalls, 0);
});

test("errore dello store lease fallisce chiuso dopo cache miss in ogni contesto", async () => {
  const coordinator = createExactAsinRefreshCoordinator({
    async tryClaim() {
      throw new Error("store unavailable");
    },
    async release() {
      return false;
    },
    async waitBeforeContentionReread() {},
  });
  let refreshCalls = 0;

  for (const context of ["interactive", "background_alert"] as const) {
    await assert.rejects(
      coordinator({
        exactAsin: PRIMARY_ASIN,
        context,
        readFreshCache: async () => null,
        refresh: async () => {
          refreshCalls += 1;
          return "unexpected";
        },
      }),
      (error: unknown) =>
        error instanceof ExactAsinRefreshLeaseError &&
        error.code === "STORE_UNAVAILABLE"
    );
  }

  assert.equal(refreshCalls, 0);
});
