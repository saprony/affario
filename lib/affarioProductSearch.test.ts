import assert from "node:assert/strict";
import test from "node:test";

import {
  groupAffarioExternalProductCandidates,
  prepareAffarioProductSearchQuery,
  rankAffarioExternalProductFamilies,
  rankAffarioProductFamilies,
  splitAffarioProductFamilyByConsumerStyle,
} from "./affarioProductSearch";
import type {
  AffarioExternalProductCandidate,
  AffarioProductSearchFamily,
  AffarioProductSearchVariant,
} from "../types/productSearch";

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

test("ranking esterno conserva solo i match completi quando disponibili", () => {
  const matrixVariants = [
    variant("B0GKP9H2W1", "Matrix10 Ultra"),
    variant("B0H1JC29D3", "Matrix10 Pro"),
    variant("B0L40SPRO1", "L40s Pro Ultra"),
    variant("B0L50SPRO1", "L50s Pro Ultra"),
  ];
  const candidates = [
    candidate({
      asin: "B0GKP9H2W1",
      title:
        "dreame Matrix10 Ultra Robot Aspirapolvere Lavapavimenti, Aspir. 30.000 Pa",
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
      asin: "B0L40SPRO1",
      title: "dreame L40s Pro Ultra Robot Aspirapolvere",
      brand: "dreame",
      model: "L40S",
      parentAsin: "B0GVP55112",
      variants: matrixVariants,
    }),
    candidate({
      asin: "B0L50SPRO1",
      title: "dreame L50s Pro Ultra Robot Aspirapolvere",
      brand: "dreame",
      model: "L50S",
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
  assert.deepEqual(
    ranked.map((family) => family.title),
    [
      "dreame Matrix10 Ultra Robot Aspirapolvere Lavapavimenti, Aspir. 30.000 Pa",
      "Accessori per Dreame L40s Pro Ultra Matrix 10 Ultra",
    ]
  );
  assert.deepEqual(
    ranked[0].variants.map(({ attributes }) => attributes.Style),
    ["Matrix10 Ultra", "Matrix10 Pro"]
  );
  assert.equal(
    ranked[0].variants.some(({ attributes }) =>
      /L40|L50/i.test(attributes.Style)
    ),
    false
  );
});

test("suddivide Style diversi senza dipendere da marchi o modelli noti", () => {
  const variants = [
    variant("GENERIC-A1", "Alpha20 Standard"),
    variant("GENERIC-A2", "Alpha20 Plus"),
    variant("GENERIC-B1", "Beta30 Max"),
  ];
  const families = groupAffarioExternalProductCandidates([
    candidate({
      asin: "GENERIC-A1",
      title: "Example Alpha20 Standard",
      brand: "Example",
      model: "A20",
      parentAsin: "GENERIC-PARENT",
      variants,
    }),
    candidate({
      asin: "GENERIC-B1",
      title: "Example Beta30 Max",
      brand: "Example",
      model: "B30",
      parentAsin: "GENERIC-PARENT",
      variants,
    }),
  ]);

  assert.deepEqual(
    families.map(({ variants: familyVariants }) =>
      familyVariants.map(({ attributes }) => attributes.Style)
    ),
    [["Alpha20 Standard", "Alpha20 Plus"], ["Beta30 Max"]]
  );
});

test("catalogo locale ed esterno costruiscono la stessa famiglia consumer", () => {
  const variants = [
    variant("B0AQUAROLL", "Aqua10 Roller"),
    variant("B0AQUACOMP", "Aqua10 Ultra Roller Complete"),
    variant("B0AQUABLCK", "Aqua10 Ultra Roller Complete Nero"),
    variant("B0AQUATRCK", "Aqua10 Ultra Track Complete"),
    variant("B0MATRIXPR", "Matrix10 Pro"),
    variant("B0MATRIXUL", "Matrix10 Ultra"),
  ];
  const parentFamily: AffarioProductSearchFamily = {
    familyId: "GENERIC-PARENT",
    title: "Example Matrix10 Ultra aspirapolvere",
    brand: "Example",
    model: "M10",
    imageUrl: null,
    representativeAsin: "B0MATRIXUL",
    parentAsin: "GENERIC-PARENT",
    variants,
  };
  const metadataByAsin = new Map([
    [
      "B0MATRIXUL",
      {
        asin: "B0MATRIXUL",
        title: "Example Matrix10 Ultra aspirapolvere",
        brand: "Example",
        model: "M10",
        imageUrl: null,
      },
    ],
  ]);
  const localFamilies = splitAffarioProductFamilyByConsumerStyle(
    parentFamily,
    metadataByAsin
  );
  const localRanked = rankAffarioProductFamilies(
    prepareAffarioProductSearchQuery("example matrix"),
    localFamilies
  );
  const externalFamilies = groupAffarioExternalProductCandidates([
    candidate({
      asin: "B0MATRIXUL",
      title: "Example Matrix10 Ultra aspirapolvere",
      brand: "Example",
      model: "M10",
      parentAsin: "GENERIC-PARENT",
      variants,
    }),
  ]);
  const externalRanked = rankAffarioExternalProductFamilies(
    prepareAffarioProductSearchQuery("example matrix"),
    externalFamilies
  );
  const localMatrix = localRanked[0];
  const externalMatrix = externalRanked[0];
  const getVariantIdentity = (family: AffarioProductSearchFamily) =>
    family.variants
      .map(({ asin, attributes }) => ({
        asin,
        style: attributes.Style,
      }))
      .sort((left, right) => left.asin.localeCompare(right.asin));

  assert.equal(localRanked.length, 1);
  assert.equal(externalRanked.length, 1);
  assert.deepEqual(getVariantIdentity(localMatrix), [
    { asin: "B0MATRIXPR", style: "Matrix10 Pro" },
    { asin: "B0MATRIXUL", style: "Matrix10 Ultra" },
  ]);
  assert.deepEqual(
    getVariantIdentity(externalMatrix),
    getVariantIdentity(localMatrix)
  );
  assert.equal(
    localMatrix.variants.some(({ attributes }) =>
      attributes.Style.startsWith("Aqua10")
    ),
    false
  );
  assert.deepEqual(
    localFamilies
      .flatMap(({ variants: familyVariants }) => familyVariants)
      .map(({ asin }) => asin)
      .sort(),
    variants.map(({ asin }) => asin).sort()
  );
});

test("la famiglia locale iPhone resta unica con nove varianti", () => {
  const variants = Array.from({ length: 9 }, (_, index) => ({
    asin: `IPHONE-${index + 1}`,
    attributes: {
      Size: ["256 GB", "512 GB", "1 TB"][Math.floor(index / 3)],
      Color: ["Argento", "Blu profondo", "Arancione cosmico"][index % 3],
    },
  }));
  const family: AffarioProductSearchFamily = {
    familyId: "IPHONE-PARENT",
    title: "Apple iPhone 17 Pro",
    brand: "Apple",
    model: "IPHONE17PRO",
    imageUrl: null,
    representativeAsin: "IPHONE-1",
    parentAsin: "IPHONE-PARENT",
    variants,
  };
  const consumerFamilies = splitAffarioProductFamilyByConsumerStyle(
    family,
    new Map()
  );
  const ranked = rankAffarioProductFamilies(
    prepareAffarioProductSearchQuery("iphone"),
    consumerFamilies
  );

  assert.equal(consumerFamilies.length, 1);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].variants.length, 9);
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
