import type { FormEvent } from "react";

type HeroProps = {
  query: string;
  setQuery: (value: string) => void;
  onSearch: () => void;
  isLoading: boolean;
};

export default function Hero({
  query,
  setQuery,
  onSearch,
  isLoading,
}: HeroProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch();
  }

  return (
    <>
      <header className="mx-auto max-w-6xl px-5 py-6">
        <div className="text-2xl font-black text-green-600">AFFARIO</div>
      </header>

      <section className="mx-auto max-w-4xl px-5 py-16 text-center">
        <div className="mb-6 inline-block rounded-full bg-green-100 px-4 py-2 text-sm font-bold text-green-800">
          🟢 Price intelligence per acquisti online
        </div>

        <h1 className="text-4xl font-black leading-tight text-gray-900 sm:text-5xl">
          Gli affari non si trovano...
          <br />
          <span className="text-green-600">si aspettano!</span>
        </h1>

        <p className="mt-6 text-xl text-gray-600 sm:text-2xl">
          Scegli il momento giusto per comprare.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mx-auto mt-9 flex max-w-3xl flex-col gap-3 rounded-2xl bg-white p-3 shadow-xl sm:flex-row"
          aria-busy={isLoading}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            aria-label="Prodotto da cercare"
            placeholder="Che prodotto stai pensando di comprare?"
            className="min-w-0 flex-1 rounded-xl border border-gray-200 p-4 text-base outline-none focus:border-green-600"
          />

          <button
            type="submit"
            disabled={isLoading}
            className="min-h-12 rounded-xl bg-green-600 px-6 font-bold text-white disabled:cursor-wait disabled:bg-green-400"
          >
            {isLoading ? "Ricerca in corso..." : "Cerca prodotto"}
          </button>
        </form>
      </section>
    </>
  );
}
