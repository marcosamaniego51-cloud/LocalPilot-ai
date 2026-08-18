import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAIClient, SITE_GENERATION_MODEL } from "@/lib/generation/openai-client";
import { buildSiteGenerationPrompt, buildSectionRegenerationPrompt, type BusinessInput } from "@/lib/generation/prompts";
import {
  siteContentSchema,
  pageContentSchemas,
  type SiteContent,
  type SitePageType,
} from "@/lib/generation/schemas";

/**
 * Generates all four pages' structured copy for a business in a single
 * OpenAI structured-output call (Requirement 2.2 / Task 4.1, 4.2).
 *
 * A single combined call (rather than 4 separate calls) keeps latency and
 * cost down for the common case (a brand-new Prospect getting its first
 * preview site) and lets the model keep voice/detail consistent across
 * pages. Section-level regeneration (Task 4.5) uses the narrower
 * single-page call below instead.
 */
export async function generateSiteContent(business: BusinessInput): Promise<SiteContent> {
  const { system, user } = buildSiteGenerationPrompt(business);
  const openai = getOpenAIClient();

  const completion = await openai.chat.completions.parse({
    model: SITE_GENERATION_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: zodResponseFormat(siteContentSchema, "site_content"),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    throw new Error("OpenAI site generation returned no parsed content");
  }

  return parsed;
}

/**
 * Regenerates a single page's copy (Requirement 2.6 / Task 4.5).
 */
export async function generateSectionContent<T extends SitePageType>(
  business: BusinessInput,
  section: T,
  overrides?: Record<string, unknown>,
): Promise<SiteContent[T]> {
  const { system, user } = buildSectionRegenerationPrompt(business, section, overrides);
  const openai = getOpenAIClient();
  const schema = pageContentSchemas[section];

  const completion = await openai.chat.completions.parse({
    model: SITE_GENERATION_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: zodResponseFormat(schema, `${section}_page_content`),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    throw new Error(`OpenAI section regeneration for "${section}" returned no parsed content`);
  }

  return parsed as SiteContent[T];
}
