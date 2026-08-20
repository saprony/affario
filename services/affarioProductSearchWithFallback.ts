import "server-only";

import {
  groupAffarioExternalProductCandidates,
  prepareAffarioProductSearchQuery,
  rankAffarioExternalProductFamilies,
} from "@/lib/affarioProductSearch";
import { searchAffarioProducts } from "@/services/affarioProductSearch";
import { searchKeepaProductCandidates } from "@/services/providers/keepaProductSearchProvider";
import type { AffarioProductSearchWithFallbackResult } from "@/types/productSearch";

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

export async function searchAffarioProductsWithFallback(
  query: string
): Promise<AffarioProductSearchWithFallbackResponse> {
  const localResult = await searchAffarioProducts(query);

  if (localResult.results.length > 0) {
    return {
      data: {
        query: localResult.query,
        source: "AFFARIO_CATALOG",
        status: "MATCHES_FOUND",
        families: localResult.results,
      },
      serverReport: {
        localFamiliesFound: localResult.results.length,
        externalRequests: 0,
        tokensConsumed: 0,
        providerCandidatesReceived: 0,
        providerCandidatesConsidered: 0,
        externalFamiliesReturned: 0,
      },
    };
  }

  const providerResult = await searchKeepaProductCandidates(
    localResult.query
  );
  const groupedFamilies = groupAffarioExternalProductCandidates(
    providerResult.data.candidates
  );
  const preparedQuery = prepareAffarioProductSearchQuery(
    providerResult.data.query
  );
  const families = rankAffarioExternalProductFamilies(
    preparedQuery,
    groupedFamilies
  );

  return {
    data: {
      query: providerResult.data.query,
      source: "EXTERNAL_PROVIDER",
      status: families.length > 0 ? "MATCHES_FOUND" : "NO_MATCHES",
      families,
    },
    serverReport: {
      localFamiliesFound: 0,
      externalRequests: providerResult.serverReport.externalRequests,
      tokensConsumed: providerResult.serverReport.tokensConsumed,
      providerCandidatesReceived:
        providerResult.serverReport.providerCandidatesReceived,
      providerCandidatesConsidered: providerResult.data.candidates.length,
      externalFamiliesReturned: families.length,
      tokensRemaining: providerResult.serverReport.tokensRemaining,
    },
  };
}
