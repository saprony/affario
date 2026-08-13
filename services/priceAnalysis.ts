import "server-only";

import {
  analyzePriceHistory,
  type PriceHistoryAnalysis,
} from "@/lib/analyzePriceHistory";
import { getPriceHistory90Days } from "@/services/priceHistory";

export async function getPriceAnalysis90Days(
  productId: string
): Promise<PriceHistoryAnalysis | null> {
  const observations = await getPriceHistory90Days(productId);

  return analyzePriceHistory(observations);
}
