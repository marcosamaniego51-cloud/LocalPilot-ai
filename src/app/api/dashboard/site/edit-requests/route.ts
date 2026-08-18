import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant-context";
import { siteGenerationQueue } from "@/lib/queues";

/**
 * Site edit requests — the AI-regeneration half of the Site Editor
 * (Requirement 8.4, 2.6 / Task 9.6). A Tenant asks to rewrite one page's
 * copy (optionally with instructions on tone/what to change); this
 * creates a SiteEditRequest (status=pending) and enqueues the same
 * section-regeneration job built in Task 4.5, which flips the request's
 * status to applied/failed when it finishes (see the
 * siteEditRequestId wiring in run-site-generation-job.ts).
 */

const createEditRequestSchema = z.object({
  section: z.enum(["home", "about", "services", "contact"]),
  instructions: z.string().max(2000).optional(),
});

export async function GET() {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const site = await prisma.site.findUnique({
    where: { tenantId: ctx.tenantId },
    include: { editRequests: { orderBy: { createdAt: "desc" }, take: 20 } },
  });

  return NextResponse.json({ editRequests: site?.editRequests ?? [] });
}

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const body = await request.json().catch(() => null);
  const parsed = createEditRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const site = await prisma.site.findUnique({ where: { tenantId: ctx.tenantId } });
  if (!site) {
    return NextResponse.json({ error: "No site found for this tenant" }, { status: 404 });
  }

  const editRequest = await prisma.siteEditRequest.create({
    data: {
      siteId: site.id,
      request: parsed.data,
      status: "pending",
    },
  });

  // If the Tenant gave free-text instructions, merge them into
  // businessInfo temporarily so the regeneration prompt sees them as
  // context (buildSectionRegenerationPrompt reads site.businessInfo) —
  // stored under a namespaced key so it doesn't collide with the
  // Tenant's actual saved business info fields (hours/services/etc).
  if (parsed.data.instructions) {
    const existing = (site.businessInfo ?? {}) as Record<string, unknown>;
    await prisma.site.update({
      where: { id: site.id },
      data: {
        businessInfo: { ...existing, editInstructions: parsed.data.instructions },
      },
    });
  }

  await siteGenerationQueue.add("regenerate", {
    siteId: site.id,
    regenerateSection: parsed.data.section,
    siteEditRequestId: editRequest.id,
  });

  return NextResponse.json({ editRequest }, { status: 201 });
}
