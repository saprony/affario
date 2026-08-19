import "server-only";

import {
  getKeepaProductByAsin,
  type KeepaCategoryTreeEntry,
  type KeepaImage,
  type KeepaIntegerArray,
  type KeepaPriceExtremeArray,
  type KeepaProductSummary,
  type KeepaStatistics,
  type KeepaUsage,
  type KeepaVariation,
} from "@/services/keepaClient";
import type { ExternalProductIdentifier } from "@/types/catalog";
import type { Product } from "@/types/product";

const PRODUCT_FIELDS_WITHOUT_KEEPA_DATA = [
  "id",
  "category",
  "familyId",
  "familyTitle",
  "memory",
  "color",
  "imageUrl",
  "currentPrice",
  "lowestPrice90Days",
  "amazonUrl",
  "isAvailable",
  "affarioScore",
] as const satisfies readonly (keyof Product)[];

const AMAZON_IMAGE_BASE_URL = "https://m.media-amazon.com/images/I/";
const KEEPA_AMAZON_PRICE_INDEX = 0;
const KEEPA_NEW_PRICE_INDEX = 1;
const KEEPA_TIME_MINUTES_OFFSET = 21_564_000;
const PRICE_STATISTICS_INTERVAL_DAYS = 90;
const MEMORY_VARIATION_DIMENSIONS = new Set([
  "digital storage capacity",
  "digitalstoragecapacity",
  "hard disk size",
  "harddisksize",
  "memory",
  "memory capacity",
  "memory size",
  "memorycapacity",
  "memorysize",
  "ram memory installed size",
  "rammemoryinstalledsize",
  "storage capacity",
  "storagecapacity",
  "capacita della memoria",
  "capacita di memoria",
  "capacita memoria",
  "memoria",
]);

export type AffarioProductFieldWithoutRealData =
  | (typeof PRODUCT_FIELDS_WITHOUT_KEEPA_DATA)[number]
  | "brand";

export type AffarioKeepaCategoryMetadata = {
  rootCategory?: number;
  categories?: readonly number[];
  categoryTree?: readonly KeepaCategoryTreeEntry[];
};

export type AffarioKeepaMinimumPrice = {
  amountInEuros: number;
  keepaTimeMinutes: number;
  observedAt: string;
};

export type AffarioKeepaPriceTypeStatistics = {
  currentInEuros?: number;
  averageInIntervalInEuros?: number;
  average90DaysInEuros?: number;
  minimumInInterval?: AffarioKeepaMinimumPrice;
};

export type AffarioKeepaPriceStatistics = {
  intervalDays: 90;
  currency: "EUR";
  amazon: AffarioKeepaPriceTypeStatistics;
  new: AffarioKeepaPriceTypeStatistics;
};

export type AffarioProductCandidate = {
  asin: string;
  amazonDomainId: number;
  title: Product["title"];
  brand?: Product["brand"];
  model?: string;
  imageUrl?: Product["imageUrl"];
  color?: Product["color"];
  size?: string;
  memory?: Product["memory"];
  keepaCategories?: AffarioKeepaCategoryMetadata;
  parentAsin?: string;
  keepaVariations?: readonly KeepaVariation[];
  keepaPriceStatistics?: AffarioKeepaPriceStatistics;
  externalIdentifiers: readonly ExternalProductIdentifier[];
  unavailableProductFields: readonly AffarioProductFieldWithoutRealData[];
};

export type AffarioProductCandidateResult = {
  product: AffarioProductCandidate;
  usage: KeepaUsage;
};

function buildAmazonImageUrl(fileName: string): string {
  return `${AMAZON_IMAGE_BASE_URL}${encodeURIComponent(fileName)}`;
}

function getMainImageUrl(
  images: readonly KeepaImage[] | undefined
): string | undefined {
  if (!images) {
    return undefined;
  }

  const orderedImages = [
    ...images.filter((image) => image.variant?.toUpperCase() === "MAIN"),
    ...images.filter((image) => image.variant?.toUpperCase() !== "MAIN"),
  ];
  const image = orderedImages.find((entry) => entry.l || entry.m);
  const fileName = image?.l ?? image?.m;

  return fileName ? buildAmazonImageUrl(fileName) : undefined;
}

function normalizeVariationDimension(dimension: string): string {
  return dimension
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getMemoryFromCurrentVariation(
  asin: string,
  variations: readonly KeepaVariation[] | undefined
): string | undefined {
  const currentVariation = variations?.find(
    (variation) => variation.asin === asin
  );

  if (!currentVariation) {
    return undefined;
  }

  const memoryValues = [
    ...new Set(
      currentVariation.attributes
        .filter((attribute) =>
          MEMORY_VARIATION_DIMENSIONS.has(
            normalizeVariationDimension(attribute.dimension)
          )
        )
        .map((attribute) => attribute.value)
    ),
  ];

  return memoryValues.length === 1 ? memoryValues[0] : undefined;
}

function getKeepaCategoryMetadata(
  keepaProduct: KeepaProductSummary
): AffarioKeepaCategoryMetadata | undefined {
  if (
    keepaProduct.rootCategory === undefined &&
    keepaProduct.categories === undefined &&
    keepaProduct.categoryTree === undefined
  ) {
    return undefined;
  }

  const metadata: AffarioKeepaCategoryMetadata = {};

  if (keepaProduct.rootCategory !== undefined) {
    metadata.rootCategory = keepaProduct.rootCategory;
  }

  if (keepaProduct.categories !== undefined) {
    metadata.categories = keepaProduct.categories;
  }

  if (keepaProduct.categoryTree !== undefined) {
    metadata.categoryTree = keepaProduct.categoryTree;
  }

  return metadata;
}

function getPriceInCents(
  values: KeepaIntegerArray | undefined,
  priceTypeIndex: number
): number | undefined {
  const value = values?.[priceTypeIndex];

  return typeof value === "number" && value >= 0 ? value : undefined;
}

function convertCentsToEuros(priceInCents: number): number {
  return priceInCents / 100;
}

function getMinimumPrice(
  values: KeepaPriceExtremeArray | undefined,
  priceTypeIndex: number
): AffarioKeepaMinimumPrice | undefined {
  const minimum = values?.[priceTypeIndex];

  if (!minimum) {
    return undefined;
  }

  const [keepaTimeMinutes, priceInCents] = minimum;

  if (keepaTimeMinutes < 0 || priceInCents < 0) {
    return undefined;
  }

  const unixTimeInMs =
    (keepaTimeMinutes + KEEPA_TIME_MINUTES_OFFSET) * 60_000;
  const observedAt = new Date(unixTimeInMs);

  if (Number.isNaN(observedAt.getTime())) {
    return undefined;
  }

  return {
    amountInEuros: convertCentsToEuros(priceInCents),
    keepaTimeMinutes,
    observedAt: observedAt.toISOString(),
  };
}

function mapPriceTypeStatistics(
  stats: KeepaStatistics,
  priceTypeIndex: number
): AffarioKeepaPriceTypeStatistics {
  const priceStatistics: AffarioKeepaPriceTypeStatistics = {};
  const currentPrice = getPriceInCents(stats.current, priceTypeIndex);
  const averageInInterval = getPriceInCents(stats.avg, priceTypeIndex);
  const average90Days = getPriceInCents(stats.avg90, priceTypeIndex);
  const minimumInInterval = getMinimumPrice(
    stats.minInInterval,
    priceTypeIndex
  );

  if (currentPrice !== undefined) {
    priceStatistics.currentInEuros = convertCentsToEuros(currentPrice);
  }

  if (averageInInterval !== undefined) {
    priceStatistics.averageInIntervalInEuros =
      convertCentsToEuros(averageInInterval);
  }

  if (average90Days !== undefined) {
    priceStatistics.average90DaysInEuros =
      convertCentsToEuros(average90Days);
  }

  if (minimumInInterval) {
    priceStatistics.minimumInInterval = minimumInInterval;
  }

  return priceStatistics;
}

function getKeepaPriceStatistics(
  stats: KeepaStatistics | undefined
): AffarioKeepaPriceStatistics | undefined {
  if (!stats) {
    return undefined;
  }

  return {
    intervalDays: PRICE_STATISTICS_INTERVAL_DAYS,
    currency: "EUR",
    amazon: mapPriceTypeStatistics(stats, KEEPA_AMAZON_PRICE_INDEX),
    new: mapPriceTypeStatistics(stats, KEEPA_NEW_PRICE_INDEX),
  };
}

function getUnavailableProductFields(
  keepaProduct: KeepaProductSummary,
  imageUrl: string | undefined,
  memory: string | undefined
): AffarioProductFieldWithoutRealData[] {
  const availableFields = new Set<keyof Product>();

  if (keepaProduct.brand) {
    availableFields.add("brand");
  }

  if (keepaProduct.color) {
    availableFields.add("color");
  }

  if (imageUrl) {
    availableFields.add("imageUrl");
  }

  if (memory) {
    availableFields.add("memory");
  }

  return [
    ...(availableFields.has("brand") ? [] : (["brand"] as const)),
    ...PRODUCT_FIELDS_WITHOUT_KEEPA_DATA.filter(
      (field) => !availableFields.has(field)
    ),
  ];
}

function mapKeepaProductToAffarioCandidate(
  keepaProduct: KeepaProductSummary
): AffarioProductCandidate {
  const imageUrl = getMainImageUrl(keepaProduct.images);
  const memory = getMemoryFromCurrentVariation(
    keepaProduct.asin,
    keepaProduct.variations
  );
  const keepaCategories = getKeepaCategoryMetadata(keepaProduct);
  const keepaPriceStatistics = getKeepaPriceStatistics(keepaProduct.stats);
  const product: AffarioProductCandidate = {
    asin: keepaProduct.asin,
    amazonDomainId: keepaProduct.domainId,
    title: keepaProduct.title,
    externalIdentifiers: [
      {
        source: "amazon",
        value: keepaProduct.asin,
      },
    ],
    unavailableProductFields: getUnavailableProductFields(
      keepaProduct,
      imageUrl,
      memory
    ),
  };

  if (keepaProduct.brand) {
    product.brand = keepaProduct.brand;
  }

  if (keepaProduct.model) {
    product.model = keepaProduct.model;
  }

  if (imageUrl) {
    product.imageUrl = imageUrl;
  }

  if (keepaProduct.color) {
    product.color = keepaProduct.color;
  }

  if (keepaProduct.size) {
    product.size = keepaProduct.size;
  }

  if (memory) {
    product.memory = memory;
  }

  if (keepaCategories) {
    product.keepaCategories = keepaCategories;
  }

  if (keepaProduct.parentAsin) {
    product.parentAsin = keepaProduct.parentAsin;
  }

  if (keepaProduct.variations) {
    product.keepaVariations = keepaProduct.variations;
  }

  if (keepaPriceStatistics) {
    product.keepaPriceStatistics = keepaPriceStatistics;
  }

  return product;
}

export async function getAffarioProductCandidateByAsin(
  asin: string
): Promise<AffarioProductCandidateResult> {
  const keepaResult = await getKeepaProductByAsin(asin);

  return {
    product: mapKeepaProductToAffarioCandidate(keepaResult.product),
    usage: keepaResult.usage,
  };
}
