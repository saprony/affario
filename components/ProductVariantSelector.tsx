"use client";

import { useState } from "react";
import { Product } from "@/types/product";

type ProductVariantSelectorProps = {
  familyTitle: string;
  products: Product[];
  initialProduct: Product | null;
  onSelectProduct: (product: Product) => void;
};

export default function ProductVariantSelector({
  familyTitle,
  products,
  initialProduct,
  onSelectProduct,
}: ProductVariantSelectorProps) {
  const [selectedMemory, setSelectedMemory] = useState<string | null>(
    initialProduct?.memory ?? null
  );
  const [selectedColor, setSelectedColor] = useState<string | null>(
    initialProduct?.color ?? null
  );

  const memories = Array.from(
    new Set(products.map((product) => product.memory))
  );
  const productsForMemory = selectedMemory
    ? products.filter((product) => product.memory === selectedMemory)
    : [];
  const colors = Array.from(
    new Set(productsForMemory.map((product) => product.color))
  );
  const selectedProduct =
    selectedMemory && selectedColor
      ? products.find(
          (product) =>
            product.memory === selectedMemory && product.color === selectedColor
        ) ?? null
      : null;

  function handleMemorySelect(memory: string) {
    const availableColors = products
      .filter((product) => product.memory === memory)
      .map((product) => product.color);
    const nextColor =
      selectedColor && availableColors.includes(selectedColor)
        ? selectedColor
        : null;

    setSelectedMemory(memory);
    setSelectedColor(nextColor);
  }

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-md sm:p-6">
      <h3 className="text-xl font-black text-gray-900">{familyTitle}</h3>

      <fieldset className="mt-5">
        <legend className="font-bold text-gray-700">Memoria</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {memories.map((memory) => {
            const isSelected = memory === selectedMemory;

            return (
              <button
                key={memory}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleMemorySelect(memory)}
                className={`min-h-11 rounded-xl border px-4 py-2 font-bold transition ${
                  isSelected
                    ? "border-green-600 bg-green-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:border-green-600"
                }`}
              >
                {memory}
              </button>
            );
          })}
        </div>
      </fieldset>

      {selectedMemory && (
        <fieldset className="mt-5">
          <legend className="font-bold text-gray-700">Colore</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {colors.map((color) => {
              const isSelected = color === selectedColor;

              return (
                <button
                  key={color}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedColor(color)}
                  className={`min-h-11 rounded-xl border px-4 py-2 font-bold transition ${
                    isSelected
                      ? "border-green-600 bg-green-50 text-green-800"
                      : "border-gray-300 bg-white text-gray-700 hover:border-green-600"
                  }`}
                >
                  {color}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {selectedProduct && (
        <div className="mt-6 rounded-2xl bg-slate-50 p-4 sm:flex sm:items-end sm:justify-between sm:gap-5">
          <div>
            <p className="text-sm font-bold text-gray-500">
              Variante selezionata
            </p>
            <p className="mt-1 font-bold text-gray-900">
              {selectedProduct.title}
            </p>
            <p className="mt-2 text-2xl font-black text-green-600">
              € {selectedProduct.currentPrice.toLocaleString("it-IT")}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onSelectProduct(selectedProduct)}
            className="mt-4 w-full rounded-xl bg-green-600 px-5 py-3 font-extrabold text-white sm:mt-0 sm:w-auto"
          >
            Analizza il prezzo
          </button>
        </div>
      )}
    </article>
  );
}
