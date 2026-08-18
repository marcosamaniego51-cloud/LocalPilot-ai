# Dockerfile for the standalone background worker process (Task 12.2).
#
# The Next.js app itself is deployed to Vercel (Task 12.1) and does NOT
# use this Dockerfile — Vercel builds it directly from the repo. This
# image is specifically for the worker (src/worker/index.ts), which needs
# a long-running Node process host (Railway or Fly.io per design.md
# Section 12) rather than Vercel's serverless functions.
#
# Runs via `tsx` rather than a `tsc`-compiled JS bundle. This was a
# deliberate correction made during Task 12: a `tsc`-to-CommonJS build was
# tried first, but tsc does not rewrite the `@/*` path alias used
# throughout src/ (see tsconfig.json's `paths`) into relative require()
# paths — it only resolves aliases for type-checking, not for the emitted
# JS. The compiled output failed at runtime with `Cannot find module
# '@/lib/redis'` the moment it tried to import anything under `@/`. `tsx`
# (esbuild-based) resolves tsconfig path aliases at runtime, so running
# the TypeScript source directly avoids this class of bug entirely and
# also removes an entire separate build step.
FROM node:22-slim
WORKDIR /app
# OpenSSL is required by Prisma's query engine on Debian-based images.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Generates src/generated/prisma — required before the worker can import
# @/lib/prisma. Does not require a live DATABASE_URL connection.
RUN npx prisma generate

ENV NODE_ENV=production
EXPOSE 8080
CMD ["npx", "tsx", "src/worker/index.ts"]
