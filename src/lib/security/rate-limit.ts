/**
 * Redis-backed rate limiting for public endpoints (Requirement: design.md
 * Section 10 security hardening / Task 11.3).
 *
 * Fixed-window counter keyed by (route, client identifier). Uses the same
 * Redis connection BullMQ already depends on (src/lib/redis.ts) rather
 * than pulling in a separate rate-limiting service — this system's
 * traffic volume doesn't need anything more sophisticated than
 * INCR+EXPIRE, and reusing the existing Redis avoids a new piece of
 * infrastructure just for this.
 *
 * Scope: applied to the two public, unauthenticated, mutation-capable
 * endpoints called out explicitly in design.md's Security Considerations
 * — the claim form and the contact form. Both can be hit by anyone with a
 * URL and no login, and both trigger real side effects (Stripe Checkout
 * session creation, Lead creation) that are worth deterring abuse of.
 */

import { redisConnection } from "@/lib/redis";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
};

/**
 * Extracts a best-effort client identifier from a request for rate-limit
 * keying. Not authentication-grade (X-Forwarded-For is spoofable by the
 * client if there's no trusted reverse proxy stripping it first) — this
 * is meant to deter casual/scripted abuse, not to be a hard security
 * boundary. Behind Vercel (the deployment target per design.md Section
 * 12), X-Forwarded-For's first entry is set by Vercel's edge network
 * itself and is reliable.
 */
export function getClientIdentifier(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  // Fallback for local dev / environments without a proxy setting this header.
  return "unknown";
}

export async function checkRateLimit(params: {
  route: string;
  identifier: string;
  limit: number;
  windowSec: number;
}): Promise<RateLimitResult> {
  const key = `ratelimit:${params.route}:${params.identifier}`;

  const count = await redisConnection.incr(key);
  if (count === 1) {
    await redisConnection.expire(key, params.windowSec);
  }

  const ttl = await redisConnection.ttl(key);
  const resetAt = new Date(Date.now() + Math.max(ttl, 0) * 1000);

  return {
    allowed: count <= params.limit,
    remaining: Math.max(params.limit - count, 0),
    resetAt,
  };
}
