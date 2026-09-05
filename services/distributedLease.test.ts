import assert from "node:assert/strict";
import test from "node:test";

import {
  createDistributedLeaseService,
  hashDistributedLeaseResourceKey,
  type DistributedLease,
} from "./distributedLease";

type LeaseRow = {
  ownerToken: string;
  expiresAt: number;
};

function createLeaseHarness() {
  const leases = new Map<string, LeaseRow>();
  const calls: string[] = [];
  let now = Date.parse("2026-09-04T09:00:00.000Z");
  let tokenSequence = 0;

  const service = createDistributedLeaseService({
    async callRpc(functionName, parameters) {
      calls.push(functionName);
      const key = `${parameters.p_resource_type}:${parameters.p_resource_key}`;

      if (functionName === "affario_try_claim_distributed_lease") {
        const existing = leases.get(key);

        if (existing && existing.expiresAt > now) {
          return false;
        }

        leases.set(key, {
          ownerToken: String(parameters.p_owner_token),
          expiresAt:
            now + Number(parameters.p_lease_seconds) * 1_000,
        });
        return true;
      }

      if (functionName === "affario_release_distributed_lease") {
        const existing = leases.get(key);

        if (
          !existing ||
          existing.ownerToken !== parameters.p_owner_token
        ) {
          return false;
        }

        leases.delete(key);
        return true;
      }

      throw new Error("Unexpected RPC.");
    },
    createOwnerToken() {
      tokenSequence += 1;
      return tokenSequence.toString(36).padStart(43, "a");
    },
  });

  return {
    calls,
    leases,
    service,
    advance(milliseconds: number) {
      now += milliseconds;
    },
  };
}

test("claim concorrente ha un solo vincitore e release normale libera", async () => {
  const harness = createLeaseHarness();
  const input = {
    resourceType: "monitoring_run",
    resourceKey: "price-alert-monitoring",
    leaseSeconds: 360,
  };

  const [first, second] = await Promise.all([
    harness.service.tryClaim(input),
    harness.service.tryClaim(input),
  ]);

  assert.equal(first.status, "acquired");
  assert.equal(second.status, "contended");

  if (first.status !== "acquired") {
    assert.fail("The first worker must own the lease.");
  }

  assert.equal(await harness.service.release(first.lease), true);
  assert.equal((await harness.service.tryClaim(input)).status, "acquired");
});

test("crash simulato conserva la lease e la scadenza permette recovery", async () => {
  const harness = createLeaseHarness();
  const input = {
    resourceType: "monitoring_run",
    resourceKey: "price-alert-monitoring",
    leaseSeconds: 360,
  };

  assert.equal((await harness.service.tryClaim(input)).status, "acquired");
  assert.equal((await harness.service.tryClaim(input)).status, "contended");

  harness.advance(360_001);

  assert.equal((await harness.service.tryClaim(input)).status, "acquired");
});

test("recovery concorrente di una lease scaduta ha un solo vincitore", async () => {
  const harness = createLeaseHarness();
  const input = {
    resourceType: "monitoring_run",
    resourceKey: "price-alert-monitoring",
    leaseSeconds: 360,
  };

  await harness.service.tryClaim(input);
  harness.advance(360_001);

  const recoveries = await Promise.all([
    harness.service.tryClaim(input),
    harness.service.tryClaim(input),
  ]);

  assert.equal(
    recoveries.filter((result) => result.status === "acquired").length,
    1
  );
  assert.equal(
    recoveries.filter((result) => result.status === "contended").length,
    1
  );
});

test("lease exact ASIN scaduta è recuperabile", async () => {
  const harness = createLeaseHarness();
  const input = {
    resourceType: "keepa_product_refresh",
    resourceKey: "B0FQGPJCJK",
    leaseSeconds: 60,
  };

  assert.equal((await harness.service.tryClaim(input)).status, "acquired");
  harness.advance(60_001);
  assert.equal((await harness.service.tryClaim(input)).status, "acquired");
});

test("release con owner errato è rifiutato", async () => {
  const harness = createLeaseHarness();
  const claim = await harness.service.tryClaim({
    resourceType: "monitoring_run",
    resourceKey: "price-alert-monitoring",
    leaseSeconds: 360,
  });

  assert.equal(claim.status, "acquired");

  if (claim.status !== "acquired") {
    assert.fail("The lease must be acquired.");
  }

  const wrongOwnerLease: DistributedLease = {
    ...claim.lease,
    ownerToken: "z".repeat(43),
  };

  assert.equal(await harness.service.release(wrongOwnerLease), false);
  assert.equal(
    (
      await harness.service.tryClaim({
        resourceType: "monitoring_run",
        resourceKey: "price-alert-monitoring",
        leaseSeconds: 360,
      })
    ).status,
    "contended"
  );
});

test("resource diverse sono indipendenti e le chiavi raw non entrano nella RPC", async () => {
  const harness = createLeaseHarness();
  const firstAsin = "B0FQGPJCJK";
  const secondAsin = "B000000001";

  const [first, second] = await Promise.all([
    harness.service.tryClaim({
      resourceType: "keepa_product_refresh",
      resourceKey: firstAsin,
      leaseSeconds: 60,
    }),
    harness.service.tryClaim({
      resourceType: "keepa_product_refresh",
      resourceKey: secondAsin,
      leaseSeconds: 60,
    }),
  ]);

  assert.equal(first.status, "acquired");
  assert.equal(second.status, "acquired");
  assert.notEqual(
    hashDistributedLeaseResourceKey("keepa_product_refresh", firstAsin),
    hashDistributedLeaseResourceKey("keepa_product_refresh", secondAsin)
  );
  assert.doesNotMatch(JSON.stringify([...harness.leases.keys()]), /B0F|B000/);
});
