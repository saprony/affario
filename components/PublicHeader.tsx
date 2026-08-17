import Link from "next/link";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/guide", label: "Guide" },
  { href: "/privacy", label: "Privacy" },
];

export default function PublicHeader() {
  return (
    <header className="border-b border-emerald-950/10 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-5 px-5 py-5 sm:px-8">
        <Link
          href="/"
          className="text-xl font-black tracking-tight text-emerald-700"
        >
          AFFARIO
        </Link>

        <nav aria-label="Navigazione principale">
          <ul className="flex items-center gap-4 text-sm font-bold text-slate-700 sm:gap-7">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="transition hover:text-emerald-700"
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
