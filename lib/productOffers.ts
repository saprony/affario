import type { ProductOffer } from "@/types/catalog";

export function getOffersForVariant(
  offers: readonly ProductOffer[],
  variantId: string
): ProductOffer[] {
  return offers.filter((offer) => offer.variantId === variantId);
}

/** In caso di parita mantiene la prima offerta nell'ordine ricevuto. */
export function getBestEligibleOffer(
  offers: readonly ProductOffer[]
): ProductOffer | null {
  let bestOffer: ProductOffer | null = null;

  for (const offer of offers) {
    if (!offer.isEligible || !offer.isAvailable) {
      continue;
    }

    if (bestOffer === null || offer.totalPrice < bestOffer.totalPrice) {
      bestOffer = offer;
    }
  }

  return bestOffer;
}
