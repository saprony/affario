import "server-only";

import {
  AFFARIO_PRODUCT_SEARCH_MAX_RESULTS,
  prepareAffarioProductSearchQuery,
} from "@/lib/affarioProductSearch";
import {
  searchKeepaProducts,
  type KeepaProductSummary,
  type KeepaVariation,
} from "@/services/keepaClient";
import type {
  AffarioExternalProductCandidate,
  AffarioExternalProductCandidateCategory,
  AffarioExternalProductSearchResult,
  AffarioProductSearchVariant,
} from "@/types/productSearch";

const AMAZON_IMAGE_BASE_URL = "https://m.media-amazon.com/images/I/";

export type KeepaProductSearchServerReport = {
  externalRequests: 1;
  providerCandidatesReceived: number;
  tokensConsumed: number;
  tokensRemaining: number;
};

export type KeepaProductSearchProviderResult = {
  data: AffarioExternalProductSearchResult;
  serverReport: KeepaProductSearchServerReport;
};

function getMainImageUrl(product: KeepaProductSummary): string | null {
  const mainImage = product.images?.find(
    (image) =>
      image.variant?.toUpperCase() === "MAIN" && (image.l || image.m)
  );
  const fallbackImage = product.images?.find((image) => image.l || image.m);
  const fileName =
    mainImage?.l ?? mainImage?.m ?? fallbackImage?.l ?? fallbackImage?.m;

  return fileName
    ? `${AMAZON_IMAGE_BASE_URL}${encodeURIComponent(fileName)}`
    : null;
}

function mapAttributes(
  entries: readonly (readonly [string, string | undefined])[]
): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {};

  for (const [dimension, value] of entries) {
    const normalizedDimension = dimension.trim();
    const normalizedValue = value?.trim();

    if (normalizedDimension && normalizedValue) {
      attributes[normalizedDimension] = normalizedValue;
    }
  }

  return attributes;
}

function mapVariants(
  variations: readonly KeepaVariation[] | undefined
): AffarioProductSearchVariant[] {
  return (variations ?? []).map((variation) => ({
    asin: variation.asin,
    attributes: mapAttributes(
      variation.attributes.map(
        ({ dimension, value }) => [dimension, value] as const
      )
    ),
  }));
}

function mapCategories(
  product: KeepaProductSummary
): AffarioExternalProductCandidateCategory[] {
  const categories: AffarioExternalProductCandidateCategory[] = (
    product.categoryTree ?? []
  ).map(({ catId, name }) => ({
    id: String(catId),
    name,
  }));

  if (
    product.rootCategory !== undefined &&
    !categories.some(({ id }) => id === String(product.rootCategory))
  ) {
    categories.push({ id: String(product.rootCategory), name: null });
  }

  return categories;
}

function mapCandidate(
  product: KeepaProductSummary
): AffarioExternalProductCandidate {
  return {
    asin: product.asin,
    title: product.title,
    brand: product.brand ?? null,
    model: product.model ?? null,
    imageUrl: getMainImageUrl(product),
    parentAsin: product.parentAsin ?? null,
    attributes: mapAttributes([
      ["Color", product.color],
      ["Size", product.size],
    ]),
    categories: mapCategories(product),
    variants: mapVariants(product.variations),
  };
}

export async function searchKeepaProductCandidates(
  query: string
): Promise<KeepaProductSearchProviderResult> {
  const preparedQuery = prepareAffarioProductSearchQuery(query);
  const keepaResult = await searchKeepaProducts(
    preparedQuery.normalizedQuery
  );
  const candidates = keepaResult.products
    .slice(0, AFFARIO_PRODUCT_SEARCH_MAX_RESULTS)
    .map(mapCandidate);

  return {
    data: {
      query: preparedQuery.normalizedQuery,
      source: "EXTERNAL_PROVIDER",
      candidates,
    },
    serverReport: {
      externalRequests: 1,
      providerCandidatesReceived: keepaResult.products.length,
      tokensConsumed: keepaResult.usage.tokensConsumed,
      tokensRemaining: keepaResult.usage.tokensLeft,
    },
  };
}
