"use client";

import { useState } from "react";
import Hero from "@/components/Hero";
import ProductList from "@/components/ProductList";
import AnalysisCard from "@/components/AnalysisCard";
import { products } from "@/data/products";
import { Product } from "@/types/product";

export default function DemoHome() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  function handleSearch() {
    setSearched(true);
    setSelectedProduct(null);
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-16 text-gray-900">
      <Hero query={query} setQuery={setQuery} onSearch={handleSearch} />

      {searched && !selectedProduct && (
        <ProductList
          query={query}
          products={products}
          onSelectProduct={setSelectedProduct}
        />
      )}

      {selectedProduct && <AnalysisCard product={selectedProduct} />}
    </main>
  );
}
