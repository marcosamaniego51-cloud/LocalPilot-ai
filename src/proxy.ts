import { NextResponse, type NextRequest } from "next/server";

// Multi-tenant routing (Requirements 3.1, 3.4 / design.md Section 5.3).
//
// Resolves the incoming Host header to decide whether this request is for:
//   - the marketing site / dashboard / admin (apex domain, e.g. localpilot.ai)
//   - a tenant's generated site on a platform subdomain (e.g. acme-plumbing.localpilot.ai)
//   - a tenant's connected custom domain (e.g. www.acmeplumbing.com)
//
// Subdomain/custom-domain requests are rewritten to /sites/[subdomain]/...
// so a single dynamic route can render any tenant's site. The actual
// custom-domain -> subdomain lookup (via the custom_domains table) happens
// in the /sites/[subdomain] route itself once we have DB access there,
// since proxy should stay fast and avoid a DB round trip per request
// where possible — for now this proxy only handles the platform
// wildcard subdomain case; custom domain support is completed in Task 5.5.
//
// Named proxy.ts / export `proxy` per the Next.js 16 convention (renamed
// from middleware.ts / `middleware`): https://nextjs.org/docs/messages/middleware-to-proxy

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "localhost:3000";

const RESERVED_SUBDOMAINS = new Set(["www", "app", "dashboard", "admin", "api"]);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const url = request.nextUrl;

  // Strip port for comparison against APP_DOMAIN which may or may not include one.
  const hostWithoutPort = host.split(":")[0];
  const appDomainWithoutPort = APP_DOMAIN.split(":")[0];

  const isApexOrReserved =
    host === APP_DOMAIN ||
    hostWithoutPort === appDomainWithoutPort ||
    hostWithoutPort === `www.${appDomainWithoutPort}`;

  if (isApexOrReserved) {
    return NextResponse.next();
  }

  const isPlatformSubdomain = hostWithoutPort.endsWith(`.${appDomainWithoutPort}`);

  if (isPlatformSubdomain) {
    const subdomain = hostWithoutPort.replace(`.${appDomainWithoutPort}`, "");
    if (RESERVED_SUBDOMAINS.has(subdomain)) {
      return NextResponse.next();
    }
    const rewritten = new URL(`/sites/${subdomain}${url.pathname}`, request.url);
    rewritten.search = url.search;
    return NextResponse.rewrite(rewritten);
  }

  // Anything else is treated as a candidate custom domain — rewrite to a
  // lookup route keyed by the raw host, which resolves it against
  // custom_domains at request time (Task 5.5).
  const rewritten = new URL(`/sites/_custom-domain${url.pathname}`, request.url);
  rewritten.search = url.search;
  rewritten.searchParams.set("host", hostWithoutPort);
  return NextResponse.rewrite(rewritten);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes handle their own auth/tenant resolution)
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, and other static assets
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
