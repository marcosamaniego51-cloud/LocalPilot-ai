import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant-context";
import { generateVerificationToken } from "@/lib/domains/verify-ownership";

// Tenant-facing custom domain connection flow (Requirement 3.4 / Task 5.5).
// Step 1 of 2: Tenant submits a domain -> we create a pending CustomDomain
// row with a verification token and return the DNS instructions they need
// to publish. Step 2 (verify + attach to Vercel) is the sibling
// /verify route.

const connectDomainSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Enter a valid domain, e.g. www.yourbusiness.com"),
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
    include: { customDomains: true },
  });

  return NextResponse.json({ customDomains: site?.customDomains ?? [] });
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
  const parsed = connectDomainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid domain", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const domain = parsed.data.domain.toLowerCase();

  const site = await prisma.site.findUnique({ where: { tenantId: ctx.tenantId } });
  if (!site) {
    return NextResponse.json({ error: "No site found for this tenant" }, { status: 404 });
  }

  const existing = await prisma.customDomain.findUnique({ where: { domain } });
  if (existing && existing.siteId !== site.id) {
    return NextResponse.json(
      { error: "This domain is already connected to a different site" },
      { status: 409 },
    );
  }

  const verificationToken = existing?.verificationToken ?? generateVerificationToken();

  const customDomain = await prisma.customDomain.upsert({
    where: { domain },
    update: {},
    create: {
      domain,
      siteId: site.id,
      verificationToken,
    },
  });

  return NextResponse.json(
    {
      customDomain,
      dnsInstructions: {
        type: "TXT",
        name: `_localpilot-verify.${domain}`,
        value: verificationToken,
        note: "Add this TXT record, then click Verify. This proves you control the domain before we connect it.",
      },
    },
    { status: 201 },
  );
}
