# Deployment Guide — LocalPilot AI

This covers Task 12 of the implementation plan: deploying the Next.js
app to Vercel, the worker to a long-running Node host, configuring
production secrets, and smoke-testing the full happy path.

**Sandbox limitation:** this guide was written and its configuration
(Dockerfile, `vercel.json`, health checks, `postinstall` hook) was
verified locally — the Docker image builds and the worker boots
correctly inside it (confirmed by actually running the built container),
and `npm run build`/`npm run worker:typecheck` pass — but no live
Vercel/Railway/Fly account exists in this sandbox, so an actual production
deploy has not been performed. Follow the steps below against your own
accounts to complete Task 12.1–12.4 for real.

## 12.1 — Deploy the Next.js app to Vercel

1. **Import the repo** into Vercel (vercel.com → New Project → import
   this repository). `vercel.json` sets `framework: nextjs`; no custom
   build command is needed — `package.json`'s `postinstall` script runs
   `prisma generate` automatically after `npm install`, before `next
   build` runs.
2. **Configure the production domain** in Vercel's Project → Domains:
   - Add your apex domain (e.g. `localpilot.ai`).
   - Add a **wildcard** domain: `*.localpilot.ai`. Vercel supports
     wildcard domains on all plans that support custom domains; this is
     what makes every Tenant/Prospect's `{subdomain}.localpilot.ai` site
     resolve to this same deployment, where `src/proxy.ts` (Task 5.1)
     inspects the `Host` header and routes accordingly.
   - Point your domain registrar's DNS at Vercel per their instructions
     (typically an `A`/`ALIAS` record for the apex + a `CNAME` for `*`).
3. Set `NEXT_PUBLIC_APP_DOMAIN=localpilot.ai` and
   `NEXT_PUBLIC_APP_URL=https://localpilot.ai` in Vercel's environment
   variables (Production scope) — `src/proxy.ts` and every
   `siteUrl()`/`appUrl()` call site derive their behavior from these.
4. Set `AUTH_SECRET` to a real random 32-byte value (`openssl rand -base64
   32`) — **do not reuse the local dev placeholder** in `.env.example`.
5. Redeploy after setting environment variables (Vercel only picks up
   new env vars on the next build/deploy).

## 12.2 — Deploy the worker to Railway or Fly.io

The worker (`src/worker/index.ts`) cannot run on Vercel — it's a
long-running process consuming BullMQ queues, not a request/response
serverless function. Deploy it separately using the `Dockerfile` at the
repo root (built and smoke-tested during this task — see the note on
why it runs via `tsx` rather than a `tsc`-compiled bundle, in the
Dockerfile's own comments).

### Railway

1. New Project → Deploy from GitHub repo → select this repo.
2. Railway auto-detects the `Dockerfile`. If it instead tries to use
   Nixpacks, explicitly set the build to "Dockerfile" in the service's
   Settings → Build.
3. Set all environment variables listed in [12.3](#123--configure-production-secrets) below on this service.
4. Set the health check path/port: Railway's "Healthcheck Path" should
   be `/` and it will hit the `WORKER_HEALTH_CHECK_PORT` (default `8080`,
   exposed via the Dockerfile's `EXPOSE 8080`) automatically once you set
   the service's target port to `8080`.
5. Railway provisions its own Redis and Postgres add-ons if you don't
   already have Neon/Upstash set up — either works; just point
   `DATABASE_URL`/`REDIS_URL` at whichever you use.

### Fly.io (alternative)

1. `fly launch` from the repo root — Fly detects the `Dockerfile`
   automatically. Decline the offer to create a new Postgres/Redis
   unless you want Fly to manage them (Neon/Upstash are the design
   doc's default recommendation).
2. In the generated `fly.toml`, set:
   ```toml
   [http_service]
     internal_port = 8080
     force_https = true
   [[http_service.checks]]
     path = "/"
     interval = "15s"
     timeout = "5s"
   ```
3. `fly secrets set KEY=value` for each variable in the checklist below,
   then `fly deploy`.

## 12.3 — Configure production secrets

Every variable in `.env.example` needs a **real** value in both the
Vercel project (for the app) and the worker host (Railway/Fly) —
**not the same value necessarily**, since `DATABASE_URL`/`REDIS_URL`
must point at the same production Postgres/Redis instance from both
sides, but e.g. `NEXTAUTH_URL` only matters to the app.

| Variable | Needed by | Notes |
|---|---|---|
| `DATABASE_URL` | App + Worker | Same production Postgres (Neon/RDS) for both |
| `REDIS_URL` | App + Worker | Same production Redis (Upstash) for both — the app enqueues jobs, the worker consumes them |
| `AUTH_SECRET`, `NEXTAUTH_URL` | App only | Real random secret; URL = production domain |
| `OPENAI_API_KEY` | Worker (site generation, email agent) + App (none directly) | |
| `GOOGLE_PLACES_API_KEY` | Worker (discovery) | Enable "Places API (New)" in Google Cloud Console |
| `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` | Worker + App (unsubscribe route doesn't send, but claim/dunning code paths run in both) | Verify the sending domain in SendGrid first |
| `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY`, `SENDGRID_INBOUND_PARSE_WEBHOOK_PUBLIC_KEY` | App only (webhook routes) | **Required in production** — Task 11.4 made these fail-closed; the app will reject unsigned webhook requests with a 500 if unset once `NODE_ENV=production` |
| `COMPANY_MAILING_ADDRESS` | App + Worker | Real physical address — required for CAN-SPAM compliance in every outbound email footer |
| `RETELL_API_KEY` | App (webhooks + dashboard config) + Worker (provisioning happens via the claim webhook, which runs in the App, not the Worker — see note below) | Also doubles as the webhook signing secret |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_DEFAULT_PLAN` | App only | Webhook secret comes from the Stripe Dashboard's webhook endpoint config (see below) |
| `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | App only | For the custom-domain connection API to call Vercel's own Domains API |
| `NEXT_PUBLIC_APP_DOMAIN`, `NEXT_PUBLIC_APP_URL` | App + Worker | Must match the real production domain on both |

**Note on where things actually run:** billing/claim webhooks
(`/api/webhooks/stripe`, `/api/claim/*`) and voice webhooks
(`/api/webhooks/voice/*`) are Next.js API routes, so they execute in the
**App** (Vercel), not the Worker. The Worker only runs the four BullMQ
consumers (discovery, site-generation, outreach, email-inbound). Both
processes need `DATABASE_URL` regardless, since both read/write the same
tables directly.

### Configuring provider-side webhooks

Once the app is deployed and has a real domain, configure each provider
to point at it:

- **Stripe**: Dashboard → Developers → Webhooks → Add endpoint →
  `https://localpilot.ai/api/webhooks/stripe`. Select events:
  `checkout.session.completed`, `invoice.payment_failed`,
  `invoice.payment_succeeded`, `customer.subscription.deleted`. Copy the
  generated signing secret into `STRIPE_WEBHOOK_SECRET`.
- **SendGrid Event Webhook**: Settings → Mail Settings → Event Webhook →
  URL `https://localpilot.ai/api/webhooks/email/events`, enable "Signed
  Event Webhook," copy the verification key into
  `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY`.
- **SendGrid Inbound Parse**: Settings → Inbound Parse → Add Host &
  URL → set the receiving hostname (e.g. `reply.localpilot.ai`, needs its
  own MX record) and URL `https://localpilot.ai/api/webhooks/email/inbound`,
  attach a Signature Verification security policy, copy the public key
  into `SENDGRID_INBOUND_PARSE_WEBHOOK_PUBLIC_KEY`.
- **Retell**: agent-level `webhook_url` and the custom tools'
  `url` fields are set automatically per-Tenant by
  `provisionReceptionistForTenant()` (Task 8) using
  `NEXT_PUBLIC_APP_URL` — nothing to configure manually in Retell's
  dashboard beyond the account-level API key.

## 12.4 — End-to-end staging smoke test

Before enabling this for real Prospects, verify the full happy path in a
staging environment (a second Vercel deployment + worker instance
pointed at a staging Postgres/Redis and, ideally, sandbox/test-mode
credentials for Stripe/SendGrid/Retell where available):

- [ ] **Discovery**: trigger a discovery job from `/admin/discovery`
      for a small radius/single category. Confirm Prospects are created
      and `discoverJobId` stats show scanned/created/duplicate counts.
- [ ] **Generation**: confirm each new Prospect gets a `Site` with all 4
      pages populated, viewable at `https://{subdomain}.<staging-domain>`
      with the noindex preview banner showing.
- [ ] **Outreach**: confirm Email 1 sends (check SendGrid's activity
      feed) within a few minutes of site generation, with a working
      claim link and unsubscribe link in the footer.
- [ ] **Claim**: click the claim link, complete Stripe Checkout with a
      test card. Confirm: Tenant + Subscription created, Site flips to
      `published`, a "set your password" email arrives, and the
      `/set-password` link works end-to-end into a dashboard login.
- [ ] **Receptionist**: confirm a phone number was provisioned
      (`tenant.receptionistPhoneNumber` is set) and the number appears in
      the Retell dashboard bound to the right agent. Place a real test
      call and confirm it's answered, a transcript appears in
      `/dashboard/calls`, and (if you ask it to take a message) a Lead
      appears in `/dashboard/leads`.
- [ ] **Contact form**: submit the published site's contact form and
      confirm a Lead appears and the Tenant receives a notification
      email.
- [ ] **Billing lifecycle**: using Stripe's test-mode tools, simulate a
      failed payment and confirm the Tenant gets a dunning email and
      (after exhausting retries) the site/receptionist suspend; then
      simulate a successful payment and confirm both auto-restore.
- [ ] **Admin tools**: confirm `/admin/tenants`, `/admin/prospects`, and
      `/admin/data-requests` all load and reflect the test data created
      above.

Only after this passes end-to-end against real (even if sandboxed)
provider credentials should real discovery jobs be pointed at production
data.
