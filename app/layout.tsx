import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import PublicHeader from "@/components/PublicHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "AFFARIO — Scegli il momento giusto per comprare",
    template: "%s | AFFARIO",
  },
  description:
    "AFFARIO aiuta a valutare il momento giusto per acquistare online.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isPublicSite = process.env.NODE_ENV === "production";

  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {isPublicSite && <PublicHeader />}
        {children}
        {isPublicSite ? (
          <footer className="border-t border-emerald-950/10 bg-[#f5f6f2] px-5 py-10 text-sm leading-relaxed text-slate-600 sm:px-8">
            <div className="mx-auto flex max-w-6xl flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl text-center sm:text-left">
                <p className="font-black tracking-[0.16em] text-emerald-800">
                  AFFARIO
                </p>
                <p className="mt-3">
                  In qualità di Affiliato Amazon io ricevo un guadagno dagli
                  acquisti idonei.
                </p>
                <p className="mt-1.5">AFFARIO è un servizio indipendente.</p>
              </div>
              <nav
                aria-label="Navigazione piè di pagina"
                className="flex justify-center gap-5 font-bold text-slate-700 sm:justify-end"
              >
                <Link
                  href="/"
                  className="rounded-md hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  Home
                </Link>
                <Link
                  href="/guide"
                  className="rounded-md hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  Guide
                </Link>
                <Link
                  href="/privacy"
                  className="rounded-md underline underline-offset-4 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  Privacy
                </Link>
              </nav>
            </div>
          </footer>
        ) : (
          <footer className="border-t border-gray-200 bg-white px-4 py-6 text-center text-sm leading-relaxed text-gray-600">
            <p>
              In qualità di Affiliato Amazon io ricevo un guadagno dagli acquisti
              idonei.
            </p>
            <Link
              href="/privacy"
              className="mt-2 inline-block font-semibold text-gray-700 underline underline-offset-2 hover:text-gray-900"
            >
              Privacy
            </Link>
          </footer>
        )}
      </body>
    </html>
  );
}
