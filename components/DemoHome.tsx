"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import Hero from "@/components/Hero";
import ProductList from "@/components/ProductList";
import {
  AffarioProductSearchInputError,
  prepareAffarioProductSearchQuery,
} from "@/lib/affarioProductSearch";
import {
  ProductAnalysisRequestError,
  requestProductAnalysisOnce,
} from "@/lib/productAnalysis";
import type { ProductAnalysisState } from "@/types/productAnalysis";
import type { AffarioProductSearchWithFallbackResult } from "@/types/productSearch";

type SearchStatus = "initial" | "loading" | "results" | "error";

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
  const [productAnalysis, setProductAnalysis] =
    useState<ProductAnalysisState>({ status: "idle" });
  const productAnalysisGate = useRef({ inFlight: false });
  const productAnalysisRequestId = useRef(0);

  async function handleSearch() {
    if (status === "loading" || productAnalysis.status === "loading") {
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
      productAnalysisRequestId.current += 1;
      setProductAnalysis({ status: "idle" });
      setErrorMessage(message);
      setStatus("error");
      return;
    }

    setSubmittedQuery(query.trim());
    setSearchResult(null);
    productAnalysisRequestId.current += 1;
    setProductAnalysis({ status: "idle" });
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

  function handleVariantChange(familyId: string) {
    setProductAnalysis((current) => {
      if (current.status === "idle" || current.familyId !== familyId) {
        return current;
      }

      productAnalysisRequestId.current += 1;
      return { status: "idle" };
    });
  }

  async function handleProductAnalysis(familyId: string, asin: string) {
    const request = requestProductAnalysisOnce(
      asin,
      productAnalysisGate.current
    );

    if (!request) {
      return;
    }

    const requestId = productAnalysisRequestId.current + 1;
    productAnalysisRequestId.current = requestId;
    setProductAnalysis({ status: "loading", familyId, asin });

    try {
      const data = await request;

      if (productAnalysisRequestId.current === requestId) {
        setProductAnalysis({ status: "success", familyId, asin, data });
      }
    } catch (error) {
      if (productAnalysisRequestId.current === requestId) {
        setProductAnalysis({
          status: "error",
          familyId,
          asin,
          message:
            error instanceof ProductAnalysisRequestError
              ? error.message
              : "Non è stato possibile recuperare i dati del prezzo.",
        });
      }
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-16 text-gray-900">
      <Hero
        query={query}
        setQuery={setQuery}
        onSearch={handleSearch}
        isLoading={status === "loading"}
        isDisabled={productAnalysis.status === "loading"}
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
              Stiamo cercando le famiglie e le varianti rilevate.
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
          analysisState={productAnalysis}
          onVariantChange={handleVariantChange}
          onAnalyzeVariant={handleProductAnalysis}
        />
      ) : null}

      <section
        aria-labelledby="come-valutare-il-prezzo"
        className="mx-auto mt-16 max-w-4xl px-5"
      >
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10">
          <h2
            id="come-valutare-il-prezzo"
            className="text-2xl font-black tracking-tight text-gray-900 sm:text-3xl"
          >
            Capisci se il prezzo è davvero conveniente
          </h2>

          <div className="mt-5 space-y-4 leading-7 text-gray-600">
            <p>
              Quando trovi un prodotto online, uno sconto evidente può sembrare
              sufficiente per decidere. Il prezzo barrato o la percentuale
              mostrata dal negozio, però, non raccontano sempre quanto
              l&apos;offerta sia davvero interessante. AFFARIO parte dal prezzo
              corrente e lo legge nel suo contesto, per aiutarti a {" "}
              <Link
                href="/guide/come-capire-se-un-prezzo-online-e-davvero-conveniente"
                className="font-semibold text-green-700 underline decoration-green-200 decoration-2 underline-offset-2 hover:text-green-800"
              >
                capire se un prezzo online è conveniente
              </Link>{" "}
              senza fermarti al confronto con il listino.
            </p>

            <p>
              L&apos;analisi confronta il prezzo attuale con il suo andamento
              recente. Lo {" "}
              <Link
                href="/guide/perche-lo-storico-del-prezzo-puo-cambiare-una-decisione"
                className="font-semibold text-green-700 underline decoration-green-200 decoration-2 underline-offset-2 hover:text-green-800"
              >
                storico del prezzo
              </Link>{" "}
              permette di capire se il valore di oggi è vicino ai livelli più
              interessanti osservati oppure se, nel periodo considerato, il
              prodotto è stato proposto a condizioni migliori. In questo modo
              un ribasso viene valutato rispetto a dati recenti, non soltanto
              rispetto a un prezzo di riferimento dichiarato.
            </p>

            <p>
              Il confronto riguarda il prodotto e la variante esatta che stai
              considerando, perché colore, memoria, taglia o configurazione
              possono avere prezzi e andamenti diversi. Questa precisione evita
              di confondere offerte che sembrano simili ma non lo sono davvero.
            </p>

            <p>
              Alla fine AFFARIO traduce le informazioni in un&apos;indicazione
              semplice: ti aiuta a valutare se è un buon momento per acquistare
              o se può essere meglio aspettare. La scelta resta tua, ma hai più
              contesto per decidere se {" "}
              <Link
                href="/guide/comprare-subito-o-aspettare"
                className="font-semibold text-green-700 underline decoration-green-200 decoration-2 underline-offset-2 hover:text-green-800"
              >
                comprare subito o aspettare
              </Link>{" "}
              senza farti guidare soltanto dall&apos;etichetta dello sconto.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
