import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyRetellSignature } from "@/lib/voice/verify-retell-signature";
import type { CallOutcome } from "@/generated/prisma/enums";

/**
 * Retell call lifecycle webhook (Requirement 7.3 / Task 8.5).
 *
 * Registered as the agent's webhook_url (see provision-receptionist.ts).
 * Handles call_started (create a placeholder Call row so it shows up as
 * "in progress" if the dashboard is checked mid-call), call_ended
 * (transcript/duration), and call_analyzed (outcome classification via
 * Retell's post-call analysis, once available — arrives slightly after
 * call_ended).
 *
 * Idempotency: keyed by the shared WebhookEvent table (Task 7.6), using
 * `call_id + event` as the event id since Retell's payloads don't include
 * a separate global event id.
 */

type RetellWebhookEvent = {
  event: "call_started" | "call_ended" | "call_analyzed";
  call: {
    call_id: string;
    from_number?: string;
    to_number?: string;
    call_status?: string;
    duration_ms?: number;
    transcript?: string;
    recording_url?: string;
    disconnection_reason?: string;
    transfer_destination?: string;
    call_analysis?: {
      call_summary?: string;
      user_sentiment?: string;
      call_successful?: boolean;
    };
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifyRetellSignature(rawBody, request.headers.get("x-retell-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as RetellWebhookEvent;
  const eventId = `${body.call.call_id}:${body.event}`;

  const alreadyProcessed = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider: "retell", eventId } },
  });
  if (alreadyProcessed) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const tenant = await prisma.tenant.findFirst({
    where: { receptionistPhoneNumber: body.call.to_number },
  });

  try {
    switch (body.event) {
      case "call_started": {
        await prisma.call.upsert({
          where: { providerCallId: body.call.call_id },
          update: {},
          create: {
            direction: "inbound",
            tenantId: tenant?.id,
            providerCallId: body.call.call_id,
          },
        });
        break;
      }

      case "call_ended": {
        await prisma.call.upsert({
          where: { providerCallId: body.call.call_id },
          update: {
            transcript: body.call.transcript,
            recordingUrl: body.call.recording_url,
            durationSec: body.call.duration_ms ? Math.round(body.call.duration_ms / 1000) : undefined,
            outcome: mapDisconnectionToOutcome(body.call.disconnection_reason, body.call.transfer_destination),
          },
          create: {
            direction: "inbound",
            tenantId: tenant?.id,
            providerCallId: body.call.call_id,
            transcript: body.call.transcript,
            recordingUrl: body.call.recording_url,
            durationSec: body.call.duration_ms ? Math.round(body.call.duration_ms / 1000) : undefined,
            outcome: mapDisconnectionToOutcome(body.call.disconnection_reason, body.call.transfer_destination),
          },
        });
        break;
      }

      case "call_analyzed": {
        // Refines the outcome using Retell's post-call analysis if it
        // gives us a clearer signal than the raw disconnection reason
        // alone (e.g. call_successful: false despite a normal hangup).
        const analysis = body.call.call_analysis;
        if (analysis && analysis.call_successful === false) {
          await prisma.call.updateMany({
            where: { providerCallId: body.call.call_id },
            data: { outcome: "resolved" },
          });
        }
        break;
      }
    }
  } catch (err) {
    console.error(`Retell webhook handler failed for ${body.event} (${body.call.call_id})`, err);
    await prisma.auditLog.create({
      data: {
        actor: "system:retell-webhook",
        action: "webhook_handler_failed",
        entityType: "Call",
        entityId: body.call.call_id,
        metadata: { event: body.event, error: err instanceof Error ? err.message : String(err) },
      },
    });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  await prisma.webhookEvent.create({
    data: { provider: "retell", eventId, type: body.event },
  });

  return NextResponse.json({ ok: true });
}

function mapDisconnectionToOutcome(
  reason: string | undefined,
  transferDestination: string | undefined,
): CallOutcome | undefined {
  if (transferDestination) return "transferred";
  switch (reason) {
    case "voicemail_reached":
      return "voicemail";
    case "dial_no_answer":
      return "no_answer";
    case "user_hangup":
    case "agent_hangup":
      return "resolved";
    default:
      return undefined;
  }
}
