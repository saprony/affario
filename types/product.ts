export type Product = {
  id: string;
  title: string;
  brand: string;
  category: string;

  imageUrl?: string;

  currentPrice: number;
  lowestPrice90Days: number;

  amazonUrl: string;
  isAvailable: boolean;

  affarioScore: number;
};