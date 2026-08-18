/**
 * Domain ownership verification via DNS TXT record (Requirement 3.4 /
 * Task 5.5).
 *
 * Before attaching a Tenant-supplied domain to the Vercel project (which
 * would otherwise let anyone claim a domain they don't control, simply by
 * typing it into the dashboard), the Tenant must first publish a TXT
 * record proving they control the domain's DNS:
 *
 *   _localpilot-verify.<domain>  TXT  "<verificationToken>"
 *
 * Uses Node's built-in DNS resolver (no extra dependency needed) via
 * Next.js API routes running on the Node runtime.
 */

import { promises as dns } from "node:dns";

export async function checkTxtVerification(
  domain: string,
  expectedToken: string,
): Promise<boolean> {
  try {
    const records = await dns.resolveTxt(`_localpilot-verify.${domain}`);
    return records.some((chunks) => chunks.join("").trim() === expectedToken);
  } catch {
    // NXDOMAIN / no TXT record yet — not verified, not an error condition
    // worth surfacing differently; the Tenant just hasn't published it yet.
    return false;
  }
}

export function generateVerificationToken(): string {
  // 24 random bytes as hex — long enough to not be guessable, short
  // enough to comfortably fit in a TXT record and be copy-pasted.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
