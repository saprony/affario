export type GuideSection = {
  heading: string;
  paragraphs: string[];
};

export type GuideAffiliateExample = {
  title: string;
  description: string;
  url: string;
};

export type Guide = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  introduction: string[];
  sections: GuideSection[];
  practicalTips: string[];
  principle: string;
  affiliateExample?: GuideAffiliateExample;
};
