import Link from "next/link";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/guide", label: "Guide" },
  { href: "/privacy", label: "Privacy" },
];

export default function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-emerald-950/10 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-lg font-black tracking-tight text-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100"
        >
          <span className="text-lg sm:text-xl">AFFARIO</span>
        </Link>

        <nav aria-label="Navigazione principale">
          <ul className="flex items-center gap-0.5 rounded-full border border-slate-200 bg-[#f7f8f5] p-1 text-[0.8125rem] font-bold text-slate-700 sm:gap-1 sm:text-sm">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-9 items-center rounded-full px-2.5 transition-colors hover:bg-white hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:px-3.5"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
