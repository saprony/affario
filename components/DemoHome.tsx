"use client";

import { useState } from "react";
import Hero from "@/components/Hero";
import ProductList from "@/components/ProductList";
import {
  AffarioProductSearchInputError,
  prepareAffarioProductSearchQuery,
} from "@/lib/affarioProductSearch";
import type { AffarioProductSearchWithFallbackResult } from "@/types/productSearch";

type SearchStatus = "initial" | "loading" | "results" | "error";

type SelectedVariant = {
  familyId: string;
  asin: string;
};

class DemoProductSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoProductSearchError";
  }
}

function getInputErrorMessage(error: AffarioProductSearchInputError): string {
  const messages = {
    EMPTY_QUERY: "Inserisci un prodotto da cercare.",
    QUERY_TOO_SHORT: "La ricerca deve contenere almeno 2 caratteri.",
    QUERY_TOO_LONG: "La ricerca non può superare 100 caratteri.",
  } as const;

  return messages[error.code];
}

function getApiErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("error" in payload)) {
    return null;
  }

  const error = payload.error;

  if (
    !error ||
    typeof error !== "object" ||
    !("message" in error) ||
    typeof error.message !== "string"
  ) {
    return null;
  }

  return error.message;
}

function getSearchResult(
  payload: unknown
): AffarioProductSearchWithFallbackResult | null {
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    return null;
  }

  const data = payload.data;

  if (
    !data ||
    typeof data !== "object" ||
    !("families" in data) ||
    !Array.isArray(data.families)
  ) {
    return null;
  }

  return data as AffarioProductSearchWithFallbackResult;
}

export default function DemoHome() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>("initial");
  const [searchResult, setSearchResult] =
    useState<AffarioProductSearchWithFallbackResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] =
    useState<SelectedVariant | null>(null);

  async function handleSearch() {
    if (status === "loading") {
      return;
    }

    let preparedQuery;

    try {
      preparedQuery = prepareAffarioProductSearchQuery(query);
    } catch (error) {
      const message =
        error instanceof AffarioProductSearchInputError
          ? getInputErrorMessage(error)
          : "Controlla il testo inserito e riprova.";

      setSubmittedQuery("");
      setSearchResult(null);
      setSelectedVariant(null);
      setErrorMessage(message);
      setStatus("error");
      return;
    }

    setSubmittedQuery(query.trim());
    setSearchResult(null);
    setSelectedVariant(null);
    setErrorMessage(null);
    setStatus("loading");

    try {
      const response = await fetch(
        `/api/search/products?q=${encodeURIComponent(
          preparedQuery.normalizedQuery
        )}`,
        { headers: { Accept: "application/json" } }
      );
      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new DemoProductSearchError(
          getApiErrorMessage(payload) ??
            "Non è stato possibile completare la ricerca."
        );
      }

      const result = getSearchResult(payload);

      if (!result) {
        throw new DemoProductSearchError(
          "La ricerca ha restituito una risposta non valida."
        );
      }

      setSearchResult(result);
      setStatus("results");
    } catch (error) {
      setErrorMessage(
        error instanceof DemoProductSearchError
          ? error.message
          : "Non è stato possibile completare la ricerca."
      );
      setStatus("error");
    }
  }

  function handleVariantSelect(familyId: string, asin: string | null) {
    if (!asin) {
      setSelectedVariant((current) =>
        current?.familyId === familyId ? null : current
      );
      return;
    }

    setSelectedVariant({ familyId, asin });
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-16 text-gray-900">
      <Hero
        query={query}
        setQuery={setQuery}
        onSearch={handleSearch}
        isLoading={status === "loading"}
      />

      {status === "loading" && (
        <section
          className="mx-auto max-w-4xl px-5"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow">
            <p className="text-lg font-bold">Ricerca dei prodotti in corso...</p>
            <p className="mt-2 text-gray-500">
              Stiamo cercando le famiglie e le varianti disponibili.
            </p>
          </div>
        </section>
      )}

      {status === "error" && errorMessage && (
        <section className="mx-auto max-w-4xl px-5" role="alert">
          <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow">
            <h2 className="text-xl font-bold">Ricerca non completata</h2>
            <p className="mt-2 text-gray-600">{errorMessage}</p>
          </div>
        </section>
      )}

      {status === "results" && searchResult?.families.length === 0 && (
        <section className="mx-auto max-w-4xl px-5">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow">
            <h2 className="text-xl font-bold">Nessun prodotto trovato</h2>
            <p className="mt-2 text-gray-500">
              Prova con un&apos;altra parola chiave.
            </p>
          </div>
        </section>
      )}

      {status === "results" && searchResult?.families.length ? (
        <ProductList
          query={submittedQuery}
          families={searchResult.families}
          selectedAsin={selectedVariant?.asin ?? null}
          onSelectVariant={handleVariantSelect}
        />
      ) : null}
    </main>
  );
}
