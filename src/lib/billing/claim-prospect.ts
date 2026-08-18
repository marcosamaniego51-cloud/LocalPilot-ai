/**
 * Claim Flow orchestration (Requirement 6.1, 6.2 / Task 7.1, 7.2, 7.3).
 *
 * Two halves:
 *   - createClaimCheckoutSession(): called from the public claim page to
 *     start a Stripe Checkout session for a Prospect.
 *   - completeClaimFromCheckout(): called from the checkout.session.completed
 *     webhook handler once payment succeeds — creates the Tenant, links the
 *     Site, and stops outreach. This is the actual "Prospect becomes a
 *     paying customer" transition point in the whole system.
 */

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { getStripeClient, getDefaultPriceId } from "@/lib/billing/stripe-client";
import { stopOutreachSequence } from "@/lib/outreach/run-outreach-tick";
import { normalizeBusinessName } from "@/lib/discovery/dedup";
import { sendEmail } from "@/lib/email/sendgrid-client";
import { createUnsubscribeToken } from "@/lib/outreach/unsubscribe-token";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://localpilot.ai";
}

export async function createClaimCheckoutSession(prospectId: string): Promise<{ checkoutUrl: string }> {
  const prospect = await prisma.prospect.findUniqueOrThrow({
    where: { id: prospectId },
    include: { site: true, tenant: true },
  });

  if (prospect.tenant) {
    throw new Error("This business has already claimed its site");
  }
  if (!prospect.site) {
    throw new Error("No preview site exists yet for this business");
  }

  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: getDefaultPriceId(), quantity: 1 }],
    success_url: `${appUrl()}/claim/${prospectId}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/claim/${prospectId}`,
    customer_email: prospect.email ?? undefined,
    // Carried through to the checkout.session.completed webhook so we can
    // resolve back to this Prospect without relying on email matching
    // (Prospects can claim with a different email than the one discovery
    // found, e.g. a personal vs. business address).
    client_reference_id: prospectId,
    metadata: { prospectId },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout URL");
  }

  return { checkoutUrl: session.url };
}

/**
 * Idempotent: if this Prospect has already been claimed (e.g. webhook
 * retried), returns the existing Tenant rather than erroring or
 * duplicating. Called only after Stripe has confirmed payment succeeded.
 *
 * Also provisions the Tenant's first login (TenantUser) — without this, a
 * paying customer would have a Tenant/Subscription/Site but no way to
 * actually log into their dashboard. A random password is generated and
 * a "set your password" email sent, rather than emailing the random
 * password itself (never email a real password/secret in plaintext).
 */
export async function completeClaimFromCheckout(params: {
  prospectId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planId: string;
  currentPeriodEnd: Date;
}): Promise<{ tenantId: string }> {
  const existingTenant = await prisma.tenant.findUnique({
    where: { prospectId: params.prospectId },
  });
  if (existingTenant) {
    return { tenantId: existingTenant.id };
  }

  const prospect = await prisma.prospect.findUniqueOrThrow({
    where: { id: params.prospectId },
    include: { site: true },
  });

  if (!prospect.email) {
    // Shouldn't happen in practice — Stripe Checkout collects an email
    // even if the Prospect record's own email field is empty — but guard
    // explicitly rather than silently creating an unreachable account.
    throw new Error(`Prospect ${prospect.id} has no email on file; cannot provision Tenant login`);
  }

  // The raw token goes in the email link; only its hash is ever stored,
  // so a DB read alone can't be used to set the account's password.
  const rawResetToken = randomBytes(32).toString("hex");
  const resetTokenHash = createHash("sha256").update(rawResetToken).digest("hex");
  // passwordHash starts as an unusable placeholder (a random bcrypt hash
  // of a value nobody knows) — the account has no working password until
  // the Tenant actually uses the set-password link.
  const placeholderPasswordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);

  const tenant = await prisma.$transaction(async (tx) => {
    const created = await tx.tenant.create({
      data: {
        prospectId: prospect.id,
        businessName: prospect.businessName,
        normalizedBusinessName: normalizeBusinessName(prospect.businessName),
        stripeCustomerId: params.stripeCustomerId,
      },
    });

    await tx.subscription.create({
      data: {
        tenantId: created.id,
        stripeSubscriptionId: params.stripeSubscriptionId,
        planId: params.planId,
        status: "active",
        currentPeriodEnd: params.currentPeriodEnd,
      },
    });

    if (prospect.site) {
      await tx.site.update({
        where: { id: prospect.site.id },
        data: {
          tenantId: created.id,
          status: "published",
          publishedAt: new Date(),
        },
      });
    }

    await tx.prospect.update({
      where: { id: prospect.id },
      data: { status: "claimed" },
    });

    const tenantUser = await tx.tenantUser.create({
      data: {
        tenantId: created.id,
        email: prospect.email!,
        passwordHash: placeholderPasswordHash,
        role: "owner",
      },
    });

    await tx.passwordResetToken.create({
      data: {
        tenantUserId: tenantUser.id,
        tokenHash: resetTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return created;
  });

  await stopOutreachSequence(prospect.id);

  await prisma.auditLog.create({
    data: {
      actor: "system:billing",
      action: "prospect_claimed",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: { prospectId: prospect.id },
    },
  });

  await sendWelcomeEmail({
    to: prospect.email,
    businessName: prospect.businessName,
    rawResetToken,
    prospectId: prospect.id,
  });

  return { tenantId: tenant.id };
}

async function sendWelcomeEmail(params: {
  to: string;
  businessName: string;
  rawResetToken: string;
  prospectId: string;
}): Promise<void> {
  const appUrlBase = appUrl();
  const setPasswordUrl = `${appUrlBase}/set-password?token=${encodeURIComponent(params.rawResetToken)}`;

  await sendEmail({
    to: params.to,
    subject: `Welcome to LocalPilot AI, ${params.businessName}!`,
    text: [
      `Your site for ${params.businessName} is now live!`,
      `Set your dashboard password to get started: ${setPasswordUrl}`,
      `From your dashboard you can view leads, call logs, and manage your site.`,
    ].join("\n\n"),
    // The unsubscribe token here is only meaningful for outreach emails;
    // a claimed Tenant is a paying customer, not a cold-outreach target,
    // so this footer link is more of a formality than a real opt-out path
    // — Tenant communication preferences belong in the dashboard (Task 9),
    // not an unsubscribe link. Kept for footer consistency for now.
    unsubscribeToken: createUnsubscribeToken(params.prospectId),
  });
}
