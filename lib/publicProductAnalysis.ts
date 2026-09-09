import type { AffarioPublicMode } from "./affarioPublicMode";
import type { AffarioAdvice } from "../types/affarioAdvice";
import type { AffarioSavingsPotential } from "../types/productAnalysis";

export type AffarioFullProductAnalysisApiData = {
  asin: string;
  title: string;
  brand: string | null;
  model: string | null;
  imageUrl: string | null;
  color: string | null;
  size: string | null;
  parentAsin: string | null;
  buyBox: {
    status: "AVAILABLE" | "UNAVAILABLE";
    currentPrice: number | null;
    price: number | null;
    shipping: number | null;
    total: number | null;
    currency: string;
    availabilityMessage: string | null;
    isAmazon: boolean | null;
    isFBA: boolean | null;
    isPrimeEligible: boolean | null;
  };
  lastBuyBoxUpdate: string | null;
  priceHistory90Days: {
    averageBuyBoxPrice: number | null;
    minimumBuyBoxPrice: number | null;
    minimumBuyBoxPriceAt: string | null;
    currency: string;
  };
  advice: AffarioAdvice;
  savingsPotential: AffarioSavingsPotential;
};

export type AffarioReviewProductAnalysisApiData = {
  publicMode: "review";
  asin: string;
  advice: AffarioAdvice;
  savingsPotential: AffarioSavingsPotential;
};

export type AffarioPublicProductAnalysisApiData =
  | AffarioFullProductAnalysisApiData
  | AffarioReviewProductAnalysisApiData;

export function getPublicProductAnalysisData(
  data: AffarioFullProductAnalysisApiData,
  publicMode: "review"
): AffarioReviewProductAnalysisApiData;
export function getPublicProductAnalysisData(
  data: AffarioFullProductAnalysisApiData,
  publicMode: "full"
): AffarioFullProductAnalysisApiData;
export function getPublicProductAnalysisData(
  data: AffarioFullProductAnalysisApiData,
  publicMode: AffarioPublicMode
): AffarioPublicProductAnalysisApiData;

export function getPublicProductAnalysisData(
  data: AffarioFullProductAnalysisApiData,
  publicMode: AffarioPublicMode
): AffarioPublicProductAnalysisApiData {
  if (publicMode === "review") {
    return {
      publicMode,
      asin: data.asin,
      advice: data.advice,
      savingsPotential: data.savingsPotential,
    };
  }

  return data;
}
