import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import {
  calculatePotentialSavings,
  type AffarioPotentialSavingsAnalysis,
} from "@/lib/calculatePotentialSavings";
import {
  analyzePriceHistoryQuality,
  analyzePriceHistorySinceAvailableMinimum,
  analyzePriceHistoryWindowMinimum,
  type PriceHistoryQuality,
} from "@/lib/analyzePriceHistory";
import {
  normalizeKeepaAsin,
  type KeepaRequestContext,
  type KeepaTokenBudgetStatus,
  type KeepaUsage,
} from "@/services/keepaClient";
import { getAffarioProductCandidateByAsin } from "@/services/keepaProductAdapter";
import { persistKeepaProduct } from "@/services/keepaPersistence";
import { getSupabaseServerClient } from "@/services/supabaseServer";

export const AFFARIO_KEEPA_CACHE_TTL_MINUTES = 60;

const AFFARIO_KEEPA_CACHE_TTL_MS =
  AFFARIO_KEEPA_CACHE_TTL_MINUTES * 60 * 1_000;
const NINETY_DAYS_IN_MILLISECONDS = 90 * 24 * 60 * 60 * 1_000;
const THREE_HUNDRED_SIXTY_FIVE_DAYS_IN_MILLISECONDS =
  365 * 24 * 60 * 60 * 1_000;
const BUY_BOX_HISTORY_RELIABLE_READ_LIMIT = 5_000;
const BUY_BOX_HISTORY_READ_LIMIT =
  BUY_BOX_HISTORY_RELIABLE_READ_LIMIT + 1;
const KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX = 18;
const KEEPA_TIME_MINUTES_OFFSET = 21_564_000;

export type AffarioProductLookupSource =
  | "DATABASE_CACHE"
  | "KEEPA_REFRESH";

export type AffarioLookupProduct = {
  asin: string;
  amazonDomainId: number;
  parentAsin: string | null;
  title: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  size: string | null;
  imageUrl: string | null;
  rootCategory: number | null;
  categoryIds: readonly number[] | null;
  categoryTree: readonly unknown[] | null;
};

export type AffarioLookupBuyBox = {
  currentIncludingShippingInEuros: number | null;
  priceInEuros: number | null;
  shippingInEuros: number | null;
  totalInEuros: number | null;
  currency: string;
  sellerId: string | null;
  isAmazon: boolean | null;
  isFBA: boolean | null;
  isPrimeEligible: boolean | null;
  isPrimeExclusive: boolean | null;
  isShippable: boolean | null;
  isPreorder: boolean | null;
  isBackorder: boolean | null;
  availabilityMessage: string | null;
};

export type AffarioLookupBuyBox90Days = {
  averageInEuros: number | null;
  minimumInEuros: number | null;
  minimumObservedAt: string | null;
};

export type AffarioLookupBuyBox365Days = {
  minimumInEuros: number | null;
  hasReliableCoverage: boolean;
};

export type AffarioLookupBuyBoxSinceAvailable = {
  minimumInEuros: number | null;
  hasReliableCoverage: boolean;
  observationCount: number;
  coverageDays: number;
};

export type AffarioProductLookupResult = {
  asin: string;
  product: AffarioLookupProduct;
  buyBox: AffarioLookupBuyBox;
  buyBox90Days: AffarioLookupBuyBox90Days;
  buyBoxHistory90Days: PriceHistoryQuality;
  potentialSavingsAnalysis: AffarioPotentialSavingsAnalysis;
  buyBox365Days: AffarioLookupBuyBox365Days;
  buyBoxSinceAvailable: AffarioLookupBuyBoxSinceAvailable;
  currency: string;
  lastBuyBoxUpdate: string | null;
  buyBoxAgeMinutes: number | null;
  lastKeepaCheckAt: string;
  lastKeepaCheckAgeMinutes: number;
  source: AffarioProductLookupSource;
  cacheHit: boolean;
  tokensConsumed: number;
  tokenBudgetStatus: KeepaTokenBudgetStatus;
  keepaUsage?: KeepaUsage;
};

export class AffarioProductLookupError extends Error {
  constructor(
    message: string,
    public readonly code: "DATABASE_UNAVAILABLE"
  ) {
    super(message);
    this.name = "AffarioProductLookupError";
  }
}

type ProductRow = {
  asin: string;
  amazon_domain: number;
  parent_asin: string | null;
  title: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  size: string | null;
  image_url: string | null;
  root_category: number | null;
  category_ids: number[] | null;
  category_tree: unknown[] | null;
};

type SnapshotRow = {
  asin: string;
  requested_at: string;
  last_buy_box_updated_at: string | null;
  buybox_current_cents: number | null;
  buybox_price_cents: number | null;
  buybox_shipping_cents: number | null;
  buybox_total_cents: number | null;
  currency: string;
  buybox_seller_id: string | null;
  buybox_is_amazon: boolean | null;
  buybox_is_fba: boolean | null;
  buybox_is_prime_eligible: boolean | null;
  buybox_is_prime_exclusive: boolean | null;
  buybox_is_shippable: boolean | null;
  buybox_is_preorder: boolean | null;
  buybox_is_backorder: boolean | null;
  buybox_availability_message: string | null;
  avg90_cents: number | null;
  min90_cents: number | null;
  min90_observed_at: string | null;
};

type RawLatestRow = {
  asin: string;
  product_object: unknown;
  requested_at: string;
};

type BuyBoxHistoryRow = {
  keepa_time: number;
  total_cents: number | null;
  observed_at: string;
};

type KeepaHistoryStartEvidence = {
  trackingStartedAt: string | null;
  listedAt: string | null;
  isCompleteSeries: boolean;
};

type StoredLookupData = {
  product: ProductRow | null;
  snapshot: SnapshotRow | null;
  rawLatest: RawLatestRow | null;
  buyBoxHistory365Days: readonly BuyBoxHistoryRow[];
  buyBoxHistory365DaysBaseline: BuyBoxHistoryRow | null;
  buyBoxHistory365DaysStartedAt: string;
  buyBoxHistory365DaysEndedAt: string;
  buyBoxHistory365DaysIsTruncated: boolean;
};

function throwForDatabaseError(
  error: PostgrestError | null,
  operation: string
): void {
  if (error) {
    throw new AffarioProductLookupError(
      `${operation}: ${error.message}`,
      "DATABASE_UNAVAILABLE"
    );
  }
}

function getTimestampMilliseconds(value: string, fieldName: string): number {
  const milliseconds = Date.parse(value);

  if (!Number.isFinite(milliseconds)) {
    throw new Error(`${fieldName} non e un timestamp valido.`);
  }

  return milliseconds;
}

function getAgeMinutes(value: string, nowMilliseconds: number): number {
  const timestampMilliseconds = getTimestampMilliseconds(value, "Timestamp");

  return Math.max(
    0,
    Math.floor((nowMilliseconds - timestampMilliseconds) / 60_000)
  );
}

function isFreshSnapshot(
  requestedAt: string,
  nowMilliseconds: number
): boolean {
  const requestedAtMilliseconds = getTimestampMilliseconds(
    requestedAt,
    "keepa_snapshots.requested_at"
  );

  return nowMilliseconds - requestedAtMilliseconds < AFFARIO_KEEPA_CACHE_TTL_MS;
}

function centsToEuros(value: number | null): number | null {
  return value === null ? null : value / 100;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keepaTimeToIso(value: unknown): string | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return null;
  }

  const date = new Date(
    (value + KEEPA_TIME_MINUTES_OFFSET) * 60_000
  );

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getKeepaHistoryStartEvidence(input: {
  rawLatest: RawLatestRow | null;
  snapshotRequestedAt: string;
  normalizedHistory: readonly BuyBoxHistoryRow[];
}): KeepaHistoryStartEvidence {
  const unavailable: KeepaHistoryStartEvidence = {
    trackingStartedAt: null,
    listedAt: null,
    isCompleteSeries: false,
  };
  const { rawLatest } = input;

  if (
    !rawLatest ||
    Date.parse(rawLatest.requested_at) !==
      Date.parse(input.snapshotRequestedAt) ||
    !isJsonObject(rawLatest.product_object)
  ) {
    return unavailable;
  }

  const trackingStartedAt = keepaTimeToIso(
    rawLatest.product_object.trackingSince
  );
  const listedAt = keepaTimeToIso(rawLatest.product_object.listedSince);
  const rawCsv = rawLatest.product_object.csv;
  const rawSeries = Array.isArray(rawCsv)
    ? rawCsv[KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX]
    : undefined;

  if (
    !trackingStartedAt ||
    !listedAt ||
    !Array.isArray(rawSeries) ||
    rawSeries.length === 0 ||
    rawSeries.length % 3 !== 0 ||
    !rawSeries.every(
      (value) => typeof value === "number" && Number.isSafeInteger(value)
    )
  ) {
    return unavailable;
  }

  const listedSinceKeepaTime = rawLatest.product_object.listedSince;
  const snapshotRequestedAtTimestamp = Date.parse(
    input.snapshotRequestedAt
  );

  if (
    typeof listedSinceKeepaTime !== "number" ||
    !Number.isSafeInteger(listedSinceKeepaTime) ||
    !Number.isFinite(snapshotRequestedAtTimestamp)
  ) {
    return unavailable;
  }

  const rawHistory = new Map<
    number,
    { totalCents: number | null; observedAt: string }
  >();

  for (let index = 0; index < rawSeries.length; index += 3) {
    const keepaTime = rawSeries[index];
    const priceCents = rawSeries[index + 1];
    const shippingCents = rawSeries[index + 2];
    const observedAt = keepaTimeToIso(keepaTime);

    if (!observedAt) {
      return unavailable;
    }

    if (
      keepaTime < listedSinceKeepaTime ||
      Date.parse(observedAt) > snapshotRequestedAtTimestamp
    ) {
      continue;
    }

    const point = {
      totalCents:
        priceCents >= 0 && shippingCents >= 0
          ? priceCents + shippingCents
          : null,
      observedAt,
    };
    const existing = rawHistory.get(keepaTime);

    if (
      existing &&
      (existing.totalCents !== point.totalCents ||
        existing.observedAt !== point.observedAt)
    ) {
      return unavailable;
    }

    rawHistory.set(keepaTime, point);
  }

  const normalizedHistory = new Map(
    input.normalizedHistory
      .filter(
        (point) =>
          point.keepa_time >= listedSinceKeepaTime &&
          Date.parse(point.observed_at) <= snapshotRequestedAtTimestamp
      )
      .map((point) => [point.keepa_time, point])
  );

  if (
    rawHistory.size === 0 ||
    rawHistory.size !== normalizedHistory.size
  ) {
    return unavailable;
  }

  for (const [keepaTime, rawPoint] of rawHistory) {
    const normalizedPoint = normalizedHistory.get(keepaTime);

    if (
      !normalizedPoint ||
      normalizedPoint.total_cents !== rawPoint.totalCents ||
      Date.parse(normalizedPoint.observed_at) !==
        Date.parse(rawPoint.observedAt)
    ) {
      return unavailable;
    }
  }

  return {
    trackingStartedAt,
    listedAt,
    isCompleteSeries: true,
  };
}

async function readStoredLookupData(
  asin: string,
  nowMilliseconds: number
): Promise<StoredLookupData> {
  let supabase: ReturnType<typeof getSupabaseServerClient>;

  try {
    supabase = getSupabaseServerClient();
  } catch {
    throw new AffarioProductLookupError(
      "Configurazione database non disponibile.",
      "DATABASE_UNAVAILABLE"
    );
  }

  const annualWindowStartedAt = new Date(
    nowMilliseconds - THREE_HUNDRED_SIXTY_FIVE_DAYS_IN_MILLISECONDS
  ).toISOString();
  const annualWindowEndedAt = new Date(nowMilliseconds).toISOString();
  const [
    productResult,
    snapshotResult,
    rawLatestResult,
    buyBoxHistoryResult,
    buyBoxHistoryBaselineResult,
  ] = await Promise.all([
    supabase
      .from("products")
      .select(
        "asin,amazon_domain,parent_asin,title,brand,model,color,size,image_url,root_category,category_ids,category_tree"
      )
      .eq("asin", asin)
      .maybeSingle(),
    supabase
      .from("keepa_snapshots")
      .select(
        "asin,requested_at,last_buy_box_updated_at,buybox_current_cents,buybox_price_cents,buybox_shipping_cents,buybox_total_cents,currency,buybox_seller_id,buybox_is_amazon,buybox_is_fba,buybox_is_prime_eligible,buybox_is_prime_exclusive,buybox_is_shippable,buybox_is_preorder,buybox_is_backorder,buybox_availability_message,avg90_cents,min90_cents,min90_observed_at"
      )
      .eq("asin", asin)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("keepa_raw_latest")
      .select("asin,product_object,requested_at")
      .eq("asin", asin)
      .maybeSingle(),
    supabase
      .from("buybox_price_history")
      .select("keepa_time,total_cents,observed_at")
      .eq("asin", asin)
      .gte("observed_at", annualWindowStartedAt)
      .lte("observed_at", annualWindowEndedAt)
      .order("observed_at", { ascending: false })
      .limit(BUY_BOX_HISTORY_READ_LIMIT),
    supabase
      .from("buybox_price_history")
      .select("keepa_time,total_cents,observed_at")
      .eq("asin", asin)
      .lt("observed_at", annualWindowStartedAt)
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  throwForDatabaseError(productResult.error, "Lettura products fallita");
  throwForDatabaseError(
    snapshotResult.error,
    "Lettura ultimo keepa_snapshots fallita"
  );
  throwForDatabaseError(
    rawLatestResult.error,
    "Lettura keepa_raw_latest fallita"
  );
  throwForDatabaseError(
    buyBoxHistoryResult.error,
    "Lettura buybox_price_history fallita"
  );
  throwForDatabaseError(
    buyBoxHistoryBaselineResult.error,
    "Lettura stato iniziale buybox_price_history fallita"
  );

  const product = productResult.data as ProductRow | null;
  const snapshot = snapshotResult.data as SnapshotRow | null;
  const rawLatest = rawLatestResult.data as RawLatestRow | null;
  const buyBoxHistory365Days = (buyBoxHistoryResult.data ??
    []) as BuyBoxHistoryRow[];
  const buyBoxHistory365DaysBaseline =
    buyBoxHistoryBaselineResult.data as BuyBoxHistoryRow | null;

  if (rawLatest && !isJsonObject(rawLatest.product_object)) {
    throw new Error("keepa_raw_latest.product_object non e un oggetto JSON.");
  }

  return {
    product,
    snapshot,
    rawLatest,
    buyBoxHistory365Days,
    buyBoxHistory365DaysBaseline,
    buyBoxHistory365DaysStartedAt: annualWindowStartedAt,
    buyBoxHistory365DaysEndedAt: annualWindowEndedAt,
    buyBoxHistory365DaysIsTruncated:
      buyBoxHistory365Days.length > BUY_BOX_HISTORY_RELIABLE_READ_LIMIT,
  };
}

async function readInitialStoredLookupData(
  asin: string,
  nowMilliseconds: number
): Promise<StoredLookupData> {
  try {
    return await readStoredLookupData(asin, nowMilliseconds);
  } catch (error) {
    if (!(error instanceof AffarioProductLookupError)) {
      throw error;
    }

    return readStoredLookupData(asin, nowMilliseconds);
  }
}

function buildLookupResult(
  storedData: StoredLookupData,
  source: AffarioProductLookupSource,
  nowMilliseconds: number,
  usage?: KeepaUsage,
  tokenBudgetStatus: KeepaTokenBudgetStatus = "UNKNOWN"
): AffarioProductLookupResult {
  const {
    product,
    snapshot,
    rawLatest,
    buyBoxHistory365Days,
    buyBoxHistory365DaysBaseline,
    buyBoxHistory365DaysStartedAt,
    buyBoxHistory365DaysEndedAt,
    buyBoxHistory365DaysIsTruncated,
  } = storedData;

  if (!product || !snapshot) {
    throw new Error("Dati Keepa persistiti incompleti dopo la lookup.");
  }

  if (rawLatest && rawLatest.asin !== product.asin) {
    throw new Error("ASIN incoerente in keepa_raw_latest.");
  }

  const lastBuyBoxUpdate = snapshot.last_buy_box_updated_at;
  const tokensConsumed = usage?.tokensConsumed ?? 0;
  const history90DaysStartedAt =
    nowMilliseconds - NINETY_DAYS_IN_MILLISECONDS;
  const targetWindowEndedAt = snapshot.requested_at;
  const targetWindowStartedAt = new Date(
    getTimestampMilliseconds(
      targetWindowEndedAt,
      "keepa_snapshots.requested_at"
    ) - NINETY_DAYS_IN_MILLISECONDS
  ).toISOString();
  const buyBoxHistoryPoints = [
    ...(buyBoxHistory365DaysBaseline
      ? [buyBoxHistory365DaysBaseline]
      : []),
    ...buyBoxHistory365Days,
  ].map((observation) => ({
    price:
      observation.total_cents === null
        ? null
        : observation.total_cents / 100,
    observedAt: observation.observed_at,
  }));
  const buyBox365Days = analyzePriceHistoryWindowMinimum({
    observations: buyBoxHistoryPoints,
    windowStart: buyBoxHistory365DaysStartedAt,
    windowEnd: buyBoxHistory365DaysEndedAt,
    isTruncated: buyBoxHistory365DaysIsTruncated,
  });
  const historyStartEvidence = getKeepaHistoryStartEvidence({
    rawLatest,
    snapshotRequestedAt: snapshot.requested_at,
    normalizedHistory: [
      ...(buyBoxHistory365DaysBaseline
        ? [buyBoxHistory365DaysBaseline]
        : []),
      ...buyBoxHistory365Days,
    ],
  });
  const buyBoxSinceAvailable =
    analyzePriceHistorySinceAvailableMinimum({
      observations: buyBoxHistoryPoints,
      trackingStartedAt: historyStartEvidence.trackingStartedAt,
      listedAt: historyStartEvidence.listedAt,
      windowEnd: snapshot.requested_at,
      isCompleteSeries: historyStartEvidence.isCompleteSeries,
      isTruncated: buyBoxHistory365DaysIsTruncated,
    });
  const buyBoxHistory90Days = analyzePriceHistoryQuality(
    buyBoxHistoryPoints
      .filter(
        (observation) =>
          Date.parse(observation.observedAt) >= history90DaysStartedAt
      )
      .map((observation) => ({
        price: observation.price ?? Number.NaN,
        observedAt: observation.observedAt,
      }))
  );
  const potentialSavingsAnalysis = calculatePotentialSavings({
    currentPrice: centsToEuros(snapshot.buybox_current_cents),
    observations: buyBoxHistoryPoints,
    windowStart: targetWindowStartedAt,
    windowEnd: targetWindowEndedAt,
    isTruncated: buyBoxHistory365DaysIsTruncated,
  });

  return {
    asin: product.asin,
    product: {
      asin: product.asin,
      amazonDomainId: product.amazon_domain,
      parentAsin: product.parent_asin,
      title: product.title,
      brand: product.brand,
      model: product.model,
      color: product.color,
      size: product.size,
      imageUrl: product.image_url,
      rootCategory: product.root_category,
      categoryIds: product.category_ids,
      categoryTree: product.category_tree,
    },
    buyBox: {
      currentIncludingShippingInEuros: centsToEuros(
        snapshot.buybox_current_cents
      ),
      priceInEuros: centsToEuros(snapshot.buybox_price_cents),
      shippingInEuros: centsToEuros(snapshot.buybox_shipping_cents),
      totalInEuros: centsToEuros(snapshot.buybox_total_cents),
      currency: snapshot.currency,
      sellerId: snapshot.buybox_seller_id,
      isAmazon: snapshot.buybox_is_amazon,
      isFBA: snapshot.buybox_is_fba,
      isPrimeEligible: snapshot.buybox_is_prime_eligible,
      isPrimeExclusive: snapshot.buybox_is_prime_exclusive,
      isShippable: snapshot.buybox_is_shippable,
      isPreorder: snapshot.buybox_is_preorder,
      isBackorder: snapshot.buybox_is_backorder,
      availabilityMessage: snapshot.buybox_availability_message,
    },
    buyBox90Days: {
      averageInEuros: centsToEuros(snapshot.avg90_cents),
      minimumInEuros: centsToEuros(snapshot.min90_cents),
      minimumObservedAt: snapshot.min90_observed_at,
    },
    buyBoxHistory90Days,
    potentialSavingsAnalysis,
    buyBox365Days: {
      minimumInEuros: buyBox365Days.minimumPrice,
      hasReliableCoverage: buyBox365Days.hasReliableCoverage,
    },
    buyBoxSinceAvailable: {
      minimumInEuros: buyBoxSinceAvailable.minimumPrice,
      hasReliableCoverage:
        buyBoxSinceAvailable.hasReliableCoverage,
      observationCount: buyBoxSinceAvailable.observationCount,
      coverageDays: buyBoxSinceAvailable.coverageDays,
    },
    currency: snapshot.currency,
    lastBuyBoxUpdate,
    buyBoxAgeMinutes:
      lastBuyBoxUpdate === null
        ? null
        : getAgeMinutes(lastBuyBoxUpdate, nowMilliseconds),
    lastKeepaCheckAt: snapshot.requested_at,
    lastKeepaCheckAgeMinutes: getAgeMinutes(
      snapshot.requested_at,
      nowMilliseconds
    ),
    source,
    cacheHit: source === "DATABASE_CACHE",
    tokensConsumed,
    tokenBudgetStatus,
    ...(usage ? { keepaUsage: usage } : {}),
  };
}

export async function getAffarioProductByAsin(
  asin: string,
  options: { context?: KeepaRequestContext } = {}
): Promise<AffarioProductLookupResult> {
  const normalizedAsin = normalizeKeepaAsin(asin);
  const initialReadTime = Date.now();
  const storedData = await readInitialStoredLookupData(
    normalizedAsin,
    initialReadTime
  );
  const cacheCheckTime = Date.now();

  if (
    storedData.product &&
    storedData.snapshot &&
    isFreshSnapshot(storedData.snapshot.requested_at, cacheCheckTime)
  ) {
    return buildLookupResult(
      storedData,
      "DATABASE_CACHE",
      cacheCheckTime
    );
  }

  const requestedAt = new Date().toISOString();
  const keepaResult = await getAffarioProductCandidateByAsin(
    normalizedAsin,
    options
  );

  try {
    await persistKeepaProduct({
      result: keepaResult,
      requestedAt,
    });
  } catch {
    throw new AffarioProductLookupError(
      "Persistenza dati Keepa non disponibile.",
      "DATABASE_UNAVAILABLE"
    );
  }

  const refreshedReadTime = Date.now();
  const refreshedStoredData = await readStoredLookupData(
    normalizedAsin,
    refreshedReadTime
  );

  return buildLookupResult(
    refreshedStoredData,
    "KEEPA_REFRESH",
    refreshedReadTime,
    keepaResult.usage,
    keepaResult.tokenBudgetStatus
  );
}
