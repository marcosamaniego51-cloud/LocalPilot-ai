import { requireTenantContext } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomDomainPanel } from "./custom-domain-panel";
import { BusinessInfoForm } from "./business-info-form";
import { EditRequestPanel } from "./edit-request-panel";

// Site management / Site Editor page (Requirement 3.4, 8.4, 2.6 / Tasks
// 5.5, 9.6). Combines: custom domain connection (5.5), direct business
// info edits (9.6's "save straight to businessInfo" half), and AI
// section-rewrite requests (9.6's "regenerate via the Task 4.5 job" half,
// with a status queue).
export default async function SiteManagementPage() {
  const { tenantId } = await requireTenantContext();

  const site = await prisma.site.findUnique({
    where: { tenantId },
    include: { customDomains: true, editRequests: { orderBy: { createdAt: "desc" }, take: 20 } },
  });

  const businessInfo = (site?.businessInfo ?? {}) as {
    hours?: Record<string, string>;
    services?: string[];
    phone?: string;
    logoUrl?: string;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Site</h1>

      {!site ? (
        <p className="text-sm text-muted-foreground">
          No site found for your account yet.
        </p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Business info</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Used on your website and by your AI receptionist — keep it
                up to date.
              </p>
              <BusinessInfoForm initial={businessInfo} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rewrite a section with AI</CardTitle>
            </CardHeader>
            <CardContent>
              <EditRequestPanel
                initialRequests={site.editRequests.map((r) => ({
                  id: r.id,
                  status: r.status,
                  request: r.request as { section: string; instructions?: string },
                  createdAt: r.createdAt.toISOString(),
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Custom domain</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Your site is live at{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {site.subdomain}.localpilot.ai
                </code>
                . Connect your own domain below.
              </p>
              <CustomDomainPanel initialDomains={site.customDomains} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
