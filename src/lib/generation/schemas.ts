import { z } from "zod";

/**
 * Structured site-content schemas (Requirement 2.2 / Task 4.1).
 *
 * Each page's AI-generated content is validated against one of these
 * schemas via OpenAI structured outputs (see openai-client.ts), so the
 * renderer (src/components/sites/site-renderer.tsx) can rely on a known
 * shape rather than defensively parsing arbitrary JSON. Kept intentionally
 * simple ("block-based" per design.md) — a handful of well-defined blocks
 * per page rather than a generic rich-text/CMS structure, which keeps both
 * generation and rendering predictable for a v1.
 */

export const homePageSchema = z.object({
  headline: z.string().describe("Short, punchy hero headline for the homepage"),
  subheadline: z
    .string()
    .describe("One-sentence supporting line under the headline"),
  body: z
    .string()
    .describe("2-3 sentence paragraph introducing the business"),
  ctaLabel: z
    .string()
    .describe('Call-to-action button label, e.g. "Get a free quote"'),
});

export const aboutPageSchema = z.object({
  headline: z.string().describe("Short headline for the About page"),
  body: z
    .string()
    .describe(
      "2-4 sentence paragraph about the business's story, experience, and values",
    ),
  highlights: z
    .array(z.string())
    .describe(
      "3-5 short trust-building bullet points, e.g. years in business, certifications, guarantees",
    ),
});

export const serviceItemSchema = z.object({
  name: z.string().describe("Name of the service"),
  description: z.string().describe("1-2 sentence description of the service"),
});

export const servicesPageSchema = z.object({
  headline: z.string().describe("Short headline for the Services page"),
  intro: z
    .string()
    .describe("1-2 sentence introduction to the services list"),
  services: z
    .array(serviceItemSchema)
    .min(3)
    .max(8)
    .describe("List of services this business offers"),
});

export const contactPageSchema = z.object({
  headline: z.string().describe("Short headline for the Contact page"),
  body: z
    .string()
    .describe("1-2 sentence invitation for visitors to get in touch"),
  formLabel: z
    .string()
    .describe('Label for the contact form submit button, e.g. "Send message"'),
});

export const siteContentSchema = z.object({
  home: homePageSchema,
  about: aboutPageSchema,
  services: servicesPageSchema,
  contact: contactPageSchema,
});

export type HomePageContent = z.infer<typeof homePageSchema>;
export type AboutPageContent = z.infer<typeof aboutPageSchema>;
export type ServicesPageContent = z.infer<typeof servicesPageSchema>;
export type ContactPageContent = z.infer<typeof contactPageSchema>;
export type SiteContent = z.infer<typeof siteContentSchema>;

/** Maps a Prisma PageType to its corresponding content schema. */
export const pageContentSchemas = {
  home: homePageSchema,
  about: aboutPageSchema,
  services: servicesPageSchema,
  contact: contactPageSchema,
} as const;

export type SitePageType = keyof typeof pageContentSchemas;
