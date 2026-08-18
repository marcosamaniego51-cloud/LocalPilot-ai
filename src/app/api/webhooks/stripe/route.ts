import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/billing/stripe-client";
import { completeClaimFromCheckout } from "@/lib/billing/claim-prospect";
import {
  handlePaymentFailed,
  handleSubscriptionSuspended,
  handleSubscriptionCanceled,
  handlePaymentSucceededAfterPastDue,
} from "@/lib/billing/dunning";

/**
 * Stripe webhook receiver (Requirement 6.2-6.6 / Task 7.3, 7.4, 7.6).
 *
 * Signature verification (Task 7.6) requires the RAW request body —
 * same constraint as the SendGrid webhooks in Task 6, and for the same
 * reason: Stripe signs the exact bytes it sent, so any parse/reserialize
 * step before verification would invalidate the signature.
 *
 * Idempotency (Task 7.6): every event is recorded in `webhook_events`
 * (provider="stripe", eventId=event.id) before processing. Stripe retries
 * webhook delivery on any non-2xx response or timeout, so the same event
 * can arrive more than once — this makes re-delivery a safe no-op rather
 * than double-creating a Tenant or double-incrementing a dunning stage.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid signature: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }

  const alreadyProcessed = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider: "stripe", eventId: event.id } },
  });
  if (alreadyProcessed) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    // Deliberately NOT recording the webhook_events row on failure, so
    // Stripe's automatic retry gets a real second attempt rather than
    // being silently deduped against a failed first try.
    console.error(`Stripe webhook handler failed for event ${event.id} (${event.type})`, err);
    await prisma.auditLog.create({
      data: {
        actor: "system:stripe-webhook",
        action: "webhook_handler_failed",
        entityType: "StripeEvent",
        entityId: event.id,
        metadata: { type: event.type, error: err instanceof Error ? err.message : String(err) },
      },
    });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  await prisma.webhookEvent.create({
    data: { provider: "stripe", eventId: event.id, type: event.type },
  });

  return NextResponse.json({ ok: true });
}

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const prospectId = session.client_reference_id ?? session.metadata?.prospectId;
      if (!prospectId) {
        throw new Error(`checkout.session.completed (${session.id}) has no client_reference_id/metadata.prospectId`);
      }
      if (!session.customer || !session.subscription) {
        throw new Error(`checkout.session.completed (${session.id}) missing customer/subscription`);
      }

      const stripe = getStripeClient();
      const subscription = await stripe.subscriptions.retrieve(session.subscription as string);

      await completeClaimFromCheckout({
        prospectId,
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: subscription.id,
        planId: subscription.items.data[0]?.price.id ?? "unknown",
        currentPeriodEnd: new Date(subscription.items.data[0].current_period_end * 1000),
      });
      return;
    }

    case "invoice.payment_failed": {
      const tenantId = await resolveTenantIdFromInvoice(event.data.object as Stripe.Invoice);
      if (tenantId) await handlePaymentFailed(tenantId);
      return;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const tenantId = await resolveTenantIdFromInvoice(invoice);
      const lineItem = invoice.lines.data[0];
      if (tenantId && lineItem?.period?.end) {
        await handlePaymentSucceededAfterPastDue(tenantId, new Date(lineItem.period.end * 1000));
      }
      return;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const tenantId = await resolveTenantIdFromStripeSubscriptionId(subscription.id);
      if (tenantId) {
        // A subscription can be deleted either because the Tenant
        // explicitly canceled (Req 6.5) or because Stripe's dunning
        // schedule exhausted all retries (Req 6.4) — Stripe's
        // cancellation_details.reason distinguishes the two.
        if (subscription.cancellation_details?.reason === "cancellation_requested") {
          await handleSubscriptionCanceled(tenantId);
        } else {
          await handleSubscriptionSuspended(tenantId);
        }
      }
      return;
    }

    default:
      // Unhandled event types are expected — Stripe sends many event
      // types we don't act on. Not an error.
      return;
  }
}

async function resolveTenantIdFromInvoice(invoice: Stripe.Invoice): Promise<string | null> {
  const subscriptionId =
    typeof invoice.parent?.subscription_details?.subscription === "string"
      ? invoice.parent.subscription_details.subscription
      : invoice.parent?.subscription_details?.subscription?.id;
  if (!subscriptionId) return null;
  return resolveTenantIdFromStripeSubscriptionId(subscriptionId);
}

async function resolveTenantIdFromStripeSubscriptionId(stripeSubscriptionId: string): Promise<string | null> {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
    select: { tenantId: true },
  });
  return subscription?.tenantId ?? null;
}
