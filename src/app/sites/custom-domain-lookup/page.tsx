import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { SiteRenderer } from "@/components/sites/site-renderer";

// Custom-domain site rendering (Requirement 3.4 / Task 5.5). Reached via
// the proxy's fallback rewrite (src/proxy.ts) for any Host that isn't the
// apex domain or a platform subdomain — resolves the raw host against the
// `custom_domains` table rather than `sites.subdomain`. Only *verified*
// custom domains resolve; an unverified domain pointed at us (DNS set up
// before ownership was proven) renders 404 rather than exposing the site,
// since verification is also the gate for actually being attached on
// Vercel — but a misconfigured DNS setup could theoretically still route
// traffic here before that, so this route re-checks `verified` itself
// rather than trusting the proxy/DNS layer alone.
//
// Named "custom-domain-lookup" rather than "_custom-domain": Next.js App
// Router treats any `_`-prefixed folder as a private folder excluded from
// routing entirely, which would make this route unreachable. The slug
// "custom-domain-lookup" is also reserved in src/lib/sites/slug.ts so no
// real Tenant's generated subdomain can ever collide with this route.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ host?: string }>;
}): Promise<Metadata> {
  const { host } = await searchParams;
  if (!host) return {};

  const customDomain = await prisma.customDomain.findUnique({
    where: { domain: host },
    include: { site: true },
  });

  if (!customDomain?.verified) return {};

  if (customDomain.site.status === "preview") {
    return { robots: { index: false, follow: false } };
  }

  return {};
}

export default async function CustomDomainSitePage({
  searchParams,
}: {
  searchParams: Promise<{ host?: string }>;
}) {
  const { host } = await searchParams;

  if (!host) {
    notFound();
  }

  const customDomain = await prisma.customDomain.findUnique({
    where: { domain: host },
    include: { site: { include: { pages: true } } },
  });

  if (!customDomain?.verified) {
    notFound();
  }

  const { site } = customDomain;

  if (site.status === "suspended") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-center">
        <h1 className="text-2xl font-semibold">Temporarily unavailable</h1>
        <p className="text-muted-foreground">
          This site is currently unavailable. Please check back later.
        </p>
      </div>
    );
  }

  return <SiteRenderer site={site} />;
}
