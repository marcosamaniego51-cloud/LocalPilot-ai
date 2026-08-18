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

// Call Logs page (Requirement 8.5 / Task 9.4): transcript, duration,
// timestamp, and outcome for every inbound call handled by the AI
// receptionist (Task 8.5's webhook populates these Call rows). Outbound
// calls are intentionally impossible for a Tenant's own Calls per the
// outbound-calling descope (design.md Section 11) — this table only ever
// shows `direction: inbound` for a Tenant, but the column is still shown
// for clarity/future-proofing rather than assumed.
function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const OUTCOME_LABELS: Record<string, string> = {
  resolved: "Resolved",
  message_taken: "Message taken",
  appointment_requested: "Appointment requested",
  transferred: "Transferred",
  voicemail: "Voicemail",
  no_answer: "No answer",
};

export default async function CallLogsPage() {
  const { tenantId } = await requireTenantContext();

  const calls = await prisma.call.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Call Logs</h1>

      <Card>
        <CardContent className="pt-6">
          {calls.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No calls yet. Once your AI receptionist is live, calls to
              your business number will show up here with a transcript.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Transcript</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {call.createdAt.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDuration(call.durationSec)}
                    </TableCell>
                    <TableCell>
                      {call.outcome ? (
                        <Badge variant="outline">
                          {OUTCOME_LABELS[call.outcome] ?? call.outcome}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">In progress</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-lg">
                      <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
                        {call.transcript ?? "No transcript available."}
                      </p>
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
