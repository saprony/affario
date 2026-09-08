import "server-only";

import { createHash } from "node:crypto";

import { prepareAffarioProductSearchQuery } from "@/lib/affarioProductSearch";
import {
  releaseDistributedLease,
  tryClaimDistributedLease,
  type DistributedLease,
  type DistributedLeaseClaimResult,
} from "@/services/distributedLease";
import {
  searchKeepaProductCandidates,
  type KeepaProductSearchProviderResult,
} from "@/services/providers/keepaProductSearchProvider";
import {
  loadFreshProductSearchCache,
  saveProductSearchCache,
  type ProductSearchCachedCandidate,
} from "@/services/productSearchQueryCacheStore";
import type { AffarioExternalProductCandidate } from "@/types/productSearch";

export const PRODUCT_SEARCH_QUERY_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
export const PRODUCT_SEARCH_QUERY_CACHE_LEASE_SECONDS = 60;
export const PRODUCT_SEARCH_QUERY_CACHE_CONTENTION_WAIT_MS = 250;

const PRODUCT_SEARCH_QUERY_CACHE_RESOURCE_TYPE = "keepa_product_search";

type ProductSearchQueryCacheDependencies = {
  loadFresh: (
    queryHash: string,
    now: Date
  ) => Promise<{
    candidates: readonly ProductSearchCachedCandidate[];
  } | null>;
  save: (input: {
    queryHash: string;
    candidates: readonly AffarioExternalProductCandidate[];
    fetchedAt: Date;
    expiresAt: Date;
  }) => Promise<void>;
  searchProvider: (query: string) => Promise<KeepaProductSearchProviderResult>;
  tryClaim: (input: {
    resourceType: string;
    resourceKey: string;
    leaseSeconds: number;
  }) => Promise<DistributedLeaseClaimResult>;
  release: (lease: DistributedLease) => Promise<boolean>;
  waitBeforeContentionReread: () => Promise<void>;
  clock: () => Date;
};

export type ProductSearchQueryCacheErrorCode =
  | "CACHE_READ_FAILED"
  | "LEASE_UNAVAILABLE"
  | "LEASE_CONTENDED"
  | "CACHE_WRITE_FAILED";

export class ProductSearchQueryCacheError extends Error {
  constructor(
    public readonly code: ProductSearchQueryCacheErrorCode,
    public readonly externalRequests: 0 | 1
  ) {
    super("Product search is temporarily unavailable.");
    this.name = "ProductSearchQueryCacheError";
  }
}

export function normalizeProductSearchCacheQuery(query: string): string {
  return query
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/gu, " ");
}

export function createProductSearchQueryHash(query: string): string {
  return createHash("sha256")
    .update(normalizeProductSearchCacheQuery(query), "utf8")
    .digest("hex");
}

function cachedProviderResult(
  query: string,
  cachedCandidates: readonly ProductSearchCachedCandidate[]
): KeepaProductSearchProviderResult {
  const candidates: AffarioExternalProductCandidate[] =
    cachedCandidates.map((candidate) => ({
      ...candidate,
      categories: [],
    }));

  return {
    data: {
      query: prepareAffarioProductSearchQuery(query).normalizedQuery,
      source: "EXTERNAL_PROVIDER",
      candidates,
    },
    serverReport: {
      externalRequests: 0,
      providerCandidatesReceived: candidates.length,
      tokensConsumed: 0,
    },
  };
}

export function createCachedProductSearchProvider(
  dependencies: ProductSearchQueryCacheDependencies
) {
  return async function searchProviderWithCache(
    query: string
  ): Promise<KeepaProductSearchProviderResult> {
    const queryHash = createProductSearchQueryHash(query);
    let cached: Awaited<ReturnType<typeof dependencies.loadFresh>>;

    try {
      cached = await dependencies.loadFresh(queryHash, dependencies.clock());
    } catch {
      throw new ProductSearchQueryCacheError("CACHE_READ_FAILED", 0);
    }

    if (cached !== null) {
      return cachedProviderResult(query, cached.candidates);
    }

    let claim: DistributedLeaseClaimResult;

    try {
      claim = await dependencies.tryClaim({
        resourceType: PRODUCT_SEARCH_QUERY_CACHE_RESOURCE_TYPE,
        resourceKey: `search:${queryHash}`,
        leaseSeconds: PRODUCT_SEARCH_QUERY_CACHE_LEASE_SECONDS,
      });
    } catch {
      throw new ProductSearchQueryCacheError("LEASE_UNAVAILABLE", 0);
    }

    if (claim.status === "contended") {
      try {
        await dependencies.waitBeforeContentionReread();
        cached = await dependencies.loadFresh(
          queryHash,
          dependencies.clock()
        );
      } catch {
        throw new ProductSearchQueryCacheError("CACHE_READ_FAILED", 0);
      }

      if (cached !== null) {
        return cachedProviderResult(query, cached.candidates);
      }

      throw new ProductSearchQueryCacheError("LEASE_CONTENDED", 0);
    }

    let releaseLease = true;

    try {
      const providerResult = await dependencies.searchProvider(query);

      try {
        const fetchedAt = dependencies.clock();
        const expiresAt = new Date(
          fetchedAt.getTime() + PRODUCT_SEARCH_QUERY_CACHE_TTL_MS
        );

        await dependencies.save({
          queryHash,
          candidates: providerResult.data.candidates,
          fetchedAt,
          expiresAt,
        });
      } catch {
        releaseLease = false;
        throw new ProductSearchQueryCacheError("CACHE_WRITE_FAILED", 1);
      }

      return providerResult;
    } finally {
      if (releaseLease) {
        try {
          await dependencies.release(claim.lease);
        } catch {
          // Expiry keeps the shared lease recoverable after a failed release.
        }
      }
    }
  };
}

export const searchKeepaProductCandidatesWithCache =
  createCachedProductSearchProvider({
    loadFresh: loadFreshProductSearchCache,
    save: saveProductSearchCache,
    searchProvider: searchKeepaProductCandidates,
    tryClaim: tryClaimDistributedLease,
    release: releaseDistributedLease,
    waitBeforeContentionReread: () =>
      new Promise((resolve) => {
        setTimeout(resolve, PRODUCT_SEARCH_QUERY_CACHE_CONTENTION_WAIT_MS);
      }),
    clock: () => new Date(),
  });
