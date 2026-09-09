import Image from "next/image";
import type { FormEvent } from "react";

type HeroProps = {
  query: string;
  setQuery: (value: string) => void;
  onSearch: () => void;
  isLoading: boolean;
  isDisabled: boolean;
};

export default function Hero({
  query,
  setQuery,
  onSearch,
  isLoading,
  isDisabled,
}: HeroProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch();
  }

  return (
    <>
      <header className="mx-auto flex max-w-6xl justify-center px-5 pb-2 pt-7 sm:pt-9">
        <h1 className="w-full max-w-lg">
          <Image
            src="/affario-logo.png"
            alt="AFFARIO — Gli affari non si trovano... si aspettano!"
            width={2172}
            height={724}
            priority
            sizes="(max-width: 640px) calc(100vw - 2.5rem), 32rem"
            className="h-auto w-full"
          />
        </h1>
      </header>

      <section className="mx-auto max-w-4xl px-5 pb-16 pt-8 text-center sm:pt-10">
        <div className="mb-6 inline-block rounded-full bg-green-100 px-4 py-2 text-sm font-bold text-green-800">
          🟢 Price intelligence per acquisti online
        </div>

        <p className="text-xl text-gray-600 sm:text-2xl">
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
            placeholder="Cerca un prodotto"
            className="min-w-0 flex-1 rounded-xl border border-gray-200 p-4 text-base outline-none focus:border-green-600"
          />

          <button
            type="submit"
            disabled={isLoading || isDisabled}
            className="min-h-12 rounded-xl bg-green-600 px-6 font-bold text-white disabled:cursor-wait disabled:bg-green-400"
          >
            {isLoading ? "Ricerca in corso..." : "Cerca prodotto"}
          </button>
        </form>
      </section>
    </>
  );
}
