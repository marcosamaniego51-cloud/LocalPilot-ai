/**
 * Tenant notification (Requirements 3.5, 8.2 / Task 11.1 closes out the
 * TODO left here in Task 5.4).
 *
 * Sends an actual email to the Tenant's owner when a new Lead comes in,
 * now that the SendGrid client exists (Task 6). Always writes the audit
 * log entry regardless of whether the email send succeeds, so the event
 * is durably recorded even if SendGrid itself is down — dashboard
 * visibility of the Lead already works independently of this (Leads are
 * queried live from the DB, Task 9.3), so a failed notification email
 * never means a silently lost Lead.
 */

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/sendgrid-client";
import { createUnsubscribeToken } from "@/lib/outreach/unsubscribe-token";

export type NewLeadNotification = {
  tenantId: string;
  leadId: string;
  source: "contact_form" | "inbound_call";
};

export async function notifyTenantOfNewLead(params: NewLeadNotification): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actor: "system:notifications",
      action: "tenant_notified_new_lead",
      entityType: "Lead",
      entityId: params.leadId,
      metadata: { tenantId: params.tenantId, source: params.source },
    },
  });

  const [tenant, lead] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: params.tenantId } }),
    prisma.lead.findUnique({ where: { id: params.leadId } }),
  ]);
  if (!tenant || !lead) return;

  const owner = await prisma.tenantUser.findFirst({
    where: { tenantId: params.tenantId, role: "owner" },
    orderBy: { createdAt: "asc" },
  });
  if (!owner) return;

  try {
    await sendEmail({
      to: owner.email,
      subject: `New lead for ${tenant.businessName}`,
      text: [
        `You have a new lead from ${params.source === "contact_form" ? "your website" : "a phone call"}.`,
        lead.name ? `Name: ${lead.name}` : null,
        lead.phone ? `Phone: ${lead.phone}` : null,
        lead.email ? `Email: ${lead.email}` : null,
        lead.message ? `Message: ${lead.message}` : null,
        `View it in your dashboard: ${process.env.NEXT_PUBLIC_APP_URL ?? "https://localpilot.ai"}/dashboard/leads`,
      ]
        .filter(Boolean)
        .join("\n"),
      // See the note in claim-prospect.ts's sendWelcomeEmail / dunning.ts's
      // notifyTenantBillingEvent — the unsubscribe link on Tenant-facing
      // transactional emails is a footer formality, not a real opt-out;
      // there's no Prospect record to key a real token off of here.
      unsubscribeToken: createUnsubscribeToken(params.tenantId),
    });
  } catch (err) {
    // A failed notification email is logged but doesn't propagate — the
    // Lead itself is already saved and visible in the dashboard
    // regardless of whether this out-of-band email ping succeeds.
    console.error(`Failed to send new-lead notification email for Tenant ${params.tenantId}`, err);
  }
}
