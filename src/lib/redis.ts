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
  });
}

export const redisConnection = globalForRedis.redis ?? createConnection();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redisConnection;
}
