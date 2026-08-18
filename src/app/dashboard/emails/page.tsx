import { requireTenantContext } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Email Conversations view (Requirement 8.3 / Task 9.5).
//
// Note on scope: EmailThread/EmailMessage in this system are currently
// populated exclusively by the pre-claim OUTREACH funnel (Task 6) —
// threads are keyed by prospectId, sent/received while a business is
// still a Prospect being courted to claim their site. There is currently
// no Tenant-side email feature (e.g. Leads replying by email to a
// published site) that would create a tenantId-keyed thread — Lead
// follow-up in this system happens via phone (Task 8) or the dashboard
// itself, not email. So today this view will be empty for essentially
// every real Tenant, and that's expected, not a bug: once a Prospect
// claims their site, `stopOutreachSequence()` (Task 6/7) halts the
// outreach conversation, and nothing currently generates a new
// tenantId-scoped thread afterward. The page and query are still built
// to the actual schema/requirement (Tenant-relevant threads) so that if a
// future feature (e.g. two-way email support for Leads) starts writing
// tenantId-scoped threads, this view picks them up with no changes needed.

export default async function EmailsPage() {
  const { tenantId } = await requireTenantContext();

  const threads = await prisma.emailThread.findMany({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Emails</h1>

      {threads.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              No email conversations yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {threads.map((thread) => (
            <Card key={thread.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{thread.subject}</CardTitle>
                <Badge variant={thread.status === "open" ? "default" : "secondary"}>
                  {thread.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {thread.messages.map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.direction === "outbound"
                        ? "rounded-md bg-muted p-3 text-sm"
                        : "rounded-md border p-3 text-sm"
                    }
                  >
                    <p className="mb-1 text-xs text-muted-foreground">
                      {message.direction === "outbound" ? "Sent" : "Received"} &middot;{" "}
                      {message.createdAt.toLocaleString()}
                      {message.aiGenerated ? " · AI-generated" : ""}
                    </p>
                    <p className="whitespace-pre-line">{message.body}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
