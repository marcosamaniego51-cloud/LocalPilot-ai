import Stripe from "stripe";

let client: Stripe | undefined;

/**
 * Lazily-instantiated Stripe client (Requirement 6.2 / Task 7.2) — same
 * lazy pattern as the OpenAI/SendGrid clients, so STRIPE_SECRET_KEY isn't
 * required at module-load time (e.g. during `next build`).
 */
export function getStripeClient(): Stripe {
  if (!client) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    client = new Stripe(apiKey);
  }
  return client;
}

/** The single v1 subscription plan (Requirement 6.7 — "at least one configurable monthly price plan"). */
export function getDefaultPriceId(): string {
  const priceId = process.env.STRIPE_PRICE_ID_DEFAULT_PLAN;
  if (!priceId) {
    throw new Error("STRIPE_PRICE_ID_DEFAULT_PLAN is not configured");
  }
  return priceId;
}
