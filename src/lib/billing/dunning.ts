/**
 * Dunning / subscription lifecycle transitions (Requirement 6.3, 6.4, 6.5,
 * 6.6 / Task 7.4, 7.5). Called from the Stripe webhook handler for the
 * relevant invoice/subscription events. Site suspend/restore and
 * receptionist enable/disable both live here since they're the two
 * things that must stay in lockstep with subscription status at all
 * times (Requirement 7.6 ties the receptionist to the same signal).
 */

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/sendgrid-client";
import { createUnsubscribeToken } from "@/lib/outreach/unsubscribe-token";
import { disableInboundAgent, enableInboundAgent } from "@/lib/voice/retell-client";

/**
 * Requirement 7.6: ties receptionist availability directly to
 * subscription status. Best-effort — a Retell API failure here shouldn't
 * block the billing state transition itself (the subscription/site
 * status update above is the source of truth; this just keeps Retell's
 * side in sync with it and is safe to retry/reconcile separately if it
 * fails).
 */
async function disableReceptionistIfProvisioned(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant?.receptionistPhoneNumber) return;

  try {
    await disableInboundAgent(tenant.receptionistPhoneNumber);
  } catch (err) {
    console.error(`Failed to disable receptionist for Tenant ${tenantId}`, err);
  }
}

async function enableReceptionistIfProvisioned(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant?.receptionistPhoneNumber || !tenant.retellAgentId) return;

  try {
    await enableInboundAgent(tenant.receptionistPhoneNumber, tenant.retellAgentId);
  } catch (err) {
    console.error(`Failed to re-enable receptionist for Tenant ${tenantId}`, err);
  }
}

async function notifyTenantBillingEvent(tenantId: string, subject: string, text: string): Promise<void> {
  const owner = await prisma.tenantUser.findFirst({
    where: { tenantId, role: "owner" },
    orderBy: { createdAt: "asc" },
  });
  if (!owner) return;

  try {
    await sendEmail({
      to: owner.email,
      subject,
      text,
      // See the note in claim-prospect.ts's sendWelcomeEmail — this
      // unsubscribe link is a footer formality for Tenant billing
      // notices, not a real "stop contacting me" opt-out. There's no
      // Prospect record for a Tenant to key a real unsubscribe token off
      // of, so this uses the Tenant id in its place; it only needs to be
      // a valid-looking signed token, not meaningfully actionable here.
      unsubscribeToken: createUnsubscribeToken(tenantId),
    });
  } catch (err) {
    // Billing notification failures shouldn't break the webhook handler
    // that's updating the actual subscription state — log and continue.
    console.error(`Failed to send billing notification email to Tenant ${tenantId}`, err);
  }
}

/** Requirement 6.3: advance dunning stage and notify on invoice.payment_failed. */
export async function handlePaymentFailed(tenantId: string): Promise<void> {
  const subscription = await prisma.subscription.update({
    where: { tenantId },
    data: { status: "past_due", dunningStage: { increment: 1 } },
  });

  await notifyTenantBillingEvent(
    tenantId,
    "Your LocalPilot AI payment failed",
    [
      "We weren't able to process your latest payment.",
      "We'll retry automatically over the next few days — please make sure your card details are up to date to avoid any interruption to your site and AI receptionist.",
    ].join("\n\n"),
  );

  await prisma.auditLog.create({
    data: {
      actor: "system:billing",
      action: "payment_failed",
      entityType: "Subscription",
      entityId: subscription.id,
      metadata: { dunningStage: subscription.dunningStage },
    },
  });
}

/** Requirement 6.4: suspend site + receptionist after all dunning retries are exhausted. */
export async function handleSubscriptionSuspended(tenantId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { tenantId },
      data: { status: "suspended" },
    });
    await tx.site.updateMany({
      where: { tenantId },
      data: { status: "suspended" },
    });
  });

  await disableReceptionistIfProvisioned(tenantId);

  await notifyTenantBillingEvent(
    tenantId,
    "Your LocalPilot AI site has been suspended",
    [
      "We were unable to collect payment after several attempts, so your site and AI receptionist have been paused.",
      "Update your payment details and your site will come back online automatically — no need to contact us.",
    ].join("\n\n"),
  );

  await prisma.auditLog.create({
    data: {
      actor: "system:billing",
      action: "subscription_suspended",
      entityType: "Tenant",
      entityId: tenantId,
      metadata: {},
    },
  });
}

/** Requirement 6.5: cancellation — unpublish at period end (Stripe already stopped billing by this point). */
export async function handleSubscriptionCanceled(tenantId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { tenantId },
      data: { status: "canceled" },
    });
    await tx.site.updateMany({
      where: { tenantId },
      data: { status: "suspended" },
    });
  });

  await disableReceptionistIfProvisioned(tenantId);

  await prisma.auditLog.create({
    data: {
      actor: "system:billing",
      action: "subscription_canceled",
      entityType: "Tenant",
      entityId: tenantId,
      metadata: {},
    },
  });
}

/** Requirement 6.6: auto-restore once payment succeeds after a past_due/suspended state. */
export async function handlePaymentSucceededAfterPastDue(
  tenantId: string,
  currentPeriodEnd: Date,
): Promise<void> {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription) return;

  const wasImpacted = subscription.status === "past_due" || subscription.status === "suspended";

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { tenantId },
      data: { status: "active", dunningStage: 0, currentPeriodEnd },
    });
    if (wasImpacted) {
      await tx.site.updateMany({
        where: { tenantId },
        data: { status: "published" },
      });
    }
  });

  if (wasImpacted) {
    await enableReceptionistIfProvisioned(tenantId);

    await notifyTenantBillingEvent(
      tenantId,
      "Your LocalPilot AI site is back online",
      "Your payment went through and your site and AI receptionist are active again.",
    );

    await prisma.auditLog.create({
      data: {
        actor: "system:billing",
        action: "subscription_restored",
        entityType: "Tenant",
        entityId: tenantId,
        metadata: {},
      },
    });
  }
}
