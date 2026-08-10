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

  const filteredProducts = products.filter((product) => {
    return (
      product.title.toLowerCase().includes(search) ||
      product.brand.toLowerCase().includes(search) ||
      product.category.toLowerCase().includes(search)
    );
  });

  return (
    <section className="mx-auto max-w-4xl px-5">
      <h2 className="text-2xl font-bold">
        Abbiamo trovato prodotti compatibili
      </h2>

      <p className="mt-2 text-gray-500">
        Hai cercato: <strong>{query || "prodotto"}</strong>
      </p>

      {filteredProducts.length === 0 && (
        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow">
          <h3 className="text-xl font-bold">Nessun prodotto trovato</h3>

          <p className="mt-2 text-gray-500">
            Prova con un&apos;altra parola chiave.
          </p>
        </div>
      )}

      {filteredProducts.length > 0 && (
        <div className="mt-5 grid gap-4">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => onSelectProduct(product)}
              className="grid gap-2 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-md transition hover:border-green-500 hover:shadow-lg"
            >
              <strong className="text-lg">{product.title}</strong>

              <span className="text-xl font-bold text-green-600">
                € {product.currentPrice.toLocaleString("it-IT")}
              </span>

              <small className="text-gray-500">
                Seleziona per analizzare
              </small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}