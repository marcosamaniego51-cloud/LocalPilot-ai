/**
 * Outreach state machine driver (Requirements 4.1, 4.2, 4.6 / Task 6.2, 6.3).
 *
 * Design.md's Section 5.4 describes a scheduled worker "tick" that scans
 * for OutreachStates whose next_action_at has passed and advances them.
 * This module implements that: `runOutreachTick()` is what the recurring
 * BullMQ job (registered in queues.ts / worker/index.ts) calls on each
 * tick, and `kickoffOutreachForSite()` is what starts a new Prospect's
 * sequence once its preview site is generated (Task 4's generation job
 * calls this after creating the site — see the TODO left there in Task 4).
 *
 * Sequence (email-only, per the outbound-calling descope in design.md
 * Section 11):
 *   Step 0 -> Email 1, sent immediately on kickoff
 *   Step 1 -> Email 2, sent at kickoff + 2 days if no engagement
 *   Step 2 -> Email 3, sent at kickoff + 5 days if no engagement
 *   -> exhausted after Email 3 with no further action
 *
 * "Engagement" (open/click/reply) short-circuits the timer schedule
 * (Requirement 4.6) — see recordEngagement() below, called from the
 * SendGrid event webhook (opens/clicks) and the inbound-reply webhook.
 * Note: an open/click, unlike a reply, does NOT stop the sequence outright
 * (that would let anyone silently kill outreach just by having images
 * auto-load) — it only pauses/delays the next timer-based step so a
 * clearly-engaged Prospect isn't immediately hit with "Still there?"
 * follow-up emails. Only an explicit reply, claim, or unsubscribe stops
 * the sequence entirely.
 */

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/sendgrid-client";
import { buildOutreachEmail } from "@/lib/outreach/email-templates";
import { createUnsubscribeToken } from "@/lib/outreach/unsubscribe-token";

const STEP_INTERVALS_DAYS = [0, 2, 5] as const; // index = step about to be sent
const FINAL_STEP = STEP_INTERVALS_DAYS.length - 1;

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://localpilot.ai";
}

/**
 * Starts the outreach sequence for a Prospect whose preview site has just
 * been generated. Idempotent-ish: if an OutreachState already exists for
 * this Prospect, this does nothing (avoids double-kickoff if a job is
 * retried after partially succeeding).
 */
export async function kickoffOutreachForSite(siteId: string): Promise<void> {
  const site = await prisma.site.findUniqueOrThrow({
    where: { id: siteId },
    include: { prospect: true },
  });

  if (!site.prospectId || !site.prospect) {
    // Tenant-owned sites (e.g. regenerated after claim) never need
    // outreach — only Prospects go through this funnel.
    return;
  }

  const existing = await prisma.outreachState.findUnique({
    where: { prospectId: site.prospectId },
  });
  if (existing) return;

  await prisma.outreachState.create({
    data: {
      prospectId: site.prospectId,
      sequence: "initial_email_seq",
      currentStep: 0,
      status: "active",
      nextActionAt: new Date(), // send Email 1 immediately on the next tick
    },
  });
}

async function sendSequenceStep(params: {
  prospectId: string;
  businessName: string;
  email: string;
  siteSubdomain: string;
  step: 0 | 1 | 2;
}): Promise<void> {
  const previewUrl = `https://${params.siteSubdomain}.${(process.env.NEXT_PUBLIC_APP_DOMAIN ?? "localpilot.ai").split(":")[0]}`;
  const claimUrl = `${appUrl()}/claim/${params.prospectId}`;

  const template = buildOutreachEmail(params.step, {
    businessName: params.businessName,
    previewUrl,
    claimUrl,
  });

  // One ongoing thread per Prospect for outreach purposes — find the
  // existing one (e.g. from a prior sequence step) or start a new one on
  // Email 1.
  const thread =
    (await prisma.emailThread.findFirst({ where: { prospectId: params.prospectId } })) ??
    (await prisma.emailThread.create({
      data: { prospectId: params.prospectId, subject: template.subject, status: "open" },
    }));

  await sendEmail({
    to: params.email,
    subject: template.subject,
    text: template.text,
    unsubscribeToken: createUnsubscribeToken(params.prospectId),
  });

  await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      direction: "outbound",
      fromAddress: process.env.SENDGRID_FROM_EMAIL ?? "hello@localpilot.ai",
      body: template.text,
      aiGenerated: false,
    },
  });

  await prisma.prospect.update({
    where: { id: params.prospectId },
    data: { status: "contacted" },
  });
}

/**
 * Advances one OutreachState by one step, if its nextActionAt has passed.
 * Called for each due state by runOutreachTick().
 */
async function advanceOutreachState(stateId: string): Promise<void> {
  const state = await prisma.outreachState.findUniqueOrThrow({
    where: { id: stateId },
    include: { prospect: { include: { site: true } } },
  });

  if (state.status !== "active") return;
  if (!state.prospect.email) {
    // No email on file for this Prospect — can't send anything. Mark
    // exhausted rather than looping forever on every tick.
    await prisma.outreachState.update({
      where: { id: state.id },
      data: { status: "exhausted" },
    });
    return;
  }
  if (state.prospect.doNotContact) {
    await prisma.outreachState.update({ where: { id: state.id }, data: { status: "stopped" } });
    return;
  }
  if (!state.prospect.site) return; // shouldn't happen, but nothing to link to

  const step = state.currentStep as 0 | 1 | 2;

  await sendSequenceStep({
    prospectId: state.prospectId,
    businessName: state.prospect.businessName,
    email: state.prospect.email,
    siteSubdomain: state.prospect.site.subdomain,
    step,
  });

  if (step >= FINAL_STEP) {
    await prisma.outreachState.update({
      where: { id: state.id },
      data: { status: "exhausted", nextActionAt: null },
    });
    return;
  }

  const nextStep = step + 1;
  const nextIntervalDays = STEP_INTERVALS_DAYS[nextStep] - STEP_INTERVALS_DAYS[step];
  const nextActionAt = new Date(Date.now() + nextIntervalDays * 24 * 60 * 60 * 1000);

  await prisma.outreachState.update({
    where: { id: state.id },
    data: { currentStep: nextStep, nextActionAt },
  });
}

/**
 * Scans for all active OutreachStates whose nextActionAt has passed and
 * advances each one. Intended to run on a recurring schedule (every few
 * minutes) via a BullMQ job scheduler (Task 6.2).
 */
export async function runOutreachTick(): Promise<{ processed: number; errors: number }> {
  const due = await prisma.outreachState.findMany({
    where: {
      status: "active",
      nextActionAt: { lte: new Date() },
    },
    select: { id: true },
  });

  let errors = 0;
  for (const { id } of due) {
    try {
      await advanceOutreachState(id);
    } catch (err) {
      errors += 1;
      console.error(`Outreach tick: failed to advance OutreachState ${id}`, err);
      await prisma.auditLog.create({
        data: {
          actor: "system:outreach-worker",
          action: "outreach_step_failed",
          entityType: "OutreachState",
          entityId: id,
          metadata: { error: err instanceof Error ? err.message : String(err) },
        },
      });
    }
  }

  return { processed: due.length, errors };
}

/**
 * Records an engagement signal (open/click) for a Prospect's outreach —
 * Requirement 4.6. Unlike a reply/claim/unsubscribe, this does not stop
 * the sequence; it delays the next scheduled step by a day so an engaged
 * Prospect isn't immediately hit with the next nudge email while they're
 * presumably still looking at the current one.
 */
export async function recordEngagement(prospectId: string): Promise<void> {
  const state = await prisma.outreachState.findUnique({ where: { prospectId } });
  if (!state || state.status !== "active" || !state.nextActionAt) return;

  const delayedNextAction = new Date(
    Math.max(state.nextActionAt.getTime(), Date.now() + 24 * 60 * 60 * 1000),
  );

  await prisma.outreachState.update({
    where: { id: state.id },
    data: { nextActionAt: delayedNextAction },
  });
}

/**
 * Stops a Prospect's outreach sequence outright — used when they reply
 * (Requirement 4.3's routing to the AI agent still happens; this just
 * halts the timer-based nudges since a real conversation is now
 * happening) or claim their site.
 */
export async function stopOutreachSequence(prospectId: string): Promise<void> {
  await prisma.outreachState.updateMany({
    where: { prospectId, status: "active" },
    data: { status: "completed", nextActionAt: null },
  });
}
