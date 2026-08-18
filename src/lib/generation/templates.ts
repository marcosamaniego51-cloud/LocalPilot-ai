/**
 * Visual template library + selection logic (Requirement 2.3 / Task 4.3).
 *
 * A small, fixed set of industry-styled templates plus one
 * industry-agnostic fallback. "Template" here means a color scheme +
 * layout identity (templateId + default colorScheme) that the site
 * renderer (src/components/sites/site-renderer.tsx) can key off of — the
 * actual page content comes from AI generation (generate-site-content.ts)
 * independent of which template is chosen. Selection is keyed off the
 * shared classifyIndustry() bucketing (industry.ts) so the voice pack used
 * for copy (prompts.ts) and the visual template used for layout always
 * agree on which industry a business belongs to.
 */

import { classifyIndustry, type IndustryBucket } from "@/lib/generation/industry";

export type ColorScheme = {
  primary: string;
  secondary: string;
  accent: string;
};

export type SiteTemplate = {
  id: string;
  label: string;
  colorScheme: ColorScheme;
};

const TEMPLATES_BY_BUCKET: Record<IndustryBucket, SiteTemplate> = {
  home_services: {
    id: "home-services-default",
    label: "Home Services",
    colorScheme: { primary: "#1d4ed8", secondary: "#0f172a", accent: "#f59e0b" },
  },
  salon_spa: {
    id: "salon-default",
    label: "Salon & Spa",
    colorScheme: { primary: "#be185d", secondary: "#fdf2f8", accent: "#f5d0c5" },
  },
  food_beverage: {
    id: "restaurant-default",
    label: "Restaurant & Cafe",
    colorScheme: { primary: "#b45309", secondary: "#1c1917", accent: "#facc15" },
  },
  automotive: {
    id: "auto-shop-default",
    label: "Auto Shop",
    colorScheme: { primary: "#111827", secondary: "#dc2626", accent: "#9ca3af" },
  },
  professional_services: {
    id: "professional-default",
    label: "Professional Services",
    colorScheme: { primary: "#0f172a", secondary: "#334155", accent: "#38bdf8" },
  },
  generic: {
    id: "generic-default",
    label: "General Business (fallback)",
    colorScheme: { primary: "#2563eb", secondary: "#111827", accent: "#93c5fd" },
  },
};

export const SITE_TEMPLATES: Record<string, SiteTemplate> = Object.fromEntries(
  Object.values(TEMPLATES_BY_BUCKET).map((template) => [template.id, template]),
);

/**
 * Selects a template for a given raw category string. Always returns a
 * valid template (falls back to the generic template for unmatched
 * categories), since this system is industry-agnostic by design (Req 2.3)
 * and must never fail to produce a site just because a category is new.
 */
export function selectTemplateForCategory(category: string): SiteTemplate {
  return TEMPLATES_BY_BUCKET[classifyIndustry(category)];
}
