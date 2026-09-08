import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialVariantSelection,
  findVariantForSelection,
  getAvailableVariantAttributeValues,
  getDetectedVariantCountLabel,
  getDisplayFamilyTitle,
  getVariantCandidates,
  getVariantDimensionLabel,
  getVariantDimensions,
  getVariantSelectorSteps,
} from "./productVariantSelection";
import type { AffarioProductSearchVariant } from "../types/productSearch";

const iphoneVariants: readonly AffarioProductSearchVariant[] = [
  {
    asin: "IPHONE-256-BLUE",
    attributes: { Color: "Blu profondo", Size: "256 GB" },
  },
  {
    asin: "IPHONE-256-SILVER",
    attributes: { Color: "Argento", Size: "256 GB" },
  },
  {
    asin: "IPHONE-512-BLUE",
    attributes: { Color: "Blu profondo", Size: "512 GB" },
  },
  {
    asin: "IPHONE-1TB-SILVER",
    attributes: { Color: "Argento", Size: "1 TB" },
  },
];

const matrixVariants: readonly AffarioProductSearchVariant[] = [
  {
    asin: "MATRIX-ULTRA",
    attributes: {
      Color: "Matrix10 Ultra",
      Style: "Matrix10 Ultra",
    },
  },
  {
    asin: "MATRIX-PRO",
    attributes: {
      Color: "Matrix10 Pro",
      Style: "Matrix10 Pro",
    },
  },
];

const sonyWh1000Xm5Variants: readonly AffarioProductSearchVariant[] = [
  {
    asin: "B09Y2LL45F",
    attributes: {
      Style: "Con Custodia Rigida",
      Color: "Argento",
    },
  },
  {
    asin: "B09Y2MYL5C",
    attributes: {
      Style: "Con Custodia Rigida",
      Color: "Nero",
      Size: "Unica",
    },
  },
  {
    asin: "B0BXM22X99",
    attributes: {
      Style: "Con Custodia Rigida",
      Color: "BLU NOTTE",
    },
  },
  {
    asin: "B0DBLP647C",
    attributes: {
      Style: "Con Custodia Rigida",
      Color: "Rosa fumè",
    },
  },
  {
    asin: "B0F38PL24W",
    attributes: {
      Style: "Con Custodia Morbida",
      Color: "Nero",
    },
  },
];

test("presenta Style come configurazione senza duplicarlo come colore", () => {
  const dimensions = getVariantDimensions(matrixVariants);

  assert.deepEqual(dimensions, ["Style"]);
  assert.equal(
    getVariantDimensionLabel(dimensions[0], matrixVariants),
    "Configurazione"
  );
  assert.deepEqual(
    getAvailableVariantAttributeValues(matrixVariants, "Style", {}),
    ["Matrix10 Pro", "Matrix10 Ultra"]
  );
});

test("normalizza il titolo marketplace usando separatori e attributi", () => {
  const title =
    'Apple iPhone 17 Pro 256 GB: display 6,3", ProMotion fino a 120Hz, chip A19 Pro; Blu profondo';

  assert.equal(
    getDisplayFamilyTitle(title, iphoneVariants),
    "Apple iPhone 17 Pro"
  );
});

test("ordina le capacità confrontando GB e TB normalizzati", () => {
  assert.deepEqual(
    getAvailableVariantAttributeValues(iphoneVariants, "Size", {}),
    ["256 GB", "512 GB", "1 TB"]
  );
});

test("ordina la selezione iPhone per capacità e colore", () => {
  const dimensions = getVariantDimensions(iphoneVariants);

  assert.deepEqual(dimensions, ["Size", "Color"]);
  assert.equal(
    getVariantDimensionLabel(dimensions[0], iphoneVariants),
    "Capacità"
  );
  assert.equal(
    getVariantDimensionLabel(dimensions[1], iphoneVariants),
    "Colore"
  );
});

test("preseleziona deterministicamente la capacità presente nella query", () => {
  const dimensions = getVariantDimensions(iphoneVariants);
  const selection = createInitialVariantSelection(
    "iphone 256",
    iphoneVariants,
    dimensions
  );

  assert.deepEqual(selection, { Size: "256 GB" });
  assert.deepEqual(
    getAvailableVariantAttributeValues(iphoneVariants, "Color", selection),
    ["Argento", "Blu profondo"]
  );
});

test("individua l'ASIN soltanto dopo la scelta completa", () => {
  assert.equal(
    findVariantForSelection(iphoneVariants, { Size: "256 GB" }),
    null
  );
  assert.equal(
    findVariantForSelection(iphoneVariants, {
      Size: "256 GB",
      Color: "Blu profondo",
    })?.asin,
    "IPHONE-256-BLUE"
  );
});

test("il caso Sony salta Size singolo e mostra i quattro colori rigidi", () => {
  const dimensions = getVariantDimensions(sonyWh1000Xm5Variants);

  assert.deepEqual(dimensions, ["Style", "Size", "Color"]);
  assert.deepEqual(
    getVariantSelectorSteps(sonyWh1000Xm5Variants, dimensions, {}).map(
      ({ dimension, values }) => ({ dimension, values })
    ),
    [
      {
        dimension: "Style",
        values: ["Con Custodia Morbida", "Con Custodia Rigida"],
      },
    ]
  );
  assert.deepEqual(
    getVariantSelectorSteps(sonyWh1000Xm5Variants, dimensions, {
      Style: "Con Custodia Rigida",
    }).map(({ dimension, values }) => ({ dimension, values })),
    [
      {
        dimension: "Style",
        values: ["Con Custodia Morbida", "Con Custodia Rigida"],
      },
      {
        dimension: "Color",
        values: ["Argento", "BLU NOTTE", "Nero", "Rosa fumè"],
      },
    ]
  );
  assert.equal(
    getVariantDimensionLabel("Size", sonyWh1000Xm5Variants),
    "Taglia"
  );
});

test("un attributo presente su un solo ASIN non elimina gli altri Sony", () => {
  assert.deepEqual(
    getVariantCandidates(sonyWh1000Xm5Variants, {
      Style: "Con Custodia Rigida",
    }).map(({ asin }) => asin),
    ["B09Y2LL45F", "B09Y2MYL5C", "B0BXM22X99", "B0DBLP647C"]
  );
});

test("ogni colore Sony rigido risolve il proprio exact ASIN", () => {
  const expectedAsinsByColor = new Map([
    ["Argento", "B09Y2LL45F"],
    ["Nero", "B09Y2MYL5C"],
    ["BLU NOTTE", "B0BXM22X99"],
    ["Rosa fumè", "B0DBLP647C"],
  ]);

  for (const [color, expectedAsin] of expectedAsinsByColor) {
    assert.equal(
      findVariantForSelection(sonyWh1000Xm5Variants, {
        Style: "Con Custodia Rigida",
        Color: color,
      })?.asin,
      expectedAsin
    );
  }
});

test("le varianti Sony rilevate ma non materializzate restano raggiungibili", () => {
  const materializedAsins = new Set(["B09Y2MYL5C"]);
  const detectedOnlyVariants = sonyWh1000Xm5Variants.filter(
    ({ asin }) => !materializedAsins.has(asin)
  );
  const selectionsByAsin: Readonly<
    Record<string, Readonly<Record<string, string>>>
  > = {
    B09Y2LL45F: {
      Style: "Con Custodia Rigida",
      Color: "Argento",
    },
    B0BXM22X99: {
      Style: "Con Custodia Rigida",
      Color: "BLU NOTTE",
    },
    B0DBLP647C: {
      Style: "Con Custodia Rigida",
      Color: "Rosa fumè",
    },
    B0F38PL24W: {
      Style: "Con Custodia Morbida",
    },
  };

  assert.deepEqual(
    detectedOnlyVariants.map(({ asin }) => asin),
    ["B09Y2LL45F", "B0BXM22X99", "B0DBLP647C", "B0F38PL24W"]
  );

  for (const { asin } of detectedOnlyVariants) {
    assert.equal(
      findVariantForSelection(
        sonyWh1000Xm5Variants,
        selectionsByAsin[asin]
      )?.asin,
      asin
    );
  }
});

test("la custodia morbida Sony risolve automaticamente l'unico ASIN", () => {
  const dimensions = getVariantDimensions(sonyWh1000Xm5Variants);
  const selection = { Style: "Con Custodia Morbida" };

  assert.deepEqual(
    getVariantSelectorSteps(
      sonyWh1000Xm5Variants,
      dimensions,
      selection
    ).map(({ dimension }) => dimension),
    ["Style"]
  );
  assert.equal(
    findVariantForSelection(sonyWh1000Xm5Variants, selection)?.asin,
    "B0F38PL24W"
  );
});

test("zero o più candidati non producono una selezione implicita", () => {
  assert.equal(
    findVariantForSelection(sonyWh1000Xm5Variants, {
      Style: "Configurazione inesistente",
    }),
    null
  );
  assert.equal(
    getVariantCandidates(sonyWh1000Xm5Variants, {
      Style: "Configurazione inesistente",
    }).length,
    0
  );
  assert.equal(
    findVariantForSelection(sonyWh1000Xm5Variants, {
      Style: "Con Custodia Rigida",
    }),
    null
  );
});

test("i selector iPhone conservano combinazioni ed exact ASIN", () => {
  const dimensions = getVariantDimensions(iphoneVariants);
  const steps = getVariantSelectorSteps(iphoneVariants, dimensions, {
    Size: "256 GB",
  });

  assert.deepEqual(
    steps.map(({ dimension, values }) => ({ dimension, values })),
    [
      { dimension: "Size", values: ["256 GB", "512 GB", "1 TB"] },
      { dimension: "Color", values: ["Argento", "Blu profondo"] },
    ]
  );
  assert.equal(
    getVariantCandidates(iphoneVariants, {
      Size: "512 GB",
      Color: "Argento",
    }).length,
    0
  );
  assert.equal(
    findVariantForSelection(iphoneVariants, {
      Size: "512 GB",
    })?.asin,
    "IPHONE-512-BLUE"
  );
});

test("il conteggio usa varianti rilevate senza dichiararne la disponibilità", () => {
  assert.equal(getDetectedVariantCountLabel(1), "1 variante rilevata");
  assert.equal(getDetectedVariantCountLabel(5), "5 varianti rilevate");
});
