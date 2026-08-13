/** Raggruppa le informazioni condivise del prodotto principale. */
export type ProductFamily = {
  id: string;
  title: string;
  brand: string;
  category: string;
  imageUrl?: string;
};

export type ExternalProductIdentifier = {
  source: string;
  value: string;
};

/** Identifica la configurazione esatta su cui AFFARIO costruisce storico e alert. */
export type ProductVariant = {
  id: string;
  familyId: string;
  title: string;
  attributes: Record<string, string>;
  externalIdentifiers?: readonly ExternalProductIdentifier[];
};

/** Rappresenta una singola possibilita di acquisto per una variante. */
export type ProductOffer = {
  id: string;
  variantId: string;
  sellerName?: string;
  price: number;
  shippingPrice?: number;
  totalPrice: number;
  currency: string;
  isAvailable: boolean;
  isEligible: boolean;
  source: string;
  url?: string;
  observedAt: string;
};
