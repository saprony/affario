import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialVariantSelection,
  findVariantForSelection,
  getAvailableVariantAttributeValues,
  getDisplayFamilyTitle,
  getVariantDimensionLabel,
  getVariantDimensions,
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

test("presenta Style come configurazione senza duplicarlo come colore", () => {
  const dimensions = getVariantDimensions(matrixVariants);

  assert.deepEqual(dimensions, ["Style"]);
  assert.equal(getVariantDimensionLabel(dimensions[0]), "Configurazione");
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
  assert.equal(getVariantDimensionLabel(dimensions[0]), "Capacità");
  assert.equal(getVariantDimensionLabel(dimensions[1]), "Colore");
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
  const dimensions = getVariantDimensions(iphoneVariants);

  assert.equal(
    findVariantForSelection(iphoneVariants, dimensions, { Size: "256 GB" }),
    null
  );
  assert.equal(
    findVariantForSelection(iphoneVariants, dimensions, {
      Size: "256 GB",
      Color: "Blu profondo",
    })?.asin,
    "IPHONE-256-BLUE"
  );
});
