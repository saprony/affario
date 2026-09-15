export type GuideInlineLink = {
  href: string;
  text: string;
};

export type GuideParagraph = string | Array<string | GuideInlineLink>;

export type GuideSection = {
  heading: string;
  paragraphs: GuideParagraph[];
};

export type GuideAffiliateExample = {
  title: string;
  description: string;
  url: string;
};

export type Guide = {
  slug: string;
  title: string;
  heading?: string;
  metaTitle?: string;
  description: string;
  publishedAt: string;
  introduction: GuideParagraph[];
  sections: GuideSection[];
  practicalTips: string[];
  principle: string;
  affiliateExample?: GuideAffiliateExample;
};
