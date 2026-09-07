export const USER_FACING_PRODUCT_TITLE_MAX_LENGTH = 56;
export const USER_FACING_PRODUCT_TITLE_FALLBACK = "Prodotto selezionato";

const ELLIPSIS = "…";

export function formatUserFacingProductTitle(
  value: string | null | undefined
): string {
  const normalizedTitle =
    typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";

  if (!normalizedTitle) {
    return USER_FACING_PRODUCT_TITLE_FALLBACK;
  }

  if (normalizedTitle.length <= USER_FACING_PRODUCT_TITLE_MAX_LENGTH) {
    return normalizedTitle;
  }

  const contentLimit = USER_FACING_PRODUCT_TITLE_MAX_LENGTH - ELLIPSIS.length;
  const candidate = normalizedTitle.slice(0, contentLimit + 1);
  const lastWordBoundary = candidate.lastIndexOf(" ");

  if (lastWordBoundary <= 0) {
    return `${USER_FACING_PRODUCT_TITLE_FALLBACK}${ELLIPSIS}`;
  }

  return `${candidate.slice(0, lastWordBoundary)}${ELLIPSIS}`;
}
