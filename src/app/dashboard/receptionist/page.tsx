import { requireTenantContext } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReceptionistConfigForm } from "./receptionist-config-form";

// AI Receptionist config page (Requirement 7.5 / Task 8.2, 9.6's
// receptionist-specific slice). Distinct from the Site Editor's business
// info (src/app/dashboard/site) — see the ReceptionistConfig model's
// schema comment for why hours/FAQs here are kept separate from the
// website's businessInfo blob. Saving here calls
// updateReceptionistAgent() so the live agent picks up changes
// immediately (Requirement 7.5).
export default async function ReceptionistPage() {
  const { tenantId } = await requireTenantContext();

  const [tenant, config] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.receptionistConfig.findUnique({ where: { tenantId } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">AI Receptionist</h1>

      <Card>
        <CardHeader>
          <CardTitle>Your receptionist number</CardTitle>
        </CardHeader>
        <CardContent>
          {tenant?.receptionistPhoneNumber ? (
            <p className="text-sm text-muted-foreground">
              Calls to{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {tenant.receptionistPhoneNumber}
              </code>{" "}
              are answered by your AI receptionist.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your receptionist number hasn&apos;t been provisioned yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hours, FAQs &amp; fallback</CardTitle>
        </CardHeader>
        <CardContent>
          <ReceptionistConfigForm
            initial={{
              businessHours: (config?.businessHours as Record<string, string>) ?? {},
              faqs: (config?.faqs as Array<{ question: string; answer: string }>) ?? [],
              personalNumber: config?.personalNumber ?? "",
              greeting: config?.greeting ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
