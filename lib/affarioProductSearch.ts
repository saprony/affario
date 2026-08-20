import type {
  AffarioProductSearchFamily,
  AffarioProductSearchVariant,
} from "@/types/productSearch";

export const AFFARIO_PRODUCT_SEARCH_MIN_QUERY_LENGTH = 2;
export const AFFARIO_PRODUCT_SEARCH_MAX_QUERY_LENGTH = 100;
export const AFFARIO_PRODUCT_SEARCH_MAX_RESULTS = 10;

const SCORE = {
  exactAsin: 10_000,
  exactModel: 5_000,
  allTokens: 2_000,
  modelContainsAllTokens: 1_000,
  exactTitle: 800,
  titlePhrase: 400,
  asinToken: 240,
  modelToken: 180,
  titleToken: 120,
  brandToken: 80,
  variantAttributeToken: 50,
  matchedToken: 20,
} as const;

export type AffarioProductSearchInputErrorCode =
  | "EMPTY_QUERY"
  | "QUERY_TOO_SHORT"
  | "QUERY_TOO_LONG";

export class AffarioProductSearchInputError extends Error {
  constructor(public readonly code: AffarioProductSearchInputErrorCode) {
    super(code);
    this.name = "AffarioProductSearchInputError";
  }
}

export type PreparedAffarioProductSearchQuery = {
  normalizedQuery: string;
  tokens: readonly string[];
};

type ScoredFamily = {
  family: AffarioProductSearchFamily;
  score: number;
};

export function normalizeAffarioProductSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function prepareAffarioProductSearchQuery(
  query: string
): PreparedAffarioProductSearchQuery {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    throw new AffarioProductSearchInputError("EMPTY_QUERY");
  }

  if (trimmedQuery.length > AFFARIO_PRODUCT_SEARCH_MAX_QUERY_LENGTH) {
    throw new AffarioProductSearchInputError("QUERY_TOO_LONG");
  }

  const normalizedQuery = normalizeAffarioProductSearchText(trimmedQuery);

  if (!normalizedQuery) {
    throw new AffarioProductSearchInputError("EMPTY_QUERY");
  }

  if (normalizedQuery.length < AFFARIO_PRODUCT_SEARCH_MIN_QUERY_LENGTH) {
    throw new AffarioProductSearchInputError("QUERY_TOO_SHORT");
  }

  return {
    normalizedQuery,
    tokens: normalizedQuery.split(" "),
  };
}

function getTokens(value: string | null): Set<string> {
  const normalizedValue = value
    ? normalizeAffarioProductSearchText(value)
    : "";

  return new Set(normalizedValue ? normalizedValue.split(" ") : []);
}

function addTokens(target: Set<string>, source: ReadonlySet<string>): void {
  for (const token of source) {
    target.add(token);
  }
}

function getVariantTokens(
  variants: readonly AffarioProductSearchVariant[]
): Set<string> {
  const tokens = new Set<string>();

  for (const variant of variants) {
    addTokens(tokens, getTokens(variant.asin));

    for (const [dimension, value] of Object.entries(variant.attributes)) {
      addTokens(tokens, getTokens(dimension));
      addTokens(tokens, getTokens(value));
    }
  }

  return tokens;
}

function countTokenMatches(
  queryTokens: readonly string[],
  fieldTokens: ReadonlySet<string>
): number {
  return queryTokens.filter((token) => fieldTokens.has(token)).length;
}

function scoreFamily(
  preparedQuery: PreparedAffarioProductSearchQuery,
  family: AffarioProductSearchFamily
): ScoredFamily | null {
  const title = normalizeAffarioProductSearchText(family.title);
  const model = family.model
    ? normalizeAffarioProductSearchText(family.model)
    : "";
  const titleTokens = getTokens(family.title);
  const brandTokens = getTokens(family.brand);
  const modelTokens = getTokens(family.model);
  const variantTokens = getVariantTokens(family.variants);
  const asinTokens = new Set(
    family.variants.map((variant) => variant.asin.toLowerCase())
  );
  const allTokens = new Set<string>();

  addTokens(allTokens, titleTokens);
  addTokens(allTokens, brandTokens);
  addTokens(allTokens, modelTokens);
  addTokens(allTokens, variantTokens);
  addTokens(allTokens, asinTokens);

  const matchedTokens = countTokenMatches(preparedQuery.tokens, allTokens);
  const exactAsin = asinTokens.has(preparedQuery.normalizedQuery);

  if (matchedTokens === 0 && !exactAsin) {
    return null;
  }

  const titleMatches = countTokenMatches(preparedQuery.tokens, titleTokens);
  const brandMatches = countTokenMatches(preparedQuery.tokens, brandTokens);
  const modelMatches = countTokenMatches(preparedQuery.tokens, modelTokens);
  const asinMatches = countTokenMatches(preparedQuery.tokens, asinTokens);
  const variantMatches = countTokenMatches(
    preparedQuery.tokens,
    variantTokens
  );
  const allTokensMatch = matchedTokens === preparedQuery.tokens.length;
  let score = matchedTokens * SCORE.matchedToken;

  score += titleMatches * SCORE.titleToken;
  score += brandMatches * SCORE.brandToken;
  score += modelMatches * SCORE.modelToken;
  score += asinMatches * SCORE.asinToken;
  score += variantMatches * SCORE.variantAttributeToken;

  if (exactAsin) {
    score += SCORE.exactAsin;
  }

  if (model && model === preparedQuery.normalizedQuery) {
    score += SCORE.exactModel;
  } else if (
    model &&
    preparedQuery.tokens.every((token) => modelTokens.has(token))
  ) {
    score += SCORE.modelContainsAllTokens;
  }

  if (allTokensMatch) {
    score += SCORE.allTokens;
  }

  if (title === preparedQuery.normalizedQuery) {
    score += SCORE.exactTitle;
  } else if (title.includes(preparedQuery.normalizedQuery)) {
    score += SCORE.titlePhrase;
  }

  const exactVariant = exactAsin
    ? family.variants.find(
        (variant) =>
          variant.asin.toLowerCase() === preparedQuery.normalizedQuery
      )
    : undefined;

  return {
    family: exactVariant
      ? { ...family, representativeAsin: exactVariant.asin }
      : family,
    score,
  };
}

export function rankAffarioProductFamilies(
  preparedQuery: PreparedAffarioProductSearchQuery,
  families: readonly AffarioProductSearchFamily[]
): AffarioProductSearchFamily[] {
  return families
    .flatMap((family) => {
      const scoredFamily = scoreFamily(preparedQuery, family);
      return scoredFamily ? [scoredFamily] : [];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.family.title.localeCompare(right.family.title, "it") ||
        left.family.familyId.localeCompare(right.family.familyId)
    )
    .slice(0, AFFARIO_PRODUCT_SEARCH_MAX_RESULTS)
    .map(({ family }) => family);
}
