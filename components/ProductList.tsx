import ProductVariantSelector from "@/components/ProductVariantSelector";
import type { AffarioProductSearchFamily } from "@/types/productSearch";

type ProductListProps = {
  query: string;
  families: readonly AffarioProductSearchFamily[];
  selectedAsin: string | null;
  onSelectVariant: (familyId: string, asin: string | null) => void;
};

export default function ProductList({
  query,
  families,
  selectedAsin,
  onSelectVariant,
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
            selectedAsin={selectedAsin}
            onSelectVariant={onSelectVariant}
          />
        ))}
      </div>
    </section>
  );
}
