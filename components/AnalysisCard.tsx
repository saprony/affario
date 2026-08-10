import { Product } from "@/types/product";
import { calculatePotentialSavings } from "@/lib/calculatePotentialSavings";

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

        <button className="w-full rounded-xl bg-gray-900 p-4 text-lg font-bold text-white">
          🔔 Avvisami se scende ancora
        </button>
      </div>
    </section>
  );
}
