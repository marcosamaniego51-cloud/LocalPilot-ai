import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant-context";
import { checkTxtVerification } from "@/lib/domains/verify-ownership";
import { addDomainToProject } from "@/lib/domains/vercel-domains";

// Step 2 of the custom domain flow (Requirement 3.4 / Task 5.5): checks
// the TXT ownership record, and if present, attaches the domain to the
// Vercel project and marks it verified. Safe to call repeatedly — a
// Tenant who hasn't published the DNS record yet just gets told so and
// can retry once they have.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ domainId: string }> },
) {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const { domainId } = await params;

  const customDomain = await prisma.customDomain.findUnique({
    where: { id: domainId },
    include: { site: true },
  });

  if (!customDomain || customDomain.site.tenantId !== ctx.tenantId) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  if (customDomain.verified) {
    return NextResponse.json({ customDomain, alreadyVerified: true });
  }

  const ownershipVerified = await checkTxtVerification(
    customDomain.domain,
    customDomain.verificationToken,
  );

  if (!ownershipVerified) {
    return NextResponse.json(
      {
        error: "Verification record not found yet",
        dnsInstructions: {
          type: "TXT",
          name: `_localpilot-verify.${customDomain.domain}`,
          value: customDomain.verificationToken,
        },
      },
      { status: 409 },
    );
  }

  try {
    await addDomainToProject(customDomain.domain);
  } catch (err) {
    // Ownership is proven at this point, but attaching to Vercel failed
    // (misconfigured API token, domain already used elsewhere on Vercel,
    // etc.) — surface this distinctly rather than silently marking
    // verified, since the domain won't actually route to the site yet.
    return NextResponse.json(
      {
        error: "Domain ownership verified, but connecting to hosting failed. Please try again shortly.",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const updated = await prisma.customDomain.update({
    where: { id: customDomain.id },
    data: { verified: true, verifiedAt: new Date() },
  });

  return NextResponse.json({ customDomain: updated });
}
