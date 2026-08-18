import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddProspectForm } from "./add-prospect-form";

/**
 * Admin Prospect pipeline view (Requirement 1.6, 4.4 / Task 10.2).
 *
 * Shows every Prospect's discovery/outreach status, their current
 * OutreachState sequence step, and flags threads that the AI email agent
 * (Task 6.6/6.7) escalated for human review — the operator's single place
 * to see "who needs my attention" across the whole discovery-to-claim
 * funnel, rather than having to separately check Prospects, OutreachStates,
 * and EmailThreads.
 */

const SEQUENCE_STEP_LABELS = ["Email 1", "Email 2", "Email 3"];

export default async function ProspectPipelinePage() {
  const [prospects, flaggedThreads] = await Promise.all([
    prisma.prospect.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { outreachState: true, site: true },
    }),
    prisma.emailThread.findMany({
      where: { status: "flagged_for_human" },
      include: { prospect: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Prospect Pipeline</h1>

      <Card>
        <CardHeader>
          <CardTitle>Add a prospect manually</CardTitle>
        </CardHeader>
        <CardContent>
          <AddProspectForm />
        </CardContent>
      </Card>

      {flaggedThreads.length > 0 ? (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base">
              Needs human review ({flaggedThreads.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {flaggedThreads.map((thread) => (
                <li key={thread.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {thread.prospect?.businessName ?? "Unknown business"}
                    </span>
                    <Badge variant="destructive">Flagged</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {thread.messages[0]?.body.slice(0, 200) ?? "No message"}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>All prospects</CardTitle>
        </CardHeader>
        <CardContent>
          {prospects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No prospects yet — run a discovery job to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Outreach step</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Do not contact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prospects.map((prospect) => (
                  <TableRow key={prospect.id}>
                    <TableCell className="font-medium">{prospect.businessName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {prospect.category}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          prospect.status === "claimed"
                            ? "default"
                            : prospect.status === "dead"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {prospect.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {prospect.outreachState
                        ? `${SEQUENCE_STEP_LABELS[prospect.outreachState.currentStep] ?? "—"} (${prospect.outreachState.status})`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {prospect.site ? (
                        <Badge variant="outline">{prospect.site.status}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {prospect.doNotContact ? <Badge variant="destructive">Yes</Badge> : "No"}
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
