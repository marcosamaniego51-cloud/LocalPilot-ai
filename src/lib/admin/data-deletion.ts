/**
 * Data deletion tool (Requirement 10.4 / Task 10.4).
 *
 * "A defined process to remove [a Prospect's or Tenant's] personal data
 * within a bounded time period" — implemented as an operator-triggered
 * admin action (not self-serve in v1, matching design.md Section 11's
 * explicit statement that this is "planned as an operator tool, not
 * self-serve").
 *
 * Deletes by identity (phone or email), since a real-world deletion
 * request comes in as "please delete my info," identified by contact
 * info, not by an internal Prospect/Tenant id the requester wouldn't
 * know. Cascades across every table that can reference a Prospect or
 * Tenant. Anonymizes rather than hard-deletes AuditLog rows referencing
 * the entity (audit trail integrity — Requirement 10.2/10.3 — outlives
 * any single actor's data, so audit history is redacted, not erased,
 * per common data-retention practice for compliance logs).
 */

import { prisma } from "@/lib/prisma";

export type DataDeletionResult = {
  prospectsDeleted: number;
  tenantsDeleted: number;
  auditLogsRedacted: number;
};

export async function deletePersonalDataByIdentity(params: {
  email?: string;
  phone?: string;
}): Promise<DataDeletionResult> {
  if (!params.email && !params.phone) {
    throw new Error("At least one of email or phone is required to identify what to delete");
  }

  const prospects = await prisma.prospect.findMany({
    where: {
      OR: [
        params.email ? { email: params.email } : undefined,
        params.phone ? { phone: params.phone } : undefined,
      ].filter((clause): clause is NonNullable<typeof clause> => Boolean(clause)),
    },
    select: { id: true },
  });

  const tenants = await prisma.tenant.findMany({
    where: {
      users: {
        some: params.email ? { email: params.email } : undefined,
      },
    },
    select: { id: true },
  });

  let auditLogsRedacted = 0;

  await prisma.$transaction(async (tx) => {
    for (const prospect of prospects) {
      // Cascading FKs (OutreachState, SitePage via Site, CustomDomain via
      // Site) clean up automatically; these don't cascade by schema
      // design (Call/EmailThread use nullable FKs so history can outlive
      // the specific Prospect/Tenant row for audit purposes elsewhere) —
      // explicitly null them out here instead, since a delete request
      // means "disassociate my identity," not "delete the fact that a
      // discovery/outreach event happened."
      await tx.call.updateMany({ where: { prospectId: prospect.id }, data: { prospectId: null } });
      await tx.emailThread.updateMany({ where: { prospectId: prospect.id }, data: { prospectId: null } });
      await tx.site.updateMany({ where: { prospectId: prospect.id }, data: { prospectId: null } });
    }

    if (prospects.length) {
      await tx.prospect.deleteMany({ where: { id: { in: prospects.map((p) => p.id) } } });
    }

    for (const tenant of tenants) {
      await tx.call.updateMany({ where: { tenantId: tenant.id }, data: { tenantId: null } });
      await tx.emailThread.updateMany({ where: { tenantId: tenant.id }, data: { tenantId: null } });
      // Site.tenantId has no cascade/set-null configured at the schema
      // level (it's the Tenant's own site, not incidental history), so it
      // must be nulled explicitly before the Tenant row is deleted or the
      // FK constraint would block the delete.
      await tx.site.updateMany({ where: { tenantId: tenant.id }, data: { tenantId: null } });
    }

    if (tenants.length) {
      // Leads and TenantUsers cascade-delete via schema (onDelete: Cascade)
      // when the Tenant itself is deleted — those rows have no
      // independent audit/compliance reason to survive their Tenant.
      await tx.tenant.deleteMany({ where: { id: { in: tenants.map((t) => t.id) } } });
    }

    const affectedIds = [...prospects.map((p) => p.id), ...tenants.map((t) => t.id)];
    if (affectedIds.length) {
      const redacted = await tx.auditLog.updateMany({
        where: { entityId: { in: affectedIds } },
        data: { metadata: { redacted: true } },
      });
      auditLogsRedacted = redacted.count;
    }
  });

  await prisma.auditLog.create({
    data: {
      actor: "system:data-deletion",
      action: "personal_data_deleted",
      entityType: "DataDeletionRequest",
      entityId: params.email ?? params.phone ?? "unknown",
      metadata: {
        prospectsDeleted: prospects.length,
        tenantsDeleted: tenants.length,
      },
    },
  });

  return {
    prospectsDeleted: prospects.length,
    tenantsDeleted: tenants.length,
    auditLogsRedacted,
  };
}
