import type { AffarioAdvice } from "./affarioAdvice";

export type AffarioSavingsPotential =
  | {
      status: "AVAILABLE";
      amount: number;
      targetPrice: number;
      message: string;
    }
  | {
      status: "NOT_APPLICABLE" | "INSUFFICIENT_DATA";
      amount: null;
      targetPrice: null;
      message: null;
    };

export type AffarioProductAnalysisData = {
  asin: string;
  buyBox: {
    status: "AVAILABLE" | "UNAVAILABLE";
    currentPrice: number | null;
  };
  lastBuyBoxUpdate: string | null;
  priceHistory90Days: {
    averageBuyBoxPrice: number | null;
    minimumBuyBoxPrice: number | null;
  };
  advice: AffarioAdvice;
  savingsPotential: AffarioSavingsPotential;
};

export type ProductAnalysisState =
  | { status: "idle" }
  | { status: "loading"; familyId: string; asin: string }
  | {
      status: "success";
      familyId: string;
      asin: string;
      data: AffarioProductAnalysisData;
    }
  | {
      status: "error";
      familyId: string;
      asin: string;
      message: string;
    };
