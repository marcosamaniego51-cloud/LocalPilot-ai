/**
 * Prompt templates for structured site-copy generation (Requirement 2.2 /
 * Task 4.1), keyed by industry category.
 *
 * Rather than one prompt per category (which would be an ever-growing,
 * hard-to-maintain list), this uses a small set of industry "voice" packs
 * keyed off the shared classifyIndustry() bucketing (industry.ts), plus a
 * generic fallback for anything unmapped — mirroring the template-library
 * approach used for visual templates (Task 4.3), and kept in sync with it
 * by sharing the same classifier.
 */

import { classifyIndustry, type IndustryBucket } from "@/lib/generation/industry";

export type BusinessInput = {
  businessName: string;
  category: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
};

type VoicePack = {
  tone: string;
  angle: string;
};

const VOICE_PACKS: Record<IndustryBucket, VoicePack> = {
  home_services: {
    tone: "trustworthy, no-nonsense, and reassuring",
    angle:
      "emphasize reliability, punctuality, fair pricing, and being a local, licensed professional",
  },
  salon_spa: {
    tone: "warm, welcoming, and a little upscale",
    angle: "emphasize relaxation, self-care, skilled staff, and a great client experience",
  },
  food_beverage: {
    tone: "friendly and appetizing",
    angle: "emphasize quality ingredients, atmosphere, and the experience of visiting",
  },
  automotive: {
    tone: "straightforward and expert",
    angle: "emphasize honest diagnostics, fair pricing, and getting customers back on the road quickly",
  },
  professional_services: {
    tone: "polished and confidence-inspiring",
    angle: "emphasize expertise, responsiveness, and clear communication",
  },
  generic: {
    tone: "friendly and professional",
    angle: "emphasize quality service and being a trusted local business",
  },
};

/**
 * Builds the system + user prompt pair for full-site content generation
 * (all four pages in one structured-output call — see generate-site-content.ts).
 */
export function buildSiteGenerationPrompt(business: BusinessInput): {
  system: string;
  user: string;
} {
  const voice = VOICE_PACKS[classifyIndustry(business.category)];
  const locationLine = [business.city, business.state].filter(Boolean).join(", ");

  const system = [
    "You are an expert copywriter who writes concise, effective marketing copy",
    "for small local business websites. You always write in a tone that is",
    `${voice.tone}. You ${voice.angle}.`,
    "Never invent specific facts you don't have (exact prices, awards, years in",
    "business, certifications) — write generally positive, plausible copy instead",
    "of fabricating specifics. Keep every field concise; this is website copy,",
    "not an essay.",
  ].join(" ");

  const user = [
    `Business name: ${business.businessName}`,
    `Category: ${business.category}`,
    locationLine ? `Location: ${locationLine}` : null,
    business.phone ? `Phone: ${business.phone}` : null,
    "",
    "Write website copy for this business's Home, About, Services, and Contact",
    "pages, matching the JSON schema provided.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { system, user };
}

/**
 * Builds a prompt for regenerating a single page's copy (Requirement 2.6 /
 * Task 4.5), given the same business input plus any Tenant-provided
 * overrides that should inform the regenerated copy (e.g. an updated
 * service list or business hours the Tenant typed in themselves).
 */
export function buildSectionRegenerationPrompt(
  business: BusinessInput,
  section: "home" | "about" | "services" | "contact",
  overrides?: Record<string, unknown>,
): { system: string; user: string } {
  const { system } = buildSiteGenerationPrompt(business);
  const overrideLines = overrides
    ? Object.entries(overrides)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    : [];

  const user = [
    `Business name: ${business.businessName}`,
    `Category: ${business.category}`,
    ...overrideLines,
    "",
    `Rewrite ONLY the "${section}" page's copy, matching the JSON schema provided`,
    "for that page. Incorporate any business details given above.",
  ].join("\n");

  return { system, user };
}
