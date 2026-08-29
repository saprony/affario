import "server-only";

import {
  getKeepaProductByAsin,
  type KeepaCategoryTreeEntry,
  type KeepaCsv,
  type KeepaImage,
  type KeepaIntegerArray,
  type KeepaPriceExtremeArray,
  type KeepaProductSummary,
  type KeepaRequestContext,
  type KeepaRawProduct,
  type KeepaStatistics,
  type KeepaUsage,
  type KeepaTokenBudgetStatus,
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
const KEEPA_AMAZON_PRICE_INDEX = 0;
const KEEPA_NEW_PRICE_INDEX = 1;
const KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX = 18;
const KEEPA_TIME_MINUTES_OFFSET = 21_564_000;
const PRICE_STATISTICS_INTERVAL_DAYS = 90;
const UNAVAILABLE_BUY_BOX_SELLER_IDS = new Set(["-1", "-2"]);
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

export type AffarioKeepaPriceExtreme = {
  amountInEuros: number;
  keepaTimeMinutes: number;
  observedAt: string;
};

export type AffarioKeepaMinimumPrice = AffarioKeepaPriceExtreme;

export type AffarioKeepaPriceTypeStatistics = {
  currentInEuros?: number;
  averageInIntervalInEuros?: number;
  average90DaysInEuros?: number;
  minimumInInterval?: AffarioKeepaMinimumPrice;
};

export type AffarioKeepaPriceStatistics = {
  intervalDays: 90;
  currency: "EUR";
  amazon: AffarioKeepaPriceTypeStatistics;
  new: AffarioKeepaPriceTypeStatistics;
};

export type AffarioKeepaBuyBox90DayContext = {
  intervalDays: 90;
  averageInIntervalInEuros?: number;
  average90DaysInEuros?: number;
  minimumInInterval?: AffarioKeepaPriceExtreme;
  maximumInInterval?: AffarioKeepaPriceExtreme;
  outOfStockPercentageInInterval?: number;
  outOfStockPercentage90Days?: number;
};

export type AffarioKeepaBuyBoxStatistics = {
  intervalDays: 90;
  atIntervalStartInEuros?: number;
  averageInIntervalInEuros?: number;
  average30DaysInEuros?: number;
  average90DaysInEuros?: number;
  average180DaysInEuros?: number;
  average365DaysInEuros?: number;
  minimumAllTime?: AffarioKeepaPriceExtreme;
  maximumAllTime?: AffarioKeepaPriceExtreme;
  minimumInInterval?: AffarioKeepaPriceExtreme;
  maximumInInterval?: AffarioKeepaPriceExtreme;
  outOfStockPercentageInInterval?: number;
  outOfStockPercentage30Days?: number;
  outOfStockPercentage90Days?: number;
  outOfStockPercentage180Days?: number;
  outOfStockPercentage365Days?: number;
};

export type AffarioKeepaBuyBoxHistoryPoint = {
  keepaTimeMinutes: number;
  observedAt: string;
  rawPriceInCents: number;
  rawShippingInCents: number;
  priceInEuros?: number;
  shippingInEuros?: number;
  totalInCents?: number;
  totalInEuros?: number;
  isAvailable: boolean;
};

export type AffarioKeepaBuyBoxHistory = {
  priceTypeIndex: 18;
  includesShipping: true;
  points: readonly AffarioKeepaBuyBoxHistoryPoint[];
};

export type AffarioKeepaInternalBuyBoxData = {
  statistics?: AffarioKeepaBuyBoxStatistics;
  fullHistory?: AffarioKeepaBuyBoxHistory;
};

export type AffarioKeepaInternalData = {
  rawProduct: KeepaRawProduct;
  buyBox?: AffarioKeepaInternalBuyBoxData;
};

export type AffarioKeepaBuyBox = {
  currency: "EUR";
  currentIncludingShippingInEuros?: number;
  priceInEuros?: number;
  shippingInEuros?: number;
  totalInEuros?: number;
  sellerId?: string;
  isAmazon?: boolean;
  isFBA?: boolean;
  isPrimeEligible?: boolean;
  isPrimeExclusive?: boolean;
  isShippable?: boolean;
  isPreorder?: boolean;
  isBackorder?: boolean;
  availabilityMessage?: string;
  lastUpdateKeepaTimeMinutes?: number;
  lastUpdatedAt?: string;
  context90Days?: AffarioKeepaBuyBox90DayContext;
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
  keepaPriceStatistics?: AffarioKeepaPriceStatistics;
  keepaBuyBox?: AffarioKeepaBuyBox;
  externalIdentifiers: readonly ExternalProductIdentifier[];
  unavailableProductFields: readonly AffarioProductFieldWithoutRealData[];
};

export type AffarioProductCandidateResult = {
  product: AffarioProductCandidate;
  internalKeepaData: AffarioKeepaInternalData;
  usage: KeepaUsage;
  tokenBudgetStatus: KeepaTokenBudgetStatus;
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

function getPriceInCents(
  values: KeepaIntegerArray | undefined,
  priceTypeIndex: number
): number | undefined {
  return getAvailablePriceInCents(values?.[priceTypeIndex]);
}

function getAvailablePriceInCents(
  value: number | null | undefined
): number | undefined {
  return typeof value === "number" && value >= 0 ? value : undefined;
}

function convertKeepaTimeToIso(keepaTimeMinutes: number): string | undefined {
  if (keepaTimeMinutes < 0) {
    return undefined;
  }

  const unixTimeInMs =
    (keepaTimeMinutes + KEEPA_TIME_MINUTES_OFFSET) * 60_000;
  const observedAt = new Date(unixTimeInMs);

  return Number.isNaN(observedAt.getTime())
    ? undefined
    : observedAt.toISOString();
}

function convertCentsToEuros(priceInCents: number): number {
  return priceInCents / 100;
}

function getPriceExtreme(
  values: KeepaPriceExtremeArray | undefined,
  priceTypeIndex: number
): AffarioKeepaPriceExtreme | undefined {
  const extreme = values?.[priceTypeIndex];

  if (!extreme) {
    return undefined;
  }

  const [keepaTimeMinutes, priceInCents] = extreme;

  if (keepaTimeMinutes < 0 || priceInCents < 0) {
    return undefined;
  }

  const observedAt = convertKeepaTimeToIso(keepaTimeMinutes);

  if (!observedAt) {
    return undefined;
  }

  return {
    amountInEuros: convertCentsToEuros(priceInCents),
    keepaTimeMinutes,
    observedAt,
  };
}

function mapPriceTypeStatistics(
  stats: KeepaStatistics,
  priceTypeIndex: number
): AffarioKeepaPriceTypeStatistics {
  const priceStatistics: AffarioKeepaPriceTypeStatistics = {};
  const currentPrice = getPriceInCents(stats.current, priceTypeIndex);
  const averageInInterval = getPriceInCents(stats.avg, priceTypeIndex);
  const average90Days = getPriceInCents(stats.avg90, priceTypeIndex);
  const minimumInInterval = getPriceExtreme(
    stats.minInInterval,
    priceTypeIndex
  );

  if (currentPrice !== undefined) {
    priceStatistics.currentInEuros = convertCentsToEuros(currentPrice);
  }

  if (averageInInterval !== undefined) {
    priceStatistics.averageInIntervalInEuros =
      convertCentsToEuros(averageInInterval);
  }

  if (average90Days !== undefined) {
    priceStatistics.average90DaysInEuros =
      convertCentsToEuros(average90Days);
  }

  if (minimumInInterval) {
    priceStatistics.minimumInInterval = minimumInInterval;
  }

  return priceStatistics;
}

function getKeepaPriceStatistics(
  stats: KeepaStatistics | undefined
): AffarioKeepaPriceStatistics | undefined {
  if (!stats) {
    return undefined;
  }

  return {
    intervalDays: PRICE_STATISTICS_INTERVAL_DAYS,
    currency: "EUR",
    amazon: mapPriceTypeStatistics(stats, KEEPA_AMAZON_PRICE_INDEX),
    new: mapPriceTypeStatistics(stats, KEEPA_NEW_PRICE_INDEX),
  };
}

function getPercentage(
  values: KeepaIntegerArray | undefined,
  priceTypeIndex: number
): number | undefined {
  const value = values?.[priceTypeIndex];

  return typeof value === "number" && value >= 0 && value <= 100
    ? value
    : undefined;
}

function getKeepaBuyBoxStatistics(
  stats: KeepaStatistics | undefined
): AffarioKeepaBuyBoxStatistics | undefined {
  if (!stats) {
    return undefined;
  }

  const statistics: AffarioKeepaBuyBoxStatistics = {
    intervalDays: PRICE_STATISTICS_INTERVAL_DAYS,
  };
  const atIntervalStart = getPriceInCents(
    stats.atIntervalStart,
    KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX
  );
  const averageInInterval = getPriceInCents(
    stats.avg,
    KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX
  );
  const average30Days = getPriceInCents(
    stats.avg30,
    KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX
  );
  const average90Days = getPriceInCents(
    stats.avg90,
    KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX
  );
  const average180Days = getPriceInCents(
    stats.avg180,
    KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX
  );
  const average365Days = getPriceInCents(
    stats.avg365,
    KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX
  );
  const minimumAllTime = getPriceExtreme(
    stats.min,
    KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX
  );
  const maximumAllTime = getPriceExtreme(
    stats.max,
    KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX
  );
  const minimumInInterval = getPriceExtreme(
    stats.minInInterval,
    KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX
  );
  const maximumInInterval = getPriceExtreme(
    stats.maxInInterval,
    KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX
  );
  const outOfStockPercentageInInterval = getPercentage(
    stats.outOfStockPercentageInInterval,
    KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX
  );
  const outOfStockPercentage30Days = getPercentage(
    stats.outOfStockPercentage30,
    KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX
  );
  const outOfStockPercentage90Days = getPercentage(
    stats.outOfStockPercentage90,
    KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX
  );
  const outOfStockPercentage180Days = getPercentage(
    stats.outOfStockPercentage180,
    KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX
  );
  const outOfStockPercentage365Days = getPercentage(
    stats.outOfStockPercentage365,
    KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX
  );

  if (atIntervalStart !== undefined) {
    statistics.atIntervalStartInEuros =
      convertCentsToEuros(atIntervalStart);
  }

  if (averageInInterval !== undefined) {
    statistics.averageInIntervalInEuros =
      convertCentsToEuros(averageInInterval);
  }

  if (average30Days !== undefined) {
    statistics.average30DaysInEuros = convertCentsToEuros(average30Days);
  }

  if (average90Days !== undefined) {
    statistics.average90DaysInEuros = convertCentsToEuros(average90Days);
  }

  if (average180Days !== undefined) {
    statistics.average180DaysInEuros =
      convertCentsToEuros(average180Days);
  }

  if (average365Days !== undefined) {
    statistics.average365DaysInEuros =
      convertCentsToEuros(average365Days);
  }

  if (minimumAllTime) {
    statistics.minimumAllTime = minimumAllTime;
  }

  if (maximumAllTime) {
    statistics.maximumAllTime = maximumAllTime;
  }

  if (minimumInInterval) {
    statistics.minimumInInterval = minimumInInterval;
  }

  if (maximumInInterval) {
    statistics.maximumInInterval = maximumInInterval;
  }

  if (outOfStockPercentageInInterval !== undefined) {
    statistics.outOfStockPercentageInInterval =
      outOfStockPercentageInInterval;
  }

  if (outOfStockPercentage30Days !== undefined) {
    statistics.outOfStockPercentage30Days = outOfStockPercentage30Days;
  }

  if (outOfStockPercentage90Days !== undefined) {
    statistics.outOfStockPercentage90Days = outOfStockPercentage90Days;
  }

  if (outOfStockPercentage180Days !== undefined) {
    statistics.outOfStockPercentage180Days = outOfStockPercentage180Days;
  }

  if (outOfStockPercentage365Days !== undefined) {
    statistics.outOfStockPercentage365Days = outOfStockPercentage365Days;
  }

  return statistics;
}

function getKeepaBuyBox90DayContext(
  statistics: AffarioKeepaBuyBoxStatistics
): AffarioKeepaBuyBox90DayContext {
  const context: AffarioKeepaBuyBox90DayContext = {
    intervalDays: PRICE_STATISTICS_INTERVAL_DAYS,
  };

  if (statistics.averageInIntervalInEuros !== undefined) {
    context.averageInIntervalInEuros =
      statistics.averageInIntervalInEuros;
  }

  if (statistics.average90DaysInEuros !== undefined) {
    context.average90DaysInEuros = statistics.average90DaysInEuros;
  }

  if (statistics.minimumInInterval) {
    context.minimumInInterval = statistics.minimumInInterval;
  }

  if (statistics.maximumInInterval) {
    context.maximumInInterval = statistics.maximumInInterval;
  }

  if (statistics.outOfStockPercentageInInterval !== undefined) {
    context.outOfStockPercentageInInterval =
      statistics.outOfStockPercentageInInterval;
  }

  if (statistics.outOfStockPercentage90Days !== undefined) {
    context.outOfStockPercentage90Days =
      statistics.outOfStockPercentage90Days;
  }

  return context;
}

function getKeepaBuyBoxHistory(
  csv: KeepaCsv | undefined
): AffarioKeepaBuyBoxHistory | undefined {
  const series = csv?.[KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX];

  if (!series || series.length === 0 || series.length % 3 !== 0) {
    return undefined;
  }

  const points: AffarioKeepaBuyBoxHistoryPoint[] = [];

  for (let index = 0; index < series.length; index += 3) {
    const keepaTimeMinutes = series[index];
    const rawPriceInCents = series[index + 1];
    const rawShippingInCents = series[index + 2];
    const observedAt = convertKeepaTimeToIso(keepaTimeMinutes);

    if (!observedAt) {
      continue;
    }

    const point: AffarioKeepaBuyBoxHistoryPoint = {
      keepaTimeMinutes,
      observedAt,
      rawPriceInCents,
      rawShippingInCents,
      isAvailable: rawPriceInCents >= 0,
    };

    if (rawPriceInCents >= 0) {
      point.priceInEuros = convertCentsToEuros(rawPriceInCents);
    }

    if (rawShippingInCents >= 0) {
      point.shippingInEuros = convertCentsToEuros(rawShippingInCents);
    }

    if (rawPriceInCents >= 0 && rawShippingInCents >= 0) {
      point.totalInCents = rawPriceInCents + rawShippingInCents;
      point.totalInEuros = convertCentsToEuros(point.totalInCents);
    }

    points.push(point);
  }

  return points.length > 0
    ? {
        priceTypeIndex: KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX,
        includesShipping: true,
        points,
      }
    : undefined;
}

function getKeepaBuyBox(
  stats: KeepaStatistics | undefined
): AffarioKeepaBuyBox | undefined {
  if (!stats) {
    return undefined;
  }

  const buyBox: AffarioKeepaBuyBox = { currency: "EUR" };
  const currentIncludingShipping = getPriceInCents(
    stats.current,
    KEEPA_BUY_BOX_SHIPPING_PRICE_INDEX
  );
  const price = getAvailablePriceInCents(stats.buyBoxPrice);
  const shipping = getAvailablePriceInCents(stats.buyBoxShipping);
  const sellerId =
    stats.buyBoxSellerId &&
    !UNAVAILABLE_BUY_BOX_SELLER_IDS.has(stats.buyBoxSellerId)
      ? stats.buyBoxSellerId
      : undefined;
  const lastUpdatedAt =
    stats.lastBuyBoxUpdate === undefined
      ? undefined
      : convertKeepaTimeToIso(stats.lastBuyBoxUpdate);
  const statistics = getKeepaBuyBoxStatistics(stats);

  if (currentIncludingShipping !== undefined) {
    buyBox.currentIncludingShippingInEuros = convertCentsToEuros(
      currentIncludingShipping
    );
  }

  if (price !== undefined) {
    buyBox.priceInEuros = convertCentsToEuros(price);
  }

  if (shipping !== undefined) {
    buyBox.shippingInEuros = convertCentsToEuros(shipping);
  }

  if (price !== undefined && shipping !== undefined) {
    buyBox.totalInEuros = convertCentsToEuros(price + shipping);
  }

  if (sellerId) {
    buyBox.sellerId = sellerId;
  }

  if (stats.buyBoxIsAmazon !== undefined) {
    buyBox.isAmazon = stats.buyBoxIsAmazon;
  }

  if (stats.buyBoxIsFBA !== undefined) {
    buyBox.isFBA = stats.buyBoxIsFBA;
  }

  if (stats.buyBoxIsPrimeEligible !== undefined) {
    buyBox.isPrimeEligible = stats.buyBoxIsPrimeEligible;
  }

  if (stats.buyBoxIsPrimeExclusive !== undefined) {
    buyBox.isPrimeExclusive = stats.buyBoxIsPrimeExclusive;
  }

  if (stats.buyBoxIsShippable !== undefined) {
    buyBox.isShippable = stats.buyBoxIsShippable;
  }

  if (stats.buyBoxIsPreorder !== undefined) {
    buyBox.isPreorder = stats.buyBoxIsPreorder;
  }

  if (stats.buyBoxIsBackorder !== undefined) {
    buyBox.isBackorder = stats.buyBoxIsBackorder;
  }

  if (stats.buyBoxAvailabilityMessage) {
    buyBox.availabilityMessage = stats.buyBoxAvailabilityMessage;
  }

  if (stats.lastBuyBoxUpdate !== undefined && lastUpdatedAt) {
    buyBox.lastUpdateKeepaTimeMinutes = stats.lastBuyBoxUpdate;
    buyBox.lastUpdatedAt = lastUpdatedAt;
  }

  if (statistics) {
    buyBox.context90Days = getKeepaBuyBox90DayContext(statistics);
  }

  return buyBox;
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
  const keepaPriceStatistics = getKeepaPriceStatistics(keepaProduct.stats);
  const keepaBuyBox = getKeepaBuyBox(keepaProduct.stats);
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

  if (keepaPriceStatistics) {
    product.keepaPriceStatistics = keepaPriceStatistics;
  }

  if (keepaBuyBox) {
    product.keepaBuyBox = keepaBuyBox;
  }

  return product;
}

function getInternalKeepaData(
  keepaProduct: KeepaProductSummary,
  rawProduct: KeepaRawProduct
): AffarioKeepaInternalData {
  const internalData: AffarioKeepaInternalData = { rawProduct };
  const statistics = getKeepaBuyBoxStatistics(keepaProduct.stats);
  const fullHistory = getKeepaBuyBoxHistory(keepaProduct.csv);

  if (statistics || fullHistory) {
    internalData.buyBox = {};

    if (statistics) {
      internalData.buyBox.statistics = statistics;
    }

    if (fullHistory) {
      internalData.buyBox.fullHistory = fullHistory;
    }
  }

  return internalData;
}

export async function getAffarioProductCandidateByAsin(
  asin: string,
  options: { context?: KeepaRequestContext } = {}
): Promise<AffarioProductCandidateResult> {
  const keepaResult = await getKeepaProductByAsin(asin, options);

  return {
    product: mapKeepaProductToAffarioCandidate(keepaResult.product),
    internalKeepaData: getInternalKeepaData(
      keepaResult.product,
      keepaResult.rawProduct
    ),
    usage: keepaResult.usage,
    tokenBudgetStatus: keepaResult.tokenBudgetStatus,
  };
}
