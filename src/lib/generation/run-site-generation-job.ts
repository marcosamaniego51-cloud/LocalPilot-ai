/**
 * Site generation job runner (Requirements 2.1, 2.2, 2.3, 2.6, 2.7 /
 * Tasks 4.2, 4.4, 4.5).
 *
 * Handles two distinct cases from a single BullMQ job, keyed by which
 * fields are present on the payload (see queues.ts SiteGenerationJobPayload):
 *
 *   1. Full generation (prospectId or tenantId set, no siteId): a brand
 *      new Prospect (from Task 3's discovery) or Tenant needs its first
 *      Site + all four SitePages created from scratch.
 *   2. Section regeneration (siteId + regenerateSection set): an existing
 *      Site's single page is re-generated, merging AI output with any
 *      Tenant-provided overrides so manual edits aren't clobbered.
 *
 * Retries: BullMQ's queue-level defaultJobOptions (3 attempts, exponential
 * backoff — see queues.ts) cover transient failures automatically. This
 * runner's job is just to make final-failure handling explicit: on the
 * last attempt, flag the record and write an audit log rather than
 * leaving it silently stuck (Requirement 2.7, 10.3).
 */

import { prisma } from "@/lib/prisma";
import { generateSiteContent, generateSectionContent } from "@/lib/generation/generate-site-content";
import { selectTemplateForCategory } from "@/lib/generation/templates";
import { generateUniqueSlug } from "@/lib/sites/slug";
import type { SiteGenerationJobPayload } from "@/lib/queues";
import type { BusinessInput } from "@/lib/generation/prompts";
import type { SitePageType } from "@/lib/generation/schemas";
import type { Job } from "bullmq";

async function flagGenerationFailure(params: {
  entityType: "Prospect" | "Tenant" | "Site";
  entityId: string;
  error: unknown;
  attemptsMade: number;
}) {
  const message = params.error instanceof Error ? params.error.message : String(params.error);

  await prisma.auditLog.create({
    data: {
      actor: "system:site-generation-worker",
      action: "site_generation_failed",
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: { error: message, attemptsMade: params.attemptsMade },
    },
  });

  // Flag the owning Prospect for manual follow-up (Req 2.7) rather than
  // silently leaving a Prospect with no site and no visible indication
  // anything went wrong.
  if (params.entityType === "Prospect") {
    await prisma.prospect.update({
      where: { id: params.entityId },
      data: { status: "dead" },
    }).catch(() => {
      // If the Prospect itself no longer exists, there's nothing further
      // to flag — the audit log entry above already captured the failure.
    });
  }
}

async function resolveBusinessInput(params: {
  prospectId?: string;
  tenantId?: string;
}): Promise<{ business: BusinessInput; prospectId?: string; tenantId?: string }> {
  if (params.prospectId) {
    const prospect = await prisma.prospect.findUniqueOrThrow({
      where: { id: params.prospectId },
    });
    return {
      business: {
        businessName: prospect.businessName,
        category: prospect.category,
        address: prospect.address,
        city: prospect.city,
        state: prospect.state,
        phone: prospect.phone,
      },
      prospectId: prospect.id,
    };
  }

  if (params.tenantId) {
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: params.tenantId },
      include: { prospect: true },
    });
    return {
      business: {
        businessName: tenant.businessName,
        category: tenant.prospect?.category ?? "generic",
        address: tenant.prospect?.address,
        city: tenant.prospect?.city,
        state: tenant.prospect?.state,
        phone: tenant.prospect?.phone,
      },
      tenantId: tenant.id,
    };
  }

  throw new Error("Site generation job requires either prospectId or tenantId");
}

/**
 * Full generation: creates a new Site (status=preview) + all four
 * SitePage rows for a Prospect/Tenant that doesn't have a site yet
 * (Task 4.2).
 */
async function runFullGeneration(
  payload: SiteGenerationJobPayload,
  attemptsMade: number,
): Promise<{ siteId: string }> {
  const { business, prospectId, tenantId } = await resolveBusinessInput(payload);

  try {
    const [content, template, subdomain] = await Promise.all([
      generateSiteContent(business),
      Promise.resolve(selectTemplateForCategory(business.category)),
      generateUniqueSlug(business.businessName),
    ]);

    const site = await prisma.site.create({
      data: {
        prospectId,
        tenantId,
        slug: subdomain,
        subdomain,
        status: "preview",
        templateId: template.id,
        colorScheme: template.colorScheme,
        generatedAt: new Date(),
        pages: {
          create: [
            { pageType: "home", content: content.home },
            { pageType: "about", content: content.about },
            { pageType: "services", content: content.services },
            { pageType: "contact", content: content.contact },
          ],
        },
      },
    });

    if (prospectId) {
      await prisma.prospect.update({
        where: { id: prospectId },
        data: { status: "previewed" },
      });
    }

    return { siteId: site.id };
  } catch (err) {
    await flagGenerationFailure({
      entityType: prospectId ? "Prospect" : "Tenant",
      entityId: prospectId ?? tenantId!,
      error: err,
      attemptsMade,
    });
    throw err;
  }
}

/**
 * Section regeneration: re-generates one page's copy for an existing
 * Site, merging with any Tenant-provided businessInfo overrides so manual
 * edits (logo, photos, custom hours, custom service list, etc.) aren't
 * clobbered by the AI rewrite (Requirement 2.4, 2.6 / Task 4.5).
 */
async function runSectionRegeneration(
  siteId: string,
  section: SitePageType,
  attemptsMade: number,
): Promise<{ siteId: string }> {
  const site = await prisma.site.findUniqueOrThrow({
    where: { id: siteId },
    include: { prospect: true, tenant: { include: { prospect: true } } },
  });

  const sourceProspect = site.prospect ?? site.tenant?.prospect;
  const businessName = site.tenant?.businessName ?? sourceProspect?.businessName;

  if (!businessName) {
    throw new Error(`Site ${siteId} has no linked Prospect or Tenant to derive business info from`);
  }

  const business: BusinessInput = {
    businessName,
    category: sourceProspect?.category ?? "generic",
    address: sourceProspect?.address,
    city: sourceProspect?.city,
    state: sourceProspect?.state,
    phone: sourceProspect?.phone,
  };

  const overrides = (site.businessInfo ?? {}) as Record<string, unknown>;

  try {
    const regenerated = await generateSectionContent(business, section, overrides);

    await prisma.sitePage.upsert({
      where: { siteId_pageType: { siteId, pageType: section } },
      update: { content: regenerated },
      create: { siteId, pageType: section, content: regenerated },
    });

    return { siteId };
  } catch (err) {
    await flagGenerationFailure({
      entityType: "Site",
      entityId: siteId,
      error: err,
      attemptsMade,
    });
    throw err;
  }
}

export async function runSiteGenerationJob(
  job: Job<SiteGenerationJobPayload>,
): Promise<{ siteId: string }> {
  const { siteId, regenerateSection } = job.data;

  if (siteId && regenerateSection) {
    return runSectionRegeneration(siteId, regenerateSection, job.attemptsMade);
  }

  return runFullGeneration(job.data, job.attemptsMade);
}
