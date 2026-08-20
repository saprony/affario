import assert from "node:assert/strict";
import test from "node:test";

import {
  groupAffarioExternalProductCandidates,
  prepareAffarioProductSearchQuery,
  rankAffarioExternalProductFamilies,
  rankAffarioProductFamilies,
} from "@/lib/affarioProductSearch";
import type {
  AffarioExternalProductCandidate,
  AffarioProductSearchFamily,
  AffarioProductSearchVariant,
} from "@/types/productSearch";

function variant(
  asin: string,
  style: string
): AffarioProductSearchVariant {
  return { asin, attributes: { Style: style } };
}

function candidate({
  asin,
  title,
  brand,
  model,
  parentAsin = null,
  variants = [],
}: {
  asin: string;
  title: string;
  brand: string;
  model: string;
  parentAsin?: string | null;
  variants?: readonly AffarioProductSearchVariant[];
}): AffarioExternalProductCandidate {
  return {
    asin,
    title,
    brand,
    model,
    imageUrl: null,
    parentAsin,
    attributes: {},
    categories: [],
    variants,
  };
}

test("ranking esterno privilegia il brand reale senza blacklist", () => {
  const matrixVariants = [
    variant("B0GKP9H2W1", "Matrix10 Ultra"),
    variant("B0H1JC29D3", "Matrix10 Pro"),
  ];
  const candidates = [
    candidate({
      asin: "B0GKP9H2W1",
      title: "dreame Matrix10 Ultra Robot Aspirapolvere Lavapavimenti",
      brand: "dreame",
      model: "RLX95CE",
      parentAsin: "B0GVP55112",
      variants: matrixVariants,
    }),
    candidate({
      asin: "B0H1JC29D3",
      title: "dreame Matrix10 Pro Robot Aspirapolvere Lavapavimenti",
      brand: "dreame",
      model: "RLM61HE",
      parentAsin: "B0GVP55112",
      variants: matrixVariants,
    }),
    candidate({
      asin: "B0GSWYM8Q2",
      title: "dreame X60 Pro Ultra Complete Robot Aspirapolvere",
      brand: "dreame",
      model: "RLX96DE",
      parentAsin: "B0DWXTTXND",
      variants: [variant("B0GSWYM8Q2", "X60 Pro Ultra Complete")],
    }),
    candidate({
      asin: "B0G1SM4VHK",
      title: "Accessori per Dreame L40s Pro Ultra Matrix 10 Ultra",
      brand: "Homruich",
      model: "2",
    }),
    candidate({
      asin: "B0GJD7VMPX",
      title: "ECOVACS X12 OMNICYCLONE Robot Aspirapolvere",
      brand: "ECOVACS",
      model: "X12 OmniCyclone",
    }),
  ];
  const families = groupAffarioExternalProductCandidates(candidates);
  const ranked = rankAffarioExternalProductFamilies(
    prepareAffarioProductSearchQuery("dreame matrix"),
    families
  );
  const familyIds = ranked.map((family) => family.familyId);

  assert.deepEqual(familyIds, [
    "B0GVP55112",
    "B0DWXTTXND",
    "B0G1SM4VHK",
  ]);
  assert.deepEqual(
    ranked[0].variants.map(({ asin }) => asin),
    ["B0GKP9H2W1", "B0H1JC29D3"]
  );
});

test("ranking locale conserva la priorita dell'ASIN esatto", () => {
  const family: AffarioProductSearchFamily = {
    familyId: "B0LOCAL001",
    title: "Prodotto locale",
    brand: "AFFARIO",
    model: "LOCAL",
    imageUrl: null,
    representativeAsin: "B0LOCAL001",
    parentAsin: null,
    variants: [
      { asin: "B0LOCAL001", attributes: {} },
      { asin: "B0LOCAL002", attributes: { Color: "Nero" } },
    ],
  };
  const ranked = rankAffarioProductFamilies(
    prepareAffarioProductSearchQuery("B0LOCAL002"),
    [family]
  );

  assert.equal(ranked[0].representativeAsin, "B0LOCAL002");
});
