import "server-only";

import { getSupabaseServerClient } from "@/services/supabaseServer";

const PRICE_HISTORY_COLUMNS =
  "id, product_id, price, source, observed_at, created_at";
const NINETY_DAYS_IN_MILLISECONDS = 90 * 24 * 60 * 60 * 1000;

type PriceObservationRow = {
  id: number;
  product_id: string;
  price: number;
  source: string;
  observed_at: string;
  created_at: string;
};

export type PriceObservation = {
  id: number;
  productId: string;
  price: number;
  source: string;
  observedAt: string;
  createdAt: string;
};

export type SavePriceObservationInput = {
  productId: string;
  price: number;
  source: string;
  observedAt: Date | string;
};

export type PriceHistoryErrorCode =
  | "INVALID_INPUT"
  | "DUPLICATE_OBSERVATION"
  | "DATABASE_ERROR";

export class PriceHistoryServiceError extends Error {
  constructor(
    message: string,
    public readonly code: PriceHistoryErrorCode
  ) {
    super(message);
    this.name = "PriceHistoryServiceError";
  }
}

function invalidInput(message: string): PriceHistoryServiceError {
  return new PriceHistoryServiceError(message, "INVALID_INPUT");
}

function databaseError(): PriceHistoryServiceError {
  return new PriceHistoryServiceError(
    "Non è stato possibile accedere allo storico prezzi.",
    "DATABASE_ERROR"
  );
}

function normalizeRequiredText(value: string, fieldName: string): string {
  if (typeof value !== "string") {
    throw invalidInput(`${fieldName} non può essere vuoto.`);
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw invalidInput(`${fieldName} non può essere vuoto.`);
  }

  return normalizedValue;
}

function normalizeObservedAt(value: Date | string): string {
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw invalidInput("observedAt deve essere una data valida.");
  }

  const observedAt = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(observedAt.getTime())) {
    throw invalidInput("observedAt deve essere una data valida.");
  }

  return observedAt.toISOString();
}

function mapPriceObservation(row: PriceObservationRow): PriceObservation {
  return {
    id: row.id,
    productId: row.product_id,
    price: row.price,
    source: row.source,
    observedAt: row.observed_at,
    createdAt: row.created_at,
  };
}

export async function savePriceObservation({
  productId,
  price,
  source,
  observedAt,
}: SavePriceObservationInput): Promise<PriceObservation> {
  const normalizedProductId = normalizeRequiredText(productId, "productId");
  const normalizedSource = normalizeRequiredText(source, "source");

  if (!Number.isFinite(price) || price <= 0) {
    throw invalidInput("price deve essere un numero finito maggiore di zero.");
  }

  const normalizedObservedAt = normalizeObservedAt(observedAt);
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .schema("public")
    .from("price_history")
    .insert({
      product_id: normalizedProductId,
      price,
      source: normalizedSource,
      observed_at: normalizedObservedAt,
    })
    .select(PRICE_HISTORY_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new PriceHistoryServiceError(
        "La rilevazione di prezzo esiste già.",
        "DUPLICATE_OBSERVATION"
      );
    }

    throw databaseError();
  }

  return mapPriceObservation(data as PriceObservationRow);
}

export async function getPriceHistory(
  productId: string
): Promise<PriceObservation[]> {
  const normalizedProductId = normalizeRequiredText(productId, "productId");
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .schema("public")
    .from("price_history")
    .select(PRICE_HISTORY_COLUMNS)
    .eq("product_id", normalizedProductId)
    .order("observed_at", { ascending: false });

  if (error) {
    throw databaseError();
  }

  return (data as PriceObservationRow[]).map(mapPriceObservation);
}

export async function getPriceHistory90Days(
  productId: string
): Promise<PriceObservation[]> {
  const normalizedProductId = normalizeRequiredText(productId, "productId");
  const observedAfter = new Date(
    Date.now() - NINETY_DAYS_IN_MILLISECONDS
  ).toISOString();
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .schema("public")
    .from("price_history")
    .select(PRICE_HISTORY_COLUMNS)
    .eq("product_id", normalizedProductId)
    .gte("observed_at", observedAfter)
    .order("observed_at", { ascending: false });

  if (error) {
    throw databaseError();
  }

  return (data as PriceObservationRow[]).map(mapPriceObservation);
}

export async function getLatestPriceObservation(
  productId: string
): Promise<PriceObservation | null> {
  const normalizedProductId = normalizeRequiredText(productId, "productId");
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .schema("public")
    .from("price_history")
    .select(PRICE_HISTORY_COLUMNS)
    .eq("product_id", normalizedProductId)
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw databaseError();
  }

  return data ? mapPriceObservation(data as PriceObservationRow) : null;
}
