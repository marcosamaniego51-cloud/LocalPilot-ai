/**
 * "No website" filter logic (Requirements 1.1, 1.2).
 *
 * A business is a discovery candidate if Google Places has no website on
 * file for it, OR the website it has on file is unreachable (dead
 * domain, expired, etc.) — a business with a broken website is
 * functionally in the same position as one with no website.
 */

const REACHABILITY_TIMEOUT_MS = 5000;

export async function isWebsiteReachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    return res.ok || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Returns true if this place should become a Prospect: no website field,
 * or an unreachable one.
 */
export async function isDiscoveryCandidate(website: string | undefined): Promise<boolean> {
  if (!website) return true;

  try {
    const reachable = await isWebsiteReachable(website);
    return !reachable;
  } catch {
    // Any unexpected error checking reachability is treated conservatively
    // as "reachable" — we'd rather under-discover than pester a business
    // that does in fact have a working site.
    return false;
  }
}
