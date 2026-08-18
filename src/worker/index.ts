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
import { runOutreachTick, kickoffOutreachForSite } from "@/lib/outreach/run-outreach-tick";
import { runEmailInboundJob } from "@/lib/outreach/run-email-inbound-job";
import { outreachQueue } from "@/lib/queues";

/**
 * Standalone background worker process (Requirement: task 1 scaffolding).
 *
 * This runs independently of the Next.js app (deployed separately per
 * design.md Section 12 — e.g. Railway/Fly.io) and consumes the BullMQ
 * queues that the Next.js app enqueues jobs into.
 *   - discovery            -> Task 3 (Prospect Discovery Engine)
 *   - site-generation       -> Task 4 (AI Website Generation)
 *   - outreach              -> Task 6 (Email Outreach state machine)
 *   - email-inbound         -> Task 6 (AI email auto-reply agent)
 * All four are implemented as of Task 8; comment above previously said
 * outreach/email-inbound were placeholders — stale as of this file's
 * later edits, corrected here (Task 11 cleanup pass).
 *
 * Retry policy (Task 11.2): every queue's defaultJobOptions (queues.ts)
 * is 3 attempts with exponential backoff, and removeOnFail: false so
 * failed jobs remain visible in Redis for dead-letter inspection rather
 * than disappearing after retries are exhausted. Each job runner also
 * does its own audit-log + status-flip on failure (see e.g.
 * flagGenerationFailure in run-site-generation-job.ts, or the try/catch
 * in run-email-inbound-job.ts) so a failure is visible in the DB/admin
 * UI too, not just in Redis/worker logs.
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

    // A Prospect's outreach sequence only starts once their preview site
    // exists; Tenant-owned regenerations (e.g. after claim) never kick
    // off outreach — kickoffOutreachForSite() itself no-ops for those, so
    // this is safe to call unconditionally.
    await outreachQueue.add("kickoff", { kind: "kickoff", siteId: result.siteId });
  },
  { connection: redisConnection },
);

const outreachWorker = new Worker<OutreachTickJobPayload>(
  QUEUE_NAMES.outreach,
  async (job: Job<OutreachTickJobPayload>) => {
    if (job.data.kind === "kickoff") {
      log(QUEUE_NAMES.outreach, "running outreach kickoff", { jobId: job.id, siteId: job.data.siteId });
      await kickoffOutreachForSite(job.data.siteId);
      return;
    }

    const result = await runOutreachTick();
    if (result.processed > 0) {
      log(QUEUE_NAMES.outreach, "outreach tick completed", { jobId: job.id, ...result });
    }
  },
  { connection: redisConnection },
);

const emailInboundWorker = new Worker<EmailInboundJobPayload>(
  QUEUE_NAMES.emailInbound,
  async (job: Job<EmailInboundJobPayload>) => {
    log(QUEUE_NAMES.emailInbound, "running email inbound job", { jobId: job.id, data: job.data });
    await runEmailInboundJob(job.data);
  },
  { connection: redisConnection },
);

// Recurring tick that scans for due OutreachStates and advances them
// (Task 6.2). Every 5 minutes per design.md Section 5.4. Using BullMQ's
// job scheduler (rather than a plain setInterval in this process) so the
// schedule survives worker restarts/redeploys and multiple worker
// instances don't all fire the same tick redundantly.
async function registerOutreachTickScheduler() {
  await outreachQueue.upsertJobScheduler(
    "outreach-tick",
    { every: 5 * 60 * 1000 },
    {
      name: "tick",
      data: { kind: "tick" },
      // Task 11.2: upsertJobScheduler's job template does NOT inherit the
      // Queue's defaultJobOptions (verified against BullMQ's type
      // definitions — JobSchedulerTemplateOptions is a bare JobsOptions,
      // with no fallback to the queue-level defaults), so the retry
      // policy has to be set explicitly here too, or a failed tick would
      // get zero retries instead of the 3-attempt/backoff policy every
      // other job in this system gets.
      opts: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    },
  );
}
registerOutreachTickScheduler().catch((err) => {
  log(QUEUE_NAMES.outreach, "failed to register outreach tick scheduler", {
    error: err instanceof Error ? err.message : String(err),
  });
});

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
