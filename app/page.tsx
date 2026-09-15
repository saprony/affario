import DemoHome from "@/components/DemoHome";
import { affarioStructuredData, homeMetadata } from "@/lib/seoMetadata";

export const metadata = homeMetadata;

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(affarioStructuredData).replace(/</g, "\\u003c"),
        }}
      />
      <DemoHome />
    </>
  );
}
