import OpenAI from "openai";

let client: OpenAI | undefined;

/**
 * Lazily-instantiated OpenAI client (Requirement 2.2 / Task 4.1). Lazy so
 * that importing this module doesn't require OPENAI_API_KEY to be set at
 * module-load time (e.g. during `next build`'s static analysis) — only
 * actually calling the API does.
 */
export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

// Cheaper/faster model for the bulk of full-site generation; kept as a
// single named constant so it's easy to bump later without hunting
// through call sites. A pricier model can be swapped in per-call if
// quality issues show up for certain industries.
export const SITE_GENERATION_MODEL = "gpt-4o-mini";
