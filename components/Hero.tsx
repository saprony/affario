type HeroProps = {
  query: string;
  setQuery: (value: string) => void;
  onSearch: () => void;
};

export default function Hero({ query, setQuery, onSearch }: HeroProps) {
  return (
    <>
      <header className="mx-auto max-w-6xl px-5 py-6">
        <div className="text-2xl font-black text-green-600">AFFARIO</div>
      </header>

      <section className="mx-auto max-w-4xl px-5 py-16 text-center">
        <div className="mb-6 inline-block rounded-full bg-green-100 px-4 py-2 text-sm font-bold text-green-800">
          🟢 Price intelligence per acquisti online
        </div>

        <h1 className="text-5xl font-black leading-tight text-gray-900">
          Gli affari non si trovano...
          <br />
          <span className="text-green-600">si aspettano!</span>
        </h1>

        <p className="mt-6 text-2xl text-gray-600">
          Scegli il momento giusto per comprare.
        </p>

        <div className="mx-auto mt-9 flex max-w-3xl gap-3 rounded-2xl bg-white p-3 shadow-xl">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="text"
            placeholder="Che prodotto stai pensando di comprare?"
            className="flex-1 rounded-xl border border-gray-200 p-4 text-base outline-none"
          />

          <button
            onClick={onSearch}
            className="rounded-xl bg-green-600 px-6 font-bold text-white"
          >
            Analizza il prezzo
          </button>
        </div>
      </section>
    </>
  );
}