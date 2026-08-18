import { NextResponse } from "next/server";
import { createClaimCheckoutSession } from "@/lib/billing/claim-prospect";

// Starts a Stripe Checkout session for a Prospect claiming their preview
// site (Requirement 6.1, 6.2 / Task 7.1, 7.2). Public/unauthenticated —
// there is no Tenant account yet at this point in the funnel; Stripe
// Checkout collects payment details directly.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ prospectId: string }> },
) {
  const { prospectId } = await params;

  try {
    const { checkoutUrl } = await createClaimCheckoutSession(prospectId);
    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start checkout";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
