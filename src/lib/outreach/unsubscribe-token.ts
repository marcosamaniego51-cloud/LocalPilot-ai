/**
 * Signed unsubscribe tokens (Requirement 4.5, 10.1 / Task 6.4).
 *
 * The unsubscribe link embeds a prospectId + HMAC signature (keyed by
 * AUTH_SECRET) rather than a bare prospectId, so a Prospect's unsubscribe
 * link can't be guessed or tampered with (e.g. to unsubscribe someone
 * else, or forge a "verified" unsubscribe for a different record). Not a
 * JWT/full auth token — just enough integrity to make this one-purpose
 * link safe to expose publicly and act on without a login.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return secret;
}

function sign(prospectId: string): string {
  return createHmac("sha256", getSecret()).update(prospectId).digest("hex").slice(0, 32);
}

export function createUnsubscribeToken(prospectId: string): string {
  return `${prospectId}.${sign(prospectId)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [prospectId, signature] = token.split(".");
  if (!prospectId || !signature) return null;

  const expected = sign(prospectId);
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signature);

  if (expectedBuf.length !== providedBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, providedBuf)) return null;

  return prospectId;
}
