import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClaimButton } from "./claim-button";
import { siteUrl } from "@/lib/sites/site-url";

// Public claim page (Requirement 6.1 / Task 7.1). Linked from every
// outreach email's claim link and from the "Claim this site" banner on a
// preview site (SiteRenderer).
export default async function ClaimPage({
  params,
}: {
  params: Promise<{ prospectId: string }>;
}) {
  const { prospectId } = await params;

  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    include: { site: { include: { pages: true } }, tenant: true },
  });

  if (!prospect || !prospect.site) {
    notFound();
  }

  if (prospect.tenant) {
    // Already claimed — nothing more to do here.
    redirect(siteUrl(prospect.site.subdomain));
  }

  const homeContent = prospect.site.pages.find((p) => p.pageType === "home")?.content as
    | { headline?: string }
    | undefined;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="max-w-xl space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Claim your free website for {prospect.businessName}
        </h1>
        <p className="text-muted-foreground">
          {homeContent?.headline ?? "Your site is ready to go live."} Go live
          today with a monthly subscription — cancel anytime.
        </p>
        <a
          href={siteUrl(prospect.site.subdomain)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-medium underline underline-offset-2"
        >
          View your preview site &rarr;
        </a>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>LocalPilot AI — Full Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>&bull; Your website, hosted and published</li>
            <li>&bull; AI receptionist for incoming calls</li>
            <li>&bull; Lead notifications from your site&apos;s contact form</li>
            <li>&bull; Cancel anytime</li>
          </ul>
          <ClaimButton prospectId={prospect.id} />
        </CardContent>
      </Card>
    </div>
  );
}
