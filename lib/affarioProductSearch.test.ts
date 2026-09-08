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
  KEEPA_HTTP_TIMEOUT_MS,
  KeepaClientError,
  type KeepaProductSummary,
} from "../services/keepaClient";
import type {
  DistributedLease,
  DistributedLeaseClaimResult,
} from "../services/distributedLease";
import {
  createCachedProductSearchProvider,
  createProductSearchQueryHash,
  normalizeProductSearchCacheQuery,
  ProductSearchQueryCacheError,
  PRODUCT_SEARCH_QUERY_CACHE_LEASE_SECONDS,
  PRODUCT_SEARCH_QUERY_CACHE_TTL_MS,
} from "../services/productSearchQueryCache";
import {
  createProductSearchQueryCacheStore,
  PRODUCT_SEARCH_CACHE_PAYLOAD_VERSION,
  type ProductSearchCachedCandidate,
} from "../services/productSearchQueryCacheStore";
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

function validCachedCandidate(
  overrides: Partial<AffarioExternalProductCandidate> = {}
): AffarioExternalProductCandidate {
  return {
    asin: "B000000001",
    title: "Example Phone",
    brand: "Example",
    model: "EX1",
    imageUrl: null,
    parentAsin: null,
    attributes: {},
    categories: [],
    variants: [{ asin: "B000000001", attributes: {} }],
    ...overrides,
  };
}

function validStoredCandidate(): ProductSearchCachedCandidate {
  const candidate = validCachedCandidate();

  return {
    asin: candidate.asin,
    title: candidate.title,
    brand: candidate.brand,
    model: candidate.model,
    imageUrl: candidate.imageUrl,
    parentAsin: candidate.parentAsin,
    attributes: candidate.attributes,
    variants: candidate.variants,
  };
}

function createDeferred() {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

function createCachedProviderHarness(input?: {
  cachedCandidates?: readonly AffarioExternalProductCandidate[] | null;
  cacheReadError?: boolean;
  cacheWriteError?: boolean;
  leaseResult?: DistributedLeaseClaimResult;
  providerCandidates?: readonly AffarioExternalProductCandidate[];
  providerError?: unknown;
  waitBeforeContentionReread?: () => Promise<void>;
}) {
  let cachedCandidates = input?.cachedCandidates ?? null;
  let cacheReads = 0;
  let cacheSaves = 0;
  let providerCalls = 0;
  let releaseCalls = 0;
  let latestSave:
    | {
        queryHash: string;
        candidates: readonly AffarioExternalProductCandidate[];
        fetchedAt: Date;
        expiresAt: Date;
      }
    | undefined;
  let claimInput:
    | {
        resourceType: string;
        resourceKey: string;
        leaseSeconds: number;
      }
    | undefined;
  const lease: DistributedLease = {
    resourceType: "keepa_product_search",
    resourceKeyHash: "a".repeat(64),
    ownerToken: "a".repeat(43),
  };
  const search = createCachedProductSearchProvider({
    async loadFresh() {
      cacheReads += 1;

      if (input?.cacheReadError) {
        throw new Error("cache read failed");
      }

      return cachedCandidates === null ? null : { candidates: cachedCandidates };
    },
    async save(saveInput) {
      cacheSaves += 1;
      latestSave = saveInput;

      if (input?.cacheWriteError) {
        throw new Error("cache write failed");
      }

      cachedCandidates = saveInput.candidates;
    },
    async searchProvider(query) {
      providerCalls += 1;

      if (input?.providerError !== undefined) {
        throw input.providerError;
      }

      return providerResult(query, input?.providerCandidates ?? []);
    },
    async tryClaim(receivedInput) {
      claimInput = receivedInput;
      return input?.leaseResult ?? { status: "acquired", lease };
    },
    async release() {
      releaseCalls += 1;
      return true;
    },
    waitBeforeContentionReread:
      input?.waitBeforeContentionReread ?? (async () => {}),
    clock: () => new Date("2026-09-08T12:00:00.000Z"),
  });

  return {
    search,
    get cacheReads() {
      return cacheReads;
    },
    get cacheSaves() {
      return cacheSaves;
    },
    get providerCalls() {
      return providerCalls;
    },
    get releaseCalls() {
      return releaseCalls;
    },
    get claimInput() {
      return claimInput;
    },
    get cachedCandidates() {
      return cachedCandidates;
    },
    get latestSave() {
      return latestSave;
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

test("cache query normalizza NFKC, case e whitespace senza rimuovere punteggiatura", () => {
  const equivalentQueries = [
    "iphone",
    " iPhone ",
    "IPHONE",
    "\uFF49\uFF30\uFF48\uFF4F\uFF2E\uFF45",
  ];
  const hashes = equivalentQueries.map(createProductSearchQueryHash);

  assert.equal(normalizeProductSearchCacheQuery("  iPhone\t\n"), "iphone");
  assert.equal(new Set(hashes).size, 1);
  assert.match(hashes[0], /^[a-f0-9]{64}$/u);
  assert.notEqual(
    createProductSearchQueryHash("iphone-17"),
    createProductSearchQueryHash("iphone 17")
  );
});

test("store persiste soltanto hash e DTO candidati, mai la query raw", async () => {
  const queryHash = createProductSearchQueryHash("Query Privata iPhone");
  let writtenRow: unknown;
  const store = createProductSearchQueryCacheStore({
    async readRow() {
      return null;
    },
    async writeRow(row) {
      writtenRow = row;
    },
  });

  await store.save({
    queryHash,
    candidates: [validCachedCandidate()],
    fetchedAt: new Date("2026-09-08T12:00:00.000Z"),
    expiresAt: new Date("2026-09-09T12:00:00.000Z"),
  });

  const row = writtenRow as Record<string, unknown>;
  assert.deepEqual(Object.keys(row).sort(), [
    "candidates",
    "expires_at",
    "fetched_at",
    "payload_version",
    "query_hash",
    "result_count",
  ]);
  assert.equal(row.query_hash, queryHash);
  assert.equal(row.payload_version, PRODUCT_SEARCH_CACHE_PAYLOAD_VERSION);
  assert.equal(row.result_count, 1);
  assert.equal(
    "categories" in (row.candidates as Record<string, unknown>[])[0],
    false
  );
  assert.equal("query" in row, false);
  assert.equal("normalized_query" in row, false);
  assert.equal("raw_query" in row, false);
});

test("store considera una fresh empty array un cache hit valido", async () => {
  const queryHash = createProductSearchQueryHash("iphone");
  const store = createProductSearchQueryCacheStore({
    async readRow() {
      return {
        query_hash: queryHash,
        payload_version: PRODUCT_SEARCH_CACHE_PAYLOAD_VERSION,
        candidates: [],
        result_count: 0,
        fetched_at: "2026-09-08T12:00:00.000Z",
        expires_at: "2026-09-09T12:00:00.000Z",
      };
    },
    async writeRow() {},
  });

  const cached = await store.loadFresh(
    queryHash,
    new Date("2026-09-08T13:00:00.000Z")
  );

  assert.deepEqual(cached?.candidates, []);
});

test("store non usa payload corrotti o versioni sconosciute", async () => {
  const queryHash = createProductSearchQueryHash("iphone");
  const baseRow = {
    query_hash: queryHash,
    payload_version: PRODUCT_SEARCH_CACHE_PAYLOAD_VERSION,
    candidates: [validStoredCandidate()],
    result_count: 1,
    fetched_at: "2026-09-08T12:00:00.000Z",
    expires_at: "2026-09-09T12:00:00.000Z",
  };

  for (const row of [
    { ...baseRow, candidates: { invalid: true } },
    { ...baseRow, candidates: [{ rawKeepaObject: true }] },
    { ...baseRow, result_count: 2 },
    { ...baseRow, payload_version: 2 },
  ]) {
    const store = createProductSearchQueryCacheStore({
      async readRow() {
        return row;
      },
      async writeRow() {},
    });

    assert.equal(
      await store.loadFresh(
        queryHash,
        new Date("2026-09-08T13:00:00.000Z")
      ),
      null
    );
  }
});

test("cache stale viene rinfrescata dal provider con TTL esatto di 24 ore", async () => {
  const queryHash = createProductSearchQueryHash("iphone");
  const cachedCandidate = validStoredCandidate();
  const liveCandidate = validCachedCandidate();
  let saveInput:
    | {
        fetchedAt: Date;
        expiresAt: Date;
      }
    | undefined;
  let providerCalls = 0;
  const store = createProductSearchQueryCacheStore({
    async readRow() {
      return {
        query_hash: queryHash,
        payload_version: PRODUCT_SEARCH_CACHE_PAYLOAD_VERSION,
        candidates: [cachedCandidate],
        result_count: 1,
        fetched_at: "2026-09-07T11:59:59.000Z",
        expires_at: "2026-09-08T11:59:59.000Z",
      };
    },
    async writeRow(row) {
      saveInput = {
        fetchedAt: new Date(row.fetched_at),
        expiresAt: new Date(row.expires_at),
      };
    },
  });
  const search = createCachedProductSearchProvider({
    loadFresh: store.loadFresh,
    save: store.save,
    async searchProvider(query) {
      providerCalls += 1;
      return providerResult(query, [liveCandidate]);
    },
    async tryClaim() {
      return {
        status: "acquired",
        lease: {
          resourceType: "keepa_product_search",
          resourceKeyHash: "a".repeat(64),
          ownerToken: "a".repeat(43),
        },
      };
    },
    async release() {
      return true;
    },
    async waitBeforeContentionReread() {},
    clock: () => new Date("2026-09-08T12:00:00.000Z"),
  });

  await search("iphone");

  assert.equal(providerCalls, 1);
  assert.equal(
    saveInput!.expiresAt.getTime() - saveInput!.fetchedAt.getTime(),
    PRODUCT_SEARCH_QUERY_CACHE_TTL_MS
  );
  assert.equal(PRODUCT_SEARCH_QUERY_CACHE_TTL_MS, 86_400_000);
  assert.ok(
    PRODUCT_SEARCH_QUERY_CACHE_LEASE_SECONDS * 1_000 >
      KEEPA_HTTP_TIMEOUT_MS
  );
});

test("fresh cache hit evita provider e usa lease zero volte", async () => {
  const cachedCandidate = validCachedCandidate();
  const harness = createCachedProviderHarness({
    cachedCandidates: [cachedCandidate],
  });

  const result = await harness.search("iphone");

  assert.equal(harness.cacheReads, 1);
  assert.equal(harness.providerCalls, 0);
  assert.equal(harness.cacheSaves, 0);
  assert.equal(harness.claimInput, undefined);
  assert.equal(result.serverReport.externalRequests, 0);
  assert.equal(result.serverReport.tokensConsumed, 0);
  assert.deepEqual(result.data.candidates, [cachedCandidate]);
});

test("fresh cache vuota evita comunque il provider", async () => {
  const harness = createCachedProviderHarness({ cachedCandidates: [] });
  const result = await harness.search("nessun risultato");

  assert.equal(harness.providerCalls, 0);
  assert.equal(harness.cacheSaves, 0);
  assert.deepEqual(result.data.candidates, []);
});

test("cache miss esegue una provider search e salva anche zero risultati", async () => {
  const harness = createCachedProviderHarness({ providerCandidates: [] });
  const result = await harness.search("iphone");

  assert.equal(harness.providerCalls, 1);
  assert.equal(harness.cacheSaves, 1);
  assert.deepEqual(harness.cachedCandidates, []);
  assert.equal(result.serverReport.externalRequests, 1);
  assert.equal(
    harness.latestSave!.expiresAt.getTime() -
      harness.latestSave!.fetchedAt.getTime(),
    PRODUCT_SEARCH_QUERY_CACHE_TTL_MS
  );
  assert.equal(
    harness.claimInput?.resourceKey,
    `search:${createProductSearchQueryHash("iphone")}`
  );
  assert.equal(
    harness.claimInput?.leaseSeconds,
    PRODUCT_SEARCH_QUERY_CACHE_LEASE_SECONDS
  );
});

test("errore provider non viene mai cacheato", async () => {
  const providerError = new KeepaClientError(
    "provider unavailable",
    "NETWORK_ERROR"
  );
  const harness = createCachedProviderHarness({ providerError });

  await assert.rejects(
    harness.search("iphone"),
    (error) => error === providerError
  );
  assert.equal(harness.providerCalls, 1);
  assert.equal(harness.cacheSaves, 0);
  assert.equal(harness.releaseCalls, 1);
});

test("richieste concorrenti uguali producono al massimo una provider search", async () => {
  const providerStarted = createDeferred();
  const providerMayFinish = createDeferred();
  const cacheReady = createDeferred();
  const cachedCandidate = validCachedCandidate();
  let cache: readonly AffarioExternalProductCandidate[] | null = null;
  let leaseHeld = false;
  let providerCalls = 0;
  const search = createCachedProductSearchProvider({
    async loadFresh() {
      return cache === null ? null : { candidates: cache };
    },
    async save(input) {
      cache = input.candidates;
      cacheReady.resolve();
    },
    async searchProvider(query) {
      providerCalls += 1;
      providerStarted.resolve();
      await providerMayFinish.promise;
      return providerResult(query, [cachedCandidate]);
    },
    async tryClaim(): Promise<DistributedLeaseClaimResult> {
      if (leaseHeld) {
        return { status: "contended" };
      }

      leaseHeld = true;
      return {
        status: "acquired",
        lease: {
          resourceType: "keepa_product_search",
          resourceKeyHash: "a".repeat(64),
          ownerToken: "a".repeat(43),
        },
      };
    },
    async release() {
      leaseHeld = false;
      return true;
    },
    waitBeforeContentionReread: () => cacheReady.promise,
    clock: () => new Date("2026-09-08T12:00:00.000Z"),
  });

  const first = search("iphone");
  await providerStarted.promise;
  const second = search(" iPhone ");
  await new Promise<void>((resolve) => setImmediate(resolve));
  providerMayFinish.resolve();

  const results = await Promise.all([first, second]);
  assert.equal(providerCalls, 1);
  assert.deepEqual(
    results.map(({ serverReport }) => serverReport.externalRequests),
    [1, 0]
  );
});

test("lease loser senza cache non chiama mai il provider", async () => {
  const harness = createCachedProviderHarness({
    leaseResult: { status: "contended" },
  });

  await assert.rejects(
    harness.search("iphone"),
    (error: unknown) =>
      error instanceof ProductSearchQueryCacheError &&
      error.code === "LEASE_CONTENDED" &&
      error.externalRequests === 0
  );
  assert.equal(harness.cacheReads, 2);
  assert.equal(harness.providerCalls, 0);
  assert.equal(harness.cacheSaves, 0);
});

test("cache hit provider-only conserva source pubblico KEEPA", async () => {
  const cachedProvider = createCachedProviderHarness({
    cachedCandidates: [
      candidate({
        asin: "B0CACHE001",
        title: "Apple iPhone 16",
        brand: "Apple",
        model: "IPHONE16",
      }),
    ],
  });
  const search = createAffarioProductSearchWithFallback({
    searchLocal: async (query) => localResult(query, []),
    searchProvider: cachedProvider.search,
  });

  const result = await search("iphone");

  assert.equal(result.data.source, "KEEPA");
  assert.equal(cachedProvider.providerCalls, 0);
  assert.equal(result.serverReport.externalRequests, 0);
});

test("cache hit unita al catalogo locale conserva merge e source HYBRID", async () => {
  const localIphone = family({
    familyId: "LOCAL-IPHONE-17",
    title: "Apple iPhone 17 Pro",
    brand: "Apple",
    model: "IPHONE17PRO",
    representativeAsin: "B0IPHONE17",
  });
  const cachedProvider = createCachedProviderHarness({
    cachedCandidates: [
      candidate({
        asin: "B0CACHE001",
        title: "Apple iPhone 16",
        brand: "Apple",
        model: "IPHONE16",
      }),
    ],
  });
  const search = createAffarioProductSearchWithFallback({
    searchLocal: async (query) => localResult(query, [localIphone]),
    searchProvider: cachedProvider.search,
  });

  const result = await search("iphone");

  assert.equal(result.data.source, "HYBRID");
  assert.deepEqual(result.data.families.map(({ title }) => title), [
    "Apple iPhone 17 Pro",
    "Apple iPhone 16",
  ]);
  assert.equal(cachedProvider.providerCalls, 0);
});

test("exact ASIN e strong identity locali non leggono la query cache", async () => {
  const iphone = family({
    familyId: "LOCAL-IPHONE-17",
    title: "Apple iPhone 17 Pro",
    brand: "Apple",
    model: "IPHONE17PRO",
    representativeAsin: "B0IPHONE01",
  });
  const sony = family({
    familyId: "LOCAL-SONY-XM5",
    title: "Sony WH-1000XM5 Cuffie Wireless",
    brand: "Sony",
    model: "WH1000XM5B.CE7",
    representativeAsin: "B09Y2MYL5C",
  });
  const cachedProvider = createCachedProviderHarness({ cachedCandidates: [] });
  const search = createAffarioProductSearchWithFallback({
    searchLocal: async (query) => {
      const prepared = prepareAffarioProductSearchQuery(query);
      return localResult(
        query,
        rankAffarioProductFamilies(prepared, [iphone, sony])
      );
    },
    searchProvider: cachedProvider.search,
  });

  await search("B0IPHONE01");
  const sonyResult = await search("Sony WH-1000XM5");

  assert.equal(cachedProvider.cacheReads, 0);
  assert.equal(cachedProvider.providerCalls, 0);
  assert.deepEqual(sonyResult.data.families.map(({ familyId }) => familyId), [
    "LOCAL-SONY-XM5",
  ]);
});

test("cache read failure degrada a local-only ma senza locale resta unavailable", async () => {
  const localIphone = family({
    familyId: "LOCAL-IPHONE-17",
    title: "Apple iPhone 17 Pro",
    brand: "Apple",
    model: "IPHONE17PRO",
    representativeAsin: "B0IPHONE01",
  });
  const localHarness = createCachedProviderHarness({ cacheReadError: true });
  const localSearch = createAffarioProductSearchWithFallback({
    searchLocal: async (query) => localResult(query, [localIphone]),
    searchProvider: localHarness.search,
  });
  const noLocalHarness = createCachedProviderHarness({ cacheReadError: true });
  const noLocalSearch = createAffarioProductSearchWithFallback({
    searchLocal: async (query) => localResult(query, []),
    searchProvider: noLocalHarness.search,
  });

  const localResponse = await localSearch("iphone");

  assert.equal(localResponse.data.source, "AFFARIO_CATALOG");
  assert.equal(localResponse.serverReport.externalRequests, 0);
  assert.equal(localHarness.providerCalls, 0);
  await assert.rejects(
    noLocalSearch("iphone"),
    (error: unknown) =>
      error instanceof ProductSearchQueryCacheError &&
      error.code === "CACHE_READ_FAILED"
  );
  assert.equal(noLocalHarness.providerCalls, 0);
});

test("provider failure e cache write failure applicano fallback conservativo", async () => {
  const localIphone = family({
    familyId: "LOCAL-IPHONE-17",
    title: "Apple iPhone 17 Pro",
    brand: "Apple",
    model: "IPHONE17PRO",
    representativeAsin: "B0IPHONE01",
  });
  const providerFailure = createCachedProviderHarness({
    providerError: new KeepaClientError(
      "provider unavailable",
      "NETWORK_ERROR"
    ),
  });
  const writeFailure = createCachedProviderHarness({
    cacheWriteError: true,
    providerCandidates: [validCachedCandidate()],
  });

  for (const harness of [providerFailure, writeFailure]) {
    const search = createAffarioProductSearchWithFallback({
      searchLocal: async (query) => localResult(query, [localIphone]),
      searchProvider: harness.search,
    });
    const result = await search("iphone");

    assert.equal(result.data.source, "AFFARIO_CATALOG");
    assert.equal(result.serverReport.externalRequests, 1);
  }

  const noLocalSearch = createAffarioProductSearchWithFallback({
    searchLocal: async (query) => localResult(query, []),
    searchProvider: writeFailure.search,
  });
  await assert.rejects(
    noLocalSearch("iphone"),
    (error: unknown) =>
      error instanceof ProductSearchQueryCacheError &&
      error.code === "CACHE_WRITE_FAILED"
  );
  assert.equal(writeFailure.releaseCalls, 0);
});

test("tutti i candidati cached vengono rivalutati prima del top 10", async () => {
  const cachedCandidates = Array.from({ length: 20 }, (_, index) =>
    candidate({
      asin: `B0CCH${String(index).padStart(5, "0")}`,
      title:
        index < 10
          ? `Unrelated device ${index}`
          : `Target cached product ${index}`,
      brand: index < 10 ? "Other" : "Target",
      model: `M${index}`,
      parentAsin: `CACHED-PARENT-${index}`,
    })
  );
  const cachedProvider = createCachedProviderHarness({ cachedCandidates });
  const search = createAffarioProductSearchWithFallback({
    searchLocal: async (query) => localResult(query, []),
    searchProvider: cachedProvider.search,
  });

  const result = await search("target");

  assert.equal(result.serverReport.providerCandidatesConsidered, 20);
  assert.equal(result.data.families.length, 10);
  assert.equal(
    result.data.families.every(({ title }) =>
      title.startsWith("Target cached")
    ),
    true
  );
  assert.equal(cachedProvider.providerCalls, 0);
});
