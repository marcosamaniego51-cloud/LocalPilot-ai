import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant-context";
import { updateReceptionistAgent } from "@/lib/voice/provision-receptionist";

/**
 * Tenant-facing receptionist configuration (Requirement 7.5 / Task 8.1-8.4
 * supporting endpoint). A full Site Editor UI around this is Task 9.6 —
 * this route is the API surface it will call; built now so the
 * "Tenant edits business info -> agent updates" loop is complete
 * end-to-end rather than leaving updateReceptionistAgent() with no caller
 * outside the provisioning path.
 */

const updateSchema = z.object({
  businessHours: z.record(z.string(), z.string()).optional(),
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  personalNumber: z.string().optional().nullable(),
  greeting: z.string().optional().nullable(),
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

  const config = await prisma.receptionistConfig.findUnique({
    where: { tenantId: ctx.tenantId },
  });

  return NextResponse.json({ config });
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
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await prisma.receptionistConfig.upsert({
    where: { tenantId: ctx.tenantId },
    update: parsed.data,
    create: { tenantId: ctx.tenantId, ...parsed.data },
  });

  try {
    await updateReceptionistAgent(ctx.tenantId);
  } catch {
    // Config is saved either way; the push-to-Retell step failing
    // shouldn't roll back the Tenant's saved changes. Surface as a
    // (still successful, 200) response with a warning field so the UI
    // can tell the Tenant their changes saved but the agent update
    // didn't go through yet.
    return NextResponse.json({
      ok: true,
      warning: "Saved, but updating the AI receptionist failed. It may still be using your previous settings.",
    });
  }

  return NextResponse.json({ ok: true });
}
