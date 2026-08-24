import ProductVariantSelector from "@/components/ProductVariantSelector";
import type { ProductAnalysisState } from "@/types/productAnalysis";
import type { AffarioProductSearchFamily } from "@/types/productSearch";

type ProductListProps = {
  query: string;
  families: readonly AffarioProductSearchFamily[];
  analysisState: ProductAnalysisState;
  onVariantChange: (familyId: string) => void;
  onAnalyzeVariant: (familyId: string, asin: string) => void;
};

export default function ProductList({
  query,
  families,
  analysisState,
  onVariantChange,
  onAnalyzeVariant,
}: ProductListProps) {
  return (
    <section className="mx-auto max-w-4xl px-5">
      <h2 className="text-2xl font-bold">
        Abbiamo trovato prodotti compatibili
      </h2>

      <p className="mt-2 text-gray-500">
        Hai cercato: <strong>{query}</strong>
      </p>

      <div className="mt-5 grid gap-4">
        {families.map((family) => (
          <ProductVariantSelector
            key={`${family.familyId}-${query}`}
            family={family}
            query={query}
            analysisState={analysisState}
            onVariantChange={onVariantChange}
            onAnalyzeVariant={onAnalyzeVariant}
          />
        ))}
      </div>
    </section>
  );
}
