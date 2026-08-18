import Link from "next/link";
import { guides } from "@/data/guides";

const waysAffarioHelps = [
  {
    number: "01",
    title: "Capire il prezzo",
    description:
      "Leggere un prezzo nel suo contesto, senza fermarsi al confronto con il listino dichiarato.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="none">
        <path
          d="M4 17.5 9 12l3 3 7-8"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round"
        />
        <circle cx="19" cy="7" r="2" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "Scegliere il momento",
    description:
      "Ragionare con più calma sulla scelta tra acquistare adesso oppure attendere.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="none">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M12 7.5V12l3 2"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Comprare con più consapevolezza",
    description:
      "Considerare variante, caratteristiche e condizioni dell'offerta prima del clic finale.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="none">
        <path
          d="m5 12 4 4 10-10"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round"
        />
        <path
          d="M19 12a7 7 0 1 1-4.5-6.54"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

const affarioQualities = [
  "Indipendente",
  "Semplice da capire",
  "Pensato per decisioni più consapevoli",
];

export default function PublicHome() {
  const featuredGuides = guides.slice(0, 3);

  return (
    <main className="flex-1 overflow-x-clip bg-[#fafbf9] text-slate-950">
      <section className="relative overflow-hidden border-b border-emerald-950/10 bg-[linear-gradient(145deg,#ffffff_10%,#f5fbf6_58%,#eef8f1_100%)]">
        <div
          aria-hidden="true"
          className="absolute -right-28 -top-28 h-72 w-72 rounded-full border border-emerald-700/10 bg-emerald-100/50 sm:h-96 sm:w-96"
        />
        <div
          aria-hidden="true"
          className="absolute -left-24 bottom-0 h-48 w-48 rounded-full bg-white/80 blur-2xl"
        />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:py-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-700/15 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-emerald-800 shadow-[0_8px_24px_-18px_rgba(6,78,59,0.5)] sm:text-sm">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-emerald-600"
              />
              Analisi intelligente dei prezzi online
            </p>

            <p className="mt-8 text-sm font-black tracking-[0.22em] text-emerald-700 lg:mt-6">
              AFFARIO
            </p>
            <h1 className="mt-4 max-w-3xl text-[2.65rem] font-black leading-[1.02] tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-7xl">
              Gli affari non si trovano...
              <span className="mt-2 block text-emerald-700">si aspettano!</span>
            </h1>

            <p className="mt-7 text-xl font-bold tracking-tight text-slate-800 sm:text-2xl lg:mt-6">
              Scegli il momento giusto per comprare.
            </p>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              AFFARIO aiuta a dare un significato più chiaro alle informazioni
              che accompagnano un acquisto online.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center lg:mt-7">
              <Link
                href="/guide"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-emerald-800 bg-emerald-700 px-6 py-3 font-extrabold text-white shadow-[0_14px_30px_-16px_rgba(6,78,59,0.8)] transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
              >
                Esplora le Guide Affario
                <span aria-hidden="true" className="ml-2">
                  →
                </span>
              </Link>
              <a
                href="#cos-e-affario"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-slate-300 bg-white/80 px-6 py-3 font-bold text-slate-800 transition-colors hover:border-emerald-700 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100"
              >
                Scopri come funziona
              </a>
            </div>
          </div>

          <div
            aria-hidden="true"
            className="relative mx-auto w-full max-w-lg lg:max-w-none"
          >
            <div className="absolute -inset-5 rounded-[2.5rem] border border-emerald-800/[0.06]" />
            <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-white/80 shadow-[0_30px_80px_-50px_rgba(6,78,59,0.5)] backdrop-blur-sm">
              <div className="absolute inset-x-7 top-7 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-700/30" />
                <span className="h-px flex-1 bg-emerald-900/10" />
                <span className="h-2 w-2 rounded-full border border-emerald-700/30" />
              </div>

              <svg viewBox="0 0 520 390" className="absolute inset-0 h-full w-full" fill="none" focusable="false">
                <defs>
                  <linearGradient id="affario-line" x1="68" y1="300" x2="452" y2="80">
                    <stop stopColor="#bbf7d0" />
                    <stop offset="1" stopColor="#047857" />
                  </linearGradient>
                </defs>
                <path
                  d="M64 298C118 284 142 226 194 230c56 4 70-82 128-74 48 7 74-40 134-74"
                  stroke="url(#affario-line)"
                  strokeWidth="4" strokeLinecap="round"
                />
                <path
                  d="M64 326h392M64 264h392M64 202h392M64 140h392"
                  stroke="#064e3b"
                  strokeOpacity=".07"
                />
                <path d="M322 84v250" stroke="#047857" strokeOpacity=".22" strokeDasharray="5 8" />
                <circle cx="194" cy="230" r="8" fill="#fff" stroke="#6ee7b7" strokeWidth="4" />
                <circle cx="322" cy="156" r="15" fill="#ecfdf5" stroke="#047857" strokeWidth="4" />
                <circle cx="322" cy="156" r="4" fill="#047857" />
                <circle cx="456" cy="82" r="8" fill="#047857" />
              </svg>

              <div className="absolute bottom-7 left-7 right-7 grid grid-cols-3 gap-2">
                <span className="h-2 rounded-full bg-emerald-100" />
                <span className="h-2 rounded-full bg-emerald-200" />
                <span className="h-2 rounded-full bg-emerald-700" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="cos-e-affario"
        className="scroll-mt-24 px-5 pb-16 pt-10 sm:px-8 sm:pb-20 sm:pt-12 lg:pb-24 lg:pt-14"
      >
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-emerald-950/10 bg-[linear-gradient(135deg,#ffffff_20%,#f2f9f3_100%)] shadow-[0_24px_70px_-52px_rgba(15,23,42,0.5)]">
          <div className="grid gap-9 p-6 sm:p-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:gap-14 lg:p-14">
            <div className="relative flex min-h-52 items-center justify-center overflow-hidden rounded-[1.5rem] border border-emerald-900/10 bg-white/75">
              <svg viewBox="0 0 240 200" aria-hidden="true" focusable="false" className="h-44 w-52" fill="none">
                <circle cx="120" cy="100" r="70" stroke="#047857" strokeOpacity=".12" />
                <circle cx="120" cy="100" r="47" stroke="#047857" strokeOpacity=".22" />
                <path
                  d="m82 106 24 24 52-62"
                  stroke="#047857"
                  strokeWidth="6"
                  strokeLinecap="round" strokeLinejoin="round"
                />
                <circle cx="158" cy="68" r="7" fill="#a7f3d0" />
              </svg>
              <span className="absolute left-5 top-5 h-2 w-14 rounded-full bg-emerald-200" />
              <span className="absolute bottom-5 right-5 h-2 w-9 rounded-full bg-emerald-700/60" />
            </div>

            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
                Cos&apos;è AFFARIO
              </p>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.025em] text-slate-950 sm:text-4xl">
                Uno sconto racconta solo una parte della storia.
              </h2>
              <div className="mt-6 space-y-4 leading-7 text-slate-600 sm:text-lg sm:leading-8">
                <p>
                  AFFARIO nasce per aiutare chi acquista online a valutare
                  meglio il momento dell&apos;acquisto, andando oltre la semplice
                  presenza di uno sconto. Un prezzo apparentemente ridotto non
                  è necessariamente un prezzo conveniente: conta il contesto in
                  cui compare.
                </p>
                <p>
                  Anche variante, memoria, colore, taglia e caratteristiche
                  possono cambiare il valore reale di un&apos;offerta. In alcuni
                  casi aspettare ha senso; in altri può essere ragionevole
                  acquistare. AFFARIO vuole trasformare queste informazioni
                  complesse in indicazioni semplici, comprensibili e utili per
                  decidere con maggiore consapevolezza.
                </p>
              </div>

              <ul className="mt-7 flex flex-wrap gap-2.5">
                {affarioQualities.map((quality) => (
                  <li
                    key={quality}
                    className="rounded-full border border-emerald-700/15 bg-white px-4 py-2 text-sm font-bold text-emerald-900"
                  >
                    {quality}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200/80 bg-[#f5f6f2] px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
              Come ti aiuta AFFARIO
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.025em] text-slate-950 sm:text-4xl">
              Più contesto, meno decisioni affrettate.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {waysAffarioHelps.map((item) => (
              <article
                key={item.number}
                className="group rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)] transition-[border-color,box-shadow,transform] duration-200 lg:hover:-translate-y-1 lg:hover:border-emerald-700/25 lg:hover:shadow-[0_24px_55px_-38px_rgba(6,78,59,0.4)]"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                    {item.icon}
                  </span>
                  <span className="text-sm font-black tracking-[0.12em] text-emerald-700">
                    {item.number}
                  </span>
                </div>
                <h3 className="mt-7 text-xl font-black tracking-tight text-slate-950">
                  {item.title}
                </h3>
                <p className="mt-3 leading-7 text-slate-600">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
                Guide Affario
              </p>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.025em] text-slate-950 sm:text-4xl">
                Strumenti per acquistare meglio.
              </h2>
            </div>
            <Link
              href="/guide"
              className="inline-flex min-h-11 items-center self-start rounded-full border border-emerald-800/20 bg-emerald-50 px-5 py-2.5 font-bold text-emerald-900 transition-colors hover:border-emerald-800/35 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 sm:self-auto"
            >
              Vedi tutte le guide
              <span aria-hidden="true" className="ml-2">
                →
              </span>
            </Link>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {featuredGuides.map((guide, index) => (
              <article
                key={guide.slug}
                className="flex flex-col rounded-[1.75rem] border border-slate-200 bg-[#fcfdfb] p-6 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.5)] transition-[border-color,box-shadow,transform] duration-200 lg:hover:-translate-y-1 lg:hover:border-emerald-700/25 lg:hover:shadow-[0_24px_55px_-40px_rgba(6,78,59,0.4)]"
              >
                <p className="self-start rounded-full border border-emerald-700/15 bg-emerald-50 px-3 py-1.5 text-xs font-black tracking-[0.1em] text-emerald-800">
                  GUIDA {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-6 text-xl font-black leading-snug tracking-tight text-slate-950">
                  {guide.title}
                </h3>
                <p className="mt-4 flex-1 leading-7 text-slate-600">
                  {guide.description}
                </p>
                <Link
                  href={"/guide/" + guide.slug}
                  className="mt-6 inline-flex min-h-11 items-center self-start font-extrabold text-emerald-800 underline decoration-emerald-200 decoration-2 underline-offset-4 hover:text-emerald-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100"
                >
                  Leggi la guida <span aria-hidden="true" className="ml-1">→</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
