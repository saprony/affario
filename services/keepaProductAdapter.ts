import "server-only";

import {
  getKeepaProductByAsin,
  type KeepaCategoryTreeEntry,
  type KeepaImage,
  type KeepaProductSummary,
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
