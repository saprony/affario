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
          <footer className="border-t border-gray-200 bg-white px-5 py-8 text-center text-sm leading-relaxed text-gray-600">
            <div className="mx-auto max-w-5xl">
              <p>
                In qualità di Affiliato Amazon io ricevo un guadagno dagli
                acquisti idonei.
              </p>
              <p className="mt-2">AFFARIO è un servizio indipendente.</p>
              <div className="mt-3 flex justify-center gap-5 font-semibold text-gray-700">
                <Link href="/">Home</Link>
                <Link href="/guide">Guide</Link>
                <Link
                  href="/privacy"
                  className="underline underline-offset-2 hover:text-gray-900"
                >
                  Privacy
                </Link>
              </div>
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
