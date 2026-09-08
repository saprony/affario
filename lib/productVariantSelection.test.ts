import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialVariantSelection,
  findVariantForSelection,
  getAvailableVariantAttributeValues,
  getDetectedVariantCountLabel,
  getDisplayFamilyTitle,
  getVariantCandidates,
  getVariantDescription,
  getVariantDimensionLabel,
  getVariantDimensions,
  getVariantSelectorSteps,
  SEARCH_CARD_PRODUCT_TITLE_MAX_LENGTH,
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

const realmeGt8ProTitle =
  'realme GT 8 Pro, 16+512 GB, Ricarica 120W, 7000mAh, 50MP IMX906 OIS, Display 6,78" 2K 144Hz, Telephoto 200MP, Snapdragon 8850, Blu, Adattatore, Deco, Clip Incluso';

const realmeGt8ProVariants: readonly AffarioProductSearchVariant[] = [
  {
    asin: "B0FVXS42GF",
    attributes: {
      Color: "Blu",
      MemoryStorageCapacity: "512 GB",
      RamMemoryInstalledSize: "16 GB",
      Size: "16+512 Go",
    },
  },
  {
    asin: "B0FYLX6W9J",
    attributes: {
      Color: "Bianco",
      MemoryStorageCapacity: "512 GB",
      RamMemoryInstalledSize: "16 GB",
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

test("il titolo search corto resta invariato e il fallback è sicuro", () => {
  assert.equal(
    getDisplayFamilyTitle("Apple iPhone 17 Pro", iphoneVariants),
    "Apple iPhone 17 Pro"
  );
  assert.equal(getDisplayFamilyTitle("   ", []), "Prodotto rilevato");
});

test("il titolo search lungo viene abbreviato senza spezzare parole", () => {
  const rawTitle =
    "Prodotto estremamente lungo senza separatori con descrizione dettagliata destinata a occupare molte righe";
  const displayTitle = getDisplayFamilyTitle(rawTitle, []);
  const visibleTitle = displayTitle.slice(0, -1);

  assert.ok(displayTitle.length <= SEARCH_CARD_PRODUCT_TITLE_MAX_LENGTH);
  assert.ok(displayTitle.endsWith("…"));
  assert.equal(rawTitle.startsWith(visibleTitle), true);
  assert.equal(rawTitle[visibleTitle.length], " ");
});

test("la formattazione search non altera il titolo raw", () => {
  const family = { title: realmeGt8ProTitle };

  assert.equal(
    getDisplayFamilyTitle(family.title, realmeGt8ProVariants),
    "realme GT 8 Pro"
  );
  assert.equal(family.title, realmeGt8ProTitle);
});

test("compatta il titolo reale Sony mantenendo brand e modello", () => {
  const family = {
    title:
      "Sony WH-1000XM5 Custodia Rigida |Cuffie Wireless con Noise Cancelling, 30 ore di autonomia, ottimizzate per Alexa e Google Assistant, Bluetooth, Nero",
  };

  assert.equal(
    getDisplayFamilyTitle(family.title, sonyWh1000Xm5Variants),
    "Sony WH-1000XM5"
  );
  assert.equal(
    family.title,
    "Sony WH-1000XM5 Custodia Rigida |Cuffie Wireless con Noise Cancelling, 30 ore di autonomia, ottimizzate per Alexa e Google Assistant, Bluetooth, Nero"
  );
});

test("rimuove un valore Style rappresentativo senza hardcode di prodotto", () => {
  const variants: readonly AffarioProductSearchVariant[] = [
    {
      asin: "GENERIC-PREMIUM",
      attributes: { Style: "Con Edizione Premium" },
    },
    {
      asin: "GENERIC-STANDARD",
      attributes: { Style: "Con Edizione Standard" },
    },
  ];

  assert.equal(
    getDisplayFamilyTitle("Acme SoundPro Edizione Premium", variants),
    "Acme SoundPro"
  );
});

test("non rimuove testo soltanto simile a un valore variante", () => {
  const variants: readonly AffarioProductSearchVariant[] = [
    {
      asin: "GENERIC-PREMIUM",
      attributes: { Style: "Con Edizione Premium" },
    },
    {
      asin: "GENERIC-STANDARD",
      attributes: { Style: "Con Edizione Standard" },
    },
  ];

  assert.equal(
    getDisplayFamilyTitle("Acme SoundPro Edizione speciale", variants),
    "Acme SoundPro Edizione speciale"
  );
});

test("compatta il titolo reale realme mantenendo brand e modello", () => {
  assert.equal(
    getDisplayFamilyTitle(realmeGt8ProTitle, realmeGt8ProVariants),
    "realme GT 8 Pro"
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

test("mappa gli attributi tecnici realme senza esporre label raw", () => {
  const labels = [
    getVariantDimensionLabel(
      "MemoryStorageCapacity",
      realmeGt8ProVariants
    ),
    getVariantDimensionLabel(
      "RamMemoryInstalledSize",
      realmeGt8ProVariants
    ),
  ];

  assert.deepEqual(labels, ["Memoria", "RAM"]);
  assert.equal(labels.includes("MemoryStorageCapacity"), false);
  assert.equal(labels.includes("RamMemoryInstalledSize"), false);
});

test("Size ambiguo non viene presentato come Capacità", () => {
  assert.equal(
    getVariantDimensionLabel("Size", realmeGt8ProVariants),
    "Taglia"
  );
});

test("realme evita selector ridondanti e conserva l'exact ASIN", () => {
  const dimensions = getVariantDimensions(realmeGt8ProVariants);

  assert.deepEqual(
    getVariantSelectorSteps(realmeGt8ProVariants, dimensions, {}).map(
      ({ dimension, values }) => ({ dimension, values })
    ),
    [{ dimension: "Color", values: ["Bianco", "Blu"] }]
  );
  assert.equal(
    findVariantForSelection(realmeGt8ProVariants, { Color: "Blu" })?.asin,
    "B0FVXS42GF"
  );
  assert.equal(
    getVariantDescription(realmeGt8ProVariants[0]),
    "Blu · Memoria: 512 GB · RAM: 16 GB"
  );
  assert.equal(
    getVariantDescription(realmeGt8ProVariants[0]).includes("16+512 Go"),
    false
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
  assert.equal(getDetectedVariantCountLabel(9), "9 varianti rilevate");
});
