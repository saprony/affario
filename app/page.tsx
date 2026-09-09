import type { Metadata } from "next";
import DemoHome from "@/components/DemoHome";

export const metadata: Metadata = {
  title: {
    absolute: "AFFARIO — Scegli il momento giusto per comprare",
  },
  description:
    "AFFARIO aiuta a valutare il momento dell'acquisto online attraverso indicazioni semplici e guide indipendenti.",
};

export default function Home() {
  return <DemoHome />;
}
