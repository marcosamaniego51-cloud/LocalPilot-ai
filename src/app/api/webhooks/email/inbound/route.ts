import { NextResponse } from "next/server";
import { EventWebhook, EventWebhookHeader } from "@sendgrid/eventwebhook";
import { prisma } from "@/lib/prisma";
import { parseMultipartFields } from "@/lib/email/parse-multipart";
import { emailInboundQueue } from "@/lib/queues";

/**
 * SendGrid Inbound Parse webhook receiver (Requirement 4.3 / Task 6.5).
 *
 * Receives a Prospect's reply to an outreach email, persists it as an
 * inbound EmailMessage on the matching thread, and enqueues the AI-agent
 * processing job (Task 6.6) — kept out of this handler so a slow/failed
 * OpenAI call can never cause SendGrid to see this webhook time out or
 * fail (which would trigger unnecessary retries on their end).
 *
 * Signature verification uses the SAME ECDSA scheme as the Event Webhook
 * (SENDGRID_INBOUND_PARSE_WEBHOOK_PUBLIC_KEY, separate from the Event
 * Webhook's key since they're configured as separate security policies in
 * SendGrid) and MUST run against the raw, unparsed request body — parsing
 * multipart form data first and re-serializing it would produce a
 * different byte sequence than what SendGrid signed.
 */

function isVerificationConfigured(): boolean {
  return Boolean(process.env.SENDGRID_INBOUND_PARSE_WEBHOOK_PUBLIC_KEY);
}

export async function POST(request: Request) {
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (isVerificationConfigured()) {
    const signature = request.headers.get(EventWebhookHeader.SIGNATURE()) ?? "";
    const timestamp = request.headers.get(EventWebhookHeader.TIMESTAMP()) ?? "";

    const ew = new EventWebhook();
    const publicKey = ew.convertPublicKeyToECDSA(
      process.env.SENDGRID_INBOUND_PARSE_WEBHOOK_PUBLIC_KEY!,
    );
    const valid = ew.verifySignature(publicKey, rawBody, signature, timestamp);

    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn(
      "SendGrid Inbound Parse webhook received without SENDGRID_INBOUND_PARSE_WEBHOOK_PUBLIC_KEY configured — signature not verified.",
    );
  }

  // Rebuild a Request over the already-read raw body so parseMultipartFields
  // can stream it — the original `request` body has already been consumed
  // by request.arrayBuffer() above (required to get the raw bytes for
  // signature verification before any parsing happens).
  const fields = await parseMultipartFields(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: rawBody,
    }),
  );

  const fromEmail = extractEmailAddress(fields.from);
  const textBody = fields.text ?? fields.html ?? "";

  if (!fromEmail || !textBody) {
    // Malformed/empty inbound email — nothing useful to process. Return
    // 200 so SendGrid doesn't retry indefinitely on something that will
    // never succeed.
    return NextResponse.json({ ok: true, skipped: "missing from/body" });
  }

  const prospect = await prisma.prospect.findFirst({ where: { email: fromEmail } });
  if (!prospect) {
    return NextResponse.json({ ok: true, skipped: "no matching prospect" });
  }

  const thread =
    (await prisma.emailThread.findFirst({ where: { prospectId: prospect.id } })) ??
    (await prisma.emailThread.create({
      data: {
        prospectId: prospect.id,
        subject: fields.subject ?? "(no subject)",
        status: "open",
      },
    }));

  const message = await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      direction: "inbound",
      fromAddress: fromEmail,
      body: stripQuotedReply(textBody),
    },
  });

  await prisma.prospect.update({
    where: { id: prospect.id },
    data: { status: "replied" },
  });

  await emailInboundQueue.add("process", {
    threadId: thread.id,
    emailMessageId: message.id,
  });

  return NextResponse.json({ ok: true });
}

function extractEmailAddress(fromHeader: string | undefined): string | null {
  if (!fromHeader) return null;
  // SendGrid's `from` field is a raw header value like `"Jane Doe" <jane@example.com>`.
  const match = fromHeader.match(/<([^>]+)>/);
  return (match ? match[1] : fromHeader).trim().toLowerCase();
}

/**
 * Strips the quoted "On [date], [person] wrote:" trailing portion most
 * email clients append to replies, so the AI agent (Task 6.6) sees just
 * the new content rather than re-reading the entire prior thread history
 * embedded in the reply body.
 */
function stripQuotedReply(body: string): string {
  const markers = [/\nOn .+wrote:\n/i, /\n-{2,}\s*Original Message\s*-{2,}/i, /\n>/];
  let trimmed = body;
  for (const marker of markers) {
    const idx = trimmed.search(marker);
    if (idx !== -1) {
      trimmed = trimmed.slice(0, idx);
    }
  }
  return trimmed.trim() || body.trim();
}
