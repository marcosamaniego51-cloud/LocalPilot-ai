import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant-context";

/**
 * Tenant-editable site business info (Requirement 8.4 / Task 9.6).
 *
 * Covers the "direct save" half of the Site Editor — hours, services,
 * FAQs, logo/photo URLs, colors — persisted straight to
 * `Site.businessInfo` with no AI involved. This is also the data source
 * `run-site-generation-job.ts`'s section regeneration reads as "Tenant
 * overrides" (Requirement 2.4/2.6) and what `provision-receptionist.ts`
 * reads for the receptionist's services list — so saving here can affect
 * both the website and (indirectly, on next regeneration) the
 * receptionist without a Tenant needing to enter the same information
 * twice in two different places.
 */

const businessInfoSchema = z.object({
  hours: z.record(z.string(), z.string()).optional(),
  services: z.array(z.string()).optional(),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  phone: z.string().optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  photos: z.array(z.string().url()).optional(),
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

  const site = await prisma.site.findUnique({ where: { tenantId: ctx.tenantId } });
  return NextResponse.json({ businessInfo: site?.businessInfo ?? {} });
}

export async function PATCH(request: Request) {
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
  const parsed = businessInfoSchema.safeParse(body);
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

  const existing = (site.businessInfo ?? {}) as Record<string, unknown>;
  const merged = { ...existing, ...parsed.data };

  await prisma.site.update({
    where: { id: site.id },
    data: { businessInfo: merged },
  });

  return NextResponse.json({ ok: true, businessInfo: merged });
}
