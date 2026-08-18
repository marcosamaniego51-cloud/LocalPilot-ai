/**
 * Shared industry classification for AI copy voice (prompts.ts) and visual
 * template selection (templates.ts). Kept as a single source of truth so
 * the two don't drift out of sync (e.g. a plumber getting the "salon"
 * voice pack but the "home services" visual template).
 */

export const INDUSTRY_BUCKETS = [
  "home_services",
  "salon_spa",
  "food_beverage",
  "automotive",
  "professional_services",
  "generic",
] as const;

export type IndustryBucket = (typeof INDUSTRY_BUCKETS)[number];

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; bucket: IndustryBucket }> = [
  { pattern: /plumb|electric|hvac|landscap|roof|contractor|handyman|pest/i, bucket: "home_services" },
  { pattern: /salon|spa|nail|barber|hair|beauty/i, bucket: "salon_spa" },
  { pattern: /restaurant|cafe|bakery|diner|bar|pizzeria|food/i, bucket: "food_beverage" },
  { pattern: /auto|mechanic|tire|car\s*repair|body\s*shop/i, bucket: "automotive" },
  { pattern: /law|account|consult|realt|insurance|financial/i, bucket: "professional_services" },
];

/**
 * Classifies a raw category string (from Google Places or an operator's
 * discovery config) into a fixed industry bucket. Always returns a bucket
 * — falls back to "generic" for anything unmapped, since this system is
 * industry-agnostic by design and must never fail to classify a business.
 */
export function classifyIndustry(category: string): IndustryBucket {
  const match = CATEGORY_PATTERNS.find((entry) => entry.pattern.test(category));
  return match?.bucket ?? "generic";
}
