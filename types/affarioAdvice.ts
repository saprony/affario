export type AffarioAdviceStatus = "AVAILABLE" | "INSUFFICIENT_DATA";

export type AffarioAdviceLabel =
  | "Ottimo momento"
  | "Buon prezzo"
  | "Prezzo nella media"
  | "Conviene aspettare"
  | "Dati insufficienti";

export type AffarioAdviceTone =
  | "POSITIVE"
  | "NEUTRAL"
  | "NEGATIVE"
  | "MUTED";

export type AffarioAdviceRecommendation =
  | "BUY_NOW"
  | "BUY"
  | "NEUTRAL"
  | "WAIT"
  | "NONE";

export type AffarioPriceHighlight = "LOWEST_12_MONTHS" | null;

export type AffarioAdvice = {
  status: AffarioAdviceStatus;
  score: number | null;
  label: AffarioAdviceLabel;
  message: string;
  tone: AffarioAdviceTone;
  recommendation: AffarioAdviceRecommendation;
  priceHighlight: AffarioPriceHighlight;
};
