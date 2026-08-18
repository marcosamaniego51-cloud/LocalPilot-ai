import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notifyTenantOfNewLead } from "@/lib/notifications/notify-tenant";
import { checkRateLimit, getClientIdentifier } from "@/lib/security/rate-limit";

// Public contact form submission (Requirement 3.5 / Task 5.4). Intentionally
// unauthenticated (any visitor to a published site can submit it).
// Rate-limited per Task 11.3 — same rationale as the claim endpoint,
// public + unauthenticated + a real write (Lead creation) per request.
// Pricing: $299/mo base plan, $399/mo with AI receptionist add-on.

const contactFormSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(3).max(50).optional().or(z.literal("")),
  message: z.string().min(1).max(5000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;

  const rateLimit = await checkRateLimit({
    route: "contact-form",
    identifier: getClientIdentifier(request),
    limit: 5,
    windowSec: 60,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = contactFormSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid submission", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, tenantId: true, status: true },
  });

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Leads (Requirement 3.5) are always associated with a Tenant, never a
  // Prospect's preview site — a preview site's contact form has no
  // business owner logged in yet to receive the message, and encouraging
  // Prospects to reply here instead of via the outreach/claim flow would
  // undercut the whole discovery -> claim funnel. Preview sites just
  // don't expose a working form (see the "coming soon" note in
  // SiteRenderer today).
  if (!site.tenantId || site.status !== "published") {
    return NextResponse.json(
      { error: "This site is not accepting messages yet" },
      { status: 409 },
    );
  }

  const { name, email, phone, message } = parsed.data;

  const lead = await prisma.lead.create({
    data: {
      tenantId: site.tenantId,
      source: "contact_form",
      name,
      email: email || undefined,
      phone: phone || undefined,
      message,
    },
  });

  await notifyTenantOfNewLead({
    tenantId: site.tenantId,
    leadId: lead.id,
    source: "contact_form",
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
