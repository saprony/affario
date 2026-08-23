import type {
  AffarioExternalProductCandidate,
  AffarioProductSearchFamily,
  AffarioProductSearchVariant,
} from "../types/productSearch";

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

const EXTERNAL_SCORE = {
  exactAsin: 10_000,
  exactModel: 5_000,
  allTokens: 3_000,
  exactBrandToken: 2_500,
  exactTitle: 2_000,
  titlePhrase: 1_600,
  brandToken: 700,
  modelToken: 500,
  titleToken: 350,
  variantToken: 250,
  matchedToken: 50,
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

type ScoredExternalFamily = ScoredFamily & {
  providerIndex: number;
  allSignificantTokensMatch: boolean;
};

type ExternalAttribute = {
  dimension: string;
  value: string;
};

type WorkingExternalFamily = {
  family: Omit<AffarioProductSearchFamily, "variants">;
  variants: Map<string, Map<string, ExternalAttribute>>;
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

function getAttributeKey(dimension: string): string {
  return normalizeAffarioProductSearchText(dimension);
}

function ensureExternalVariant(
  family: WorkingExternalFamily,
  asin: string
): Map<string, ExternalAttribute> {
  const existing = family.variants.get(asin);

  if (existing) {
    return existing;
  }

  const attributes = new Map<string, ExternalAttribute>();
  family.variants.set(asin, attributes);
  return attributes;
}

function mergeExternalAttributes(
  target: Map<string, ExternalAttribute>,
  source: Readonly<Record<string, string>>
): void {
  for (const [dimension, value] of Object.entries(source)) {
    const normalizedDimension = dimension.trim();
    const normalizedValue = value.trim();
    const key = getAttributeKey(normalizedDimension);

    if (
      normalizedDimension &&
      normalizedValue &&
      key &&
      !target.has(key)
    ) {
      target.set(key, {
        dimension: normalizedDimension,
        value: normalizedValue,
      });
    }
  }
}

function getExternalVariantStyle(
  variant: AffarioProductSearchVariant
): string | null {
  const entry = Object.entries(variant.attributes).find(
    ([dimension]) => getAttributeKey(dimension) === "style"
  );

  return entry?.[1].trim() || null;
}

function getStyleFamilyKey(style: string, brand: string | null): string {
  const brandTokens = getTokens(brand);
  const styleTokens = normalizeAffarioProductSearchText(style)
    .split(" ")
    .filter((token) => token && !brandTokens.has(token));
  const alphaNumericModelToken = styleTokens.find(
    (token) => /\p{L}/u.test(token) && /\p{N}/u.test(token)
  );

  if (alphaNumericModelToken) {
    return alphaNumericModelToken;
  }

  const numericTokenIndex = styleTokens.findIndex((token) => /^\d/u.test(token));

  if (numericTokenIndex > 0) {
    return styleTokens.slice(0, numericTokenIndex + 1).join("");
  }

  return styleTokens.slice(0, 2).join("-");
}

function getStyleFamilyTitle(
  brand: string | null,
  style: string
): string {
  const normalizedBrand = brand
    ? normalizeAffarioProductSearchText(brand)
    : "";
  const normalizedStyle = normalizeAffarioProductSearchText(style);

  if (
    normalizedBrand &&
    (` ${normalizedStyle} `).startsWith(` ${normalizedBrand} `)
  ) {
    return style.trim();
  }

  return [brand?.trim(), style.trim()].filter(Boolean).join(" ");
}

function splitExternalFamilyByStyle(
  family: AffarioProductSearchFamily,
  candidatesByAsin: ReadonlyMap<string, AffarioExternalProductCandidate>
): AffarioProductSearchFamily[] {
  const styleGroups = new Map<
    string,
    {
      variants: AffarioProductSearchVariant[];
      representativeStyle: string;
    }
  >();
  const unclassifiedVariants: AffarioProductSearchVariant[] = [];

  for (const variant of family.variants) {
    const style = getExternalVariantStyle(variant);
    const styleKey = style ? getStyleFamilyKey(style, family.brand) : "";

    if (!style || !styleKey) {
      unclassifiedVariants.push(variant);
      continue;
    }

    const existing = styleGroups.get(styleKey);

    if (existing) {
      existing.variants.push(variant);
    } else {
      styleGroups.set(styleKey, {
        variants: [variant],
        representativeStyle: style,
      });
    }
  }

  if (styleGroups.size <= 1) {
    return [family];
  }

  const representativeVariant = family.variants.find(
    ({ asin }) => asin === family.representativeAsin
  );
  const representativeStyle = representativeVariant
    ? getExternalVariantStyle(representativeVariant)
    : null;
  const representativeStyleKey = representativeStyle
    ? getStyleFamilyKey(representativeStyle, family.brand)
    : "";
  const fallbackStyleKey = styleGroups.has(representativeStyleKey)
    ? representativeStyleKey
    : styleGroups.keys().next().value;

  if (fallbackStyleKey) {
    styleGroups.get(fallbackStyleKey)?.variants.push(...unclassifiedVariants);
  }

  return [...styleGroups.entries()].map(
    ([styleKey, { variants, representativeStyle: style }]) => {
      const representative =
        variants.find(({ asin }) => asin === family.representativeAsin) ??
        variants.find(({ asin }) => candidatesByAsin.has(asin)) ??
        variants[0];
      const candidate = candidatesByAsin.get(representative.asin);
      const usesOriginalRepresentative =
        representative.asin === family.representativeAsin;

      return {
        ...family,
        familyId: `${family.familyId}:style:${styleKey}`,
        title:
          candidate?.title ?? getStyleFamilyTitle(family.brand, style),
        brand: candidate?.brand ?? family.brand,
        model:
          candidate?.model ??
          (usesOriginalRepresentative ? family.model : null),
        imageUrl:
          candidate?.imageUrl ??
          (usesOriginalRepresentative ? family.imageUrl : null),
        representativeAsin: representative.asin,
        variants,
      };
    }
  );
}

export function groupAffarioExternalProductCandidates(
  candidates: readonly AffarioExternalProductCandidate[]
): AffarioProductSearchFamily[] {
  const families = new Map<string, WorkingExternalFamily>();
  const candidatesByAsin = new Map(
    candidates.map((candidate) => [candidate.asin, candidate] as const)
  );

  for (const candidate of candidates) {
    const familyId = candidate.parentAsin ?? candidate.asin;

    if (!families.has(familyId)) {
      families.set(familyId, {
        family: {
          familyId,
          title: candidate.title,
          brand: candidate.brand,
          model: candidate.model,
          imageUrl: candidate.imageUrl,
          representativeAsin: candidate.asin,
          parentAsin: candidate.parentAsin,
        },
        variants: new Map(),
      });
    }

    const family = families.get(familyId);

    if (family) {
      mergeExternalAttributes(
        ensureExternalVariant(family, candidate.asin),
        candidate.attributes
      );
    }
  }

  for (const candidate of candidates) {
    const familyId = candidate.parentAsin ?? candidate.asin;
    const family = families.get(familyId);

    if (!family) {
      continue;
    }

    for (const variant of candidate.variants) {
      mergeExternalAttributes(
        ensureExternalVariant(family, variant.asin),
        variant.attributes
      );
    }
  }

  return [...families.values()]
    .map(({ family, variants }): AffarioProductSearchFamily => ({
      ...family,
      variants: [...variants.entries()].map(([asin, attributes]) => ({
        asin,
        attributes: Object.fromEntries(
          [...attributes.values()]
            .sort((left, right) =>
              left.dimension.localeCompare(right.dimension, "it")
            )
            .map(({ dimension, value }) => [dimension, value])
        ),
      })),
    }))
    .flatMap((family) =>
      splitExternalFamilyByStyle(family, candidatesByAsin)
    );
}

function externalTokenMatches(
  queryToken: string,
  fieldToken: string
): boolean {
  return (
    fieldToken === queryToken ||
    (queryToken.length >= 3 && fieldToken.startsWith(queryToken))
  );
}

function countExternalTokenMatches(
  queryTokens: readonly string[],
  fieldTokens: ReadonlySet<string>
): number {
  return queryTokens.filter((queryToken) =>
    [...fieldTokens].some((fieldToken) =>
      externalTokenMatches(queryToken, fieldToken)
    )
  ).length;
}

function getSignificantQueryTokens(
  queryTokens: readonly string[]
): readonly string[] {
  const significantTokens = queryTokens.filter((token) => token.length >= 2);

  return significantTokens.length > 0 ? significantTokens : queryTokens;
}

function getExactQueryBrandTokens(
  preparedQuery: PreparedAffarioProductSearchQuery,
  families: readonly AffarioProductSearchFamily[]
): ReadonlySet<string> {
  const queryBrandTokens = new Set<string>();

  for (const family of families) {
    const brandTokens = getTokens(family.brand);

    for (const queryToken of preparedQuery.tokens) {
      if (brandTokens.has(queryToken)) {
        queryBrandTokens.add(queryToken);
      }
    }
  }

  return queryBrandTokens;
}

function getEligibleExternalQueryTokens(
  queryTokens: readonly string[],
  brandTokens: ReadonlySet<string>,
  queryBrandTokens: ReadonlySet<string>
): readonly string[] {
  if (brandTokens.size === 0) {
    return queryTokens;
  }

  return queryTokens.filter(
    (queryToken) =>
      !queryBrandTokens.has(queryToken) || brandTokens.has(queryToken)
  );
}

function scoreExternalFamily(
  preparedQuery: PreparedAffarioProductSearchQuery,
  family: AffarioProductSearchFamily,
  providerIndex: number,
  queryBrandTokens: ReadonlySet<string>
): ScoredExternalFamily | null {
  const title = normalizeAffarioProductSearchText(family.title);
  const model = family.model
    ? normalizeAffarioProductSearchText(family.model)
    : "";
  const titleTokens = getTokens(family.title);
  const brandTokens = getTokens(family.brand);
  const eligibleQueryTokens = getEligibleExternalQueryTokens(
    preparedQuery.tokens,
    brandTokens,
    queryBrandTokens
  );
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

  const matchedTokens = countExternalTokenMatches(
    eligibleQueryTokens,
    allTokens
  );
  const significantQueryTokens = getSignificantQueryTokens(
    preparedQuery.tokens
  );
  const allSignificantTokensMatch =
    countExternalTokenMatches(significantQueryTokens, allTokens) ===
    significantQueryTokens.length;
  const exactAsin = asinTokens.has(preparedQuery.normalizedQuery);

  if (matchedTokens === 0 && !exactAsin) {
    return null;
  }

  const titleMatches = countExternalTokenMatches(
    eligibleQueryTokens,
    titleTokens
  );
  const brandMatches = countExternalTokenMatches(
    eligibleQueryTokens,
    brandTokens
  );
  const modelMatches = countExternalTokenMatches(
    eligibleQueryTokens,
    modelTokens
  );
  const variantMatches = countExternalTokenMatches(
    eligibleQueryTokens,
    variantTokens
  );
  const exactBrandMatches = preparedQuery.tokens.filter(
    (queryToken) =>
      queryBrandTokens.has(queryToken) && brandTokens.has(queryToken)
  ).length;
  let score = matchedTokens * EXTERNAL_SCORE.matchedToken;

  score += titleMatches * EXTERNAL_SCORE.titleToken;
  score += brandMatches * EXTERNAL_SCORE.brandToken;
  score += modelMatches * EXTERNAL_SCORE.modelToken;
  score += variantMatches * EXTERNAL_SCORE.variantToken;
  score += exactBrandMatches * EXTERNAL_SCORE.exactBrandToken;

  if (exactAsin) {
    score += EXTERNAL_SCORE.exactAsin;
  }

  if (model && model === preparedQuery.normalizedQuery) {
    score += EXTERNAL_SCORE.exactModel;
  }

  if (matchedTokens === preparedQuery.tokens.length) {
    score += EXTERNAL_SCORE.allTokens;
  }

  if (title === preparedQuery.normalizedQuery) {
    score += EXTERNAL_SCORE.exactTitle;
  } else if (title.includes(preparedQuery.normalizedQuery)) {
    score += EXTERNAL_SCORE.titlePhrase;
  }

  return {
    family,
    score,
    providerIndex,
    allSignificantTokensMatch,
  };
}

export function rankAffarioExternalProductFamilies(
  preparedQuery: PreparedAffarioProductSearchQuery,
  families: readonly AffarioProductSearchFamily[]
): AffarioProductSearchFamily[] {
  const queryBrandTokens = getExactQueryBrandTokens(
    preparedQuery,
    families
  );

  const scoredFamilies = families
    .flatMap((family, providerIndex) => {
      const scoredFamily = scoreExternalFamily(
        preparedQuery,
        family,
        providerIndex,
        queryBrandTokens
      );
      return scoredFamily ? [scoredFamily] : [];
    });
  const hasCompleteMatch = scoredFamilies.some(
    ({ allSignificantTokensMatch }) => allSignificantTokensMatch
  );
  const relevantFamilies = hasCompleteMatch
    ? scoredFamilies.filter(
        ({ allSignificantTokensMatch }) => allSignificantTokensMatch
      )
    : scoredFamilies;

  return relevantFamilies
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.providerIndex - right.providerIndex ||
        left.family.familyId.localeCompare(right.family.familyId)
    )
    .slice(0, AFFARIO_PRODUCT_SEARCH_MAX_RESULTS)
    .map(({ family }) => family);
}
