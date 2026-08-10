import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "AFFARIO — Scegli il momento giusto per comprare",
  description:
    "AFFARIO ti aiuta a scegliere il momento giusto per acquistare online.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
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
      </body>
    </html>
  );
}
