import "server-only";

import {
  releaseDistributedLease,
  tryClaimDistributedLease,
  type DistributedLease,
  type DistributedLeaseClaimResult,
} from "@/services/distributedLease";
import type { KeepaRequestContext } from "@/services/keepaRuntimeState";

export const EXACT_ASIN_REFRESH_LEASE_SECONDS = 60;
export const INTERACTIVE_REFRESH_CONTENTION_WAIT_MS = 250;

const EXACT_ASIN_RESOURCE_TYPE = "keepa_product_refresh";

type CacheReadReason = "initial" | "contention";

type ExactAsinRefreshLeaseDependencies = {
  tryClaim: (input: {
    resourceType: string;
    resourceKey: string;
    leaseSeconds: number;
  }) => Promise<DistributedLeaseClaimResult>;
  release: (lease: DistributedLease) => Promise<boolean>;
  waitBeforeContentionReread: () => Promise<void>;
};

export class ExactAsinRefreshLeaseError extends Error {
  constructor(public readonly code: "CONTENDED" | "STORE_UNAVAILABLE") {
    super("Exact-ASIN refresh is temporarily unavailable.");
    this.name = "ExactAsinRefreshLeaseError";
  }
}

export function createExactAsinRefreshCoordinator(
  dependencies: ExactAsinRefreshLeaseDependencies
) {
  return async function executeWithExactAsinRefreshLease<T>(input: {
    exactAsin: string;
    context: KeepaRequestContext;
    readFreshCache: (reason: CacheReadReason) => Promise<T | null>;
    refresh: () => Promise<T>;
  }): Promise<T> {
    const cachedResult = await input.readFreshCache("initial");

    if (cachedResult !== null) {
      return cachedResult;
    }

    let claim: DistributedLeaseClaimResult;

    try {
      claim = await dependencies.tryClaim({
        resourceType: EXACT_ASIN_RESOURCE_TYPE,
        resourceKey: input.exactAsin,
        leaseSeconds: EXACT_ASIN_REFRESH_LEASE_SECONDS,
      });
    } catch {
      throw new ExactAsinRefreshLeaseError("STORE_UNAVAILABLE");
    }

    if (claim.status === "contended") {
      if (input.context === "background_alert") {
        throw new ExactAsinRefreshLeaseError("CONTENDED");
      }

      await dependencies.waitBeforeContentionReread();
      const concurrentResult = await input.readFreshCache("contention");

      if (concurrentResult !== null) {
        return concurrentResult;
      }

      throw new ExactAsinRefreshLeaseError("CONTENDED");
    }

    try {
      return await input.refresh();
    } finally {
      try {
        await dependencies.release(claim.lease);
      } catch {
        // Expiry keeps the lease recoverable after a failed release.
      }
    }
  };
}

const executeProductionExactAsinRefresh =
  createExactAsinRefreshCoordinator({
    tryClaim: tryClaimDistributedLease,
    release: releaseDistributedLease,
    waitBeforeContentionReread: () =>
      new Promise((resolve) => {
        setTimeout(resolve, INTERACTIVE_REFRESH_CONTENTION_WAIT_MS);
      }),
  });

export const executeWithExactAsinRefreshLease =
  executeProductionExactAsinRefresh;
