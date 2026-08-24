"use client";

import { useMemo, useState } from "react";
import ProductPriceAnalysis from "@/components/ProductPriceAnalysis";
import {
  createInitialVariantSelection,
  findVariantForSelection,
  getAvailableVariantAttributeValues,
  getDisplayFamilyTitle,
  getVariantDescription,
  getVariantDimensionLabel,
  getVariantDimensions,
  type VariantSelection,
} from "@/lib/productVariantSelection";
import type { ProductAnalysisState } from "@/types/productAnalysis";
import type { AffarioProductSearchFamily } from "@/types/productSearch";

type ProductVariantSelectorProps = {
  family: AffarioProductSearchFamily;
  query: string;
  analysisState: ProductAnalysisState;
  onVariantChange: (familyId: string) => void;
  onAnalyzeVariant: (familyId: string, asin: string) => void;
};

export default function ProductVariantSelector({
  family,
  query,
  analysisState,
  onVariantChange,
  onAnalyzeVariant,
}: ProductVariantSelectorProps) {
  const dimensions = useMemo(
    () => getVariantDimensions(family.variants),
    [family.variants]
  );
  const displayTitle = useMemo(
    () => getDisplayFamilyTitle(family.title, family.variants),
    [family.title, family.variants]
  );
  const [selection, setSelection] = useState<VariantSelection>(() =>
    createInitialVariantSelection(query, family.variants, dimensions)
  );
  const [undimensionedVariantAsin, setUndimensionedVariantAsin] = useState<
    string | null
  >(() =>
    dimensions.length === 0 && family.variants.length === 1
      ? family.variants[0].asin
      : null
  );
  const dimensionedVariant = findVariantForSelection(
    family.variants,
    dimensions,
    selection
  );
  const selectedVariant =
    dimensions.length === 0
      ? family.variants.find(
          (variant) => variant.asin === undimensionedVariantAsin
        ) ?? null
      : dimensionedVariant;
  const isAnalysisLoading = analysisState.status === "loading";
  const isSelectedVariantAnalysis =
    selectedVariant !== null &&
    analysisState.status !== "idle" &&
    analysisState.familyId === family.familyId &&
    analysisState.asin === selectedVariant.asin;

  function handleAttributeSelect(
    dimension: string,
    value: string,
    dimensionIndex: number
  ) {
    setSelection((current) => {
      const nextSelection: Record<string, string> = {};

      for (let index = 0; index < dimensionIndex; index += 1) {
        const previousDimension = dimensions[index];
        const previousValue = current[previousDimension];

        if (previousValue) {
          nextSelection[previousDimension] = previousValue;
        }
      }

      nextSelection[dimension] = value;
      return nextSelection;
    });
    onVariantChange(family.familyId);
  }

  function handleUndimensionedVariantSelect(asin: string) {
    setUndimensionedVariantAsin(asin);
    onVariantChange(family.familyId);
  }

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-md sm:p-6">
      <div className="grid gap-5 sm:grid-cols-[8rem_1fr] sm:items-start">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-slate-50 p-3">
          {family.imageUrl ? (
            // The public DTO can contain different provider image hosts.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={family.imageUrl}
              alt={displayTitle}
              className="h-full w-full object-contain"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-center text-sm font-bold text-gray-400">
              Immagine non disponibile
            </span>
          )}
        </div>

        <div>
          <h3 className="text-xl font-black text-gray-900">{displayTitle}</h3>

          {family.brand && <p className="mt-2 text-gray-600">{family.brand}</p>}

          <p className="mt-2 text-sm font-bold text-gray-500">
            {family.variants.length === 1
              ? "1 variante disponibile"
              : `${family.variants.length} varianti disponibili`}
          </p>
        </div>
      </div>

      {dimensions.map((dimension, dimensionIndex) => {
        const previousDimensions = dimensions.slice(0, dimensionIndex);
        const canChoose = previousDimensions.every(
          (previousDimension) => selection[previousDimension]
        );

        if (!canChoose) {
          return null;
        }

        const requiredSelection = Object.fromEntries(
          previousDimensions
            .filter((previousDimension) => selection[previousDimension])
            .map((previousDimension) => [
              previousDimension,
              selection[previousDimension],
            ])
        );
        const values = getAvailableVariantAttributeValues(
          family.variants,
          dimension,
          requiredSelection
        );

        return (
          <fieldset className="mt-5" key={dimension}>
            <legend className="font-bold text-gray-700">
              {getVariantDimensionLabel(dimension)}
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {values.map((value) => {
                const isSelected = selection[dimension] === value;

                return (
                  <button
                    key={value}
                    type="button"
                    disabled={isAnalysisLoading}
                    aria-pressed={isSelected}
                    onClick={() =>
                      handleAttributeSelect(dimension, value, dimensionIndex)
                    }
                    className={`min-h-11 rounded-xl border px-4 py-2 font-bold transition disabled:cursor-wait disabled:opacity-60 ${
                      isSelected
                        ? "border-green-600 bg-green-600 text-white"
                        : "border-gray-300 bg-white text-gray-700 hover:border-green-600"
                    }`}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {dimensions.length === 0 && family.variants.length > 1 && (
        <fieldset className="mt-5">
          <legend className="font-bold text-gray-700">
            Varianti disponibili
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {family.variants.map((variant, index) => {
              const isSelected = undimensionedVariantAsin === variant.asin;
              const label = `Variante ${index + 1}`;

              return (
                <button
                  key={variant.asin}
                  type="button"
                  disabled={isAnalysisLoading}
                  aria-pressed={isSelected}
                  onClick={() =>
                    handleUndimensionedVariantSelect(variant.asin)
                  }
                  className={`min-h-11 rounded-xl border px-4 py-2 font-bold transition disabled:cursor-wait disabled:opacity-60 ${
                    isSelected
                      ? "border-green-600 bg-green-600 text-white"
                      : "border-gray-300 bg-white text-gray-700 hover:border-green-600"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {selectedVariant && (
        <div className="mt-6 rounded-2xl bg-slate-50 p-4 sm:flex sm:items-end sm:justify-between sm:gap-5">
          <div>
            <p className="text-sm font-bold text-gray-500">
              Variante individuata
            </p>
            <p className="mt-1 font-bold text-gray-900">
              {getVariantDescription(selectedVariant)}
            </p>
            {isSelectedVariantAnalysis && (
              <p className="mt-2 font-bold text-green-700">
                Variante selezionata correttamente.
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={isAnalysisLoading}
            onClick={() =>
              onAnalyzeVariant(family.familyId, selectedVariant.asin)
            }
            className="mt-4 w-full rounded-xl bg-green-600 px-5 py-3 font-extrabold text-white disabled:cursor-wait disabled:bg-green-400 sm:mt-0 sm:w-auto"
          >
            {isSelectedVariantAnalysis && analysisState.status === "loading"
              ? "Analisi in corso..."
              : "Analizza il prezzo"}
          </button>
        </div>
      )}

      {isSelectedVariantAnalysis && (
        <ProductPriceAnalysis state={analysisState} />
      )}
    </article>
  );
}
