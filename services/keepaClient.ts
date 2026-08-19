import "server-only";

const KEEPA_BASE_URL = "https://api.keepa.com/";
const KEEPA_PRODUCT_ENDPOINT = "product";
const AMAZON_ITALY_DOMAIN_ID = 8;
const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

export type KeepaImage = {
  l?: string;
  m?: string;
  variant?: string;
};

export type KeepaCategoryTreeEntry = {
  catId: number;
  name: string;
};

export type KeepaVariationAttribute = {
  dimension: string;
  value: string;
};

export type KeepaVariation = {
  asin: string;
  image?: string;
  attributes: readonly KeepaVariationAttribute[];
};

export type KeepaIntegerArray = readonly (number | null)[];

export type KeepaPriceExtreme = readonly [
  keepaTimeMinutes: number,
  value: number,
];

export type KeepaPriceExtremeArray = readonly (KeepaPriceExtreme | null)[];

export type KeepaCsvSeries = readonly number[];

export type KeepaCsv = readonly (KeepaCsvSeries | null)[];

export type KeepaRawProduct = Readonly<Record<string, unknown>>;

export type KeepaStatistics = {
  current?: KeepaIntegerArray;
  avg?: KeepaIntegerArray;
  avg30?: KeepaIntegerArray;
  avg90?: KeepaIntegerArray;
  avg180?: KeepaIntegerArray;
  avg365?: KeepaIntegerArray;
  atIntervalStart?: KeepaIntegerArray;
  min?: KeepaPriceExtremeArray;
  max?: KeepaPriceExtremeArray;
  minInInterval?: KeepaPriceExtremeArray;
  maxInInterval?: KeepaPriceExtremeArray;
  outOfStockPercentageInInterval?: KeepaIntegerArray;
  outOfStockPercentage30?: KeepaIntegerArray;
  outOfStockPercentage90?: KeepaIntegerArray;
  outOfStockPercentage180?: KeepaIntegerArray;
  outOfStockPercentage365?: KeepaIntegerArray;
  lastBuyBoxUpdate?: number;
  buyBoxSellerId?: string;
  buyBoxPrice?: number;
  buyBoxShipping?: number;
  buyBoxIsAmazon?: boolean;
  buyBoxIsFBA?: boolean;
  buyBoxIsPrimeEligible?: boolean;
  buyBoxIsPrimeExclusive?: boolean;
  buyBoxIsShippable?: boolean;
  buyBoxIsPreorder?: boolean;
  buyBoxIsBackorder?: boolean;
  buyBoxAvailabilityMessage?: string;
};

export type KeepaProductSummary = {
  asin: string;
  domainId: number;
  title: string;
  brand?: string;
  model?: string;
  images?: readonly KeepaImage[];
  color?: string;
  size?: string;
  rootCategory?: number;
  categories?: readonly number[];
  categoryTree?: readonly KeepaCategoryTreeEntry[];
  parentAsin?: string;
  variations?: readonly KeepaVariation[];
  csv?: KeepaCsv;
  stats?: KeepaStatistics;
};

export type KeepaUsage = {
  tokensConsumed: number;
  tokensLeft: number;
  refillIn: number;
  refillRate: number;
  processingTimeInMs: number;
};

export type KeepaProductResult = {
  product: KeepaProductSummary;
  rawProduct: KeepaRawProduct;
  usage: KeepaUsage;
};

export type KeepaClientErrorCode =
  | "MISSING_API_KEY"
  | "INVALID_ASIN"
  | "NETWORK_ERROR"
  | "KEEPA_HTTP_ERROR"
  | "OUT_OF_TOKENS"
  | "INVALID_RESPONSE"
  | "PRODUCT_NOT_FOUND";

export class KeepaClientError extends Error {
  constructor(
    message: string,
    public readonly code: KeepaClientErrorCode,
    public readonly httpStatus?: number
  ) {
    super(message);
    this.name = "KeepaClientError";
  }
}

function normalizeAsin(asin: string): string {
  if (typeof asin !== "string") {
    throw new KeepaClientError(
      "L'ASIN deve contenere 10 caratteri alfanumerici.",
      "INVALID_ASIN"
    );
  }

  const normalizedAsin = asin.trim().toUpperCase();

  if (!ASIN_PATTERN.test(normalizedAsin)) {
    throw new KeepaClientError(
      "L'ASIN deve contenere 10 caratteri alfanumerici.",
      "INVALID_ASIN"
    );
  }

  return normalizedAsin;
}

function getApiKey(): string {
  const apiKey = process.env.KEEPA_API_KEY?.trim();

  if (!apiKey) {
    throw new KeepaClientError(
      "Configurazione Keepa mancante.",
      "MISSING_API_KEY"
    );
  }

  return apiKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readInteger(
  payload: Record<string, unknown>,
  fieldName: keyof KeepaUsage,
  allowNegative = false
): number {
  const value = payload[fieldName];

  if (
    !Number.isSafeInteger(value) ||
    (!allowNegative && (value as number) < 0)
  ) {
    throw new KeepaClientError(
      "La risposta Keepa non contiene dati di utilizzo validi.",
      "INVALID_RESPONSE"
    );
  }

  return value as number;
}

function mapUsage(payload: Record<string, unknown>): KeepaUsage {
  return {
    tokensConsumed: readInteger(payload, "tokensConsumed"),
    tokensLeft: readInteger(payload, "tokensLeft", true),
    refillIn: readInteger(payload, "refillIn"),
    refillRate: readInteger(payload, "refillRate"),
    processingTimeInMs: readInteger(payload, "processingTimeInMs"),
  };
}

function readOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
}

function readOptionalCategoryId(value: unknown): number | undefined {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    return undefined;
  }

  return value as number;
}

function readOptionalInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) ? (value as number) : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function mapImages(value: unknown): KeepaImage[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const images = value.flatMap((entry): KeepaImage[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const largeFileName = readOptionalText(entry.l);
    const mediumFileName = readOptionalText(entry.m);

    if (!largeFileName && !mediumFileName) {
      return [];
    }

    const image: KeepaImage = {};
    const variant = readOptionalText(entry.variant);

    if (largeFileName) {
      image.l = largeFileName;
    }

    if (mediumFileName) {
      image.m = mediumFileName;
    }

    if (variant) {
      image.variant = variant;
    }

    return [image];
  });

  return images.length > 0 ? images : undefined;
}

function mapCategoryIds(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((entry) => {
    const categoryId = readOptionalCategoryId(entry);
    return categoryId === undefined ? [] : [categoryId];
  });
}

function mapCategoryTree(
  value: unknown
): KeepaCategoryTreeEntry[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((entry): KeepaCategoryTreeEntry[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const catId = readOptionalCategoryId(entry.catId);
    const name = readOptionalText(entry.name);

    if (catId === undefined || !name) {
      return [];
    }

    return [{ catId, name }];
  });
}

function mapVariationAttributes(
  value: unknown
): KeepaVariationAttribute[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry): KeepaVariationAttribute[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const dimension = readOptionalText(entry.dimension);
    const attributeValue = readOptionalText(entry.value);

    if (!dimension || !attributeValue) {
      return [];
    }

    return [{ dimension, value: attributeValue }];
  });
}

function mapVariations(value: unknown): KeepaVariation[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const variations = value.flatMap((entry): KeepaVariation[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const asin = readOptionalText(entry.asin)?.toUpperCase();

    if (!asin || !ASIN_PATTERN.test(asin)) {
      return [];
    }

    const variation: KeepaVariation = {
      asin,
      attributes: mapVariationAttributes(entry.attributes),
    };
    const image = readOptionalText(entry.image);

    if (image) {
      variation.image = image;
    }

    return [variation];
  });

  return variations.length > 0 ? variations : undefined;
}

function mapIntegerArray(value: unknown): KeepaIntegerArray | undefined {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => entry === null || Number.isSafeInteger(entry))
  ) {
    return undefined;
  }

  return value as KeepaIntegerArray;
}

function mapPriceExtremeArray(
  value: unknown
): KeepaPriceExtremeArray | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const extremes: (KeepaPriceExtreme | null)[] = [];

  for (const entry of value) {
    if (entry === null) {
      extremes.push(null);
      continue;
    }

    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      !Number.isSafeInteger(entry[0]) ||
      !Number.isSafeInteger(entry[1])
    ) {
      return undefined;
    }

    extremes.push([entry[0] as number, entry[1] as number]);
  }

  return extremes;
}

function mapCsv(value: unknown): KeepaCsv | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const csv: (KeepaCsvSeries | null)[] = [];

  for (const series of value) {
    if (series === null) {
      csv.push(null);
      continue;
    }

    if (
      !Array.isArray(series) ||
      !series.every((entry) => Number.isSafeInteger(entry))
    ) {
      return undefined;
    }

    csv.push(series as number[]);
  }

  return csv;
}

function mapStatistics(value: unknown): KeepaStatistics | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const statistics: KeepaStatistics = {};
  const current = mapIntegerArray(value.current);
  const avg = mapIntegerArray(value.avg);
  const avg30 = mapIntegerArray(value.avg30);
  const avg90 = mapIntegerArray(value.avg90);
  const avg180 = mapIntegerArray(value.avg180);
  const avg365 = mapIntegerArray(value.avg365);
  const atIntervalStart = mapIntegerArray(value.atIntervalStart);
  const min = mapPriceExtremeArray(value.min);
  const max = mapPriceExtremeArray(value.max);
  const minInInterval = mapPriceExtremeArray(value.minInInterval);
  const maxInInterval = mapPriceExtremeArray(value.maxInInterval);
  const outOfStockPercentageInInterval = mapIntegerArray(
    value.outOfStockPercentageInInterval
  );
  const outOfStockPercentage30 = mapIntegerArray(
    value.outOfStockPercentage30
  );
  const outOfStockPercentage90 = mapIntegerArray(
    value.outOfStockPercentage90
  );
  const outOfStockPercentage180 = mapIntegerArray(
    value.outOfStockPercentage180
  );
  const outOfStockPercentage365 = mapIntegerArray(
    value.outOfStockPercentage365
  );
  const lastBuyBoxUpdate = readOptionalInteger(value.lastBuyBoxUpdate);
  const buyBoxSellerId = readOptionalText(value.buyBoxSellerId);
  const buyBoxPrice = readOptionalInteger(value.buyBoxPrice);
  const buyBoxShipping = readOptionalInteger(value.buyBoxShipping);
  const buyBoxIsAmazon = readOptionalBoolean(value.buyBoxIsAmazon);
  const buyBoxIsFBA = readOptionalBoolean(value.buyBoxIsFBA);
  const buyBoxIsPrimeEligible = readOptionalBoolean(
    value.buyBoxIsPrimeEligible
  );
  const buyBoxIsPrimeExclusive = readOptionalBoolean(
    value.buyBoxIsPrimeExclusive
  );
  const buyBoxIsShippable = readOptionalBoolean(value.buyBoxIsShippable);
  const buyBoxIsPreorder = readOptionalBoolean(value.buyBoxIsPreorder);
  const buyBoxIsBackorder = readOptionalBoolean(value.buyBoxIsBackorder);
  const buyBoxAvailabilityMessage = readOptionalText(
    value.buyBoxAvailabilityMessage
  );

  if (current) {
    statistics.current = current;
  }

  if (avg) {
    statistics.avg = avg;
  }

  if (avg30) {
    statistics.avg30 = avg30;
  }

  if (avg90) {
    statistics.avg90 = avg90;
  }

  if (avg180) {
    statistics.avg180 = avg180;
  }

  if (avg365) {
    statistics.avg365 = avg365;
  }

  if (atIntervalStart) {
    statistics.atIntervalStart = atIntervalStart;
  }

  if (min) {
    statistics.min = min;
  }

  if (max) {
    statistics.max = max;
  }

  if (minInInterval) {
    statistics.minInInterval = minInInterval;
  }

  if (maxInInterval) {
    statistics.maxInInterval = maxInInterval;
  }

  if (outOfStockPercentageInInterval) {
    statistics.outOfStockPercentageInInterval =
      outOfStockPercentageInInterval;
  }

  if (outOfStockPercentage30) {
    statistics.outOfStockPercentage30 = outOfStockPercentage30;
  }

  if (outOfStockPercentage90) {
    statistics.outOfStockPercentage90 = outOfStockPercentage90;
  }

  if (outOfStockPercentage180) {
    statistics.outOfStockPercentage180 = outOfStockPercentage180;
  }

  if (outOfStockPercentage365) {
    statistics.outOfStockPercentage365 = outOfStockPercentage365;
  }

  if (lastBuyBoxUpdate !== undefined) {
    statistics.lastBuyBoxUpdate = lastBuyBoxUpdate;
  }

  if (buyBoxSellerId) {
    statistics.buyBoxSellerId = buyBoxSellerId;
  }

  if (buyBoxPrice !== undefined) {
    statistics.buyBoxPrice = buyBoxPrice;
  }

  if (buyBoxShipping !== undefined) {
    statistics.buyBoxShipping = buyBoxShipping;
  }

  if (buyBoxIsAmazon !== undefined) {
    statistics.buyBoxIsAmazon = buyBoxIsAmazon;
  }

  if (buyBoxIsFBA !== undefined) {
    statistics.buyBoxIsFBA = buyBoxIsFBA;
  }

  if (buyBoxIsPrimeEligible !== undefined) {
    statistics.buyBoxIsPrimeEligible = buyBoxIsPrimeEligible;
  }

  if (buyBoxIsPrimeExclusive !== undefined) {
    statistics.buyBoxIsPrimeExclusive = buyBoxIsPrimeExclusive;
  }

  if (buyBoxIsShippable !== undefined) {
    statistics.buyBoxIsShippable = buyBoxIsShippable;
  }

  if (buyBoxIsPreorder !== undefined) {
    statistics.buyBoxIsPreorder = buyBoxIsPreorder;
  }

  if (buyBoxIsBackorder !== undefined) {
    statistics.buyBoxIsBackorder = buyBoxIsBackorder;
  }

  if (buyBoxAvailabilityMessage) {
    statistics.buyBoxAvailabilityMessage = buyBoxAvailabilityMessage;
  }

  return statistics;
}

type MappedKeepaProduct = {
  summary: KeepaProductSummary;
  rawProduct: KeepaRawProduct;
};

function mapProduct(
  payload: Record<string, unknown>,
  requestedAsin: string
): MappedKeepaProduct {
  const products = payload.products;

  if (!Array.isArray(products)) {
    throw new KeepaClientError(
      "La risposta Keepa non contiene un elenco prodotti valido.",
      "INVALID_RESPONSE"
    );
  }

  if (products.length === 0) {
    throw new KeepaClientError(
      "Keepa non ha trovato il prodotto richiesto.",
      "PRODUCT_NOT_FOUND"
    );
  }

  const product = products[0];

  if (!isRecord(product)) {
    throw new KeepaClientError(
      "La risposta Keepa non contiene un prodotto valido.",
      "INVALID_RESPONSE"
    );
  }

  const asin = readOptionalText(product.asin)?.toUpperCase();
  const title = readOptionalText(product.title);

  if (
    asin !== requestedAsin ||
    product.domainId !== AMAZON_ITALY_DOMAIN_ID ||
    !title
  ) {
    throw new KeepaClientError(
      "La risposta Keepa contiene dati prodotto insufficienti.",
      "INVALID_RESPONSE"
    );
  }

  const result: KeepaProductSummary = {
    asin,
    domainId: AMAZON_ITALY_DOMAIN_ID,
    title,
  };
  const brand = readOptionalText(product.brand);
  const model = readOptionalText(product.model);
  const images = mapImages(product.images);
  const color = readOptionalText(product.color);
  const size = readOptionalText(product.size);
  const rootCategory = readOptionalCategoryId(product.rootCategory);
  const categories = mapCategoryIds(product.categories);
  const categoryTree = mapCategoryTree(product.categoryTree);
  const parentAsin = readOptionalText(product.parentAsin)?.toUpperCase();
  const variations = mapVariations(product.variations);
  const csv = mapCsv(product.csv);
  const stats = mapStatistics(product.stats);

  if (brand) {
    result.brand = brand;
  }

  if (model) {
    result.model = model;
  }

  if (images) {
    result.images = images;
  }

  if (color) {
    result.color = color;
  }

  if (size) {
    result.size = size;
  }

  if (rootCategory !== undefined) {
    result.rootCategory = rootCategory;
  }

  if (categories) {
    result.categories = categories;
  }

  if (categoryTree) {
    result.categoryTree = categoryTree;
  }

  if (parentAsin && ASIN_PATTERN.test(parentAsin)) {
    result.parentAsin = parentAsin;
  }

  if (variations) {
    result.variations = variations;
  }

  if (csv) {
    result.csv = csv;
  }

  if (stats) {
    result.stats = stats;
  }

  return { summary: result, rawProduct: product };
}

export async function getKeepaProductByAsin(
  asin: string
): Promise<KeepaProductResult> {
  const normalizedAsin = normalizeAsin(asin);
  const apiKey = getApiKey();
  const requestUrl = new URL(KEEPA_PRODUCT_ENDPOINT, KEEPA_BASE_URL);
  requestUrl.searchParams.set("key", apiKey);
  requestUrl.searchParams.set("domain", String(AMAZON_ITALY_DOMAIN_ID));
  requestUrl.searchParams.set("asin", normalizedAsin);
  requestUrl.searchParams.set("stats", "90");
  requestUrl.searchParams.set("buybox", "1");

  let response: Response;

  try {
    response = await fetch(requestUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new KeepaClientError(
      "Non è stato possibile connettersi a Keepa.",
      "NETWORK_ERROR"
    );
  }

  if (response.status === 429) {
    throw new KeepaClientError(
      "I token Keepa disponibili sono esauriti.",
      "OUT_OF_TOKENS",
      response.status
    );
  }

  if (!response.ok) {
    throw new KeepaClientError(
      `Keepa ha risposto con stato HTTP ${response.status}.`,
      "KEEPA_HTTP_ERROR",
      response.status
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new KeepaClientError(
      "Keepa ha restituito una risposta JSON non valida.",
      "INVALID_RESPONSE"
    );
  }

  if (!isRecord(payload)) {
    throw new KeepaClientError(
      "Keepa ha restituito una risposta non valida.",
      "INVALID_RESPONSE"
    );
  }

  const mappedProduct = mapProduct(payload, normalizedAsin);

  return {
    product: mappedProduct.summary,
    rawProduct: mappedProduct.rawProduct,
    usage: mapUsage(payload),
  };
}
