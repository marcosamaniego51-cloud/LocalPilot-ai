import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenantOwner, UnauthorizedError } from "@/lib/tenant-context";
import { getStripeClient } from "@/lib/billing/stripe-client";

// Creates a Stripe Customer Portal session for the current Tenant
// (Requirement 6.1 / Task 9.7). The portal itself (hosted by Stripe)
// covers payment method updates, invoice history, and self-serve
// cancellation — no custom billing UI needed beyond this redirect.
// Owner-only (Task 9.8) — enforced here too, not just hidden from staff
// in the nav, since a hidden link doesn't stop a direct API call.
function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://localpilot.ai";
}

export async function POST() {
  let ctx;
  try {
    ctx = await requireTenantOwner();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });

  if (!tenant.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account found for this tenant" }, { status: 404 });
  }

  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: `${appUrl()}/dashboard/billing`,
  });

  return NextResponse.json({ url: session.url });
}
