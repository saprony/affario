import {
  getProductAnalysisPresentation,
  type ProductAnalysisPresentation,
} from "@/lib/productAnalysis";
import {
  AFFARIO_LOWEST_12_MONTHS_LABEL,
  AFFARIO_LOWEST_SINCE_AVAILABLE_LABEL,
} from "@/lib/affarioAdvice";
import type {
  AffarioAdviceRecommendation,
  AffarioAdviceTone,
} from "@/types/affarioAdvice";
import type { ProductAnalysisState } from "@/types/productAnalysis";

type ActiveProductAnalysisState = Exclude<
  ProductAnalysisState,
  { status: "idle" }
>;

type ProductPriceAnalysisProps = {
  state: ActiveProductAnalysisState;
};

const ADVICE_TONE_STYLES: Record<AffarioAdviceTone, string> = {
  POSITIVE: "border-green-300 bg-green-50 text-green-900",
  NEUTRAL: "border-amber-300 bg-amber-50 text-amber-900",
  NEGATIVE: "border-red-300 bg-red-50 text-red-900",
  MUTED: "border-slate-300 bg-slate-50 text-slate-800",
};

const RECOMMENDATION_TEXT: Record<
  AffarioAdviceRecommendation,
  string | null
> = {
  BUY_NOW: "ACQUISTA ORA",
  BUY: "BUON MOMENTO PER COMPRARE",
  NEUTRAL: null,
  WAIT: "ASPETTA",
  NONE: null,
};

const PRICE_HIGHLIGHT_TEXT = {
  LOWEST_12_MONTHS: AFFARIO_LOWEST_12_MONTHS_LABEL,
  LOWEST_SINCE_AVAILABLE: AFFARIO_LOWEST_SINCE_AVAILABLE_LABEL,
} as const;

type AmazonCta = NonNullable<ProductAnalysisPresentation["amazonCta"]>;

function AmazonCtaLink({ cta }: { cta: AmazonCta }) {
  const styles = {
    PRIMARY:
      "affario-cta-emphasis bg-green-700 text-white shadow-lg hover:bg-green-800",
    SUPPORTING:
      "border border-green-700 bg-white text-green-800 hover:bg-green-50",
    NEUTRAL:
      "border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50",
  } as const;

  return (
    <div className="mt-5">
      <a
        href={cta.url}
        target="_blank"
        rel="sponsored noopener noreferrer"
        className={`block w-full rounded-xl px-5 py-3 text-center font-extrabold transition ${styles[cta.priority]}`}
      >
        {cta.label}
      </a>
      <p className="mt-2 text-center text-xs text-gray-500">
        Link affiliato Amazon. AFFARIO può ricevere una commissione dagli
        acquisti idonei.
      </p>
    </div>
  );
}

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
          Stiamo recuperando il prezzo attuale e lo storico degli ultimi 90
          giorni.
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
  const recommendationText =
    RECOMMENDATION_TEXT[presentation.advice.recommendation];
  const adviceAmazonCta =
    presentation.amazonCta?.priority === "NEUTRAL"
      ? null
      : presentation.amazonCta;
  const neutralAmazonCta =
    presentation.amazonCta?.priority === "NEUTRAL"
      ? presentation.amazonCta
      : null;

  return (
    <section
      className="mt-5 rounded-2xl border border-gray-200 bg-white p-5"
      aria-live="polite"
    >
      <div
        className={`affario-advice-enter rounded-2xl border p-5 ${ADVICE_TONE_STYLES[presentation.advice.tone]}`}
      >
        <p className="text-sm font-extrabold uppercase tracking-wide">
          Consiglio AFFARIO
        </p>
        {presentation.advice.priceHighlight && (
          <p className="mt-3 inline-flex rounded-full bg-green-800 px-3 py-1.5 text-sm font-black text-white">
            {PRICE_HIGHLIGHT_TEXT[presentation.advice.priceHighlight]}
          </p>
        )}
        {recommendationText ? (
          <>
            <h4 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              {recommendationText}
            </h4>
            <p className="mt-2 font-bold">
              {presentation.advice.label}
              {presentation.advice.score !== null && (
                <> · Affario Score {presentation.advice.score}/100</>
              )}
            </p>
          </>
        ) : (
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-2xl font-black">
              {presentation.advice.label}
            </h4>
            {presentation.advice.score !== null && (
              <p className="font-extrabold">
                Affario Score: {presentation.advice.score}/100
              </p>
            )}
          </div>
        )}
        <p className="mt-3 leading-relaxed">{presentation.advice.message}</p>
        {adviceAmazonCta && <AmazonCtaLink cta={adviceAmazonCta} />}
      </div>

      <p className="mt-6 text-sm font-bold text-gray-500">
        Dati reali del prezzo
      </p>

      {presentation.isBuyBoxAvailable ? (
        <div className="mt-2">
          <h4 className="font-extrabold text-gray-900">
            Prezzo attuale su Amazon
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
            Prezzo attuale su Amazon non disponibile
          </h4>
          <p className="mt-1 text-sm text-gray-600">
            Al momento non è disponibile un prezzo attuale per questa
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

      {neutralAmazonCta && <AmazonCtaLink cta={neutralAmazonCta} />}
    </section>
  );
}
