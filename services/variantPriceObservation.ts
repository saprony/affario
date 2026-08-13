import "server-only";

import {
  getBestEligibleOffer,
  getOffersForVariant,
} from "@/lib/productOffers";
import {
  PriceHistoryServiceError,
  savePriceObservation,
  type PriceObservation,
  type SavePriceObservationInput,
} from "@/services/priceHistory";
import type { ProductOffer } from "@/types/catalog";

export type SaveBestEligibleOfferObservationInput = {
  variantId: string;
  offers: readonly ProductOffer[];
  observedAt: Date | string;
};

export type SaveBestEligibleOfferObservationResult =
  | {
      status: "saved";
      variantId: string;
      price: number;
      source: string;
      observedAt: string;
      observation: PriceObservation;
    }
  | {
      status: "duplicate";
      variantId: string;
    }
  | {
      status: "no-eligible-offer";
      variantId: string;
    };

type SaveObservation = (
  input: SavePriceObservationInput
) => Promise<PriceObservation>;

export async function saveBestEligibleOfferObservation(
  { variantId, offers, observedAt }: SaveBestEligibleOfferObservationInput,
  saveObservation: SaveObservation = savePriceObservation
): Promise<SaveBestEligibleOfferObservationResult> {
  const normalizedVariantId = normalizeVariantId(variantId);
  const variantOffers = getOffersForVariant(offers, normalizedVariantId);
  const bestOffer = getBestEligibleOffer(variantOffers);

  if (bestOffer === null) {
    return {
      status: "no-eligible-offer",
      variantId: normalizedVariantId,
    };
  }

  try {
    const observation = await saveObservation({
      // Nel nuovo dominio product_id identifica la variante analizzata.
      productId: normalizedVariantId,
      price: bestOffer.totalPrice,
      source: bestOffer.source,
      observedAt,
    });

    return {
      status: "saved",
      variantId: normalizedVariantId,
      price: observation.price,
      source: observation.source,
      observedAt: observation.observedAt,
      observation,
    };
  } catch (error) {
    if (
      error instanceof PriceHistoryServiceError &&
      error.code === "DUPLICATE_OBSERVATION"
    ) {
      return {
        status: "duplicate",
        variantId: normalizedVariantId,
      };
    }

    throw error;
  }
}

function normalizeVariantId(variantId: string): string {
  if (typeof variantId !== "string" || !variantId.trim()) {
    throw new PriceHistoryServiceError(
      "variantId non puo essere vuoto.",
      "INVALID_INPUT"
    );
  }

  return variantId.trim();
}
