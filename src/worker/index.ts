import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import {
  QUEUE_NAMES,
  type DiscoveryJobPayload,
  type SiteGenerationJobPayload,
  type OutreachTickJobPayload,
  type EmailInboundJobPayload,
} from "@/lib/queues";
import { runDiscoveryJob } from "@/lib/discovery/run-discovery-job";
import { runSiteGenerationJob } from "@/lib/generation/run-site-generation-job";

/**
 * Standalone background worker process (Requirement: task 1 scaffolding).
 *
 * This runs independently of the Next.js app (deployed separately per
 * design.md Section 12 — e.g. Railway/Fly.io) and consumes the BullMQ
 * queues that the Next.js app enqueues jobs into.
 *   - discovery            -> Task 3 (Prospect Discovery Engine) — implemented
 *   - site-generation       -> Task 4 (AI Website Generation) — implemented
 *   - outreach              -> Task 6 (Email Outreach state machine) — placeholder
 *   - email-inbound         -> Task 6 (AI email auto-reply agent) — placeholder
 *
 * Run locally with: npm run worker
 */

function log(queue: string, message: string, extra?: Record<string, unknown>) {
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), queue, message, ...extra }),
  );
}

const discoveryWorker = new Worker<DiscoveryJobPayload>(
  QUEUE_NAMES.discovery,
  async (job: Job<DiscoveryJobPayload>) => {
    log(QUEUE_NAMES.discovery, "running discovery job", {
      jobId: job.id,
      discoveryJobId: job.data.discoveryJobId,
    });
    const stats = await runDiscoveryJob(job.data.discoveryJobId);
    log(QUEUE_NAMES.discovery, "discovery job completed", {
      jobId: job.id,
      discoveryJobId: job.data.discoveryJobId,
      stats,
    });
  },
  { connection: redisConnection },
);

const siteGenerationWorker = new Worker<SiteGenerationJobPayload>(
  QUEUE_NAMES.siteGeneration,
  async (job: Job<SiteGenerationJobPayload>) => {
    log(QUEUE_NAMES.siteGeneration, "running site generation job", {
      jobId: job.id,
      data: job.data,
    });
    const result = await runSiteGenerationJob(job);
    log(QUEUE_NAMES.siteGeneration, "site generation job completed", {
      jobId: job.id,
      siteId: result.siteId,
    });
    // TODO(Task 6): enqueue outreach kickoff for newly-generated Prospect sites.
  },
  { connection: redisConnection },
);

const outreachWorker = new Worker<OutreachTickJobPayload>(
  QUEUE_NAMES.outreach,
  async (job: Job<OutreachTickJobPayload>) => {
    log(QUEUE_NAMES.outreach, "received job (not yet implemented)", {
      jobId: job.id,
      data: job.data,
    });
    // TODO(Task 6): advance the outreach_states state machine, send the
    // next email in the sequence via SendGrid.
  },
  { connection: redisConnection },
);

const emailInboundWorker = new Worker<EmailInboundJobPayload>(
  QUEUE_NAMES.emailInbound,
  async (job: Job<EmailInboundJobPayload>) => {
    log(QUEUE_NAMES.emailInbound, "received job (not yet implemented)", {
      jobId: job.id,
      data: job.data,
    });
    // TODO(Task 6): run the AI email agent (reply vs escalate) against the
    // inbound message.
  },
  { connection: redisConnection },
);

for (const worker of [
  discoveryWorker,
  siteGenerationWorker,
  outreachWorker,
  emailInboundWorker,
]) {
  worker.on("failed", (job, err) => {
    log(worker.name, "job failed", { jobId: job?.id, error: err.message });
  });
}

log("worker", `LocalPilot AI worker started, listening on queues: ${Object.values(QUEUE_NAMES).join(", ")}`);

process.on("SIGTERM", async () => {
  await Promise.all([
    discoveryWorker.close(),
    siteGenerationWorker.close(),
    outreachWorker.close(),
    emailInboundWorker.close(),
  ]);
  process.exit(0);
});
