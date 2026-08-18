import { requireTenantContext } from "@/lib/tenant-context";
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

// Leads page (Requirement 8.2 / Task 9.3): list/detail view of Leads
// generated from the site's contact form (Task 5.4) and the inbound AI
// receptionist (Task 8.3). Both sources land in the same `leads` table
// with a `source` discriminator, so this is a single list rather than
// two separate views — a Tenant just wants "who contacted me," not a
// breakdown by channel.
export default async function LeadsPage() {
  const { tenantId } = await requireTenantContext();

  const leads = await prisma.lead.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { calls: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Leads</h1>

      <Card>
        <CardContent className="pt-6">
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No leads yet. New contact-form submissions and calls handled
              by your AI receptionist will show up here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      {lead.name ?? "Unknown"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.phone ?? lead.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {lead.source === "contact_form" ? "Website" : "Phone call"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md text-sm text-muted-foreground">
                      {lead.message ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {lead.createdAt.toLocaleString()}
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
