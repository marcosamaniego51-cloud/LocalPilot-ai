/**
 * Tenant notification stub (Requirements 3.5, 8.2).
 *
 * "Triggers a Tenant notification" is required by Task 5.4 (new Lead from
 * a site's contact form), but the actual email-sending infrastructure
 * (SendGrid) doesn't exist until Task 6. Rather than block the contact
 * form on that dependency, this is a small seam: it does the one thing we
 * *can* do today (write an audit log entry, so the event is durably
 * recorded even before real delivery exists) and is the single place
 * Task 6 wires in an actual SendGrid send once the client exists — no
 * caller of this function needs to change when that happens.
 */

import { prisma } from "@/lib/prisma";

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

  // TODO(Task 6): send an actual email to the Tenant's contact address via
  // SendGrid once src/lib/email/sendgrid-client.ts exists. Dashboard
  // visibility of the new Lead already works without this, since Leads
  // are queried live from the DB (Task 9.3) — this is specifically about
  // the "notify" half of the requirement (an out-of-band ping), not the
  // Lead's visibility itself.
}
