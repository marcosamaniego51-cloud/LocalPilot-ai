/**
 * Retell webhook signature verification (Requirement 10.2 / Task 8.5).
 *
 * Per https://docs.retellai.com/features/secure-webhook: the
 * X-Retell-Signature header is formatted as `v={timestamp},d={digest}`,
 * where digest = HMAC-SHA256(raw_body + timestamp, RETELL_API_KEY) — the
 * API key itself is the signing secret, there is no separate webhook
 * secret to configure. Must run against the RAW body, same constraint as
 * every other webhook verified in this codebase (Stripe, SendGrid).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 minutes, per Retell's docs

export function verifyRetellSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;

  const match = signatureHeader.match(/^v=(\d+),d=(.+)$/);
  if (!match) return false;

  const [, timestampStr, digest] = match;
  const timestamp = Number(timestampStr);

  if (Math.abs(Date.now() - timestamp) > MAX_CLOCK_SKEW_MS) {
    return false; // stale signature — possible replay attempt
  }

  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) return false;

  const expectedDigest = createHmac("sha256", apiKey)
    .update(rawBody + timestampStr)
    .digest("hex");

  const expectedBuf = Buffer.from(expectedDigest);
  const providedBuf = Buffer.from(digest);
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}
