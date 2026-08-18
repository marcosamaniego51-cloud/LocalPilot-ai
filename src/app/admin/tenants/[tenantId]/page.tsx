import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Tenant detail view for support/debugging (Requirement 9.3 / Task 10.3).
// A deeper drill-in from the Tenants list — recent Leads, Calls, and
// AuditLog entries for this one Tenant, so an operator investigating a
// support request doesn't need direct DB access to see what happened.
export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      subscription: true,
      site: true,
      users: true,
      receptionistConfig: true,
      leads: { orderBy: { createdAt: "desc" }, take: 10 },
      calls: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!tenant) {
    notFound();
  }

  // Filtered by entityType too, not just entityId — AuditLog.entityId is a
  // bare string shared across every entity type (Tenant, Prospect, Site,
  // etc.), and while a cross-type id collision is astronomically unlikely
  // with cuids, being explicit here costs nothing and avoids relying on
  // that assumption.
  const auditLogs = await prisma.auditLog.findMany({
    where: { entityId: tenant.id, entityType: "Tenant" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{tenant.businessName}</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Subscription:{" "}
              <Badge variant={tenant.subscription?.status === "active" ? "default" : "secondary"}>
                {tenant.subscription?.status ?? "none"}
              </Badge>
            </p>
            <p>Site: {tenant.site ? `${tenant.site.subdomain} (${tenant.site.status})` : "none"}</p>
            <p>Receptionist number: {tenant.receptionistPhoneNumber ?? "not provisioned"}</p>
            <p>
              Users:{" "}
              {tenant.users.map((u) => `${u.email} (${u.role})`).join(", ") || "none"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent audit log</CardTitle>
          </CardHeader>
          <CardContent>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No audit entries.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {auditLogs.map((log) => (
                  <li key={log.id} className="text-muted-foreground">
                    {log.createdAt.toLocaleString()} — {log.action}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent leads</CardTitle>
        </CardHeader>
        <CardContent>
          {tenant.leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leads.</p>
          ) : (
            <ul className="space-y-2">
              {tenant.leads.map((lead) => (
                <li key={lead.id} className="text-sm">
                  <span className="font-medium">{lead.name ?? "Unknown"}</span> —{" "}
                  <span className="text-muted-foreground">{lead.message ?? "no message"}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent calls</CardTitle>
        </CardHeader>
        <CardContent>
          {tenant.calls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No calls.</p>
          ) : (
            <ul className="space-y-2">
              {tenant.calls.map((call) => (
                <li key={call.id} className="text-sm">
                  <span className="text-muted-foreground">{call.createdAt.toLocaleString()}</span>{" "}
                  — {call.outcome ?? "in progress"}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
