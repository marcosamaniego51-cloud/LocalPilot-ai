import IORedis, { type Redis } from "ioredis";

// Shared Redis connection used by BullMQ queues (in the Next.js app, for enqueueing)
// and by the standalone worker process (for consuming). BullMQ requires
// maxRetriesPerRequest to be null on connections it manages.
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createConnection(): Redis {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    // Defer the actual TCP connection until the first command is issued
    // (e.g. a queue.add() call), rather than connecting the moment this
    // module is imported. Avoids noisy ECONNREFUSED retries during `next
    // build`'s static analysis/route collection, when nothing has actually
    // tried to enqueue a job yet and Redis may not be up.
    lazyConnect: true,
  });
}

export const redisConnection = globalForRedis.redis ?? createConnection();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redisConnection;
}
