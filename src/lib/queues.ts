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

// ─────────────────────────────────────────────────────────────
// Lean-launch mode: queues are constructed lazily and add() calls
// gracefully no-op if Redis is unreachable. This means the Next.js app
// (API routes, webhook handlers) can function without Redis/the worker
// running — the only things that break are background job processing
// itself (site generation, outreach sequencing, email-agent replies),
// which is fine when running the $0 stack where you're doing manual
// discovery + manual outreach anyway.
//
// The worker process itself still fails hard on Redis (it must be able
// to connect to consume jobs), so this graceful degradation only applies
// to the app side's enqueue calls.
// ─────────────────────────────────────────────────────────────

function createQueue<T>(name: string): Queue<T> {
  return new Queue<T>(name, { connection: redisConnection, defaultJobOptions });
}

// Lazy queue instances — only created on first use, not at import time.
let _discoveryQueue: Queue<DiscoveryJobPayload> | undefined;
let _siteGenerationQueue: Queue<SiteGenerationJobPayload> | undefined;
let _outreachQueue: Queue<OutreachTickJobPayload> | undefined;
let _emailInboundQueue: Queue<EmailInboundJobPayload> | undefined;

export const discoveryQueue = new Proxy({} as Queue<DiscoveryJobPayload>, {
  get(_target, prop) {
    if (!_discoveryQueue) _discoveryQueue = createQueue(QUEUE_NAMES.discovery);
    return Reflect.get(_discoveryQueue, prop);
  },
});

export const siteGenerationQueue = new Proxy({} as Queue<SiteGenerationJobPayload>, {
  get(_target, prop) {
    if (!_siteGenerationQueue) _siteGenerationQueue = createQueue(QUEUE_NAMES.siteGeneration);
    return Reflect.get(_siteGenerationQueue, prop);
  },
});

export const outreachQueue = new Proxy({} as Queue<OutreachTickJobPayload>, {
  get(_target, prop) {
    if (!_outreachQueue) _outreachQueue = createQueue(QUEUE_NAMES.outreach);
    return Reflect.get(_outreachQueue, prop);
  },
});

export const emailInboundQueue = new Proxy({} as Queue<EmailInboundJobPayload>, {
  get(_target, prop) {
    if (!_emailInboundQueue) _emailInboundQueue = createQueue(QUEUE_NAMES.emailInbound);
    return Reflect.get(_emailInboundQueue, prop);
  },
});

/**
 * Safe wrapper for queue.add() that catches Redis connection errors
 * gracefully — logs a warning and returns null instead of crashing the
 * request. Use this in API routes/webhook handlers instead of calling
 * queue.add() directly when you want the request to succeed even if the
 * background worker infrastructure isn't running.
 */
export async function safeEnqueue<T>(
  queue: Queue<T>,
  name: string,
  data: T,
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (queue as any).add(name, data);
  } catch (err) {
    console.warn(
      `[lean-launch] Failed to enqueue job "${name}" — Redis/worker may not be running. The request will still succeed.`,
      err instanceof Error ? err.message : err,
    );
  }
}
