import { decisionGuides } from "@/data/guides/decisionGuides";
import { priceContextGuides } from "@/data/guides/priceContextGuides";
import type { Guide } from "@/types/guide";

const guideOrder = [
  "come-capire-se-un-prezzo-online-e-davvero-conveniente",
  "prezzo-di-listino-e-prezzo-reale",
  "perche-lo-storico-del-prezzo-puo-cambiare-una-decisione",
  "comprare-subito-o-aspettare",
  "sconti-percentuali-online-come-interpretarli",
  "come-stabilire-una-soglia-di-prezzo-realistica",
  "offerte-a-tempo-quando-la-fretta-aiuta-e-quando-fa-sbagliare",
  "stesso-prodotto-prezzo-diverso-ruolo-di-variante",
  "perche-il-prezzo-piu-basso-non-e-sempre-lofferta-migliore",
  "quando-un-piccolo-ribasso-puo-essere-sufficiente",
] as const;

const guideBySlug = new Map(
  [...priceContextGuides, ...decisionGuides].map((guide) => [
    guide.slug,
    guide,
  ])
);

export const guides: Guide[] = guideOrder.map((slug) => {
  const guide = guideBySlug.get(slug);

  if (!guide) {
    throw new Error("Guida mancante: " + slug);
  }

  return guide;
});

export function getGuideBySlug(slug: string): Guide | undefined {
  return guideBySlug.get(slug);
}
