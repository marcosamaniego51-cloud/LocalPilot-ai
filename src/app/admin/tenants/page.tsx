import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Admin cross-tenant support/operations view (Requirement 9.3 / Task
 * 10.3). The one place in the app where cross-Tenant visibility is
 * intentional — everywhere else (dashboard pages, their API routes) goes
 * through `requireTenantContext()`, which can only ever see the
 * requester's own Tenant. This page uses the separate
 * `requireOperatorContext()` gate (enforced by the /admin layout) so that
 * distinction stays explicit rather than this becoming "one more page
 * that happens to skip the tenant filter."
 */
export default async function TenantsAdminPage() {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      subscription: true,
      site: true,
      _count: { select: { leads: true, calls: true } },
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tenants</h1>

      <Card>
        <CardContent className="pt-6">
          {tenants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tenants yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Receptionist</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/tenants/${tenant.id}`} className="hover:underline">
                        {tenant.businessName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          tenant.subscription?.status === "active" ? "default" : "secondary"
                        }
                      >
                        {tenant.subscription?.status ?? "none"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {tenant.site ? (
                        <Badge variant="outline">{tenant.site.status}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tenant._count.leads}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tenant._count.calls}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tenant.receptionistPhoneNumber ?? "Not provisioned"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {tenant.createdAt.toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
