"use client";

import { useState } from "react";
import Hero from "@/components/Hero";

const products = [
  {
    name: "iPhone 17 Pro 128GB Nero",
    price: "€ 1.099",
    score: 72,
    verdict: "Buon prezzo",
    color: "#22c55e",
  },
  {
    name: "iPhone 17 Pro 256GB Nero",
    price: "€ 1.149",
    score: 84,
    verdict: "Ottimo momento per acquistare",
    color: "#166534",
  },
  {
    name: "iPhone 17 Pro 512GB Titanio",
    price: "€ 1.349",
    score: 48,
    verdict: "Prezzo nella media",
    color: "#eab308",
  },
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  function handleSearch() {
    setSearched(true);
    setSelectedProduct(null);
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-16 text-gray-900">
      <Hero query={query} setQuery={setQuery} onSearch={handleSearch} />

      {searched && !selectedProduct && (
        <section className="mx-auto max-w-4xl px-5">
          <h2 className="text-2xl font-bold">Abbiamo trovato prodotti compatibili</h2>
          <p className="mt-2 text-gray-500">
            Hai cercato: <strong>{query || "iPhone 17 Pro"}</strong>
          </p>

          <div className="mt-5 grid gap-4">
            {products.map((product) => (
              <button
                key={product.name}
                onClick={() => setSelectedProduct(product)}
                className="grid gap-2 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-md"
              >
                <strong>{product.name}</strong>
                <span>{product.price}</span>
                <small>Seleziona per analizzare</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {selectedProduct && (
        <section className="mx-auto mt-8 max-w-3xl rounded-3xl bg-white p-8 shadow-xl">
          <h2 className="text-2xl font-bold">{selectedProduct.name}</h2>

          <p className="mt-4 text-2xl font-bold">
            Prezzo attuale: {selectedProduct.price}
          </p>

          <div
            className="mt-4 inline-block rounded-xl px-5 py-3 font-extrabold text-white"
            style={{ background: selectedProduct.color }}
          >
            Affario Score: {selectedProduct.score}/100
          </div>

          <h3 className="mt-4 text-xl font-bold">{selectedProduct.verdict}</h3>

          <p className="mt-4 leading-relaxed text-gray-600">
            Il prezzo attuale viene confrontato con l&apos;andamento degli ultimi
            90 giorni. Più il prezzo è vicino ai minimi recenti, più alto sarà
            l&apos;Affario Score.
          </p>

          <ul className="mt-4 list-disc pl-5 leading-8">
            <li>Prezzo minimo ultimi 90 giorni: € 1.089</li>
            <li>Prezzo attuale inferiore alla media recente</li>
          </ul>

          <div className="mt-6">
            <button className="w-full rounded-xl bg-green-600 p-4 font-extrabold text-white">
              🛒 Compra ora su Amazon
            </button>

            <p className="mb-5 mt-3 text-center text-sm text-gray-500">
              Verrai reindirizzato ad Amazon per completare l&apos;acquisto.
            </p>

            <button className="w-full rounded-xl bg-gray-900 p-4 font-bold text-white">
              🔔 Avvisami se scende ancora
            </button>
          </div>
        </section>
      )}
    </main>
  );
}