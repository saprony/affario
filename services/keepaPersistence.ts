import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import type {
  AffarioKeepaPriceExtreme,
  AffarioProductCandidateResult,
} from "@/services/keepaProductAdapter";
import { getSupabaseServerClient } from "@/services/supabaseServer";

const ASIN_PATTERN = /^[A-Z0-9]{10}$/;
const KEEPA_TIME_OFFSET_MINUTES = 21_564_000;
const WRITE_CHUNK_SIZE = 500;

const STORAGE_TABLES = [
  "products",
  "product_variants",
  "buybox_price_history",
  "keepa_snapshots",
  "keepa_history_points",
  "keepa_raw_latest",
] as const;

type StorageTable = (typeof STORAGE_TABLES)[number];
type JsonObject = Record<string, unknown>;

export type KeepaStorageCounts = Record<StorageTable, number>;

export type KeepaPersistenceInput = {
  result: AffarioProductCandidateResult;
  requestedAt: string;
};

export type KeepaPersistenceResult = {
  asin: string;
  requestedAt: string;
  productRows: 1;
  variantAttributeRows: number;
  buyBoxHistoryRows: number;
  snapshotRows: 1;
  historyPointRows: 0;
  rawLatestRows: 1;
};

type VariantRow = {
  child_asin: string;
  parent_asin: string;
  attribute_dimension: string;
  attribute_value: string;
  related_asin: string;
  observed_at: string;
};

type BuyBoxHistoryRow = {
  asin: string;
  keepa_time: number;
  observed_at: string;
  buybox_price_cents: number | null;
  shipping_cents: number | null;
  total_cents: number | null;
  currency: "EUR";
};

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function normalizeRequestedAt(value: string): string {
  const milliseconds = Date.parse(value);

  if (!value || !Number.isFinite(milliseconds)) {
    throw new Error("requestedAt non è un timestamp ISO valido.");
  }

  return new Date(milliseconds).toISOString();
}

function keepaTimeToIso(keepaTime: number): string | undefined {
  if (!Number.isSafeInteger(keepaTime) || keepaTime < 0) {
    return undefined;
  }

  const milliseconds =
    (keepaTime + KEEPA_TIME_OFFSET_MINUTES) * 60 * 1_000;
  const date = new Date(milliseconds);

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function eurosToCents(value: number | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const cents = Math.round(value * 100);

  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error("Keepa ha restituito un importo non valido.");
  }

  return cents;
}

function extremeCents(
  value: AffarioKeepaPriceExtreme | undefined
): number | null {
  return eurosToCents(value?.amountInEuros);
}

function extremeTime(
  value: AffarioKeepaPriceExtreme | undefined
): number | null {
  return value?.keepaTimeMinutes ?? null;
}

function extremeObservedAt(
  value: AffarioKeepaPriceExtreme | undefined
): string | null {
  return value?.observedAt ?? null;
}

function throwForDatabaseError(
  error: PostgrestError | null,
  operation: string
): void {
  if (error) {
    throw new Error(`${operation}: ${error.message}`);
  }
}

function chunks<T>(rows: readonly T[]): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < rows.length; index += WRITE_CHUNK_SIZE) {
    result.push(rows.slice(index, index + WRITE_CHUNK_SIZE));
  }

  return result;
}

function earlierTimestamp(left: string, right: string): string {
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function laterTimestamp(left: string, right: string): string {
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function buildVariantRows(
  input: KeepaPersistenceInput,
  requestedAt: string
): VariantRow[] {
  const { product } = input.result;
  const variations = product.keepaVariations ?? [];

  if (variations.length === 0) {
    return [];
  }

  if (!product.parentAsin || !ASIN_PATTERN.test(product.parentAsin)) {
    throw new Error(
      "Lo schema richiede parentAsin per memorizzare le varianti senza prodotti fittizi."
    );
  }

  const rowsByIdentity = new Map<string, VariantRow>();

  for (const variation of variations) {
    if (variation.attributes.length === 0) {
      throw new Error(
        `La variante ${variation.asin} non contiene attributi rappresentabili nello schema.`
      );
    }

    for (const attribute of variation.attributes) {
      const dimension = attribute.dimension.trim();
      const value = attribute.value.trim();

      if (!dimension || !value) {
        throw new Error(
          `La variante ${variation.asin} contiene un attributo vuoto.`
        );
      }

      const row: VariantRow = {
        child_asin: product.asin,
        parent_asin: product.parentAsin,
        attribute_dimension: dimension,
        attribute_value: value,
        related_asin: variation.asin,
        observed_at: requestedAt,
      };
      const identity = variantIdentity(row);

      rowsByIdentity.set(identity, row);
    }
  }

  return [...rowsByIdentity.values()];
}

function buildBuyBoxHistoryRows(
  input: KeepaPersistenceInput,
  rawProduct: JsonObject
): BuyBoxHistoryRow[] {
  const { product, internalKeepaData } = input.result;
  const points = internalKeepaData.buyBox?.fullHistory?.points ?? [];
  const rawCsv = rawProduct.csv;
  const rawSeries = Array.isArray(rawCsv) ? rawCsv[18] : undefined;

  if (rawSeries !== undefined && rawSeries !== null) {
    if (
      !Array.isArray(rawSeries) ||
      rawSeries.length % 3 !== 0 ||
      !rawSeries.every(isSafeInteger) ||
      points.length !== rawSeries.length / 3
    ) {
      throw new Error(
        "BUY_BOX_SHIPPING non è rappresentabile integralmente nello schema."
      );
    }

    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const rawIndex = index * 3;

      if (
        point.keepaTimeMinutes !== rawSeries[rawIndex] ||
        point.rawPriceInCents !== rawSeries[rawIndex + 1] ||
        point.rawShippingInCents !== rawSeries[rawIndex + 2]
      ) {
        throw new Error(
          "BUY_BOX_SHIPPING è incoerente tra adapter e Product Object."
        );
      }
    }
  } else if (points.length > 0) {
    throw new Error(
      "BUY_BOX_SHIPPING è presente nell'adapter ma non nel Product Object."
    );
  }

  const rowsByTime = new Map<number, BuyBoxHistoryRow>();

  for (const point of points) {
    const expectedObservedAt = keepaTimeToIso(point.keepaTimeMinutes);

    if (!expectedObservedAt || expectedObservedAt !== point.observedAt) {
      throw new Error("Timestamp BUY_BOX_SHIPPING non coerente.");
    }

    const row: BuyBoxHistoryRow = {
      asin: product.asin,
      keepa_time: point.keepaTimeMinutes,
      observed_at: point.observedAt,
      buybox_price_cents:
        point.rawPriceInCents >= 0 ? point.rawPriceInCents : null,
      shipping_cents:
        point.rawShippingInCents >= 0 ? point.rawShippingInCents : null,
      total_cents: point.totalInCents ?? null,
      currency: "EUR",
    };
    const existing = rowsByTime.get(row.keepa_time);

    if (existing && JSON.stringify(existing) !== JSON.stringify(row)) {
      throw new Error(
        `BUY_BOX_SHIPPING contiene valori diversi nello stesso minuto ${row.keepa_time}.`
      );
    }

    rowsByTime.set(row.keepa_time, row);
  }

  return [...rowsByTime.values()].sort(
    (left, right) => left.keepa_time - right.keepa_time
  );
}

function buildSnapshotRow(
  input: KeepaPersistenceInput,
  requestedAt: string
): JsonObject {
  const { product, internalKeepaData, usage } = input.result;
  const buyBox = product.keepaBuyBox;
  const statistics = internalKeepaData.buyBox?.statistics;

  return {
    asin: product.asin,
    requested_at: requestedAt,
    last_buy_box_update_keepa_time:
      buyBox?.lastUpdateKeepaTimeMinutes ?? null,
    last_buy_box_updated_at: buyBox?.lastUpdatedAt ?? null,
    buybox_current_cents: eurosToCents(
      buyBox?.currentIncludingShippingInEuros
    ),
    buybox_price_cents: eurosToCents(buyBox?.priceInEuros),
    buybox_shipping_cents: eurosToCents(buyBox?.shippingInEuros),
    buybox_total_cents: eurosToCents(buyBox?.totalInEuros),
    currency: buyBox?.currency ?? "EUR",
    buybox_seller_id: buyBox?.sellerId ?? null,
    buybox_is_amazon: buyBox?.isAmazon ?? null,
    buybox_is_fba: buyBox?.isFBA ?? null,
    buybox_is_prime_eligible: buyBox?.isPrimeEligible ?? null,
    buybox_is_prime_exclusive: buyBox?.isPrimeExclusive ?? null,
    buybox_is_shippable: buyBox?.isShippable ?? null,
    buybox_is_preorder: buyBox?.isPreorder ?? null,
    buybox_is_backorder: buyBox?.isBackorder ?? null,
    buybox_availability_message: buyBox?.availabilityMessage ?? null,
    avg30_cents: eurosToCents(statistics?.average30DaysInEuros),
    avg90_cents: eurosToCents(statistics?.average90DaysInEuros),
    avg180_cents: eurosToCents(statistics?.average180DaysInEuros),
    avg365_cents: eurosToCents(statistics?.average365DaysInEuros),
    min90_cents: extremeCents(statistics?.minimumInInterval),
    min90_keepa_time: extremeTime(statistics?.minimumInInterval),
    min90_observed_at: extremeObservedAt(statistics?.minimumInInterval),
    max90_cents: extremeCents(statistics?.maximumInInterval),
    max90_keepa_time: extremeTime(statistics?.maximumInInterval),
    max90_observed_at: extremeObservedAt(statistics?.maximumInInterval),
    min_all_time_cents: extremeCents(statistics?.minimumAllTime),
    min_all_time_keepa_time: extremeTime(statistics?.minimumAllTime),
    min_all_time_observed_at: extremeObservedAt(statistics?.minimumAllTime),
    max_all_time_cents: extremeCents(statistics?.maximumAllTime),
    max_all_time_keepa_time: extremeTime(statistics?.maximumAllTime),
    max_all_time_observed_at: extremeObservedAt(statistics?.maximumAllTime),
    out_of_stock_percentage30:
      statistics?.outOfStockPercentage30Days ?? null,
    out_of_stock_percentage90:
      statistics?.outOfStockPercentage90Days ?? null,
    out_of_stock_percentage180:
      statistics?.outOfStockPercentage180Days ?? null,
    out_of_stock_percentage365:
      statistics?.outOfStockPercentage365Days ?? null,
    tokens_consumed: usage.tokensConsumed,
  };
}

function validateInput(input: KeepaPersistenceInput): {
  requestedAt: string;
  rawProduct: JsonObject;
} {
  const requestedAt = normalizeRequestedAt(input.requestedAt);
  const { product, internalKeepaData, usage } = input.result;

  if (!ASIN_PATTERN.test(product.asin)) {
    throw new Error("ASIN Keepa non valido.");
  }

  if (
    !Number.isSafeInteger(product.amazonDomainId) ||
    product.amazonDomainId <= 0
  ) {
    throw new Error("Dominio Amazon Keepa non valido.");
  }

  if (!product.title.trim()) {
    throw new Error("Titolo Keepa mancante.");
  }

  if (!isRecord(internalKeepaData.rawProduct)) {
    throw new Error("Il Product Object Keepa completo non è un oggetto JSON.");
  }

  if (
    internalKeepaData.rawProduct.asin !== undefined &&
    internalKeepaData.rawProduct.asin !== product.asin
  ) {
    throw new Error("ASIN incoerente tra adapter e Product Object Keepa.");
  }

  if (
    internalKeepaData.rawProduct.domainId !== undefined &&
    internalKeepaData.rawProduct.domainId !== product.amazonDomainId
  ) {
    throw new Error("Dominio incoerente tra adapter e Product Object Keepa.");
  }

  if (!Number.isSafeInteger(usage.tokensConsumed) || usage.tokensConsumed < 0) {
    throw new Error("Consumo token Keepa non valido.");
  }

  JSON.stringify(internalKeepaData.rawProduct);

  return { requestedAt, rawProduct: internalKeepaData.rawProduct };
}

async function upsertProduct(
  input: KeepaPersistenceInput,
  requestedAt: string
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { product } = input.result;
  const { data: existing, error: selectError } = await supabase
    .from("products")
    .select(
      "first_seen_at,last_seen_at,brand,model,color,size,image_url,root_category,category_ids,category_tree,parent_asin"
    )
    .eq("asin", product.asin)
    .maybeSingle();

  throwForDatabaseError(selectError, "Lettura products fallita");

  const firstSeenAt = existing?.first_seen_at
    ? earlierTimestamp(existing.first_seen_at, requestedAt)
    : requestedAt;
  const lastSeenAt = existing?.last_seen_at
    ? laterTimestamp(existing.last_seen_at, requestedAt)
    : requestedAt;
  const row = {
    asin: product.asin,
    amazon_domain: product.amazonDomainId,
    parent_asin: product.parentAsin ?? existing?.parent_asin ?? null,
    title: product.title,
    brand: product.brand ?? existing?.brand ?? null,
    model: product.model ?? existing?.model ?? null,
    color: product.color ?? existing?.color ?? null,
    size: product.size ?? existing?.size ?? null,
    image_url: product.imageUrl ?? existing?.image_url ?? null,
    root_category:
      product.keepaCategories?.rootCategory ?? existing?.root_category ?? null,
    category_ids:
      product.keepaCategories?.categories ?? existing?.category_ids ?? null,
    category_tree:
      product.keepaCategories?.categoryTree ?? existing?.category_tree ?? null,
    first_seen_at: firstSeenAt,
    last_seen_at: lastSeenAt,
  };
  const { error } = await supabase
    .from("products")
    .upsert(row, { onConflict: "asin" });

  throwForDatabaseError(error, "Upsert products fallito");
}

function variantIdentity(
  row: Pick<
    VariantRow,
    | "child_asin"
    | "parent_asin"
    | "attribute_dimension"
    | "attribute_value"
    | "related_asin"
  >
): string {
  return [
    row.child_asin,
    row.parent_asin,
    row.attribute_dimension,
    row.attribute_value,
    row.related_asin,
  ].join("\u0000");
}

async function upsertVariants(rows: readonly VariantRow[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const supabase = getSupabaseServerClient();
  const { data: existingRows, error: selectError } = await supabase
    .from("product_variants")
    .select(
      "id,child_asin,parent_asin,attribute_dimension,attribute_value,related_asin"
    )
    .eq("child_asin", rows[0].child_asin);

  throwForDatabaseError(selectError, "Lettura product_variants fallita");

  const existingByIdentity = new Map(
    (existingRows ?? []).map((row) => [
      variantIdentity({
        child_asin: row.child_asin,
        parent_asin: row.parent_asin,
        attribute_dimension: row.attribute_dimension,
        attribute_value: row.attribute_value,
        related_asin: row.related_asin ?? "",
      }),
      row.id,
    ])
  );
  const rowsToInsert: VariantRow[] = [];

  for (const row of rows) {
    const existingId = existingByIdentity.get(variantIdentity(row));

    if (existingId === undefined) {
      rowsToInsert.push(row);
      continue;
    }

    const { error } = await supabase
      .from("product_variants")
      .update({ observed_at: row.observed_at })
      .eq("id", existingId);

    throwForDatabaseError(error, "Aggiornamento product_variants fallito");
  }

  for (const batch of chunks(rowsToInsert)) {
    const { error } = await supabase.from("product_variants").insert(batch);
    throwForDatabaseError(error, "Inserimento product_variants fallito");
  }
}

async function upsertBuyBoxHistory(
  rows: readonly BuyBoxHistoryRow[]
): Promise<void> {
  const supabase = getSupabaseServerClient();

  for (const batch of chunks(rows)) {
    const { error } = await supabase
      .from("buybox_price_history")
      .upsert(batch, { onConflict: "asin,keepa_time" });

    throwForDatabaseError(error, "Upsert buybox_price_history fallito");
  }
}

export async function getKeepaStorageCounts(): Promise<KeepaStorageCounts> {
  const supabase = getSupabaseServerClient();
  const counts = {} as KeepaStorageCounts;

  for (const table of STORAGE_TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });

    throwForDatabaseError(error, `Conteggio ${table} fallito`);
    counts[table] = count ?? 0;
  }

  return counts;
}

export async function persistKeepaProduct(
  input: KeepaPersistenceInput
): Promise<KeepaPersistenceResult> {
  const { requestedAt, rawProduct } = validateInput(input);
  const variantRows = buildVariantRows(input, requestedAt);
  const buyBoxHistoryRows = buildBuyBoxHistoryRows(input, rawProduct);
  const snapshotRow = buildSnapshotRow(input, requestedAt);
  const rawLatestRow = {
    asin: input.result.product.asin,
    product_object: rawProduct,
    requested_at: requestedAt,
    last_buy_box_update_keepa_time:
      input.result.product.keepaBuyBox?.lastUpdateKeepaTimeMinutes ?? null,
    last_buy_box_updated_at:
      input.result.product.keepaBuyBox?.lastUpdatedAt ?? null,
  };

  await upsertProduct(input, requestedAt);
  await upsertVariants(variantRows);
  await upsertBuyBoxHistory(buyBoxHistoryRows);

  const supabase = getSupabaseServerClient();
  const { error: snapshotError } = await supabase
    .from("keepa_snapshots")
    .upsert(snapshotRow, { onConflict: "asin,requested_at" });
  throwForDatabaseError(snapshotError, "Upsert keepa_snapshots fallito");

  const { error: rawError } = await supabase
    .from("keepa_raw_latest")
    .upsert(rawLatestRow, { onConflict: "asin" });
  throwForDatabaseError(rawError, "Upsert keepa_raw_latest fallito");

  return {
    asin: input.result.product.asin,
    requestedAt,
    productRows: 1,
    variantAttributeRows: variantRows.length,
    buyBoxHistoryRows: buyBoxHistoryRows.length,
    snapshotRows: 1,
    historyPointRows: 0,
    rawLatestRows: 1,
  };
}
