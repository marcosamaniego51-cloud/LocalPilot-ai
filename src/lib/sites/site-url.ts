/**
 * Shared helper for building a Site's public URL from its subdomain.
 * Previously duplicated inline across the outreach tick, claim page, and
 * claim success page — consolidated here during Task 7 to avoid three
 * copies of the same NEXT_PUBLIC_APP_DOMAIN-stripping logic drifting out
 * of sync.
 */
export function siteUrl(subdomain: string): string {
  const appDomain = (process.env.NEXT_PUBLIC_APP_DOMAIN ?? "localpilot.ai").split(":")[0];
  return `https://${subdomain}.${appDomain}`;
}
