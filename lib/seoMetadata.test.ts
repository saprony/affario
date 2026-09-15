import assert from "node:assert/strict";
import test from "node:test";
import type { Metadata } from "next";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { guides } from "@/data/guides";
import {
  AFFARIO_HOME_DESCRIPTION,
  AFFARIO_HOME_TITLE,
  AFFARIO_SITE_URL,
  alertManagementMetadata,
  affarioStructuredData,
  createPublicPageMetadata,
  guidesMetadata,
  homeMetadata,
  privacyMetadata,
  rootMetadata,
} from "@/lib/seoMetadata";

test("sitemap include tutte e sole le route pubbliche indicizzabili", () => {
  const entries = sitemap();
  const urls = entries.map((entry) => entry.url);
  const expectedUrls = [
    `${AFFARIO_SITE_URL}/`,
    `${AFFARIO_SITE_URL}/privacy`,
    `${AFFARIO_SITE_URL}/guide`,
    ...guides.map(
      (guide) => `${AFFARIO_SITE_URL}/guide/${guide.slug}`
    ),
  ];

  assert.deepEqual(urls, expectedUrls);
  assert.equal(
    urls.some((url) => url.includes("/api/") || url.includes("/alert/")),
    false
  );
  assert.equal(
    entries.every((entry) => entry.lastModified instanceof Date),
    true
  );
});

test("robots consente le pagine pubbliche ed esclude API e alert", () => {
  const config = robots();

  assert.deepEqual(config.rules, {
    userAgent: "*",
    allow: "/",
    disallow: ["/api/", "/alert/"],
  });
  assert.equal(config.sitemap, `${AFFARIO_SITE_URL}/sitemap.xml`);
});

test("homepage usa title, description e canonical PUBLIC REVIEW", () => {
  assert.equal(rootMetadata.metadataBase?.toString(), `${AFFARIO_SITE_URL}/`);
  assert.deepEqual(homeMetadata.title, { absolute: AFFARIO_HOME_TITLE });
  assert.equal(homeMetadata.description, AFFARIO_HOME_DESCRIPTION);
  assert.equal(
    homeMetadata.alternates?.canonical?.toString(),
    `${AFFARIO_SITE_URL}/`
  );
  assert.equal(homeMetadata.openGraph?.url?.toString(), `${AFFARIO_SITE_URL}/`);
  assert.ok(homeMetadata.twitter && "card" in homeMetadata.twitter);
  assert.equal(homeMetadata.twitter.card, "summary");
  assert.equal(AFFARIO_HOME_DESCRIPTION.includes("alert"), false);
  assert.equal(AFFARIO_HOME_DESCRIPTION.includes("tracking"), false);
});

test("le pagine editoriali usano canonical assoluti sul dominio www", () => {
  const metadataByUrl: ReadonlyArray<readonly [Metadata, string]> = [
    [privacyMetadata, `${AFFARIO_SITE_URL}/privacy`],
    [guidesMetadata, `${AFFARIO_SITE_URL}/guide`],
    ...guides.map(
      (guide): readonly [Metadata, string] => [
        createPublicPageMetadata({
          title: guide.title,
          description: guide.description,
          path: `/guide/${guide.slug}`,
        }),
        `${AFFARIO_SITE_URL}/guide/${guide.slug}`,
      ]
    ),
  ];

  for (const [metadata, expectedUrl] of metadataByUrl) {
    assert.equal(metadata.alternates?.canonical?.toString(), expectedUrl);
    assert.equal(metadata.openGraph?.url?.toString(), expectedUrl);
  }
});

test("la route alert richiede noindex e nofollow", () => {
  assert.deepEqual(alertManagementMetadata.robots, {
    index: false,
    follow: false,
  });
  assert.equal(alertManagementMetadata.alternates, undefined);
});

test("structured data usa solo WebSite e Organization pubblici", () => {
  assert.deepEqual(
    affarioStructuredData["@graph"].map((entry) => entry["@type"]),
    ["WebSite", "Organization"]
  );
  assert.equal(affarioStructuredData["@context"], "https://schema.org");
  assert.equal(affarioStructuredData["@graph"][0].url, `${AFFARIO_SITE_URL}/`);
  assert.equal(
    JSON.stringify(affarioStructuredData).includes("SearchAction"),
    false
  );
});
