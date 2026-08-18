import { requireTenantContext } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function DashboardOverviewPage() {
  const { tenantId } = await requireTenantContext();

  const [tenant, recentLeads] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { site: true, subscription: true },
    }),
    prisma.lead.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Site status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={tenant?.site?.status === "published" ? "default" : "secondary"}>
              {tenant?.site?.status ?? "no site yet"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Subscription
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant={
                tenant?.subscription?.status === "active" ? "default" : "secondary"
              }
            >
              {tenant?.subscription?.status ?? "none"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Recent leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">{recentLeads.length}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent leads</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No leads yet. Once your site is published or your AI
              receptionist takes a call, they&apos;ll show up here.
            </p>
          ) : (
            <ul className="divide-y">
              {recentLeads.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{lead.name ?? "Unknown"}</p>
                    <p className="text-sm text-muted-foreground">
                      {lead.message ?? "No message"}
                    </p>
                  </div>
                  <Badge variant="outline">{lead.source}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
