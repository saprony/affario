import type { MetadataRoute } from "next";
import { AFFARIO_SITE_URL } from "@/lib/seoMetadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/alert/"],
    },
    sitemap: `${AFFARIO_SITE_URL}/sitemap.xml`,
  };
}
