import "server-only";

import { getSupabaseServerClient } from "@/services/supabaseServer";
import type {
  AffarioProductSearchFamily,
  AffarioPublicProductSearchFamily,
} from "@/types/productSearch";

export const PRODUCT_SEARCH_AVAILABILITY_MAX_AGE_MS = 60 * 60 * 1_000;
export const MIN_AVAILABLE_FAMILIES_TO_HIDE_UNAVAILABLE = 5;

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
};

export type ProductSearchAvailabilityRanker = (
  families: readonly AffarioProductSearchFamily[],
  options: ProductSearchAvailabilityOptions
) => Promise<readonly AffarioPublicProductSearchFamily[]>;

type ProductSearchAvailabilityDependencies = {
  loadRecentSnapshots: (
    asins: readonly string[],
    requestedAtOrAfter: string
  ) => Promise<readonly ProductSearchAvailabilitySnapshot[]>;
  clock: () => Date;
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
): ReadonlyMap<string, ProductSearchAvailabilityState> {
  const latestByAsin = new Map<
    string,
    { requestedAt: number; state: ProductSearchAvailabilityState }
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
      latestByAsin.set(asin, { requestedAt, state });
    }
  }

  return new Map(
    [...latestByAsin].map(([asin, { state }]) => [asin, state])
  );
}

function getFamilyAvailability(
  family: AffarioProductSearchFamily,
  availabilityByAsin: ReadonlyMap<string, ProductSearchAvailabilityState>
): ProductSearchAvailabilityState {
  const asins = getFamilyAsins(family);
  const states = asins.map(
    (asin) => availabilityByAsin.get(asin) ?? "unknown"
  );

  if (states.includes("available")) {
    return "available";
  }

  return states.length > 0 && states.every((state) => state === "unavailable")
    ? "unavailable"
    : "unknown";
}

function toPublicAvailabilityStatus(
  state: ProductSearchAvailabilityState
): AffarioPublicProductSearchFamily["availabilityStatus"] {
  return PUBLIC_AVAILABILITY_STATUS[state];
}

function applyAvailabilityRanking(
  families: readonly AffarioProductSearchFamily[],
  availabilityByAsin: ReadonlyMap<string, ProductSearchAvailabilityState>,
  options: ProductSearchAvailabilityOptions
): readonly AffarioPublicProductSearchFamily[] {
  const annotated = families.map((family, relevanceIndex) => {
    const state = getFamilyAvailability(family, availabilityByAsin);

    return {
      family: {
        ...family,
        availabilityStatus: toPublicAvailabilityStatus(state),
      },
      relevanceIndex,
      state,
    };
  });
  const availableFamilies = annotated.filter(
    ({ state }) => state === "available"
  ).length;
  const visibleFamilies =
    availableFamilies >= MIN_AVAILABLE_FAMILIES_TO_HIDE_UNAVAILABLE &&
    !options.preserveUnavailable
      ? annotated.filter(({ state }) => state !== "unavailable")
      : annotated;

  return visibleFamilies
    .sort(
      (left, right) =>
        AVAILABILITY_PRIORITY[left.state] -
          AVAILABILITY_PRIORITY[right.state] ||
        left.relevanceIndex - right.relevanceIndex
    )
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
  }));
}

export function createProductSearchAvailabilityRanker(
  dependencies: ProductSearchAvailabilityDependencies
): ProductSearchAvailabilityRanker {
  return async function rankByAvailability(families, options) {
    if (families.length === 0) {
      return [];
    }

    const uniqueAsins = [...new Set(families.flatMap(getFamilyAsins))];
    const cutoff =
      dependencies.clock().getTime() - PRODUCT_SEARCH_AVAILABILITY_MAX_AGE_MS;

    try {
      const snapshots = await dependencies.loadRecentSnapshots(
        uniqueAsins,
        new Date(cutoff).toISOString()
      );
      const availabilityByAsin = getLatestAvailabilityByAsin(
        snapshots,
        cutoff
      );

      return applyAvailabilityRanking(families, availabilityByAsin, options);
    } catch {
      return markProductSearchAvailabilityUnknown(families, options.maxResults);
    }
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
    clock: () => new Date(),
  });
