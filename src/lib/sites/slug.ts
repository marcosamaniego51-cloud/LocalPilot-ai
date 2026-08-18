/**
 * Slug/subdomain generation for newly-generated sites (used by Task 4.2).
 * Subdomains must be unique and DNS-safe (lowercase, hyphen-separated,
 * alphanumeric) since they're used directly in the wildcard-subdomain
 * routing (src/proxy.ts).
 */

import { prisma } from "@/lib/prisma";

export function slugify(businessName: string): string {
  return businessName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50)
    .replace(/^-+|-+$/g, "");
}

/**
 * Produces a unique slug/subdomain for a business name, appending a
 * numeric suffix on collision. Checked against the `sites` table's unique
 * `subdomain` column, which is also used as the `slug`.
 */
export async function generateUniqueSlug(businessName: string): Promise<string> {
  const base = slugify(businessName) || "business";
  let candidate = base;
  let attempt = 1;

  while (await prisma.site.findUnique({ where: { subdomain: candidate } })) {
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }

  return candidate;
}
