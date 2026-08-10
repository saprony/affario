"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Product } from "@/types/product";
import { calculatePotentialSavings } from "@/lib/calculatePotentialSavings";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AnalysisCardProps = {
  product: Product;
};

function getVerdict(score: number): string {
  if (score >= 80) return "Ottimo momento per acquistare";
  if (score >= 65) return "Buon prezzo";
  if (score >= 50) return "Prezzo nella media";
  return "Conviene aspettare";
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#166534";
  if (score >= 65) return "#22c55e";
  if (score >= 50) return "#eab308";
  return "#dc2626";
}

function getAdvice(score: number, savings: number): string {
  if (score >= 80) {
    return "Ti consigliamo di acquistare ora. Il prezzo è molto vicino ai minimi registrati e AFFARIO non prevede ribassi significativi nel breve periodo.";
  }

  if (score >= 65) {
    return "Il prezzo è buono. Se non hai urgenza, puoi attendere qualche giorno per verificare eventuali piccoli ribassi.";
  }

  if (score >= 50) {
    return "Il prezzo è nella media. Se puoi aspettare, AFFARIO consiglia di monitorare il prodotto prima di acquistare.";
  }

  return `Ti consigliamo di aspettare. Secondo AFFARIO potresti risparmiare fino a circa € ${savings} nei prossimi ribassi.`;
}

function getSavingsStyle(score: number) {
  if (score >= 80) {
    return {
      box: "mt-5 rounded-2xl border border-yellow-300 bg-yellow-50 p-4",
      label: "text-sm font-bold text-yellow-700",
      value: "mt-2 text-2xl font-black text-yellow-700",
    };
  }

  if (score >= 65) {
    return {
      box: "mt-5 rounded-2xl border border-green-300 bg-green-50 p-5",
      label: "text-sm font-bold text-green-700",
      value: "mt-2 text-3xl font-black text-green-700",
    };
  }

  return {
    box: "mt-5 rounded-2xl border-2 border-green-600 bg-green-100 p-6",
    label: "text-base font-bold text-green-800",
    value: "mt-2 text-5xl font-black text-green-800",
  };
}

export default function AnalysisCard({ product }: AnalysisCardProps) {
  const [isAlertFormOpen, setIsAlertFormOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [alertError, setAlertError] = useState("");
  const [isSavingAlert, setIsSavingAlert] = useState(false);
  const [isAlertCreated, setIsAlertCreated] = useState(false);

  const potentialSavings = calculatePotentialSavings(
    product.currentPrice,
    product.lowestPrice90Days
  );

  const score = product.affarioScore;
  const style = getSavingsStyle(score);
  const verdict = getVerdict(score);
  const advice = getAdvice(score, potentialSavings.savings);
  const amazonUrl = product.amazonUrl.trim();
  const isAmazonLinkAvailable = amazonUrl !== "" && amazonUrl !== "#";

  async function handleAlertSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    const numericTargetPrice = Number(targetPrice);

    if (!normalizedEmail) {
      setAlertError("Inserisci la tua email.");
      return;
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setAlertError("Inserisci un indirizzo email valido.");
      return;
    }

    if (!targetPrice || !Number.isFinite(numericTargetPrice)) {
      setAlertError("Inserisci il prezzo desiderato.");
      return;
    }

    if (numericTargetPrice <= 0) {
      setAlertError("Il prezzo desiderato deve essere maggiore di zero.");
      return;
    }

    if (numericTargetPrice >= product.currentPrice) {
      setAlertError(
        "Il prezzo desiderato deve essere inferiore al prezzo attuale."
      );
      return;
    }

    setAlertError("");
    setIsSavingAlert(true);

    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: product.id,
          email: normalizedEmail,
          targetPrice: numericTargetPrice,
        }),
      });

      if (!response.ok) {
        throw new Error("Alert non salvato");
      }

      setIsAlertCreated(true);
    } catch {
      setAlertError("Non è stato possibile attivare l'alert. Riprova.");
    } finally {
      setIsSavingAlert(false);
    }
  }

  return (
    <section className="mx-auto mt-8 max-w-3xl rounded-3xl bg-white p-8 shadow-xl">
      <h2 className="text-2xl font-bold">{product.title}</h2>

      <p className="mt-4 text-2xl font-bold">
        Prezzo attuale: € {product.currentPrice.toLocaleString("it-IT")}
      </p>

      <div className={style.box}>
        <p className={style.label}>💰 Risparmio Potenziale</p>

        {potentialSavings.savings <= 0 ? (
          <p className="mt-2 text-lg font-bold text-green-800">
            AFFARIO non prevede ribassi di prezzo nei prossimi 30 giorni.
          </p>
        ) : (
          <p className={style.value}>
            Fino a circa € {potentialSavings.savings}
          </p>
        )}
      </div>

      <div
        className="mt-5 inline-block rounded-xl px-5 py-3 font-extrabold text-white"
        style={{ background: getScoreColor(score) }}
      >
        Affario Score: {score}/100
      </div>

      <h3 className="mt-5 text-2xl font-bold">{verdict}</h3>

      <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <p className="text-sm font-bold text-blue-700">💡 Consiglio Affario</p>
        <p className="mt-2 leading-relaxed text-blue-900">{advice}</p>
      </div>

      <p className="mt-5 leading-relaxed text-gray-600">
        Il prezzo attuale viene confrontato con l&apos;andamento degli ultimi 90
        giorni. Più il prezzo è vicino ai minimi recenti, più alto sarà
        l&apos;Affario Score.
      </p>

      <ul className="mt-5 list-disc pl-5 leading-8">
        <li>
          Prezzo minimo ultimi 90 giorni: €{" "}
          {product.lowestPrice90Days.toLocaleString("it-IT")}
        </li>
        <li>
          Prezzo obiettivo Affario: €{" "}
          {potentialSavings.targetPrice.toLocaleString("it-IT")}
        </li>
      </ul>

      <div className="mt-8">
        {isAmazonLinkAvailable ? (
          <>
            <a
              href={amazonUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-xl bg-green-600 p-4 text-center text-lg font-extrabold text-white"
            >
              🛒 Compra ora su Amazon
            </a>
            <p className="mt-3 text-center text-sm leading-relaxed text-gray-600">
              Link affiliato Amazon — AFFARIO può ricevere una commissione dagli
              acquisti idonei.
            </p>
          </>
        ) : (
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-xl bg-gray-300 p-4 text-lg font-extrabold text-gray-600"
          >
            Link Amazon non disponibile
          </button>
        )}

        <p className="mb-5 mt-2 text-center text-sm text-gray-500">
          {isAmazonLinkAvailable
            ? "Verrai reindirizzato ad Amazon per completare l'acquisto."
            : "Il link per questo prodotto non è ancora disponibile."}
        </p>

        {!isAlertFormOpen && !isAlertCreated && (
          <button
            type="button"
            onClick={() => setIsAlertFormOpen(true)}
            className="w-full rounded-xl bg-gray-900 p-4 text-lg font-bold text-white"
          >
            🔔 Avvisami se scende ancora
          </button>
        )}

        {isAlertFormOpen && !isAlertCreated && (
          <form
            onSubmit={handleAlertSubmit}
            className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5"
            noValidate
          >
            <div className="rounded-xl bg-white p-4">
              <p className="text-sm font-bold text-gray-500">Alert per</p>
              <p className="mt-1 font-bold text-gray-900">{product.title}</p>
              <p className="mt-1 text-sm text-gray-600">
                Prezzo attuale: € {product.currentPrice.toLocaleString("it-IT")}
              </p>
            </div>

            <div className="mt-4">
              <label htmlFor="alert-email" className="block font-bold">
                Email
              </label>
              <input
                id="alert-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                placeholder="nome@esempio.it"
              />
            </div>

            <div className="mt-4">
              <label htmlFor="alert-target-price" className="block font-bold">
                Prezzo desiderato
              </label>
              <div className="relative mt-2">
                <span className="absolute inset-y-0 left-4 flex items-center text-gray-500">
                  €
                </span>
                <input
                  id="alert-target-price"
                  type="number"
                  value={targetPrice}
                  onChange={(event) => setTargetPrice(event.target.value)}
                  min="0.01"
                  max={Math.max(0.01, product.currentPrice - 0.01)}
                  step="0.01"
                  inputMode="decimal"
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-9 pr-4 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  placeholder="0,00"
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Deve essere inferiore al prezzo attuale.
              </p>
            </div>

            {alertError && (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700"
              >
                {alertError}
              </p>
            )}

            <p className="mt-5 text-sm leading-relaxed text-gray-600">
              L&apos;indirizzo email sarà utilizzato esclusivamente per gestire
              l&apos;alert prezzo richiesto.
            </p>
            <Link
              href="/privacy"
              className="mt-1 inline-block text-sm font-semibold text-green-700 underline underline-offset-2 hover:text-green-800"
            >
              Leggi l&apos;Informativa Privacy
            </Link>

            <button
              type="submit"
              disabled={isSavingAlert}
              className="mt-5 w-full rounded-xl bg-gray-900 p-4 text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingAlert ? "Attivazione in corso..." : "Attiva alert"}
            </button>
          </form>
        )}

        {isAlertCreated && (
          <div
            role="status"
            className="rounded-2xl border border-green-300 bg-green-50 p-5 text-green-900"
          >
            <p className="font-extrabold">Alert attivato correttamente.</p>
            <p className="mt-2 text-sm leading-relaxed">
              L&apos;alert per {product.title} è stato salvato al prezzo desiderato
              di €{" "}
              {Number(targetPrice).toLocaleString("it-IT")}.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
