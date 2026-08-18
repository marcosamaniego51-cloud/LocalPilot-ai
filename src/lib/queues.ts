import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";

// Central registry of BullMQ queue names + typed job payloads.
// The worker process (src/worker/*) registers Workers against these same
// queue names — keep both in sync.

export const QUEUE_NAMES = {
  discovery: "discovery",
  siteGeneration: "site-generation",
  outreach: "outreach",
  emailInbound: "email-inbound",
  billing: "billing",
  voiceInbound: "voice-inbound",
} as const;

export type DiscoveryJobPayload = {
  discoveryJobId: string;
  category: string;
  location: string;
  radiusKm: number;
};

export type SiteGenerationJobPayload = {
  // Full generation (Task 4) is keyed by prospectId/tenantId (whichever
  // owns the site) since the Site row itself doesn't exist yet the first
  // time this job runs — Task 4's generation worker creates it.
  prospectId?: string;
  tenantId?: string;
  // Section regeneration (Task 4.5) targets an existing Site.
  siteId?: string;
  regenerateSection?: "home" | "about" | "services" | "contact";
  // Set when this regeneration was triggered by a Tenant's Site Editor
  // request (Task 9.6), so the job runner can flip the request's status
  // to applied/failed when done.
  siteEditRequestId?: string;
};

// The outreach queue carries two distinct job types, distinguished by
// `kind`:
//   - "tick": scans ALL due OutreachStates and advances each one. Enqueued
//     on a recurring schedule via a BullMQ job scheduler (see worker/index.ts).
//   - "kickoff": starts a brand-new Prospect's sequence once its preview
//     site is ready. Enqueued once per Prospect by the site-generation job.
export type OutreachTickJobPayload =
  | { kind: "tick" }
  | { kind: "kickoff"; siteId: string };

export type EmailInboundJobPayload = {
  threadId: string;
  emailMessageId: string;
};

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: false, // keep failures around for dead-letter inspection (Req 10.3)
};

export const discoveryQueue = new Queue<DiscoveryJobPayload>(
  QUEUE_NAMES.discovery,
  { connection: redisConnection, defaultJobOptions },
);

export const siteGenerationQueue = new Queue<SiteGenerationJobPayload>(
  QUEUE_NAMES.siteGeneration,
  { connection: redisConnection, defaultJobOptions },
);

export const outreachQueue = new Queue<OutreachTickJobPayload>(
  QUEUE_NAMES.outreach,
  { connection: redisConnection, defaultJobOptions },
);

export const emailInboundQueue = new Queue<EmailInboundJobPayload>(
  QUEUE_NAMES.emailInbound,
  { connection: redisConnection, defaultJobOptions },
);
