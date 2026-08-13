import ProductVariantSelector from "@/components/ProductVariantSelector";
import { Product } from "@/types/product";

type ProductListProps = {
  query: string;
  products: Product[];
  onSelectProduct: (product: Product) => void;
};

export default function ProductList({
  query,
  products,
  onSelectProduct,
}: ProductListProps) {
  const search = query.toLowerCase().trim();

  const matchingProducts = products.filter((product) => {
    return (
      product.title.toLowerCase().includes(search) ||
      product.familyTitle.toLowerCase().includes(search) ||
      product.brand.toLowerCase().includes(search) ||
      product.category.toLowerCase().includes(search)
    );
  });

  const matchingFamilyIds = new Set(
    matchingProducts.map((product) => product.familyId)
  );

  const productFamilies = Array.from(
    products
      .filter((product) => matchingFamilyIds.has(product.familyId))
      .reduce((families, product) => {
        const familyProducts = families.get(product.familyId) ?? [];
        familyProducts.push(product);
        families.set(product.familyId, familyProducts);
        return families;
      }, new Map<string, Product[]>())
  );

  return (
    <section className="mx-auto max-w-4xl px-5">
      <h2 className="text-2xl font-bold">
        Abbiamo trovato prodotti compatibili
      </h2>

      <p className="mt-2 text-gray-500">
        Hai cercato: <strong>{query || "prodotto"}</strong>
      </p>

      {productFamilies.length === 0 && (
        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow">
          <h3 className="text-xl font-bold">Nessun prodotto trovato</h3>

          <p className="mt-2 text-gray-500">
            Prova con un&apos;altra parola chiave.
          </p>
        </div>
      )}

      {productFamilies.length > 0 && (
        <div className="mt-5 grid gap-4">
          {productFamilies.map(([familyId, familyProducts]) => {
            const matchingFamilyProducts = matchingProducts.filter(
              (product) => product.familyId === familyId
            );
            const initialProduct =
              matchingFamilyProducts.length === 1
                ? matchingFamilyProducts[0]
                : null;

            return (
              <ProductVariantSelector
                key={`${familyId}-${search}`}
                familyTitle={familyProducts[0].familyTitle}
                products={familyProducts}
                initialProduct={initialProduct}
                onSelectProduct={onSelectProduct}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
