import type {
  AffarioProductAnalysisData,
  AffarioSavingsPotential,
} from "../types/productAnalysis";
import type {
  AffarioAdvice,
  AffarioAdviceLabel,
  AffarioPriceHighlight,
  AffarioAdviceRecommendation,
  AffarioAdviceTone,
} from "../types/affarioAdvice";
import { buildAmazonAffiliateProductUrl } from "./amazonAffiliateLink";

type ProductAnalysisHttpResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

export type ProductAnalysisRequester = (
  input: string,
  init: RequestInit
) => Promise<ProductAnalysisHttpResponse>;

export type ProductAnalysisRequestGate = {
  inFlight: boolean;
};

export type ProductAnalysisPresentation = {
  advice: AffarioAdvice;
  amazonCta: {
    url: string;
    label: "Compra ora su Amazon" | "Vedi questa variante su Amazon";
    priority: "PRIMARY" | "SUPPORTING" | "NEUTRAL";
  } | null;
  isBuyBoxAvailable: boolean;
  currentPrice: string | null;
  priceTimestamp: string | null;
  minimum90Days: string;
  average90Days: string;
  savingsPotential: {
    amount: string;
    targetPrice: string;
    message: string;
    prominence: "SUBTLE" | "STANDARD" | "PROMINENT";
  } | null;
};

export class ProductAnalysisRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductAnalysisRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

const AFFARIO_ADVICE_LABELS = new Set<AffarioAdviceLabel>([
  "Ottimo momento",
  "Buon prezzo",
  "Prezzo nella media",
  "Conviene aspettare",
  "Dati insufficienti",
]);

const AFFARIO_ADVICE_TONES = new Set<AffarioAdviceTone>([
  "POSITIVE",
  "NEUTRAL",
  "NEGATIVE",
  "MUTED",
]);

const AFFARIO_ADVICE_RECOMMENDATIONS =
  new Set<AffarioAdviceRecommendation>([
    "BUY_NOW",
    "BUY",
    "NEUTRAL",
    "WAIT",
    "NONE",
  ]);

const AFFARIO_PRICE_HIGHLIGHTS = new Set<AffarioPriceHighlight>([
  "LOWEST_12_MONTHS",
  "LOWEST_SINCE_AVAILABLE",
  null,
]);

function parseAffarioAdvice(value: unknown): AffarioAdvice | null {
  if (
    !isRecord(value) ||
    (value.status !== "AVAILABLE" &&
      value.status !== "INSUFFICIENT_DATA") ||
    (value.score !== null &&
      (typeof value.score !== "number" ||
        !Number.isInteger(value.score) ||
        value.score < 0 ||
        value.score > 100)) ||
    typeof value.label !== "string" ||
    !AFFARIO_ADVICE_LABELS.has(value.label as AffarioAdviceLabel) ||
    typeof value.message !== "string" ||
    !value.message.trim() ||
    typeof value.tone !== "string" ||
    !AFFARIO_ADVICE_TONES.has(value.tone as AffarioAdviceTone) ||
    typeof value.recommendation !== "string" ||
    !AFFARIO_ADVICE_RECOMMENDATIONS.has(
      value.recommendation as AffarioAdviceRecommendation
    ) ||
    !AFFARIO_PRICE_HIGHLIGHTS.has(
      value.priceHighlight as AffarioPriceHighlight
    ) ||
    (value.status === "AVAILABLE" && value.score === null) ||
    (value.status === "AVAILABLE" && value.recommendation === "NONE") ||
    (value.status === "INSUFFICIENT_DATA" &&
      (value.score !== null || value.recommendation !== "NONE"))
  ) {
    return null;
  }

  return {
    status: value.status,
    score: value.score,
    label: value.label as AffarioAdviceLabel,
    message: value.message,
    tone: value.tone as AffarioAdviceTone,
    recommendation:
      value.recommendation as AffarioAdviceRecommendation,
    priceHighlight: value.priceHighlight as AffarioPriceHighlight,
  };
}

function parseSavingsPotential(
  value: unknown
): AffarioSavingsPotential | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.status === "AVAILABLE") {
    if (
      !isPositiveFiniteNumber(value.amount) ||
      !isPositiveFiniteNumber(value.targetPrice) ||
      typeof value.message !== "string" ||
      !value.message.trim()
    ) {
      return null;
    }

    return {
      status: "AVAILABLE",
      amount: value.amount,
      targetPrice: value.targetPrice,
      message: value.message,
    };
  }

  if (
    (value.status === "NOT_APPLICABLE" ||
      value.status === "INSUFFICIENT_DATA") &&
    value.amount === null &&
    value.targetPrice === null &&
    value.message === null
  ) {
    return {
      status: value.status,
      amount: null,
      targetPrice: null,
      message: null,
    };
  }

  return null;
}

function getAmazonCta(
  asin: string,
  recommendation: AffarioAdviceRecommendation
): ProductAnalysisPresentation["amazonCta"] {
  if (recommendation === "WAIT" || recommendation === "NONE") {
    return null;
  }

  const url = buildAmazonAffiliateProductUrl(asin);

  if (!url) {
    return null;
  }

  if (recommendation === "BUY_NOW") {
    return { url, label: "Compra ora su Amazon", priority: "PRIMARY" };
  }

  if (recommendation === "BUY") {
    return { url, label: "Compra ora su Amazon", priority: "SUPPORTING" };
  }

  return {
    url,
    label: "Vedi questa variante su Amazon",
    priority: "NEUTRAL",
  };
}

function getApiErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return null;
  }

  return typeof payload.error.message === "string"
    ? payload.error.message
    : null;
}

function parseProductAnalysisPayload(
  payload: unknown
): AffarioProductAnalysisData | null {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }

  const { data } = payload;
  const lastBuyBoxUpdate = data.lastBuyBoxUpdate;
  const advice = parseAffarioAdvice(data.advice);
  const savingsPotential = parseSavingsPotential(data.savingsPotential);

  if (
    typeof data.asin !== "string" ||
    !isRecord(data.buyBox) ||
    (data.buyBox.status !== "AVAILABLE" &&
      data.buyBox.status !== "UNAVAILABLE") ||
    !isNullableNumber(data.buyBox.currentPrice) ||
    (data.buyBox.status === "AVAILABLE" &&
      data.buyBox.currentPrice === null) ||
    (data.buyBox.status === "UNAVAILABLE" &&
      data.buyBox.currentPrice !== null) ||
    (lastBuyBoxUpdate !== null && typeof lastBuyBoxUpdate !== "string") ||
    !isRecord(data.priceHistory90Days) ||
    !isNullableNumber(data.priceHistory90Days.averageBuyBoxPrice) ||
    !isNullableNumber(data.priceHistory90Days.minimumBuyBoxPrice) ||
    !advice ||
    !savingsPotential ||
    data.buyBox.currency !== "EUR" ||
    data.priceHistory90Days.currency !== "EUR"
  ) {
    return null;
  }

  return {
    asin: data.asin,
    buyBox: {
      status: data.buyBox.status,
      currentPrice: data.buyBox.currentPrice,
    },
    lastBuyBoxUpdate:
      typeof lastBuyBoxUpdate === "string" ? lastBuyBoxUpdate : null,
    priceHistory90Days: {
      averageBuyBoxPrice: data.priceHistory90Days.averageBuyBoxPrice,
      minimumBuyBoxPrice: data.priceHistory90Days.minimumBuyBoxPrice,
    },
    advice,
    savingsPotential,
  };
}

async function requestProductAnalysis(
  asin: string,
  requester: ProductAnalysisRequester
): Promise<AffarioProductAnalysisData> {
  const response = await requester(
    `/api/products/${encodeURIComponent(asin)}`,
    { headers: { Accept: "application/json" } }
  );
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new ProductAnalysisRequestError(
      "L'analisi ha restituito una risposta non valida."
    );
  }

  if (!response.ok) {
    throw new ProductAnalysisRequestError(
      getApiErrorMessage(payload) ??
        "Non è stato possibile recuperare i dati del prezzo."
    );
  }

  const data = parseProductAnalysisPayload(payload);

  if (!data || data.asin !== asin) {
    throw new ProductAnalysisRequestError(
      "L'analisi ha restituito una risposta non valida."
    );
  }

  return data;
}

export function requestProductAnalysisOnce(
  asin: string,
  gate: ProductAnalysisRequestGate,
  requester: ProductAnalysisRequester = (input, init) => fetch(input, init)
): Promise<AffarioProductAnalysisData> | null {
  if (gate.inFlight) {
    return null;
  }

  gate.inFlight = true;

  return requestProductAnalysis(asin, requester).finally(() => {
    gate.inFlight = false;
  });
}

export function formatEuroPrice(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return `${new Intl.NumberFormat("it-IT", {
    useGrouping: true,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} €`;
}

function getDateParts(value: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

export function formatLastBuyBoxUpdate(
  value: string | null,
  now: Date = new Date()
): string | null {
  if (value === null) {
    return null;
  }

  const update = new Date(value);

  if (!Number.isFinite(update.getTime()) || !Number.isFinite(now.getTime())) {
    return null;
  }

  const updateParts = getDateParts(update);
  const nowParts = getDateParts(now);
  const time = `${updateParts.hour}:${updateParts.minute}`;
  const isSameLocalDate = ["year", "month", "day"].every(
    (part) => updateParts[part] === nowParts[part]
  );

  return isSameLocalDate
    ? `Prezzo rilevato alle ${time}`
    : `Prezzo rilevato il ${updateParts.day}/${updateParts.month} alle ${time}`;
}

export function getProductAnalysisPresentation(
  data: AffarioProductAnalysisData,
  now: Date = new Date()
): ProductAnalysisPresentation {
  const isBuyBoxAvailable =
    data.buyBox.status === "AVAILABLE" &&
    data.buyBox.currentPrice !== null;

  const savingsProminence = {
    BUY_NOW: "SUBTLE",
    BUY: "SUBTLE",
    NEUTRAL: "STANDARD",
    WAIT: "PROMINENT",
    NONE: null,
  } as const;
  const savingsPotentialProminence =
    savingsProminence[data.advice.recommendation];
  const savingsPotential =
    data.savingsPotential.status === "AVAILABLE" &&
    savingsPotentialProminence !== null
      ? {
          amount: formatEuroPrice(data.savingsPotential.amount)!,
          targetPrice: formatEuroPrice(
            data.savingsPotential.targetPrice
          )!,
          message: data.savingsPotential.message,
          prominence: savingsPotentialProminence,
        }
      : null;

  return {
    advice: data.advice,
    amazonCta: getAmazonCta(data.asin, data.advice.recommendation),
    isBuyBoxAvailable,
    currentPrice: isBuyBoxAvailable
      ? formatEuroPrice(data.buyBox.currentPrice)
      : null,
    priceTimestamp: isBuyBoxAvailable
      ? formatLastBuyBoxUpdate(data.lastBuyBoxUpdate, now)
      : null,
    minimum90Days:
      formatEuroPrice(data.priceHistory90Days.minimumBuyBoxPrice) ??
      "Non disponibile",
    average90Days:
      formatEuroPrice(data.priceHistory90Days.averageBuyBoxPrice) ??
      "Non disponibile",
    savingsPotential,
  };
}
