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
  siteId: string;
  regenerateSection?: "home" | "about" | "services" | "contact";
};

export type OutreachTickJobPayload = {
  prospectId: string;
};

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
