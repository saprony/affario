import type { MetadataRoute } from "next";
import { guides } from "@/data/guides";
import { AFFARIO_SITE_URL } from "@/lib/seoMetadata";

const HOME_LAST_MODIFIED = new Date("2026-09-10T00:00:00.000Z");
const PRIVACY_LAST_MODIFIED = new Date("2026-09-06T00:00:00.000Z");
const GUIDES_LAST_MODIFIED = new Date("2026-08-18T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${AFFARIO_SITE_URL}/`,
      lastModified: HOME_LAST_MODIFIED,
    },
    {
      url: `${AFFARIO_SITE_URL}/privacy`,
      lastModified: PRIVACY_LAST_MODIFIED,
    },
    {
      url: `${AFFARIO_SITE_URL}/guide`,
      lastModified: GUIDES_LAST_MODIFIED,
    },
    ...guides.map((guide) => ({
      url: `${AFFARIO_SITE_URL}/guide/${guide.slug}`,
      lastModified: GUIDES_LAST_MODIFIED,
    })),
  ];
}
