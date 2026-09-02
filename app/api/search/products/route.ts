import { NextResponse } from "next/server";

import {
  AffarioProductSearchInputError,
  type AffarioProductSearchInputErrorCode,
} from "@/lib/affarioProductSearch";
import { API_NO_STORE_HEADERS } from "@/lib/jsonRequestBody";
import {
  AffarioProductSearchServiceError,
} from "@/services/affarioProductSearch";
import { searchAffarioProductsWithFallback } from "@/services/affarioProductSearchWithFallback";
import { KeepaClientError } from "@/services/keepaClient";
import {
  getKeepaRetryAfterSeconds,
  TEMPORARY_PRODUCT_DATA_MESSAGE,
} from "@/services/keepaTemporaryUnavailable";
import type { AffarioProductSearchWithFallbackResult } from "@/types/productSearch";

export type AffarioProductSearchApiErrorCode =
  | AffarioProductSearchInputErrorCode
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type AffarioProductSearchApiErrorResponse = {
  error: {
    code: AffarioProductSearchApiErrorCode;
    message: string;
  };
};

export type AffarioProductSearchApiSuccessResponse = {
  data: AffarioProductSearchWithFallbackResult;
};

function errorResponse(
  code: AffarioProductSearchApiErrorCode,
  message: string,
  status: number,
  retryAfterSeconds?: number
): NextResponse<AffarioProductSearchApiErrorResponse> {
  return NextResponse.json(
    { error: { code, message } },
    {
      status,
      headers: {
        ...API_NO_STORE_HEADERS,
        ...(retryAfterSeconds === undefined
          ? {}
          : { "Retry-After": String(retryAfterSeconds) }),
      },
    }
  );
}

function mapError(
  error: unknown
): NextResponse<AffarioProductSearchApiErrorResponse> {
  if (error instanceof AffarioProductSearchInputError) {
    const messages: Record<AffarioProductSearchInputErrorCode, string> = {
      EMPTY_QUERY: "Inserisci un prodotto da cercare.",
      QUERY_TOO_SHORT: "La ricerca deve contenere almeno 2 caratteri.",
      QUERY_TOO_LONG: "La ricerca non puo superare 100 caratteri.",
    };

    return errorResponse(error.code, messages[error.code], 400);
  }

  if (error instanceof KeepaClientError && error.code === "OUT_OF_TOKENS") {
    return errorResponse(
      "SERVICE_UNAVAILABLE",
      TEMPORARY_PRODUCT_DATA_MESSAGE,
      503,
      getKeepaRetryAfterSeconds(error)
    );
  }

  if (error instanceof AffarioProductSearchServiceError) {
    return errorResponse(
      "SERVICE_UNAVAILABLE",
      "La ricerca prodotti non e temporaneamente disponibile.",
      503
    );
  }

  console.error("Ricerca prodotti AFFARIO fallita.", {
    name: error instanceof Error ? error.name : "UnknownError",
  });

  return errorResponse(
    "INTERNAL_ERROR",
    "Non e stato possibile completare la ricerca.",
    500
  );
}

export async function GET(
  request: Request
): Promise<
  NextResponse<
    | AffarioProductSearchApiSuccessResponse
    | AffarioProductSearchApiErrorResponse
  >
> {
  const query = new URL(request.url).searchParams.get("q") ?? "";

  try {
    const { data } = await searchAffarioProductsWithFallback(query);

    return NextResponse.json(
      { data },
      { headers: API_NO_STORE_HEADERS }
    );
  } catch (error) {
    return mapError(error);
  }
}
