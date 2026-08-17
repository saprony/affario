import type { Metadata } from "next";
import Link from "next/link";
import { guides } from "@/data/guides";

export const metadata: Metadata = {
  title: "Guide Affario",
  description:
    "Guide pratiche per interpretare prezzi, sconti e varianti e scegliere con maggiore consapevolezza quando acquistare online.",
};

export default function GuidesPage() {
  return (
    <main className="flex-1 bg-slate-50 px-5 py-14 text-slate-950 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <header className="max-w-3xl">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
            Guide Affario
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
            Capire meglio prima di comprare.
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-600">
            Dieci guide indipendenti per leggere prezzi, sconti, tempi e
            varianti con più attenzione. Informazioni semplici, pensate per
            aiutarti a costruire una decisione più consapevole.
          </p>
        </header>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {guides.map((guide, index) => (
            <article
              key={guide.slug}
              className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.4)] sm:p-8"
            >
              <div className="flex items-center justify-between gap-4 text-sm">
                <p className="font-black text-emerald-700">
                  GUIDA {String(index + 1).padStart(2, "0")}
                </p>
                <p className="text-slate-500">{guide.publishedAt}</p>
              </div>
              <h2 className="mt-6 text-2xl font-black leading-tight tracking-tight">
                {guide.title}
              </h2>
              <p className="mt-4 flex-1 leading-7 text-slate-600">
                {guide.description}
              </p>
              <Link
                href={"/guide/" + guide.slug}
                className="mt-7 font-bold text-emerald-800 hover:text-emerald-950"
              >
                Leggi la guida <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
