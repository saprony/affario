import "server-only";

import {
  getKeepaProductAvailabilityByAsins,
  KEEPA_AVAILABILITY_PRECHECK_MAX_ASINS,
  type KeepaProductAvailabilityBatchResult,
  type KeepaProductAvailabilityCheck,
} from "@/services/keepaClient";
import { getSupabaseServerClient } from "@/services/supabaseServer";
import type {
  AffarioProductSearchFamily,
  AffarioPublicProductSearchFamily,
} from "@/types/productSearch";

export const PRODUCT_SEARCH_AVAILABILITY_MAX_AGE_MS = 60 * 60 * 1_000;
export const PRODUCT_SEARCH_AVAILABILITY_PRECHECK_MAX_ASINS =
  KEEPA_AVAILABILITY_PRECHECK_MAX_ASINS;
export const MIN_AVAILABLE_FAMILIES_TO_HIDE_UNAVAILABLE = 5;
export const PRODUCT_SEARCH_COMMERCIAL_RELEVANCE_SCORE_TOLERANCE = 500;

export type ProductSearchAvailabilityState =
  | "available"
  | "unknown"
  | "unavailable";

export type ProductSearchAvailabilitySnapshot = {
  asin: string;
  requested_at: string;
  buybox_current_cents: number | null;
};

export type ProductSearchAvailabilityOptions = {
  preserveUnavailable: boolean;
  maxResults: number;
  relevanceScoreByFamilyId?: ReadonlyMap<string, number>;
};

export type ProductSearchAvailabilityPrecheckReport = {
  availabilityPrecheckRequests: 0 | 1;
  availabilityPrecheckAsins: number;
  availabilityPrecheckTokensConsumed: number;
  tokensRemaining?: number;
};

export type ProductSearchAvailabilityRankingResult = {
  families: readonly AffarioPublicProductSearchFamily[];
  report: ProductSearchAvailabilityPrecheckReport;
};

export type ProductSearchAvailabilityRanker = (
  families: readonly AffarioProductSearchFamily[],
  options: ProductSearchAvailabilityOptions
) => Promise<ProductSearchAvailabilityRankingResult>;

type ProductSearchAvailabilityDependencies = {
  loadRecentSnapshots: (
    asins: readonly string[],
    requestedAtOrAfter: string
  ) => Promise<readonly ProductSearchAvailabilitySnapshot[]>;
  precheckUnknownAsins?: (
    asins: readonly string[]
  ) => Promise<KeepaProductAvailabilityBatchResult>;
  clock: () => Date;
};

type AvailabilityRecord = {
  state: ProductSearchAvailabilityState;
  currentBuyBoxPriceCents: number | null;
  checkedAt: string | null;
};

type FamilyAvailability = AvailabilityRecord & {
  lowestCurrentBuyBoxAsin: string | null;
};

const AVAILABILITY_PRIORITY: Record<ProductSearchAvailabilityState, number> = {
  available: 0,
  unknown: 1,
  unavailable: 2,
};

const PUBLIC_AVAILABILITY_STATUS = {
  available: "AVAILABLE",
  unknown: "UNKNOWN",
  unavailable: "UNAVAILABLE",
} as const;

export function getEmptyProductSearchAvailabilityPrecheckReport(
): ProductSearchAvailabilityPrecheckReport {
  return {
    availabilityPrecheckRequests: 0,
    availabilityPrecheckAsins: 0,
    availabilityPrecheckTokensConsumed: 0,
  };
}

function getFamilyAsins(
  family: AffarioProductSearchFamily
): readonly string[] {
  return [
    ...new Set(
      [
        family.representativeAsin,
        ...family.variants.map(({ asin }) => asin),
      ]
        .map((asin) => asin.trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
}

function getLatestAvailabilityByAsin(
  snapshots: readonly ProductSearchAvailabilitySnapshot[],
  requestedAtOrAfter: number
): Map<string, AvailabilityRecord> {
  const latestByAsin = new Map<
    string,
    { requestedAt: number; record: AvailabilityRecord }
  >();

  for (const snapshot of snapshots) {
    const asin = snapshot.asin.trim().toUpperCase();
    const requestedAt = Date.parse(snapshot.requested_at);

    if (
      !asin ||
      !Number.isFinite(requestedAt) ||
      requestedAt < requestedAtOrAfter
    ) {
      continue;
    }

    const state: ProductSearchAvailabilityState =
      snapshot.buybox_current_cents === null
        ? "unavailable"
        : snapshot.buybox_current_cents > 0
          ? "available"
          : "unknown";
    const existing = latestByAsin.get(asin);

    if (!existing || requestedAt > existing.requestedAt) {
      latestByAsin.set(asin, {
        requestedAt,
        record: {
          state,
          currentBuyBoxPriceCents:
            state === "available" ? snapshot.buybox_current_cents : null,
          checkedAt: new Date(requestedAt).toISOString(),
        },
      });
    }
  }

  return new Map(
    [...latestByAsin].map(([asin, { record }]) => [asin, record])
  );
}

function toAvailabilityRecord(
  check: KeepaProductAvailabilityCheck
): AvailabilityRecord {
  if (
    check.availabilityStatus === "AVAILABLE" &&
    check.currentBuyBoxPriceCents !== null &&
    check.currentBuyBoxPriceCents > 0
  ) {
    return {
      state: "available",
      currentBuyBoxPriceCents: check.currentBuyBoxPriceCents,
      checkedAt: check.checkedAt,
    };
  }

  if (check.availabilityStatus === "UNAVAILABLE") {
    return {
      state: "unavailable",
      currentBuyBoxPriceCents: null,
      checkedAt: check.checkedAt,
    };
  }

  return {
    state: "unknown",
    currentBuyBoxPriceCents: null,
    checkedAt: check.checkedAt,
  };
}

function getFamilyAvailability(
  family: AffarioProductSearchFamily,
  availabilityByAsin: ReadonlyMap<string, AvailabilityRecord>
): FamilyAvailability {
  const asins = getFamilyAsins(family);
  const entries = asins.map((asin) => ({
    asin,
    record:
      availabilityByAsin.get(asin) ?? {
        state: "unknown" as const,
        currentBuyBoxPriceCents: null,
        checkedAt: null,
      },
  }));
  const availableEntries = entries.filter(
    ({ record }) =>
      record.state === "available" &&
      record.currentBuyBoxPriceCents !== null &&
      record.currentBuyBoxPriceCents > 0
  );

  if (availableEntries.length > 0) {
    const lowest = availableEntries.reduce((current, candidate) =>
      candidate.record.currentBuyBoxPriceCents! <
      current.record.currentBuyBoxPriceCents!
        ? candidate
        : current
    );

    return {
      state: "available",
      currentBuyBoxPriceCents: lowest.record.currentBuyBoxPriceCents,
      lowestCurrentBuyBoxAsin: lowest.asin,
      checkedAt: lowest.record.checkedAt,
    };
  }

  if (
    entries.length > 0 &&
    entries.every(({ record }) => record.state === "unavailable")
  ) {
    return {
      state: "unavailable",
      currentBuyBoxPriceCents: null,
      lowestCurrentBuyBoxAsin: null,
      checkedAt: null,
    };
  }

  return {
    state: "unknown",
    currentBuyBoxPriceCents: null,
    lowestCurrentBuyBoxAsin: null,
    checkedAt: null,
  };
}

function applyAvailabilityRanking(
  families: readonly AffarioProductSearchFamily[],
  availabilityByAsin: ReadonlyMap<string, AvailabilityRecord>,
  options: ProductSearchAvailabilityOptions
): readonly AffarioPublicProductSearchFamily[] {
  const relevanceScores = families.flatMap(({ familyId }) => {
    const score = options.relevanceScoreByFamilyId?.get(familyId);
    return score === undefined ? [] : [score];
  });
  const maximumRelevanceScore =
    relevanceScores.length > 0 ? Math.max(...relevanceScores) : null;
  const annotated = families.map((family, relevanceIndex) => {
    const availability = getFamilyAvailability(family, availabilityByAsin);
    const relevanceScore = options.relevanceScoreByFamilyId?.get(
      family.familyId
    );
    const commercialRelevanceBand =
      maximumRelevanceScore === null || relevanceScore === undefined
        ? 0
        : Math.floor(
            (maximumRelevanceScore - relevanceScore) /
              (PRODUCT_SEARCH_COMMERCIAL_RELEVANCE_SCORE_TOLERANCE + 1)
          );

    return {
      family: {
        ...family,
        availabilityStatus: PUBLIC_AVAILABILITY_STATUS[availability.state],
        lowestCurrentBuyBoxPriceCents:
          availability.currentBuyBoxPriceCents,
        lowestCurrentBuyBoxAsin: availability.lowestCurrentBuyBoxAsin,
      },
      relevanceIndex,
      commercialRelevanceBand,
      availability,
    };
  });
  const availableFamilies = annotated.filter(
    ({ availability }) => availability.state === "available"
  ).length;
  const visibleFamilies =
    availableFamilies >= MIN_AVAILABLE_FAMILIES_TO_HIDE_UNAVAILABLE &&
    !options.preserveUnavailable
      ? annotated.filter(
          ({ availability }) => availability.state !== "unavailable"
        )
      : annotated;

  if (options.preserveUnavailable) {
    return visibleFamilies
      .sort((left, right) => left.relevanceIndex - right.relevanceIndex)
      .slice(0, options.maxResults)
      .map(({ family }) => family);
  }

  return visibleFamilies
    .sort((left, right) => {
      const relevanceBandDifference =
        left.commercialRelevanceBand - right.commercialRelevanceBand;

      if (relevanceBandDifference !== 0) {
        return relevanceBandDifference;
      }

      const stateDifference =
        AVAILABILITY_PRIORITY[left.availability.state] -
        AVAILABILITY_PRIORITY[right.availability.state];

      if (stateDifference !== 0) {
        return stateDifference;
      }

      if (
        left.availability.state === "available" &&
        right.availability.state === "available"
      ) {
        const priceDifference =
          left.availability.currentBuyBoxPriceCents! -
          right.availability.currentBuyBoxPriceCents!;

        if (priceDifference !== 0) {
          return priceDifference;
        }
      }

      return left.relevanceIndex - right.relevanceIndex;
    })
    .slice(0, options.maxResults)
    .map(({ family }) => family);
}

export function markProductSearchAvailabilityUnknown(
  families: readonly AffarioProductSearchFamily[],
  maxResults: number
): readonly AffarioPublicProductSearchFamily[] {
  return families.slice(0, maxResults).map((family) => ({
    ...family,
    availabilityStatus: "UNKNOWN",
    lowestCurrentBuyBoxPriceCents: null,
    lowestCurrentBuyBoxAsin: null,
  }));
}

export function createProductSearchAvailabilityRanker(
  dependencies: ProductSearchAvailabilityDependencies
): ProductSearchAvailabilityRanker {
  return async function rankByAvailability(families, options) {
    const emptyReport = getEmptyProductSearchAvailabilityPrecheckReport();

    if (families.length === 0) {
      return { families: [], report: emptyReport };
    }

    const uniqueAsins = [...new Set(families.flatMap(getFamilyAsins))];
    const cutoff =
      dependencies.clock().getTime() - PRODUCT_SEARCH_AVAILABILITY_MAX_AGE_MS;
    let availabilityByAsin = new Map<string, AvailabilityRecord>();

    try {
      const snapshots = await dependencies.loadRecentSnapshots(
        uniqueAsins,
        new Date(cutoff).toISOString()
      );
      availabilityByAsin = getLatestAvailabilityByAsin(snapshots, cutoff);
    } catch {
      // Supabase is an optimization: live checks remain available.
    }

    const unknownAsins = uniqueAsins
      .filter(
        (asin) =>
          !availabilityByAsin.has(asin) ||
          availabilityByAsin.get(asin)?.state === "unknown"
      )
      .slice(0, PRODUCT_SEARCH_AVAILABILITY_PRECHECK_MAX_ASINS);
    let report = emptyReport;

    if (unknownAsins.length > 0 && dependencies.precheckUnknownAsins) {
      report = {
        availabilityPrecheckRequests: 1,
        availabilityPrecheckAsins: unknownAsins.length,
        availabilityPrecheckTokensConsumed: 0,
      };

      try {
        const precheck = await dependencies.precheckUnknownAsins(unknownAsins);
        const requestedAsins = new Set(unknownAsins);

        for (const check of precheck.checks) {
          if (requestedAsins.has(check.asin)) {
            availabilityByAsin.set(check.asin, toAvailabilityRecord(check));
          }
        }

        report = {
          availabilityPrecheckRequests: 1,
          availabilityPrecheckAsins: unknownAsins.length,
          availabilityPrecheckTokensConsumed: precheck.usage.tokensConsumed,
          tokensRemaining: precheck.usage.tokensLeft,
        };
      } catch {
        // Technical Keepa errors leave every affected ASIN UNKNOWN.
      }
    }

    return {
      families: applyAvailabilityRanking(
        families,
        availabilityByAsin,
        options
      ),
      report,
    };
  };
}

async function loadRecentSnapshots(
  uniqueAsins: readonly string[],
  requestedAtOrAfter: string
): Promise<readonly ProductSearchAvailabilitySnapshot[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("keepa_snapshots")
    .select("asin,requested_at,buybox_current_cents")
    .in("asin", uniqueAsins)
    .gte("requested_at", requestedAtOrAfter)
    .order("requested_at", { ascending: false });

  if (error) {
    throw new Error("Lettura availability ricerca non disponibile.");
  }

  return (data ?? []) as ProductSearchAvailabilitySnapshot[];
}

export const rankProductSearchFamiliesByAvailability =
  createProductSearchAvailabilityRanker({
    loadRecentSnapshots,
    precheckUnknownAsins: (asins) =>
      getKeepaProductAvailabilityByAsins(asins, { context: "interactive" }),
    clock: () => new Date(),
  });
