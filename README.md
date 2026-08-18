# LocalPilot AI

AI-built websites, self-serve billing, and automated customer communication
(email + inbound AI call answering) for small local businesses.

See the full spec in `.kiro/specs/local-pilot-ai/` at the repo root
(`requirements.md`, `design.md`, `tasks.md`) for the product scope,
architecture, and implementation plan this codebase follows.

## Stack

- **App**: Next.js 16 (App Router, TypeScript, Tailwind, shadcn/ui)
- **Worker**: standalone Node process (`src/worker`) consuming BullMQ queues
- **Database**: PostgreSQL via Prisma (driver adapter: `@prisma/adapter-pg`)
- **Queue/cache**: Redis (BullMQ)
- **Auth**: Auth.js (NextAuth v5, credentials provider, JWT sessions)
- **Billing**: Stripe (not yet wired up — Task 7)
- **Email**: SendGrid (not yet wired up — Task 6)
- **Voice AI**: Twilio + Retell/Vapi, inbound-only (not yet wired up — Task 8)

## Local Development

### 1. Start Postgres + Redis

```bash
docker compose up -d
```

(If `docker compose` isn't available in your environment, run equivalent
`docker run` commands for `postgres:16-alpine` and `redis:7-alpine` using the
same credentials as `docker-compose.yml`.)

### 2. Configure environment variables

```bash
cp .env.example .env
```

The defaults in `.env` already point at the local Postgres/Redis containers
above. Fill in third-party API keys as you implement the tasks that need
them (see `.env.example` for the full list and what each is for).

### 3. Install dependencies & set up the database

```bash
npm install
npm run db:migrate   # creates tables from prisma/schema.prisma
npm run db:seed      # loads sample Prospects/Tenants for local testing
```

### 4. Run the app and worker

```bash
npm run dev      # Next.js app on http://localhost:3000
npm run worker   # background worker (separate terminal)
```

Seeded login for the dashboard: `owner@hilltopauto.example` / `password123`.

## Multi-tenant routing

`src/proxy.ts` (Next.js 16's renamed `middleware.ts`) resolves the request's
`Host` header and rewrites platform-subdomain requests
(`{slug}.localpilot.ai`) to `/sites/[subdomain]`, which renders that
Tenant/Prospect's generated site. The apex domain and reserved subdomains
(`www`, `app`, `dashboard`, `admin`, `api`) fall through to the normal
app routes. Custom domain resolution is a stub pending Task 5.5.

## Useful scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js app |
| `npm run worker` | Start the background worker (watch mode) |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:studio` | Open Prisma Studio (DB browser) |
| `npm run db:seed` | Seed sample data |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
