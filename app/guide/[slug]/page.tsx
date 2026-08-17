import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuideBySlug, guides } from "@/data/guides";

type GuidePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);

  if (!guide) {
    return { title: "Guida non trovata" };
  }

  return {
    title: guide.title,
    description: guide.description,
  };
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);

  if (!guide) {
    notFound();
  }

  return (
    <main className="flex-1 bg-slate-50 px-5 py-10 text-slate-950 sm:px-8 sm:py-16">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white px-6 py-8 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.45)] sm:px-10 sm:py-12 lg:px-14">
        <Link
          href="/guide"
          className="text-sm font-bold text-emerald-800 hover:text-emerald-950"
        >
          <span aria-hidden="true">←</span> Tutte le guide
        </Link>

        <header className="mt-8 border-b border-slate-200 pb-9">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-emerald-700">
            Guida Affario
          </p>
          <h1 className="mt-4 text-4xl font-black leading-tight tracking-[-0.035em] sm:text-5xl">
            {guide.title}
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            {guide.description}
          </p>
          <p className="mt-5 text-sm text-slate-500">
            Pubblicata il {guide.publishedAt}
          </p>
        </header>

        <div className="mt-9 space-y-5 text-[1.0625rem] leading-8 text-slate-700">
          {guide.introduction.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        {guide.sections.map((section) => (
          <section key={section.heading} className="mt-11">
            <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              {section.heading}
            </h2>
            <div className="mt-5 space-y-5 text-[1.0625rem] leading-8 text-slate-700">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}

        {guide.affiliateExample && (
          <aside className="mt-11 rounded-3xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
            <p className="text-sm font-black uppercase tracking-[0.14em] text-emerald-800">
              Esempio di variante
            </p>
            <h2 className="mt-3 text-xl font-black text-slate-950">
              {guide.affiliateExample.title}
            </h2>
            <p className="mt-3 leading-7 text-slate-700">
              {guide.affiliateExample.description}
            </p>
            <a
              href={guide.affiliateExample.url}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-emerald-700 px-5 py-3 font-bold text-white hover:bg-emerald-800"
            >
              Vedi il prodotto su Amazon
            </a>
            <p className="mt-3 text-sm font-bold text-slate-700">
              (link a pagamento)
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              AFFARIO può ricevere una commissione dagli acquisti idonei
              effettuati tramite questo link.
            </p>
          </aside>
        )}

        <section className="mt-11 rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-emerald-400">
            Consigli pratici
          </h2>
          <ul className="mt-5 list-disc space-y-3 pl-5 leading-7 text-slate-200">
            {guide.practicalTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>

        <section className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-emerald-800">
            Principio AFFARIO
          </h2>
          <p className="mt-4 text-xl font-black leading-8 text-slate-950">
            {guide.principle}
          </p>
        </section>
      </article>
    </main>
  );
}
