import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { SiteRenderer } from "@/components/sites/site-renderer";

// Public tenant site rendering, reached via the wildcard-subdomain rewrite
// in src/middleware.ts (Requirements 3.1, 3.2, 3.3).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}): Promise<Metadata> {
  const { subdomain } = await params;
  const site = await prisma.site.findUnique({ where: { subdomain } });

  if (!site) return {};

  // Preview sites must not be indexed by search engines (Requirement 3.1).
  if (site.status === "preview") {
    return { robots: { index: false, follow: false } };
  }

  return {};
}

export default async function TenantSitePage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;

  const site = await prisma.site.findUnique({
    where: { subdomain },
    include: { pages: true },
  });

  if (!site) {
    notFound();
  }

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
