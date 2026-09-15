import type { Metadata } from "next";

export const AFFARIO_SITE_URL = "https://www.affario.it";
export const AFFARIO_HOME_TITLE =
  "AFFARIO — Scegli il momento giusto per comprare";
export const AFFARIO_HOME_DESCRIPTION =
  "AFFARIO ti aiuta a capire se è un buon momento per comprare online o se conviene aspettare, con indicazioni semplici e indipendenti.";

const AFFARIO_SOCIAL_IMAGE_URL = `${AFFARIO_SITE_URL}/affario-logo.png`;
const AFFARIO_SOCIAL_IMAGE_ALT =
  "AFFARIO — Scegli il momento giusto per comprare";

type PublicPageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  absoluteTitle?: boolean;
};

export function createPublicPageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
}: PublicPageMetadataOptions): Metadata {
  const canonicalUrl = new URL(path, AFFARIO_SITE_URL).toString();

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: "website",
      locale: "it_IT",
      siteName: "AFFARIO",
      title,
      description,
      url: canonicalUrl,
      images: [
        {
          url: AFFARIO_SOCIAL_IMAGE_URL,
          alt: AFFARIO_SOCIAL_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [AFFARIO_SOCIAL_IMAGE_URL],
    },
  };
}

export const rootMetadata: Metadata = {
  metadataBase: new URL(AFFARIO_SITE_URL),
  title: {
    default: AFFARIO_HOME_TITLE,
    template: "%s | AFFARIO",
  },
  description: AFFARIO_HOME_DESCRIPTION,
};

export const homeMetadata = createPublicPageMetadata({
  title: AFFARIO_HOME_TITLE,
  description: AFFARIO_HOME_DESCRIPTION,
  path: "/",
  absoluteTitle: true,
});

export const privacyMetadata = createPublicPageMetadata({
  title: "Informativa Privacy",
  description:
    "Informativa sul trattamento dei dati personali del servizio AFFARIO.",
  path: "/privacy",
});

export const guidesMetadata = createPublicPageMetadata({
  title: "Guide Affario",
  description:
    "Guide pratiche per interpretare prezzi, sconti e varianti e scegliere con maggiore consapevolezza quando acquistare online.",
  path: "/guide",
});

export const alertManagementMetadata: Metadata = {
  title: "Gestisci alert | AFFARIO",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
  },
};

export const affarioStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${AFFARIO_SITE_URL}/#website`,
      name: "AFFARIO",
      url: `${AFFARIO_SITE_URL}/`,
    },
    {
      "@type": "Organization",
      "@id": `${AFFARIO_SITE_URL}/#organization`,
      name: "AFFARIO",
      url: `${AFFARIO_SITE_URL}/`,
      logo: {
        "@type": "ImageObject",
        url: `${AFFARIO_SITE_URL}/affario-logo.png`,
      },
    },
  ],
};
