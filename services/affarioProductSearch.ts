import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import {
  prepareAffarioProductSearchQuery,
  rankAffarioProductFamilies,
  splitAffarioProductFamilyByConsumerStyle,
} from "@/lib/affarioProductSearch";
import { getSupabaseServerClient } from "@/services/supabaseServer";
import type {
  AffarioProductSearchFamily,
  AffarioProductSearchResult,
} from "@/types/productSearch";

const PRODUCT_CATALOG_READ_LIMIT = 500;
const VARIANT_ATTRIBUTE_READ_LIMIT = 5_000;

type ProductRow = {
  asin: string;
  parent_asin: string | null;
  title: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  size: string | null;
  image_url: string | null;
};

type VariantAttributeRow = {
  child_asin: string;
  parent_asin: string;
  related_asin: string | null;
  attribute_dimension: string;
  attribute_value: string;
  observed_at: string;
};

type AttributeValue = {
  dimension: string;
  value: string;
  observedAt: string;
};

type WorkingFamily = {
  family: Omit<AffarioProductSearchFamily, "variants">;
  variants: Map<string, Map<string, AttributeValue>>;
};

export class AffarioProductSearchServiceError extends Error {
  constructor(public readonly code: "DATABASE_UNAVAILABLE") {
    super(code);
    this.name = "AffarioProductSearchServiceError";
  }
}

function throwForDatabaseError(error: PostgrestError | null): void {
  if (error) {
    throw new AffarioProductSearchServiceError("DATABASE_UNAVAILABLE");
  }
}

function getAttributeKey(dimension: string): string {
  return dimension.trim().toLowerCase();
}

function setAttribute(
  attributes: Map<string, AttributeValue>,
  dimension: string,
  value: string,
  observedAt: string
): void {
  const normalizedDimension = dimension.trim();
  const normalizedValue = value.trim();

  if (!normalizedDimension || !normalizedValue) {
    return;
  }

  const key = getAttributeKey(normalizedDimension);
  const existing = attributes.get(key);
  const observedAtMilliseconds = Date.parse(observedAt);
  const existingObservedAtMilliseconds = existing
    ? Date.parse(existing.observedAt)
    : Number.NaN;

  if (
    !existing ||
    (Number.isFinite(observedAtMilliseconds) &&
      (!Number.isFinite(existingObservedAtMilliseconds) ||
        observedAtMilliseconds > existingObservedAtMilliseconds)) ||
    (observedAt === existing.observedAt && normalizedValue < existing.value)
  ) {
    attributes.set(key, {
      dimension: normalizedDimension,
      value: normalizedValue,
      observedAt,
    });
  }
}

function ensureVariant(
  family: WorkingFamily,
  asin: string
): Map<string, AttributeValue> {
  const existing = family.variants.get(asin);

  if (existing) {
    return existing;
  }

  const attributes = new Map<string, AttributeValue>();
  family.variants.set(asin, attributes);
  return attributes;
}

function buildFamilies(
  products: readonly ProductRow[],
  variantRows: readonly VariantAttributeRow[]
): AffarioProductSearchFamily[] {
  const families = new Map<string, WorkingFamily>();
  const familyIdByProductAsin = new Map<string, string>();
  const metadataByAsin = new Map(
    products.map((product) => [
      product.asin,
      {
        asin: product.asin,
        title: product.title,
        brand: product.brand,
        model: product.model,
        imageUrl: product.image_url,
      },
    ])
  );

  for (const product of products) {
    const familyId = product.parent_asin ?? product.asin;
    familyIdByProductAsin.set(product.asin, familyId);

    if (!families.has(familyId)) {
      families.set(familyId, {
        family: {
          familyId,
          title: product.title,
          brand: product.brand,
          model: product.model,
          imageUrl: product.image_url,
          representativeAsin: product.asin,
          parentAsin: product.parent_asin,
        },
        variants: new Map(),
      });
    }

    const family = families.get(familyId);

    if (!family) {
      continue;
    }

    const attributes = ensureVariant(family, product.asin);
    setAttribute(attributes, "Color", product.color ?? "", "");
    setAttribute(attributes, "Size", product.size ?? "", "");
  }

  for (const row of variantRows) {
    const familyId =
      familyIdByProductAsin.get(row.child_asin) ?? row.parent_asin;
    const family = families.get(familyId);

    if (!family) {
      continue;
    }

    const variantAsin = row.related_asin ?? row.child_asin;
    const attributes = ensureVariant(family, variantAsin);

    setAttribute(
      attributes,
      row.attribute_dimension,
      row.attribute_value,
      row.observed_at
    );
  }

  return [...families.values()]
    .map(({ family, variants }): AffarioProductSearchFamily => ({
      ...family,
      variants: [...variants.entries()]
        .sort(([leftAsin], [rightAsin]) => leftAsin.localeCompare(rightAsin))
        .map(([asin, attributes]) => ({
          asin,
          attributes: Object.fromEntries(
            [...attributes.values()]
              .sort((left, right) =>
                left.dimension.localeCompare(right.dimension, "it")
              )
              .map(({ dimension, value }) => [dimension, value])
          ),
        })),
    }))
    .flatMap((family) =>
      splitAffarioProductFamilyByConsumerStyle(family, metadataByAsin)
    )
    .sort((left, right) => left.familyId.localeCompare(right.familyId));
}

async function readCatalog(): Promise<AffarioProductSearchFamily[]> {
  let supabase: ReturnType<typeof getSupabaseServerClient>;

  try {
    supabase = getSupabaseServerClient();
  } catch {
    throw new AffarioProductSearchServiceError("DATABASE_UNAVAILABLE");
  }

  const [productsResult, variantsResult] = await Promise.all([
    supabase
      .from("products")
      .select("asin,parent_asin,title,brand,model,color,size,image_url")
      .order("asin")
      .limit(PRODUCT_CATALOG_READ_LIMIT),
    supabase
      .from("product_variants")
      .select(
        "child_asin,parent_asin,related_asin,attribute_dimension,attribute_value,observed_at"
      )
      .order("child_asin")
      .order("related_asin")
      .limit(VARIANT_ATTRIBUTE_READ_LIMIT),
  ]);

  throwForDatabaseError(productsResult.error);
  throwForDatabaseError(variantsResult.error);

  return buildFamilies(
    (productsResult.data ?? []) as ProductRow[],
    (variantsResult.data ?? []) as VariantAttributeRow[]
  );
}

export async function searchAffarioProducts(
  query: string
): Promise<AffarioProductSearchResult> {
  const preparedQuery = prepareAffarioProductSearchQuery(query);
  const families = await readCatalog();
  const results = rankAffarioProductFamilies(preparedQuery, families);

  return {
    query: preparedQuery.normalizedQuery,
    source: "AFFARIO_CATALOG",
    status: results.length > 0 ? "MATCHES_FOUND" : "NO_LOCAL_MATCHES",
    results,
  };
}
