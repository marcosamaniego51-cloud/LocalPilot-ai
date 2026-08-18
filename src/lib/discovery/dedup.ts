/**
 * Deduplication helpers for Prospect discovery (Requirements 1.3, 1.4).
 *
 * Two businesses are considered the same if their normalized phone numbers
 * match, or (as a fallback when phone is missing) their normalized
 * business names match. Dedup is checked against both `prospects` and
 * `tenants` so we never re-discover a business that's already a customer.
 */

import { prisma } from "@/lib/prisma";

/**
 * Normalizes a phone number to a loose E.164-ish form for comparison.
 * Strips all non-digit characters; assumes US numbers when a 10-digit
 * number is given without a country code. Not a full E.164 validator —
 * good enough for matching, not for sending SMS/calls.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 0) return `+${digits}`;
  return null;
}

/**
 * Normalizes a business name for fuzzy-ish comparison: lowercase, strip
 * punctuation, collapse whitespace.
 */
export function normalizeBusinessName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type DedupCandidate = {
  normalizedPhone: string | null;
  normalizedName: string;
};

/**
 * Checks whether a candidate business already exists as a Prospect or
 * Tenant. Every Tenant in this system originates from a Prospect record
 * (see prisma schema: Tenant.prospectId), so checking Prospects alone
 * would normally be sufficient — but we also match against Tenant
 * normalizedBusinessName directly as a defense-in-depth guard against any
 * future path that creates a Tenant without a linked Prospect.
 *
 * Phone match is the primary signal (most reliable); normalized-name
 * match is the fallback for when a phone number is missing or mismatched
 * (e.g. business switched numbers).
 */
export async function isDuplicateBusiness(
  candidate: DedupCandidate,
): Promise<boolean> {
  if (candidate.normalizedPhone) {
    const existingProspect = await prisma.prospect.findFirst({
      where: { normalizedPhone: candidate.normalizedPhone },
      select: { id: true },
    });
    if (existingProspect) return true;
  }

  const [prospectNameMatch, tenantNameMatch] = await Promise.all([
    prisma.prospect.findFirst({
      where: { normalizedBusinessName: candidate.normalizedName },
      select: { id: true },
    }),
    prisma.tenant.findFirst({
      where: { normalizedBusinessName: candidate.normalizedName },
      select: { id: true },
    }),
  ]);

  return Boolean(prospectNameMatch || tenantNameMatch);
}
