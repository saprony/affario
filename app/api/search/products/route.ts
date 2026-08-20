import { NextResponse } from "next/server";

import {
  AffarioProductSearchInputError,
  type AffarioProductSearchInputErrorCode,
} from "@/lib/affarioProductSearch";
import {
  AffarioProductSearchServiceError,
} from "@/services/affarioProductSearch";
import { searchAffarioProductsWithFallback } from "@/services/affarioProductSearchWithFallback";
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
  status: number
): NextResponse<AffarioProductSearchApiErrorResponse> {
  return NextResponse.json({ error: { code, message } }, { status });
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

    return NextResponse.json({ data });
  } catch (error) {
    return mapError(error);
  }
}
