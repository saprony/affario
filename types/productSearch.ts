export type AffarioProductSearchStatus =
  | "MATCHES_FOUND"
  | "NO_LOCAL_MATCHES";

export type AffarioProductSearchVariant = {
  asin: string;
  attributes: Readonly<Record<string, string>>;
};

export type AffarioProductSearchFamily = {
  familyId: string;
  title: string;
  brand: string | null;
  model: string | null;
  imageUrl: string | null;
  representativeAsin: string;
  parentAsin: string | null;
  variants: readonly AffarioProductSearchVariant[];
};

export type AffarioProductSearchResult = {
  query: string;
  source: "AFFARIO_CATALOG";
  status: AffarioProductSearchStatus;
  results: readonly AffarioProductSearchFamily[];
};
