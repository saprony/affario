import { AMAZON_IT_AFFILIATE_TAG } from "../data/affiliateLinks";

const AMAZON_ASIN_PATTERN = /^[A-Z0-9]{10}$/;
const AMAZON_IT_PRODUCT_BASE_URL = "https://www.amazon.it/dp/";

export function buildAmazonAffiliateProductUrl(
  asin: string
): string | null {
  const normalizedAsin = asin.trim().toUpperCase();

  if (!AMAZON_ASIN_PATTERN.test(normalizedAsin)) {
    return null;
  }

  const url = new URL(
    `${AMAZON_IT_PRODUCT_BASE_URL}${encodeURIComponent(normalizedAsin)}`
  );
  url.searchParams.set("tag", AMAZON_IT_AFFILIATE_TAG);

  return url.toString();
}
