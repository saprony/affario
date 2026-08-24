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
