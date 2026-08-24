import "server-only";

import { createAffarioAdvice } from "@/lib/affarioAdvice";
import type { AffarioProductLookupResult } from "@/services/affarioProductLookup";
import type { AffarioAdvice } from "@/types/affarioAdvice";

export function buildAffarioProductAdvice(
  product: AffarioProductLookupResult
): AffarioAdvice {
  return createAffarioAdvice({
    currentPrice: product.buyBox.currentIncludingShippingInEuros,
    minimumPrice90Days: product.buyBox90Days.minimumInEuros,
    averagePrice90Days: product.buyBox90Days.averageInEuros,
    observationCount: product.buyBoxHistory90Days.observationCount,
    coverageDays: product.buyBoxHistory90Days.coverageDays,
    minimumPrice365Days: product.buyBox365Days.minimumInEuros,
    hasReliable365DayCoverage:
      product.buyBox365Days.hasReliableCoverage,
    minimumPriceSinceAvailable:
      product.buyBoxSinceAvailable.minimumInEuros,
    hasReliableSinceAvailableCoverage:
      product.buyBoxSinceAvailable.hasReliableCoverage,
  });
}
