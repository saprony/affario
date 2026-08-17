import type { Metadata } from "next";
import PublicHome from "@/components/PublicHome";

export const metadata: Metadata = {
  title: {
    absolute: "AFFARIO — Scegli il momento giusto per comprare",
  },
  description:
    "AFFARIO aiuta a valutare il momento dell'acquisto online attraverso indicazioni semplici e guide indipendenti.",
};

export default async function Home() {
  if (process.env.NODE_ENV === "development") {
    const { default: DemoHome } = await import("@/components/DemoHome");

    return <DemoHome />;
  }

  return <PublicHome />;
}
