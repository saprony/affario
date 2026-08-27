"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";

import {
  normalizePriceAlertEmail,
  PRICE_ALERT_ACTIVE_STATUS,
  PriceAlertRequestError,
  requestAffarioPriceAlertOnce,
  type AffarioPriceAlertOpportunity,
  type PriceAlertPersistenceStatus,
} from "@/lib/affarioPriceAlert";
import { formatEuroPrice } from "@/lib/productAnalysis";

type AffarioPriceAlertProps = {
  exactAsin: string;
  targetPrice: number;
  opportunity: AffarioPriceAlertOpportunity;
};

type SubmitStatus =
  | "idle"
  | "submitting"
  | "created"
  | "duplicate"
  | "error";

export default function AffarioPriceAlert({
  exactAsin,
  targetPrice,
  opportunity,
}: AffarioPriceAlertProps) {
  const [isOpen, setIsOpen] = useState(opportunity.priority === "PRIMARY");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmationEmailSent, setConfirmationEmailSent] = useState(false);
  const [alertStatus, setAlertStatus] =
    useState<PriceAlertPersistenceStatus | null>(null);
  const requestGate = useRef({ inFlight: false });
  const inputId = `affario-alert-email-${exactAsin}`;
  const isSubmitting = status === "submitting";
  const isComplete = status === "created" || status === "duplicate";
  const isPrimary = opportunity.priority === "PRIMARY";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (normalizePriceAlertEmail(email) === null) {
      setStatus("error");
      setErrorMessage("Inserisci un indirizzo email valido.");
      return;
    }

    const request = requestAffarioPriceAlertOnce(
      exactAsin,
      email,
      requestGate.current
    );

    if (!request) {
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const result = await request;

      setConfirmationEmailSent(result.confirmationEmailSent);
      setAlertStatus(result.alertStatus);
      setStatus(result.alreadyExists ? "duplicate" : "created");
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof PriceAlertRequestError
          ? error.message
          : "Non è stato possibile creare l'alert. Riprova."
      );
    }
  }

  if (!isOpen) {
    return (
      <div className="mt-5">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full rounded-xl border border-green-700 bg-white px-5 py-3 font-extrabold text-green-800 transition hover:bg-green-50"
        >
          {opportunity.label}
        </button>
      </div>
    );
  }

  return (
    <section
      className={`mt-5 rounded-2xl border p-5 ${
        isPrimary
          ? "border-green-600 bg-green-50"
          : "border-gray-200 bg-slate-50"
      }`}
    >
      <h4 className="text-xl font-black text-gray-900">
        {opportunity.label}
      </h4>
      <p className="mt-2 text-sm font-bold text-green-900">
        Prezzo obiettivo AFFARIO: circa {formatEuroPrice(targetPrice)}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">
        Il prezzo obiettivo è calcolato da AFFARIO e non è modificabile.
      </p>

      {isComplete ? (
        <div
          role="status"
          className="mt-4 rounded-xl border border-green-300 bg-white p-4 text-green-900"
        >
          {status === "duplicate" &&
          alertStatus === PRICE_ALERT_ACTIVE_STATUS ? (
            <>
              <p className="font-extrabold">Questo alert è già attivo.</p>
              <p className="mt-1 text-sm leading-relaxed">
                Non abbiamo creato un secondo alert identico.
              </p>
            </>
          ) : status === "duplicate" && confirmationEmailSent ? (
            <>
              <p className="font-extrabold">
                Nuova email di conferma inviata.
              </p>
              <p className="mt-1 text-sm leading-relaxed">
                Usa il nuovo link: quello precedente non è più valido.
              </p>
            </>
          ) : status === "duplicate" ? (
            <>
              <p className="font-extrabold">
                Questo alert è già in attesa di conferma.
              </p>
              <p className="mt-1 text-sm leading-relaxed">
                Per evitare invii ripetuti non abbiamo inviato un&apos;altra
                email. Controlla i messaggi già ricevuti oppure riprova più
                tardi.
              </p>
            </>
          ) : (
            <>
              {confirmationEmailSent ? (
                <>
                  <p className="font-extrabold">
                    Controlla la tua email per confermare l&apos;alert.
                  </p>
                  <p className="mt-1 text-sm leading-relaxed">
                    L&apos;alert non è ancora attivo: apri il link e conferma la
                    richiesta.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-extrabold text-amber-900">
                    Richiesta salvata, ma email non inviata.
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-amber-900">
                    L&apos;alert non è attivo. Riprova più tardi.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4" noValidate>
          <label htmlFor={inputId} className="block font-bold text-gray-900">
            Email
          </label>
          <input
            id={inputId}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            disabled={isSubmitting}
            aria-invalid={status === "error"}
            className="mt-2 min-h-12 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100 disabled:cursor-wait disabled:opacity-70"
            placeholder="nome@esempio.it"
          />

          {status === "error" && (
            <p
              role="alert"
              className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700"
            >
              {errorMessage}
            </p>
          )}

          <p className="mt-3 text-xs leading-relaxed text-gray-600">
            Useremo la tua email solo per questo alert e per le comunicazioni
            necessarie al servizio. {" "}
            <Link
              href="/privacy"
              className="font-semibold text-green-800 underline underline-offset-2"
            >
              Informativa Privacy
            </Link>
          </p>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`mt-4 w-full rounded-xl px-5 py-3 font-extrabold transition disabled:cursor-wait disabled:opacity-60 ${
              isPrimary
                ? "bg-green-700 text-white hover:bg-green-800"
                : "bg-gray-900 text-white hover:bg-black"
            }`}
          >
            {isSubmitting ? "Creazione alert..." : "Crea alert"}
          </button>
        </form>
      )}
    </section>
  );
}
