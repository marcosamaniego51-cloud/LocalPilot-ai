/**
 * Inbound email processing job (Requirement 4.3, 4.4 / Task 6.6, 6.7).
 *
 * Triggered after the SendGrid Inbound Parse webhook (Task 6.5) has
 * already persisted the inbound EmailMessage row — this job runs the AI
 * agent against that message and either sends an auto-reply or flags the
 * thread for human review, keeping the (fast, must-not-fail) webhook
 * handler itself free of any OpenAI call latency/failure risk.
 */

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/sendgrid-client";
import { runEmailAgent } from "@/lib/outreach/email-agent";
import { createUnsubscribeToken } from "@/lib/outreach/unsubscribe-token";
import { stopOutreachSequence } from "@/lib/outreach/run-outreach-tick";
import { siteUrl } from "@/lib/sites/site-url";
import type { EmailInboundJobPayload } from "@/lib/queues";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://localpilot.ai";
}

export async function runEmailInboundJob(payload: EmailInboundJobPayload): Promise<void> {
  const thread = await prisma.emailThread.findUniqueOrThrow({
    where: { id: payload.threadId },
    include: {
      prospect: { include: { site: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  const incoming = thread.messages.find((m) => m.id === payload.emailMessageId);
  if (!incoming) {
    throw new Error(`EmailMessage ${payload.emailMessageId} not found on thread ${payload.threadId}`);
  }

  // A reply is itself an engagement signal that should halt the
  // timer-based outreach nudges (Requirement 4.6) — a real conversation
  // is happening now, so "Still there?" follow-ups would be tone-deaf.
  if (thread.prospectId) {
    await stopOutreachSequence(thread.prospectId);
  }

  if (!thread.prospect || !thread.prospect.site) {
    // Tenant-side email threads (not yet built — a future Tenant-facing
    // email feature) don't go through this Prospect-specific agent flow.
    // Nothing to do here until that's designed; flag for a human rather
    // than silently drop it.
    await prisma.emailThread.update({
      where: { id: thread.id },
      data: { status: "flagged_for_human" },
    });
    return;
  }

  // Task 11.1/11.2: on any failure past this point (most likely the
  // OpenAI call itself), flag the thread for human review and audit-log
  // the failure — mirroring the pattern used by the other job runners
  // (discovery, site-generation) — rather than letting a failed inbound
  // reply job silently exhaust its BullMQ retries with no visible trace
  // for an operator to notice. A Prospect who replied and got no
  // response at all is a worse outcome than one who got a slightly
  // delayed human reply.
  try {
    const priorMessages = thread.messages
      .filter((m) => m.id !== incoming.id)
      .map((m) => ({ direction: m.direction, body: m.body }));

    const agentResponse = await runEmailAgent({
      businessName: thread.prospect.businessName,
      previewUrl: siteUrl(thread.prospect.site.subdomain),
      claimUrl: `${appUrl()}/claim/${thread.prospectId}`,
      priorMessages,
      incomingMessage: incoming.body,
    });

    await prisma.emailMessage.update({
      where: { id: incoming.id },
      data: { confidenceScore: agentResponse.confidence },
    });

    if (agentResponse.action === "escalate" || !agentResponse.replyBody) {
      await prisma.emailThread.update({
        where: { id: thread.id },
        data: { status: "flagged_for_human" },
      });
      await prisma.auditLog.create({
        data: {
          actor: "system:email-agent",
          action: "email_escalated_to_human",
          entityType: "EmailThread",
          entityId: thread.id,
          metadata: {
            reason: agentResponse.escalationReason,
            confidence: agentResponse.confidence,
          },
        },
      });
      return;
    }

    if (!thread.prospectId) return;

    await sendEmail({
      to: thread.prospect.email ?? "",
      subject: `Re: ${thread.subject}`,
      text: agentResponse.replyBody,
      unsubscribeToken: createUnsubscribeToken(thread.prospectId),
    });

    await prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        direction: "outbound",
        fromAddress: process.env.SENDGRID_FROM_EMAIL ?? "hello@localpilot.ai",
        body: agentResponse.replyBody,
        aiGenerated: true,
        confidenceScore: agentResponse.confidence,
      },
    });
  } catch (err) {
    await prisma.emailThread.update({
      where: { id: thread.id },
      data: { status: "flagged_for_human" },
    });
    await prisma.auditLog.create({
      data: {
        actor: "system:email-agent",
        action: "email_agent_failed",
        entityType: "EmailThread",
        entityId: thread.id,
        metadata: { error: err instanceof Error ? err.message : String(err) },
      },
    });
    throw err; // let BullMQ's retry/dead-letter policy still apply
  }
}
