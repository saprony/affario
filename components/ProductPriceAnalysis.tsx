import { getProductAnalysisPresentation } from "@/lib/productAnalysis";
import type { ProductAnalysisState } from "@/types/productAnalysis";

type ActiveProductAnalysisState = Exclude<
  ProductAnalysisState,
  { status: "idle" }
>;

type ProductPriceAnalysisProps = {
  state: ActiveProductAnalysisState;
};

export default function ProductPriceAnalysis({
  state,
}: ProductPriceAnalysisProps) {
  if (state.status === "loading") {
    return (
      <div
        className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-5"
        role="status"
        aria-live="polite"
      >
        <p className="font-extrabold text-green-800">
          Analisi del prezzo in corso...
        </p>
        <p className="mt-1 text-sm text-gray-600">
          Stiamo recuperando Buy Box e storico degli ultimi 90 giorni.
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5"
        role="alert"
      >
        <p className="font-extrabold text-gray-900">Analisi non disponibile</p>
        <p className="mt-1 text-sm text-gray-600">{state.message}</p>
      </div>
    );
  }

  const presentation = getProductAnalysisPresentation(state.data);

  return (
    <section
      className="mt-5 rounded-2xl border border-gray-200 bg-white p-5"
      aria-live="polite"
    >
      <p className="text-sm font-bold text-gray-500">Dati reali del prezzo</p>

      {presentation.isBuyBoxAvailable ? (
        <div className="mt-2">
          <h4 className="font-extrabold text-gray-900">
            Buy Box / Featured Offer
          </h4>
          <p className="mt-1 text-3xl font-black text-green-700">
            {presentation.currentPrice}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {presentation.priceTimestamp ??
              "Orario del prezzo non disponibile."}
          </p>
        </div>
      ) : (
        <div className="mt-2">
          <h4 className="font-extrabold text-gray-900">
            Buy Box / Featured Offer non disponibile
          </h4>
          <p className="mt-1 text-sm text-gray-600">
            Al momento non è disponibile un prezzo Buy Box per questa
            variante.
          </p>
        </div>
      )}

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-4">
          <dt className="text-sm font-bold text-gray-500">
            Minimo ultimi 90 giorni
          </dt>
          <dd className="mt-1 text-lg font-extrabold text-gray-900">
            {presentation.minimum90Days}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <dt className="text-sm font-bold text-gray-500">
            Media ultimi 90 giorni
          </dt>
          <dd className="mt-1 text-lg font-extrabold text-gray-900">
            {presentation.average90Days}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-gray-500">
        Questi valori descrivono il contesto di prezzo e non costituiscono
        ancora il Consiglio AFFARIO.
      </p>
    </section>
  );
}
