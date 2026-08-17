import Link from "next/link";
import { guides } from "@/data/guides";

const waysAffarioHelps = [
  {
    number: "01",
    title: "Capire il prezzo",
    description:
      "Leggere un prezzo nel suo contesto, senza fermarsi al confronto con il listino dichiarato.",
  },
  {
    number: "02",
    title: "Scegliere il momento",
    description:
      "Ragionare con più calma sulla scelta tra acquistare adesso oppure attendere.",
  },
  {
    number: "03",
    title: "Comprare con più consapevolezza",
    description:
      "Considerare variante, caratteristiche e condizioni dell'offerta prima del clic finale.",
  },
];

export default function PublicHome() {
  const featuredGuides = guides.slice(0, 3);

  return (
    <main className="flex-1 bg-white text-slate-950">
      <section className="relative overflow-hidden border-b border-emerald-950/10 bg-[linear-gradient(145deg,#ffffff_15%,#f0fdf4_100%)]">
        <div className="absolute -right-24 top-16 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28 lg:py-36">
          <p className="inline-flex rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-bold text-emerald-800 shadow-sm">
            Analisi intelligente dei prezzi online
          </p>
          <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[0.96] tracking-[-0.05em] sm:text-7xl lg:text-8xl">
            AFFARIO
          </h1>
          <p className="mt-7 max-w-3xl text-3xl font-black leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Gli affari non si trovano...{" "}
            <span className="text-emerald-700">si aspettano!</span>
          </p>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
            Scegli il momento giusto per comprare. AFFARIO aiuta a dare un
            significato più chiaro alle informazioni che accompagnano un
            acquisto online.
          </p>
          <Link
            href="/guide"
            className="mt-9 inline-flex min-h-12 items-center justify-center rounded-full bg-emerald-700 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-800"
          >
            Esplora le Guide Affario
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
            Cos&apos;è AFFARIO
          </p>
          <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
            Uno sconto racconta solo una parte della storia.
          </h2>
        </div>
        <div className="space-y-5 text-lg leading-8 text-slate-600">
          <p>
            AFFARIO nasce per aiutare chi acquista online a valutare meglio il
            momento dell&apos;acquisto, andando oltre la semplice presenza di uno
            sconto. Un prezzo apparentemente ridotto non è necessariamente un
            prezzo conveniente: conta il contesto in cui compare.
          </p>
          <p>
            Anche variante, memoria, colore, taglia e caratteristiche possono
            cambiare il valore reale di un&apos;offerta. In alcuni casi aspettare ha
            senso; in altri può essere ragionevole acquistare. AFFARIO vuole
            trasformare queste informazioni complesse in indicazioni semplici,
            comprensibili e utili per decidere con maggiore consapevolezza.
          </p>
        </div>
      </section>

      <section className="bg-slate-950 px-5 py-20 text-white sm:px-8 lg:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-400">
            Come ti aiuta AFFARIO
          </p>
          <h2 className="mt-4 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">
            Più contesto, meno decisioni affrettate.
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {waysAffarioHelps.map((item) => (
              <article
                key={item.number}
                className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 sm:p-7"
              >
                <p className="text-sm font-black text-emerald-400">
                  {item.number}
                </p>
                <h3 className="mt-8 text-xl font-black">{item.title}</h3>
                <p className="mt-3 leading-7 text-slate-300">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
              Guide Affario
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
              Strumenti per acquistare meglio.
            </h2>
          </div>
          <Link
            href="/guide"
            className="font-bold text-emerald-800 underline decoration-emerald-300 decoration-2 underline-offset-4 hover:text-emerald-950"
          >
            Vedi tutte le guide
          </Link>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {featuredGuides.map((guide, index) => (
            <article
              key={guide.slug}
              className="flex min-h-72 flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.35)] sm:p-7"
            >
              <p className="text-sm font-black text-emerald-700">
                GUIDA {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-6 text-2xl font-black leading-tight tracking-tight">
                {guide.title}
              </h3>
              <p className="mt-4 flex-1 leading-7 text-slate-600">
                {guide.description}
              </p>
              <Link
                href={`/guide/${guide.slug}`}
                className="mt-7 font-bold text-emerald-800 hover:text-emerald-950"
              >
                Leggi la guida <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
