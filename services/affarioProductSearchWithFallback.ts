import "server-only";

import {
  AFFARIO_PRODUCT_SEARCH_MAX_RESULTS,
  groupAffarioExternalProductCandidates,
  prepareAffarioProductSearchQuery,
  rankAffarioExternalProductFamilies,
} from "@/lib/affarioProductSearch";
import { searchAffarioProducts } from "@/services/affarioProductSearch";
import {
  type KeepaProductSearchProviderResult,
} from "@/services/providers/keepaProductSearchProvider";
import {
  ProductSearchQueryCacheError,
  searchKeepaProductCandidatesWithCache,
} from "@/services/productSearchQueryCache";
import {
  markProductSearchAvailabilityUnknown,
  rankProductSearchFamiliesByAvailability,
  type ProductSearchAvailabilityRanker,
} from "@/services/productSearchAvailability";
import type {
  AffarioProductSearchFamily,
  AffarioProductSearchResult,
  AffarioProductSearchWithFallbackResult,
  AffarioPublicProductSearchFamily,
} from "@/types/productSearch";

const AFFARIO_EXACT_ASIN_QUERY_PATTERN = /^[a-z0-9]{10}$/u;

export type AffarioProductSearchFallbackServerReport = {
  localFamiliesFound: number;
  externalRequests: 0 | 1;
  tokensConsumed: number;
  providerCandidatesReceived: number;
  providerCandidatesConsidered: number;
  externalFamiliesReturned: number;
  tokensRemaining?: number;
};

export type AffarioProductSearchWithFallbackResponse = {
  data: AffarioProductSearchWithFallbackResult;
  serverReport: AffarioProductSearchFallbackServerReport;
};

export type AffarioProductSearchWithFallbackDependencies = {
  searchLocal: (query: string) => Promise<AffarioProductSearchResult>;
  searchProvider: (
    query: string
  ) => Promise<KeepaProductSearchProviderResult>;
  rankByAvailability?: ProductSearchAvailabilityRanker;
};

function getFamilyAsins(
  family: AffarioProductSearchFamily
): ReadonlySet<string> {
  return new Set([
    family.representativeAsin,
    ...family.variants.map(({ asin }) => asin),
  ].map((asin) => asin.trim().toUpperCase()));
}

function familyContainsAsin(
  family: AffarioProductSearchFamily,
  normalizedAsin: string
): boolean {
  return [...getFamilyAsins(family)].some(
    (asin) => asin.toLowerCase() === normalizedAsin
  );
}

function isExactLocalAsinSearch(
  normalizedQuery: string,
  localFamilies: readonly AffarioProductSearchFamily[]
): boolean {
  return (
    AFFARIO_EXACT_ASIN_QUERY_PATTERN.test(normalizedQuery) &&
    localFamilies.some((family) =>
      familyContainsAsin(family, normalizedQuery)
    )
  );
}

export function mergeAffarioProductSearchFamilies(
  localFamilies: readonly AffarioProductSearchFamily[],
  providerFamilies: readonly AffarioProductSearchFamily[]
): AffarioProductSearchFamily[] {
  const merged = [...localFamilies];
  const familyIds = new Set(localFamilies.map(({ familyId }) => familyId));
  const exactAsins = new Set(
    localFamilies.flatMap((family) => [...getFamilyAsins(family)])
  );

  for (const providerFamily of providerFamilies) {
    const providerAsins = getFamilyAsins(providerFamily);
    const hasAsinOverlap = [...providerAsins].some((asin) =>
      exactAsins.has(asin)
    );

    if (familyIds.has(providerFamily.familyId) || hasAsinOverlap) {
      continue;
    }

    merged.push(providerFamily);
    familyIds.add(providerFamily.familyId);

    for (const asin of providerAsins) {
      exactAsins.add(asin);
    }
  }

  return merged;
}

function getPublicSource(
  families: readonly AffarioProductSearchFamily[],
  localFamilyIds: ReadonlySet<string>
): AffarioProductSearchWithFallbackResult["source"] {
  const hasLocalFamilies = families.some(({ familyId }) =>
    localFamilyIds.has(familyId)
  );
  const hasProviderFamilies = families.some(
    ({ familyId }) => !localFamilyIds.has(familyId)
  );

  if (hasLocalFamilies && hasProviderFamilies) {
    return "HYBRID";
  }

  return hasLocalFamilies ? "AFFARIO_CATALOG" : "KEEPA";
}

function localOnlyResponse(
  localResult: AffarioProductSearchResult,
  externalRequests: 0 | 1,
  families: readonly AffarioPublicProductSearchFamily[]
): AffarioProductSearchWithFallbackResponse {
  return {
    data: {
      query: localResult.query,
      source: "AFFARIO_CATALOG",
      status: "MATCHES_FOUND",
      families,
    },
    serverReport: {
      localFamiliesFound: localResult.results.length,
      externalRequests,
      tokensConsumed: 0,
      providerCandidatesReceived: 0,
      providerCandidatesConsidered: 0,
      externalFamiliesReturned: 0,
    },
  };
}

async function addProductSearchAvailability(
  dependencies: AffarioProductSearchWithFallbackDependencies,
  families: readonly AffarioProductSearchFamily[],
  preserveUnavailable: boolean
): Promise<readonly AffarioPublicProductSearchFamily[]> {
  if (!dependencies.rankByAvailability) {
    return markProductSearchAvailabilityUnknown(
      families,
      AFFARIO_PRODUCT_SEARCH_MAX_RESULTS
    );
  }

  try {
    return await dependencies.rankByAvailability(families, {
      preserveUnavailable,
      maxResults: AFFARIO_PRODUCT_SEARCH_MAX_RESULTS,
    });
  } catch {
    return markProductSearchAvailabilityUnknown(
      families,
      AFFARIO_PRODUCT_SEARCH_MAX_RESULTS
    );
  }
}

export function createAffarioProductSearchWithFallback(
  dependencies: AffarioProductSearchWithFallbackDependencies
) {
  return async function searchWithFallback(
    query: string
  ): Promise<AffarioProductSearchWithFallbackResponse> {
    const localResult = await dependencies.searchLocal(query);
    const preparedQuery = prepareAffarioProductSearchQuery(localResult.query);
    const exactAsinQuery = AFFARIO_EXACT_ASIN_QUERY_PATTERN.test(
      preparedQuery.normalizedQuery
    );
    const exactLocalAsinSearch = isExactLocalAsinSearch(
      preparedQuery.normalizedQuery,
      localResult.results
    );
    if (exactLocalAsinSearch) {
      const families = await addProductSearchAvailability(
        dependencies,
        localResult.results,
        true
      );

      return localOnlyResponse(localResult, 0, families);
    }

    let providerResult: KeepaProductSearchProviderResult;

    try {
      providerResult = await dependencies.searchProvider(query);
    } catch (error) {
      if (localResult.results.length > 0) {
        const families = await addProductSearchAvailability(
          dependencies,
          localResult.results,
          exactAsinQuery
        );

        return localOnlyResponse(
          localResult,
          error instanceof ProductSearchQueryCacheError
            ? error.externalRequests
            : 1,
          families
        );
      }

      throw error;
    }

    const providerFamilies = groupAffarioExternalProductCandidates(
      providerResult.data.candidates
    );
    const mergedFamilies = mergeAffarioProductSearchFamilies(
      localResult.results,
      providerFamilies
    );
    const rankedFamilies = rankAffarioExternalProductFamilies(
      preparedQuery,
      mergedFamilies,
      null
    );
    const families = await addProductSearchAvailability(
      dependencies,
      rankedFamilies,
      exactAsinQuery
    );
    const localFamilyIds = new Set(
      localResult.results.map(({ familyId }) => familyId)
    );
    const source = getPublicSource(families, localFamilyIds);
    const externalFamiliesReturned = families.filter(
      ({ familyId }) => !localFamilyIds.has(familyId)
    ).length;

    return {
      data: {
        query: providerResult.data.query,
        source,
        status: families.length > 0 ? "MATCHES_FOUND" : "NO_MATCHES",
        families,
      },
      serverReport: {
        localFamiliesFound: localResult.results.length,
        externalRequests: providerResult.serverReport.externalRequests,
        tokensConsumed: providerResult.serverReport.tokensConsumed,
        providerCandidatesReceived:
          providerResult.serverReport.providerCandidatesReceived,
        providerCandidatesConsidered: providerResult.data.candidates.length,
        externalFamiliesReturned,
        tokensRemaining: providerResult.serverReport.tokensRemaining,
      },
    };
  };
}

export const searchAffarioProductsWithFallback =
  createAffarioProductSearchWithFallback({
    searchLocal: searchAffarioProducts,
    searchProvider: searchKeepaProductCandidatesWithCache,
    rankByAvailability: rankProductSearchFamiliesByAvailability,
  });
