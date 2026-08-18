import { requireTenantContext } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomDomainPanel } from "./custom-domain-panel";

// Site management page (Requirement 3.4, 8.4 / Task 5.5). Full Site
// Editor (business info form, edit requests, template/color changes) is
// Task 9.6 — this page currently covers the custom-domain connection flow
// end-to-end; the rest is added there.
export default async function SiteManagementPage() {
  const { tenantId } = await requireTenantContext();

  const site = await prisma.site.findUnique({
    where: { tenantId },
    include: { customDomains: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Site</h1>

      {!site ? (
        <p className="text-sm text-muted-foreground">
          No site found for your account yet.
        </p>
      ) : (
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
      )}
    </div>
  );
}
