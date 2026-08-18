import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/outreach/unsubscribe-token";

// Actually performs the unsubscribe (Requirement 4.5, 10.1 / Task 6.4).
// Deliberately POST-only, triggered by a user click on the /unsubscribe
// landing page rather than the initial GET to that page. Email security
// scanners (Outlook Safe Links, corporate gateways, some webmail image
// proxies) routinely pre-fetch links found inside emails — including
// unsubscribe links — to check them for phishing. If a bare GET
// auto-processed the unsubscribe, those scanners would silently
// unsubscribe Prospects who never actually asked to be. Requiring an
// explicit POST from a real click avoids that failure mode while still
// honoring CAN-SPAM's "no more than one click" requirement (RFC 8058's
// one-click unsubscribe pattern uses the same GET-confirms/POST-executes
// split for this exact reason).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = body?.token as string | undefined;
  const prospectId = token ? verifyUnsubscribeToken(token) : null;

  if (!prospectId) {
    return NextResponse.json({ error: "Invalid or expired unsubscribe link" }, { status: 400 });
  }

  await prisma.prospect.updateMany({
    where: { id: prospectId },
    data: { doNotContact: true },
  });

  await prisma.outreachState.updateMany({
    where: { prospectId },
    data: { status: "stopped" },
  });

  await prisma.auditLog.create({
    data: {
      actor: "system:unsubscribe",
      action: "prospect_unsubscribed",
      entityType: "Prospect",
      entityId: prospectId,
      metadata: {},
    },
  });

  return NextResponse.json({ ok: true });
}
