import { NextResponse } from "next/server";
import { EventWebhook, EventWebhookHeader } from "@sendgrid/eventwebhook";
import { prisma } from "@/lib/prisma";
import { recordEngagement } from "@/lib/outreach/run-outreach-tick";

/**
 * SendGrid Event Webhook receiver (Requirement 4.6 / Task 6.3).
 *
 * Receives open/click/bounce/etc. events for outreach emails and records
 * engagement, which delays (but doesn't stop) the timer-based outreach
 * sequence for that Prospect — see recordEngagement()'s doc comment for
 * why opens/clicks specifically don't halt the sequence outright.
 *
 * Requires SendGrid's "Signed Event Webhook" feature enabled with
 * SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY set to the verification key SendGrid
 * generates for it — see
 * https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook-security-features
 */

type SendGridEvent = {
  event: string;
  email: string;
  sg_message_id?: string;
  timestamp: number;
};

function isVerificationConfigured(): boolean {
  return Boolean(process.env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY);
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (isVerificationConfigured()) {
    const signature = request.headers.get(EventWebhookHeader.SIGNATURE()) ?? "";
    const timestamp = request.headers.get(EventWebhookHeader.TIMESTAMP()) ?? "";

    const ew = new EventWebhook();
    const publicKey = ew.convertPublicKeyToECDSA(
      process.env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY!,
    );
    const valid = ew.verifySignature(publicKey, rawBody, signature, timestamp);

    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Fail closed in production (Requirement 10.2, Task 11.4 — every
    // webhook route must verify signatures before processing). Previously
    // this failed open ("accept but log"), which was inconsistent with
    // how the Stripe and Retell webhooks behave (both fail closed
    // unconditionally) and left a real gap: without a configured key, an
    // unauthenticated request could forge engagement events and
    // manipulate a Prospect's outreach timing. Only non-production
    // environments are allowed to proceed unverified, so local dev/testing
    // doesn't require a real SendGrid account to exercise this route.
    console.error(
      "SendGrid event webhook rejected: SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY is not configured in production.",
    );
    return NextResponse.json({ error: "Webhook verification not configured" }, { status: 500 });
  } else {
    console.warn(
      "SendGrid event webhook received without SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY configured — signature not verified (allowed outside production).",
    );
  }

  let events: SendGridEvent[];
  try {
    events = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  for (const event of events) {
    if (event.event !== "open" && event.event !== "click") continue;

    const prospect = await prisma.prospect.findFirst({
      where: { email: event.email },
      select: { id: true },
    });
    if (!prospect) continue;

    await recordEngagement(prospect.id);
  }

  return NextResponse.json({ ok: true });
}
