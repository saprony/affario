"use client";

import { useState } from "react";

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

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logo}>AFFARIO</div>
      </header>

      <section style={styles.hero}>
        <div style={styles.badge}>🟢 Price intelligence per acquisti online</div>

        <h1 style={styles.title}>
          Gli affari non si trovano...
          <br />
          <span style={styles.green}>si aspettano!</span>
        </h1>

        <p style={styles.subtitle}>Scegli il momento giusto per comprare.</p>

        <div style={styles.searchBox}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="text"
            placeholder="Che prodotto stai pensando di comprare?"
            style={styles.input}
          />
          <button
            style={styles.button}
            onClick={() => {
              setSearched(true);
              setSelectedProduct(null);
            }}
          >
            Analizza il prezzo
          </button>
        </div>
      </section>

      {searched && !selectedProduct && (
        <section style={styles.results}>
          <h2>Abbiamo trovato prodotti compatibili</h2>
          <p style={styles.muted}>
            Hai cercato: <strong>{query || "iPhone 17 Pro"}</strong>
          </p>

          <div style={styles.productList}>
            {products.map((product) => (
              <button
                key={product.name}
                style={styles.productCard}
                onClick={() => setSelectedProduct(product)}
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
        <section style={styles.analysis}>
          <h2>{selectedProduct.name}</h2>

          <p style={styles.price}>Prezzo attuale: {selectedProduct.price}</p>

          <div
            style={{
              ...styles.scoreBox,
              background: selectedProduct.color,
            }}
          >
            Affario Score: {selectedProduct.score}/100
          </div>

          <h3>{selectedProduct.verdict}</h3>

          <p style={styles.analysisText}>
            Il prezzo attuale viene confrontato con l&apos;andamento degli ultimi
            90 giorni. Più il prezzo è vicino ai minimi recenti, più alto sarà
            l&apos;Affario Score.
          </p>

          <ul style={styles.list}>
            <li>Prezzo medio ultimi 90 giorni: € 1.240</li>
            <li>Prezzo minimo ultimi 90 giorni: € 1.089</li>
            <li>Prezzo attuale inferiore alla media recente</li>
          </ul>

          <div style={styles.ctaContainer}>
            <button style={styles.amazonButton}>
              🛒 Compra ora su Amazon
            </button>

            <p style={styles.amazonText}>
              Verrai reindirizzato ad Amazon per completare l&apos;acquisto.
            </p>

            <button style={styles.alertButton}>
              🔔 Avvisami se scende ancora
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    color: "#111827",
    fontFamily: "Arial, sans-serif",
    paddingBottom: "60px",
  },
  header: {
    maxWidth: "1100px",
    margin: "0 auto",
    padding: "24px 20px",
  },
  logo: {
    fontSize: "24px",
    fontWeight: "900",
    color: "#16a34a",
  },
  hero: {
    maxWidth: "900px",
    margin: "0 auto",
    padding: "60px 20px",
    textAlign: "center" as const,
  },
  badge: {
    display: "inline-block",
    marginBottom: "24px",
    padding: "8px 14px",
    borderRadius: "999px",
    background: "#dcfce7",
    color: "#166534",
    fontSize: "14px",
    fontWeight: "700",
  },
  title: {
    margin: 0,
    fontSize: "54px",
    lineHeight: "1.05",
    fontWeight: "900",
  },
  green: {
    color: "#16a34a",
  },
  subtitle: {
    marginTop: "22px",
    fontSize: "24px",
    color: "#4b5563",
  },
  searchBox: {
    margin: "36px auto 0",
    maxWidth: "720px",
    display: "flex",
    gap: "12px",
    background: "white",
    padding: "12px",
    borderRadius: "18px",
    boxShadow: "0 15px 40px rgba(0,0,0,0.10)",
  },
  input: {
    flex: 1,
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "16px",
    fontSize: "16px",
  },
  button: {
    border: "none",
    borderRadius: "12px",
    background: "#16a34a",
    color: "white",
    fontSize: "16px",
    fontWeight: "700",
    padding: "0 24px",
    cursor: "pointer",
  },
  results: {
    maxWidth: "900px",
    margin: "0 auto",
    padding: "20px",
  },
  muted: {
    color: "#6b7280",
  },
  productList: {
    display: "grid",
    gap: "16px",
    marginTop: "20px",
  },
  productCard: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    padding: "20px",
    textAlign: "left" as const,
    display: "grid",
    gap: "8px",
    cursor: "pointer",
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
  },
  analysis: {
    maxWidth: "760px",
    margin: "30px auto",
    background: "white",
    padding: "30px",
    borderRadius: "24px",
    boxShadow: "0 15px 40px rgba(0,0,0,0.10)",
  },
  price: {
    fontSize: "22px",
    fontWeight: "700",
  },
  scoreBox: {
    display: "inline-block",
    padding: "12px 18px",
    borderRadius: "14px",
    color: "white",
    fontWeight: "800",
    margin: "16px 0",
  },
  analysisText: {
    color: "#4b5563",
    lineHeight: "1.6",
  },
  list: {
    lineHeight: "1.8",
  },
  ctaContainer: {
    marginTop: "24px",
  },
  amazonButton: {
    width: "100%",
    border: "none",
    borderRadius: "14px",
    background: "#16a34a",
    color: "white",
    padding: "16px",
    fontWeight: "800",
    fontSize: "16px",
    cursor: "pointer",
  },
  amazonText: {
    textAlign: "center" as const,
    color: "#6b7280",
    fontSize: "13px",
    marginTop: "10px",
    marginBottom: "20px",
  },
  alertButton: {
    width: "100%",
    border: "none",
    borderRadius: "14px",
    background: "#111827",
    color: "white",
    padding: "14px 20px",
    fontWeight: "700",
    cursor: "pointer",
  },
};