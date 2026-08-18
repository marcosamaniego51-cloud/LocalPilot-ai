/**
 * Discovery job runner (Requirements 1.1, 1.3, 1.4, 1.5, 1.6 / Task 3.4).
 *
 * Given a DiscoveryJob's params (category, location, radiusKm), this:
 *   1. Paginates Google Places Text Search results for that (category, location).
 *   2. Fetches Place Details for phone/website on each candidate.
 *   3. Filters to businesses with no website / an unreachable website.
 *   4. Dedupes against existing Prospects/Tenants and do-not-contact records.
 *   5. Creates a Prospect row for each new, non-duplicate candidate.
 *   6. Enqueues a site-generation job for each new Prospect.
 *   7. Writes final scanned/created/duplicate counts back onto the job.
 */

import { prisma } from "@/lib/prisma";
import { paginateSearch, getPlaceDetails } from "@/lib/discovery/google-places";
import { isDiscoveryCandidate } from "@/lib/discovery/filters";
import {
  isDuplicateBusiness,
  normalizeBusinessName,
  normalizePhone,
} from "@/lib/discovery/dedup";
import { siteGenerationQueue } from "@/lib/queues";

export type DiscoveryJobParams = {
  category: string;
  location: string;
  radiusKm: number;
};

export type DiscoveryJobStats = {
  scanned: number;
  created: number;
  duplicates: number;
  filteredHasWebsite: number;
  errors: number;
};

export async function runDiscoveryJob(discoveryJobId: string): Promise<DiscoveryJobStats> {
  const job = await prisma.discoveryJob.findUniqueOrThrow({
    where: { id: discoveryJobId },
  });
  const params = job.params as unknown as DiscoveryJobParams;

  await prisma.discoveryJob.update({
    where: { id: discoveryJobId },
    data: { status: "running" },
  });

  const stats: DiscoveryJobStats = {
    scanned: 0,
    created: 0,
    duplicates: 0,
    filteredHasWebsite: 0,
    errors: 0,
  };

  try {
    await paginateSearch(
      { category: params.category, location: params.location },
      async (results) => {
        for (const result of results) {
          stats.scanned += 1;

          try {
            const details = await getPlaceDetails(result.placeId);

            const isCandidate = await isDiscoveryCandidate(details.website);
            if (!isCandidate) {
              stats.filteredHasWebsite += 1;
              continue;
            }

            const normalizedPhone = normalizePhone(details.phoneNumber);
            const normalizedName = normalizeBusinessName(details.name);

            const duplicate = await isDuplicateBusiness({
              normalizedPhone,
              normalizedName,
            });
            if (duplicate) {
              stats.duplicates += 1;
              continue;
            }

            const prospect = await prisma.prospect.create({
              data: {
                businessName: details.name,
                normalizedBusinessName: normalizedName,
                category: params.category,
                phone: details.phoneNumber,
                normalizedPhone,
                address: details.formattedAddress,
                lat: details.lat,
                lng: details.lng,
                source: "google_places",
                status: "new",
                discoveryJobId,
              },
            });

            // Site creation + AI content generation is Task 4's
            // responsibility; discovery's job here is just to hand off a
            // new Prospect for generation to pick up.
            await siteGenerationQueue.add("generate", {
              prospectId: prospect.id,
            });

            stats.created += 1;
          } catch (err) {
            stats.errors += 1;
            console.error(
              `Discovery job ${discoveryJobId}: failed processing place ${result.placeId}`,
              err,
            );
          }
        }
      },
    );

    await prisma.discoveryJob.update({
      where: { id: discoveryJobId },
      data: { status: "completed", stats: stats as unknown as object },
    });
  } catch (err) {
    await prisma.discoveryJob.update({
      where: { id: discoveryJobId },
      data: { status: "failed", stats: stats as unknown as object },
    });
    await prisma.auditLog.create({
      data: {
        actor: "system:discovery-worker",
        action: "discovery_job_failed",
        entityType: "DiscoveryJob",
        entityId: discoveryJobId,
        metadata: { error: err instanceof Error ? err.message : String(err) },
      },
    });
    throw err;
  }

  return stats;
}
