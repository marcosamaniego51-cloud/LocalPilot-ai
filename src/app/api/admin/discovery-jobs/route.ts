import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { discoveryQueue } from "@/lib/queues";
import { requireOperatorContext, UnauthorizedError } from "@/lib/tenant-context";

// Operator endpoint to trigger and list discovery job runs (Requirements
// 1.5, 1.6 / Task 3.5).

const createDiscoveryJobSchema = z.object({
  category: z.string().min(1),
  location: z.string().min(1),
  radiusKm: z.number().positive().default(25),
});

export async function GET() {
  try {
    await requireOperatorContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const jobs = await prisma.discoveryJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { prospects: true } } },
  });

  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  try {
    await requireOperatorContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const body = await request.json().catch(() => null);
  const parsed = createDiscoveryJobSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { category, location, radiusKm } = parsed.data;

  const job = await prisma.discoveryJob.create({
    data: {
      status: "pending",
      params: { category, location, radiusKm },
    },
  });

  await discoveryQueue.add("run", {
    discoveryJobId: job.id,
    category,
    location,
    radiusKm,
  });

  return NextResponse.json({ job }, { status: 201 });
}
