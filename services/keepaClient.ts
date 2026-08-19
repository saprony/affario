import "server-only";

const KEEPA_BASE_URL = "https://api.keepa.com/";
const KEEPA_PRODUCT_ENDPOINT = "product";
const AMAZON_ITALY_DOMAIN_ID = 8;
const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

export type KeepaProductSummary = {
  asin: string;
  domainId: number;
  title: string;
  brand?: string;
  model?: string;
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

function mapProduct(
  payload: Record<string, unknown>,
  requestedAsin: string
): KeepaProductSummary {
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

  if (brand) {
    result.brand = brand;
  }

  if (model) {
    result.model = model;
  }

  return result;
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
  requestUrl.searchParams.set("history", "0");

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

  return {
    product: mapProduct(payload, normalizedAsin),
    usage: mapUsage(payload),
  };
}
