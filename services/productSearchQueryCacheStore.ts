import "server-only";

import { getSupabaseServerClient } from "@/services/supabaseServer";
import type { AffarioExternalProductCandidate } from "@/types/productSearch";

export const PRODUCT_SEARCH_CACHE_PAYLOAD_VERSION = 1;

const QUERY_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const ASIN_PATTERN = /^[A-Z0-9]{10}$/u;

export type ProductSearchCachedCandidate = Omit<
  AffarioExternalProductCandidate,
  "categories"
>;

type ProductSearchQueryCacheRow = {
  query_hash: string;
  payload_version: number;
  candidates: unknown;
  result_count: number;
  fetched_at: string;
  expires_at: string;
};

export type FreshProductSearchCache = {
  candidates: readonly ProductSearchCachedCandidate[];
  fetchedAt: string;
  expiresAt: string;
};

type ProductSearchQueryCacheStoreDependencies = {
  readRow: (queryHash: string) => Promise<unknown | null>;
  writeRow: (row: ProductSearchQueryCacheRow) => Promise<void>;
};

export class ProductSearchQueryCacheStoreError extends Error {
  constructor() {
    super("Product search query cache store is unavailable.");
    this.name = "ProductSearchQueryCacheStoreError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean {
  const expected = new Set(expectedKeys);

  return (
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key))
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseAttributes(
  value: unknown
): Readonly<Record<string, string>> | null {
  if (!isRecord(value)) {
    return null;
  }

  const attributes: Record<string, string> = {};

  for (const [dimension, attributeValue] of Object.entries(value)) {
    if (
      !dimension.trim() ||
      typeof attributeValue !== "string" ||
      !attributeValue.trim()
    ) {
      return null;
    }

    attributes[dimension] = attributeValue;
  }

  return attributes;
}

function parseVariant(value: unknown) {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["asin", "attributes"]) ||
    typeof value.asin !== "string" ||
    !ASIN_PATTERN.test(value.asin)
  ) {
    return null;
  }

  const attributes = parseAttributes(value.attributes);

  return attributes === null
    ? null
    : { asin: value.asin, attributes };
}

function parseCandidate(
  value: unknown
): ProductSearchCachedCandidate | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "asin",
      "title",
      "brand",
      "model",
      "imageUrl",
      "parentAsin",
      "attributes",
      "variants",
    ]) ||
    typeof value.asin !== "string" ||
    !ASIN_PATTERN.test(value.asin) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    !isNullableString(value.brand) ||
    !isNullableString(value.model) ||
    !isNullableString(value.imageUrl) ||
    !isNullableString(value.parentAsin) ||
    (value.parentAsin !== null && !ASIN_PATTERN.test(value.parentAsin)) ||
    !Array.isArray(value.variants)
  ) {
    return null;
  }

  const attributes = parseAttributes(value.attributes);
  const variants = value.variants.map(parseVariant);

  if (
    attributes === null ||
    variants.some((variant) => variant === null)
  ) {
    return null;
  }

  return {
    asin: value.asin,
    title: value.title,
    brand: value.brand,
    model: value.model,
    imageUrl: value.imageUrl,
    parentAsin: value.parentAsin,
    attributes,
    variants: variants as AffarioExternalProductCandidate["variants"],
  };
}

function parseCandidates(
  value: unknown
): readonly ProductSearchCachedCandidate[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const candidates = value.map(parseCandidate);

  return candidates.some((candidate) => candidate === null)
    ? null
    : (candidates as ProductSearchCachedCandidate[]);
}

function serializeCandidates(
  candidates: readonly AffarioExternalProductCandidate[]
): readonly ProductSearchCachedCandidate[] | null {
  return parseCandidates(
    candidates.map(
      ({
        asin,
        title,
        brand,
        model,
        imageUrl,
        parentAsin,
        attributes,
        variants,
      }) => ({
        asin,
        title,
        brand,
        model,
        imageUrl,
        parentAsin,
        attributes,
        variants,
      })
    )
  );
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validateQueryHash(queryHash: string): void {
  if (!QUERY_HASH_PATTERN.test(queryHash)) {
    throw new Error("Invalid product search query hash.");
  }
}

export function parseFreshProductSearchCacheRow(
  value: unknown,
  expectedQueryHash: string,
  now: Date
): FreshProductSearchCache | null {
  if (
    !isRecord(value) ||
    value.query_hash !== expectedQueryHash ||
    value.payload_version !== PRODUCT_SEARCH_CACHE_PAYLOAD_VERSION ||
    !Number.isSafeInteger(value.result_count) ||
    (value.result_count as number) < 0 ||
    !isValidTimestamp(value.fetched_at) ||
    !isValidTimestamp(value.expires_at)
  ) {
    return null;
  }

  const candidates = parseCandidates(value.candidates);
  const fetchedAtMilliseconds = Date.parse(value.fetched_at);
  const expiresAtMilliseconds = Date.parse(value.expires_at);
  const nowMilliseconds = now.getTime();

  if (
    candidates === null ||
    candidates.length !== value.result_count ||
    !Number.isFinite(nowMilliseconds) ||
    expiresAtMilliseconds <= fetchedAtMilliseconds ||
    nowMilliseconds >= expiresAtMilliseconds
  ) {
    return null;
  }

  return {
    candidates,
    fetchedAt: value.fetched_at,
    expiresAt: value.expires_at,
  };
}

export function createProductSearchQueryCacheStore(
  dependencies: ProductSearchQueryCacheStoreDependencies
) {
  return {
    async loadFresh(
      queryHash: string,
      now: Date
    ): Promise<FreshProductSearchCache | null> {
      validateQueryHash(queryHash);

      let row: unknown | null;

      try {
        row = await dependencies.readRow(queryHash);
      } catch {
        throw new ProductSearchQueryCacheStoreError();
      }

      return row === null
        ? null
        : parseFreshProductSearchCacheRow(row, queryHash, now);
    },

    async save(input: {
      queryHash: string;
      candidates: readonly AffarioExternalProductCandidate[];
      fetchedAt: Date;
      expiresAt: Date;
    }): Promise<void> {
      validateQueryHash(input.queryHash);

      const candidates = serializeCandidates(input.candidates);
      const fetchedAtMilliseconds = input.fetchedAt.getTime();
      const expiresAtMilliseconds = input.expiresAt.getTime();

      if (
        candidates === null ||
        !Number.isFinite(fetchedAtMilliseconds) ||
        !Number.isFinite(expiresAtMilliseconds) ||
        expiresAtMilliseconds <= fetchedAtMilliseconds
      ) {
        throw new ProductSearchQueryCacheStoreError();
      }

      try {
        await dependencies.writeRow({
          query_hash: input.queryHash,
          payload_version: PRODUCT_SEARCH_CACHE_PAYLOAD_VERSION,
          candidates,
          result_count: candidates.length,
          fetched_at: input.fetchedAt.toISOString(),
          expires_at: input.expiresAt.toISOString(),
        });
      } catch {
        throw new ProductSearchQueryCacheStoreError();
      }
    },
  };
}

const productionProductSearchQueryCacheStore =
  createProductSearchQueryCacheStore({
    async readRow(queryHash) {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase
        .schema("public")
        .from("product_search_query_cache")
        .select(
          "query_hash,payload_version,candidates,result_count,fetched_at,expires_at"
        )
        .eq("query_hash", queryHash)
        .maybeSingle();

      if (error) {
        throw new Error("Product search cache read failed.");
      }

      return data;
    },

    async writeRow(row) {
      const supabase = getSupabaseServerClient();
      const { error } = await supabase
        .schema("public")
        .from("product_search_query_cache")
        .upsert(row, { onConflict: "query_hash" });

      if (error) {
        throw new Error("Product search cache write failed.");
      }
    },
  });

export const loadFreshProductSearchCache =
  productionProductSearchQueryCacheStore.loadFresh;
export const saveProductSearchCache =
  productionProductSearchQueryCacheStore.save;
