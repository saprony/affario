import "server-only";

import {
  getKeepaProductByAsin,
  type KeepaProductSummary,
  type KeepaUsage,
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

export type AffarioProductFieldWithoutRealData =
  | (typeof PRODUCT_FIELDS_WITHOUT_KEEPA_DATA)[number]
  | "brand";

export type AffarioProductCandidate = {
  asin: string;
  amazonDomainId: number;
  title: Product["title"];
  brand?: Product["brand"];
  model?: string;
  externalIdentifiers: readonly ExternalProductIdentifier[];
  unavailableProductFields: readonly AffarioProductFieldWithoutRealData[];
};

export type AffarioProductCandidateResult = {
  product: AffarioProductCandidate;
  usage: KeepaUsage;
};

function mapKeepaProductToAffarioCandidate(
  keepaProduct: KeepaProductSummary
): AffarioProductCandidate {
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
    unavailableProductFields: keepaProduct.brand
      ? PRODUCT_FIELDS_WITHOUT_KEEPA_DATA
      : ["brand", ...PRODUCT_FIELDS_WITHOUT_KEEPA_DATA],
  };

  if (keepaProduct.brand) {
    product.brand = keepaProduct.brand;
  }

  if (keepaProduct.model) {
    product.model = keepaProduct.model;
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
