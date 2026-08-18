import { NextResponse } from "next/server";
import { createClaimCheckoutSession } from "@/lib/billing/claim-prospect";
import { checkRateLimit, getClientIdentifier } from "@/lib/security/rate-limit";

// Starts a Stripe Checkout session for a Prospect claiming their preview
// site (Requirement 6.1, 6.2 / Task 7.1, 7.2). Public/unauthenticated —
// there is no Tenant account yet at this point in the funnel; Stripe
// Checkout collects payment details directly. Rate-limited (Task 11.3) —
// each Checkout session creation is a real (if small) Stripe API call,
// and this endpoint has no auth to otherwise deter scripted abuse.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ prospectId: string }> },
) {
  const { prospectId } = await params;

  const rateLimit = await checkRateLimit({
    route: "claim",
    identifier: getClientIdentifier(request),
    limit: 10,
    windowSec: 60,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429 },
    );
  }

  try {
    const { checkoutUrl } = await createClaimCheckoutSession(prospectId);
    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start checkout";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
