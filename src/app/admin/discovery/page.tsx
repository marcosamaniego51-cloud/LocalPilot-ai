import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOperatorContext, UnauthorizedError } from "@/lib/tenant-context";
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
import { DiscoveryJobForm } from "./discovery-job-form";

// Operator/admin view for triggering and monitoring Prospect discovery
// runs (Requirements 1.5, 1.6 / Task 3.5).
export default async function DiscoveryAdminPage() {
  try {
    await requireOperatorContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect("/login");
    }
    throw err;
  }

  const jobs = await prisma.discoveryJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { prospects: true } } },
  });

  return (
    <div className="space-y-6 px-6 py-8">
      <h1 className="text-2xl font-semibold">Prospect Discovery</h1>

      <Card>
        <CardHeader>
          <CardTitle>Run a new discovery job</CardTitle>
        </CardHeader>
        <CardContent>
          <DiscoveryJobForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No discovery jobs have been run yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scanned</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Duplicates</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const params = job.params as {
                    category?: string;
                    location?: string;
                  };
                  const stats = (job.stats ?? {}) as {
                    scanned?: number;
                    created?: number;
                    duplicates?: number;
                  };
                  return (
                    <TableRow key={job.id}>
                      <TableCell>{params.category}</TableCell>
                      <TableCell>{params.location}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            job.status === "completed"
                              ? "default"
                              : job.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{stats.scanned ?? "—"}</TableCell>
                      <TableCell>{stats.created ?? job._count.prospects}</TableCell>
                      <TableCell>{stats.duplicates ?? "—"}</TableCell>
                      <TableCell>{job.createdAt.toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
