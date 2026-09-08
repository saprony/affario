import assert from "node:assert/strict";
import test from "node:test";

import {
  groupAffarioExternalProductCandidates,
  hasCompleteAffarioIdentityMatch,
  prepareAffarioProductSearchQuery,
  rankAffarioExternalProductFamilies,
  rankAffarioProductFamilies,
  splitAffarioProductFamilyByConsumerStyle,
} from "./affarioProductSearch";
import {
  createAffarioProductSearchWithFallback,
} from "../services/affarioProductSearchWithFallback";
import {
  searchKeepaProductCandidates,
  type KeepaProductSearchProviderResult,
} from "../services/providers/keepaProductSearchProvider";
import {
  KeepaClientError,
  type KeepaProductSummary,
} from "../services/keepaClient";
import type {
  AffarioExternalProductCandidate,
  AffarioProductSearchFamily,
  AffarioProductSearchResult,
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

function family({
  familyId,
  title,
  brand,
  model,
  representativeAsin,
  parentAsin = null,
  variants,
}: {
  familyId: string;
  title: string;
  brand: string;
  model: string;
  representativeAsin: string;
  parentAsin?: string | null;
  variants?: readonly AffarioProductSearchVariant[];
}): AffarioProductSearchFamily {
  return {
    familyId,
    title,
    brand,
    model,
    imageUrl: null,
    representativeAsin,
    parentAsin,
    variants: variants ?? [{ asin: representativeAsin, attributes: {} }],
  };
}

function localResult(
  query: string,
  families: readonly AffarioProductSearchFamily[]
): AffarioProductSearchResult {
  const preparedQuery = prepareAffarioProductSearchQuery(query);

  return {
    query: preparedQuery.normalizedQuery,
    source: "AFFARIO_CATALOG",
    status: families.length > 0 ? "MATCHES_FOUND" : "NO_LOCAL_MATCHES",
    results: families,
  };
}

function providerResult(
  query: string,
  candidates: readonly AffarioExternalProductCandidate[]
): KeepaProductSearchProviderResult {
  return {
    data: {
      query: prepareAffarioProductSearchQuery(query).normalizedQuery,
      source: "EXTERNAL_PROVIDER",
      candidates,
    },
    serverReport: {
      externalRequests: 1,
      providerCandidatesReceived: candidates.length,
      tokensConsumed: 10,
      tokensRemaining: 1_000,
    },
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

test("identity relevance esclude una citazione descrittiva quando esiste un match Sony reale", () => {
  const sonyVariants: readonly AffarioProductSearchVariant[] = [
    { asin: "B09Y2LL45F", attributes: { Style: "Con Custodia Rigida", Color: "Argento" } },
    { asin: "B09Y2MYL5C", attributes: { Style: "Con Custodia Rigida", Color: "Nero" } },
    { asin: "B0BXM22X99", attributes: { Style: "Con Custodia Rigida", Color: "BLU NOTTE" } },
    { asin: "B0DBLP647C", attributes: { Style: "Con Custodia Rigida", Color: "Rosa fumè" } },
    { asin: "B0F38PL24W", attributes: { Style: "Con Custodia Morbida", Color: "Nero" } },
  ];
  const sony = family({
    familyId: "B0FG8TC6HL",
    title: "Sony WH-1000XM5 Custodia Rigida | Cuffie Wireless Over-Ear",
    brand: "Sony",
    model: "WH1000XM5B.CE7",
    representativeAsin: "B09Y2MYL5C",
    parentAsin: "B0FG8TC6HL",
    variants: sonyVariants,
  });
  const ultWear = family({
    familyId: "B0CZY6Q3XK",
    title:
      "Sony ULT WEAR – Cuffie wireless con lo stesso processore delle WH-1000XM5",
    brand: "Sony",
    model: "WHULT900NB.CE7",
    representativeAsin: "B0CX1TJXKV",
    parentAsin: "B0CZY6Q3XK",
  });
  const preparedQuery = prepareAffarioProductSearchQuery(
    "Sony WH-1000XM5"
  );
  const ranked = rankAffarioProductFamilies(preparedQuery, [sony, ultWear]);

  assert.equal(hasCompleteAffarioIdentityMatch(preparedQuery, sony), true);
  assert.equal(
    hasCompleteAffarioIdentityMatch(preparedQuery, ultWear),
    false
  );
  assert.deepEqual(ranked.map(({ familyId }) => familyId), ["B0FG8TC6HL"]);
  assert.equal(ranked[0].variants.length, 5);
});

test("identity relevance riconosce modelli equivalenti senza separatori", () => {
  const preparedQuery = prepareAffarioProductSearchQuery(
    "Sony WH-1000XM5"
  );
  const compactModelFamily = family({
    familyId: "MODEL-FAMILY",
    title: "Sony cuffie premium, cancellazione del rumore",
    brand: "Sony",
    model: "WH1000XM5B.CE7",
    representativeAsin: "B0MODEL0001",
  });

  assert.equal(
    hasCompleteAffarioIdentityMatch(preparedQuery, compactModelFamily),
    true
  );
});

test("identity relevance conserva il recall quando manca un match identitario completo", () => {
  const descriptiveMatch = family({
    familyId: "DESCRIPTIVE-FAMILY",
    title: "Adattatore audio, compatibile wireless universale",
    brand: "Example",
    model: "Z1",
    representativeAsin: "B0RECALL001",
  });
  const ranked = rankAffarioExternalProductFamilies(
    prepareAffarioProductSearchQuery("wireless"),
    [descriptiveMatch]
  );

  assert.deepEqual(ranked.map(({ familyId }) => familyId), [
    "DESCRIPTIVE-FAMILY",
  ]);
});

test("provider conserva tutti i venti Product Object della singola search", async () => {
  const products: KeepaProductSummary[] = Array.from(
    { length: 20 },
    (_, index) => ({
      asin: `B${String(index).padStart(9, "0")}`,
      domainId: 8,
      title: `Example product ${index}`,
      brand: "Example",
      model: `M${index}`,
    })
  );
  let receivedQuery = "";
  let receivedContext = "";
  const result = await searchKeepaProductCandidates(
    "  Example  ",
    async (query, options) => {
      receivedQuery = query;
      receivedContext = options?.context ?? "";

      return {
        products,
        usage: {
          tokensConsumed: 10,
          tokensLeft: 990,
          refillIn: 1_000,
          refillRate: 20,
          tokenFlowReduction: 0,
          processingTimeInMs: 50,
        },
      };
    }
  );

  assert.equal(receivedQuery, "example");
  assert.equal(receivedContext, "interactive");
  assert.equal(result.serverReport.providerCandidatesReceived, 20);
  assert.equal(result.data.candidates.length, 20);
});

test("orchestrator exact ASIN locale preserva nove varianti e non chiama il provider", async () => {
  const iphoneVariants = Array.from({ length: 9 }, (_, index) => ({
    asin: `B0IPHONE0${index + 1}`,
    attributes: { Color: `Colore ${index + 1}` },
  }));
  const iphone = family({
    familyId: "IPHONE-PARENT",
    title: "Apple iPhone 17 Pro",
    brand: "Apple",
    model: "IPHONE17PRO",
    representativeAsin: iphoneVariants[0].asin,
    parentAsin: "IPHONE-PARENT",
    variants: iphoneVariants,
  });
  let providerCalls = 0;
  const search = createAffarioProductSearchWithFallback({
    searchLocal: async (query) =>
      localResult(
        query,
        rankAffarioProductFamilies(
          prepareAffarioProductSearchQuery(query),
          [iphone]
        )
      ),
    searchProvider: async () => {
      providerCalls += 1;
      return providerResult("iphone", []);
    },
  });
  const result = await search(iphoneVariants[4].asin);

  assert.equal(providerCalls, 0);
  assert.equal(result.data.source, "AFFARIO_CATALOG");
  assert.equal(result.data.families[0].representativeAsin, iphoneVariants[4].asin);
  assert.equal(result.data.families[0].variants.length, 9);
});

test("orchestrator evita l'espansione per un forte modello locale e preserva Sony", async () => {
  const sonyVariants: readonly AffarioProductSearchVariant[] = [
    { asin: "B09Y2LL45F", attributes: { Style: "Con Custodia Rigida", Color: "Argento" } },
    { asin: "B09Y2MYL5C", attributes: { Style: "Con Custodia Rigida", Color: "Nero" } },
    { asin: "B0BXM22X99", attributes: { Style: "Con Custodia Rigida", Color: "BLU NOTTE" } },
    { asin: "B0DBLP647C", attributes: { Style: "Con Custodia Rigida", Color: "Rosa fumè" } },
    { asin: "B0F38PL24W", attributes: { Style: "Con Custodia Morbida", Color: "Nero" } },
  ];
  const sony = family({
    familyId: "B0FG8TC6HL",
    title: "Sony WH-1000XM5 Custodia Rigida | Cuffie Wireless Over-Ear",
    brand: "Sony",
    model: "WH1000XM5B.CE7",
    representativeAsin: "B09Y2MYL5C",
    parentAsin: "B0FG8TC6HL",
    variants: sonyVariants,
  });
  const ultWear = family({
    familyId: "B0CZY6Q3XK",
    title: "Sony ULT WEAR – stesso processore delle WH-1000XM5",
    brand: "Sony",
    model: "WHULT900NB.CE7",
    representativeAsin: "B0CX1TJXKV",
  });
  let providerCalls = 0;
  const search = createAffarioProductSearchWithFallback({
    searchLocal: async (query) =>
      localResult(
        query,
        rankAffarioProductFamilies(
          prepareAffarioProductSearchQuery(query),
          [sony, ultWear]
        )
      ),
    searchProvider: async () => {
      providerCalls += 1;
      return providerResult("Sony WH-1000XM5", []);
    },
  });
  const result = await search("Sony WH-1000XM5");

  assert.equal(providerCalls, 0);
  assert.equal(result.data.source, "AFFARIO_CATALOG");
  assert.deepEqual(result.data.families.map(({ familyId }) => familyId), [
    "B0FG8TC6HL",
  ]);
  assert.equal(result.data.families[0].variants.length, 5);
});

test("orchestrator espande iphone, deduplica il locale e applica dieci solo alla fine", async () => {
  const iphoneVariants = Array.from({ length: 9 }, (_, index) => ({
    asin: `B0IPHONE0${index + 1}`,
    attributes: { Color: `Colore ${index + 1}` },
  }));
  const localIphone = family({
    familyId: "IPHONE-PARENT",
    title: "Apple iPhone 17 Pro",
    brand: "Apple",
    model: "IPHONE17PRO",
    representativeAsin: iphoneVariants[0].asin,
    parentAsin: "IPHONE-PARENT",
    variants: iphoneVariants,
  });
  const candidates = [
    candidate({
      asin: iphoneVariants[0].asin,
      title: "Provider duplicate iPhone",
      brand: "Apple",
      model: "IPHONE17PRO",
      parentAsin: "IPHONE-PARENT",
    }),
    ...Array.from({ length: 12 }, (_, index) =>
      candidate({
        asin: `B0IPHN${String(index).padStart(4, "0")}`,
        title: `Apple iPhone ${index + 1}`,
        brand: "Apple",
        model: `IPHONE${index + 1}`,
        parentAsin: `IPHONE-NEW-${index + 1}`,
      })
    ),
  ];
  let providerCalls = 0;
  const search = createAffarioProductSearchWithFallback({
    searchLocal: async (query) => localResult(query, [localIphone]),
    searchProvider: async (query) => {
      providerCalls += 1;
      return providerResult(query, candidates);
    },
  });
  const result = await search("iphone");
  const returnedLocal = result.data.families.filter(
    ({ familyId }) => familyId === localIphone.familyId
  );

  assert.equal(providerCalls, 1);
  assert.equal(result.serverReport.providerCandidatesConsidered, 13);
  assert.equal(result.data.source, "HYBRID");
  assert.equal(result.data.families.length, 10);
  assert.equal(returnedLocal.length, 1);
  assert.equal(returnedLocal[0].variants.length, 9);
});

test("orchestrator realme deduplica per familyId e ASIN overlap con precedenza locale", async () => {
  const localRealme = family({
    familyId: "B0H8YYK6JP",
    title: "realme GT 8 Pro locale",
    brand: "realme",
    model: "RMX5210",
    representativeAsin: "B0FVXS42GF",
    parentAsin: "B0H8YYK6JP",
    variants: [
      { asin: "B0FVXS42GF", attributes: { Color: "Blu" } },
      { asin: "B0FYLX6W9J", attributes: { Color: "Bianco" } },
    ],
  });
  const candidates = [
    candidate({
      asin: "B0DUPFAM01",
      title: "realme GT 8 Pro provider familyId",
      brand: "realme",
      model: "RMX5210",
      parentAsin: localRealme.familyId,
    }),
    candidate({
      asin: "B0DUPASIN1",
      title: "realme GT 8 Pro provider ASIN",
      brand: "realme",
      model: "RMX5210",
      parentAsin: "OTHER-PARENT",
      variants: [{ asin: "B0FVXS42GF", attributes: { Color: "Blu" } }],
    }),
    candidate({
      asin: "B0REALMEC71",
      title: "realme C71 Smartphone",
      brand: "realme",
      model: "C71",
      parentAsin: "REALME-C71-PARENT",
    }),
  ];
  const search = createAffarioProductSearchWithFallback({
    searchLocal: async (query) => localResult(query, [localRealme]),
    searchProvider: async (query) => providerResult(query, candidates),
  });
  const result = await search("realme");

  assert.equal(result.data.source, "HYBRID");
  assert.deepEqual(result.data.families.map(({ title }) => title), [
    "realme GT 8 Pro locale",
    "realme C71 Smartphone",
  ]);
  assert.equal(result.data.families[0].variants.length, 2);
});

test("orchestrator usa source catalogo se il provider aggiunge solo duplicati", async () => {
  const localIphone = family({
    familyId: "IPHONE-PARENT",
    title: "Apple iPhone 17 Pro",
    brand: "Apple",
    model: "IPHONE17PRO",
    representativeAsin: "B0IPHONE01",
    parentAsin: "IPHONE-PARENT",
  });
  const search = createAffarioProductSearchWithFallback({
    searchLocal: async (query) => localResult(query, [localIphone]),
    searchProvider: async (query) =>
      providerResult(query, [
        candidate({
          asin: "B0IPHDUP01",
          title: "Apple iPhone 17 Pro provider",
          brand: "Apple",
          model: "IPHONE17PRO",
          parentAsin: "IPHONE-PARENT",
        }),
      ]),
  });
  const result = await search("iphone");

  assert.equal(result.serverReport.externalRequests, 1);
  assert.equal(result.data.source, "AFFARIO_CATALOG");
  assert.deepEqual(result.data.families.map(({ familyId }) => familyId), [
    "IPHONE-PARENT",
  ]);
});

test("orchestrator valuta venti candidati e restituisce solo le dieci famiglie finali pertinenti", async () => {
  const candidates = Array.from({ length: 20 }, (_, index) =>
    candidate({
      asin: `B0CAND${String(index).padStart(4, "0")}`,
      title:
        index < 10
          ? `Unrelated device ${index}`
          : `Target product ${index}`,
      brand: index < 10 ? "Other" : "Target",
      model: `M${index}`,
      parentAsin: `CANDIDATE-PARENT-${index}`,
    })
  );
  const search = createAffarioProductSearchWithFallback({
    searchLocal: async (query) => localResult(query, []),
    searchProvider: async (query) => providerResult(query, candidates),
  });
  const result = await search("target");

  assert.equal(result.data.source, "KEEPA");
  assert.equal(result.serverReport.providerCandidatesConsidered, 20);
  assert.equal(result.data.families.length, 10);
  assert.equal(
    result.data.families.every(({ title }) => title.startsWith("Target")),
    true
  );
});

test("orchestrator degrada ai risultati locali se il provider fallisce", async () => {
  const localIphone = family({
    familyId: "IPHONE-PARENT",
    title: "Apple iPhone 17 Pro",
    brand: "Apple",
    model: "IPHONE17PRO",
    representativeAsin: "B0IPHONE01",
  });
  const search = createAffarioProductSearchWithFallback({
    searchLocal: async (query) => localResult(query, [localIphone]),
    searchProvider: async () => {
      throw new KeepaClientError("provider unavailable", "NETWORK_ERROR");
    },
  });
  const result = await search("iphone");

  assert.equal(result.data.source, "AFFARIO_CATALOG");
  assert.equal(result.data.status, "MATCHES_FOUND");
  assert.equal(result.serverReport.externalRequests, 1);
});

test("orchestrator propaga l'indisponibilita provider quando il locale e vuoto", async () => {
  const providerError = new KeepaClientError(
    "provider unavailable",
    "NETWORK_ERROR"
  );
  const search = createAffarioProductSearchWithFallback({
    searchLocal: async (query) => localResult(query, []),
    searchProvider: async () => {
      throw providerError;
    },
  });

  await assert.rejects(search("iphone"), (error) => error === providerError);
});

test("orchestrator espande sempre le query testuali generiche", async () => {
  const cases = [
    { query: "sony", title: "Sony Wireless Headphones" },
    { query: "samsung galaxy", title: "Samsung Galaxy Smartphone" },
    { query: "iphone 17", title: "Apple iPhone 17" },
  ];

  for (const [index, testCase] of cases.entries()) {
    let providerCalls = 0;
    const search = createAffarioProductSearchWithFallback({
      searchLocal: async (query) => localResult(query, []),
      searchProvider: async (query) => {
        providerCalls += 1;
        return providerResult(query, [
          candidate({
            asin: `B0GENERIC${index}`,
            title: testCase.title,
            brand: testCase.title.split(" ")[0],
            model: `GENERIC${index}`,
            parentAsin: `GENERIC-PARENT-${index}`,
          }),
        ]);
      },
    });

    const result = await search(testCase.query);

    assert.equal(providerCalls, 1, testCase.query);
    assert.equal(result.serverReport.externalRequests, 1, testCase.query);
    assert.equal(result.data.source, "KEEPA", testCase.query);
  }
});

test("ranking combinato mantiene un ordine deterministico", () => {
  const families = [
    family({
      familyId: "SECOND",
      title: "Example Phone Second",
      brand: "Example",
      model: "P2",
      representativeAsin: "B0ORDER002",
    }),
    family({
      familyId: "FIRST",
      title: "Example Phone First",
      brand: "Example",
      model: "P1",
      representativeAsin: "B0ORDER001",
    }),
  ];
  const preparedQuery = prepareAffarioProductSearchQuery("example phone");
  const firstRun = rankAffarioExternalProductFamilies(
    preparedQuery,
    families,
    null
  );
  const secondRun = rankAffarioExternalProductFamilies(
    preparedQuery,
    families,
    null
  );

  assert.deepEqual(
    firstRun.map(({ familyId }) => familyId),
    secondRun.map(({ familyId }) => familyId)
  );
});
