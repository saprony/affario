import type { AffarioProductSearchVariant } from "../types/productSearch";

export type VariantSelection = Readonly<Record<string, string>>;

const DIMENSION_PRIORITY = [
  "style",
  "size",
  "capacity",
  "memory",
  "storage",
  "color",
  "colour",
] as const;

const ATTRIBUTE_LABELS: Readonly<Record<string, string>> = {
  size: "Capacità",
  capacity: "Capacità",
  memory: "Capacità",
  storage: "Capacità",
  color: "Colore",
  colour: "Colore",
  style: "Configurazione",
};

const ATTRIBUTE_UNIT_TOKENS = new Set([
  "gb",
  "tb",
  "ml",
  "cm",
  "mm",
  "kg",
]);

const CAPACITY_DIMENSIONS = new Set([
  "size",
  "capacity",
  "memory",
  "storage",
]);

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .replace(/(\p{N})(\p{L})/gu, "$1 $2")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getAttributeValue(
  variant: AffarioProductSearchVariant,
  dimension: string
): string | null {
  const normalizedDimension = normalizeText(dimension);
  const entry = Object.entries(variant.attributes).find(
    ([candidateDimension]) =>
      normalizeText(candidateDimension) === normalizedDimension
  );

  return entry?.[1] ?? null;
}

function getNormalizedAttributeValues(
  variants: readonly AffarioProductSearchVariant[],
  dimension: string
): Set<string> {
  return new Set(
    variants
      .map((variant) => getAttributeValue(variant, dimension))
      .filter((value): value is string => Boolean(value))
      .map(normalizeText)
  );
}

function isColorDuplicatedByStyle(
  variants: readonly AffarioProductSearchVariant[],
  colorDimension: string,
  styleDimension: string
): boolean {
  const colorValues = getNormalizedAttributeValues(variants, colorDimension);
  const styleValues = getNormalizedAttributeValues(variants, styleDimension);

  return (
    colorValues.size > 0 &&
    styleValues.size > 0 &&
    [...colorValues].every((value) => styleValues.has(value))
  );
}

function matchesSelection(
  variant: AffarioProductSearchVariant,
  selection: VariantSelection
): boolean {
  return Object.entries(selection).every(
    ([dimension, value]) => getAttributeValue(variant, dimension) === value
  );
}

function queryContainsAttributeValue(query: string, value: string): boolean {
  const normalizedQuery = normalizeText(query);
  const normalizedValue = normalizeText(value);

  if (!normalizedQuery || !normalizedValue) {
    return false;
  }

  if (` ${normalizedQuery} `.includes(` ${normalizedValue} `)) {
    return true;
  }

  const queryTokens = new Set(normalizedQuery.split(" "));
  const distinctiveValueTokens = normalizedValue
    .split(" ")
    .filter(
      (token) => token.length >= 2 && !ATTRIBUTE_UNIT_TOKENS.has(token)
    );

  return (
    distinctiveValueTokens.length > 0 &&
    distinctiveValueTokens.every((token) => queryTokens.has(token))
  );
}

function getCapacityInGigabytes(value: string): number | null {
  const match = value
    .trim()
    .replace(",", ".")
    .match(/^(\d+(?:\.\d+)?)\s*(gb|tb)$/i);

  if (!match) {
    return null;
  }

  const quantity = Number(match[1]);

  if (!Number.isFinite(quantity)) {
    return null;
  }

  return match[2].toLowerCase() === "tb" ? quantity * 1024 : quantity;
}

function compareAttributeValues(
  dimension: string,
  left: string,
  right: string
): number {
  if (CAPACITY_DIMENSIONS.has(normalizeText(dimension))) {
    const leftCapacity = getCapacityInGigabytes(left);
    const rightCapacity = getCapacityInGigabytes(right);

    if (leftCapacity !== null && rightCapacity !== null) {
      return (
        leftCapacity - rightCapacity ||
        left.localeCompare(right, "it", { numeric: true })
      );
    }
  }

  return left.localeCompare(right, "it", { numeric: true });
}

function getTitlePrefix(title: string): string {
  const separator = /:\s|;\s|\s[|•]\s|\s[-–—]\s/u.exec(title);

  return separator?.index === undefined
    ? title
    : title.slice(0, separator.index);
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getFlexibleAttributePattern(value: string): string {
  return value
    .trim()
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .replace(/(\p{N})(\p{L})/gu, "$1 $2")
    .split(/\s+/u)
    .map(escapeRegularExpression)
    .join("\\s*");
}

function getVariableAttributeValues(
  variants: readonly AffarioProductSearchVariant[]
): string[] {
  return getVariantDimensions(variants)
    .flatMap((dimension) => {
      const values = getAvailableVariantAttributeValues(
        variants,
        dimension,
        {}
      );

      return values.length > 1 ? values : [];
    })
    .sort((left, right) => right.length - left.length);
}

export function getVariantDimensions(
  variants: readonly AffarioProductSearchVariant[]
): string[] {
  const dimensions = new Map<string, string>();

  for (const variant of variants) {
    for (const dimension of Object.keys(variant.attributes)) {
      const normalizedDimension = normalizeText(dimension);

      if (normalizedDimension && !dimensions.has(normalizedDimension)) {
        dimensions.set(normalizedDimension, dimension);
      }
    }
  }

  const styleDimension = dimensions.get("style");

  if (styleDimension) {
    for (const colorKey of ["color", "colour"]) {
      const colorDimension = dimensions.get(colorKey);

      if (
        colorDimension &&
        isColorDuplicatedByStyle(
          variants,
          colorDimension,
          styleDimension
        )
      ) {
        dimensions.delete(colorKey);
      }
    }
  }

  return [...dimensions.entries()]
    .sort(([leftKey, leftDimension], [rightKey, rightDimension]) => {
      const leftPriority = DIMENSION_PRIORITY.indexOf(
        leftKey as (typeof DIMENSION_PRIORITY)[number]
      );
      const rightPriority = DIMENSION_PRIORITY.indexOf(
        rightKey as (typeof DIMENSION_PRIORITY)[number]
      );
      const normalizedLeftPriority =
        leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority;
      const normalizedRightPriority =
        rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority;

      return (
        normalizedLeftPriority - normalizedRightPriority ||
        leftDimension.localeCompare(rightDimension, "it")
      );
    })
    .map(([, dimension]) => dimension);
}

export function getVariantDimensionLabel(dimension: string): string {
  return ATTRIBUTE_LABELS[normalizeText(dimension)] ?? dimension;
}

export function getDisplayFamilyTitle(
  title: string,
  variants: readonly AffarioProductSearchVariant[]
): string {
  const originalTitle = title.trim().replace(/\s+/g, " ");
  let displayTitle = getTitlePrefix(originalTitle).trim();
  let removedAttribute = true;
  const attributeValues = getVariableAttributeValues(variants);

  while (removedAttribute && displayTitle) {
    removedAttribute = false;

    for (const value of attributeValues) {
      const attributePattern = getFlexibleAttributePattern(value);
      const trailingAttribute = new RegExp(
        `(?:\\s*[,;/|–—-]\\s*|\\s+)${attributePattern}\\s*$`,
        "iu"
      );
      const normalizedTitle = displayTitle.replace(trailingAttribute, "").trim();

      if (normalizedTitle !== displayTitle) {
        displayTitle = normalizedTitle;
        removedAttribute = true;
        break;
      }
    }
  }

  return displayTitle || originalTitle;
}

export function getAvailableVariantAttributeValues(
  variants: readonly AffarioProductSearchVariant[],
  dimension: string,
  requiredSelection: VariantSelection
): string[] {
  return Array.from(
    new Set(
      variants
        .filter((variant) => matchesSelection(variant, requiredSelection))
        .map((variant) => getAttributeValue(variant, dimension))
        .filter((value): value is string => Boolean(value))
    )
  ).sort((left, right) => compareAttributeValues(dimension, left, right));
}

export function createInitialVariantSelection(
  query: string,
  variants: readonly AffarioProductSearchVariant[],
  dimensions: readonly string[]
): VariantSelection {
  const selection: Record<string, string> = {};

  for (const dimension of dimensions) {
    const matchingValues = getAvailableVariantAttributeValues(
      variants,
      dimension,
      selection
    ).filter((value) => queryContainsAttributeValue(query, value));

    if (matchingValues.length !== 1) {
      break;
    }

    selection[dimension] = matchingValues[0];
  }

  return selection;
}

export function findVariantForSelection(
  variants: readonly AffarioProductSearchVariant[],
  dimensions: readonly string[],
  selection: VariantSelection
): AffarioProductSearchVariant | null {
  if (
    dimensions.length === 0 ||
    !dimensions.every((dimension) => selection[dimension])
  ) {
    return null;
  }

  return (
    variants.find((variant) => matchesSelection(variant, selection)) ?? null
  );
}

export function getVariantDescription(
  variant: AffarioProductSearchVariant
): string {
  const values = getVariantDimensions([variant])
    .map((dimension) => getAttributeValue(variant, dimension))
    .filter((value): value is string => Boolean(value));

  return values.length > 0 ? values.join(" · ") : "Variante disponibile";
}
