# Lean Launch Guide — $0/month Stack

Get LocalPilot AI running and selling to your first customers without
paying for any infrastructure or third-party APIs upfront. You only
start paying when you're ready to automate or scale.

## What Your Customers Get (at $299/month)

- ✅ A professional AI-generated multi-page website (Home, About, Services, Contact)
- ✅ Hosted on your platform (`businessname.yourdomain.com`)
- ✅ Working contact form → instant lead notification email to them
- ✅ A dashboard to see leads, manage site content, request AI rewrites
- ✅ Cancel anytime

**Upsell to $399/month** adds the AI receptionist (answers calls 24/7,
takes messages, books appointments). Only enable this once you have
paying customers and set up a Retell AI account.

## What You Need

- A computer with Docker and Node.js 22 installed
- 30 minutes to set up
- No credit card, no API keys, no domain required to start

## Quick Start (5 minutes)

```bash
# 1. Clone the repo
git clone https://github.com/marcosamaniego51-cloud/LocalPilot-ai.git
cd LocalPilot-ai

# 2. Start Postgres (the only required infrastructure)
docker compose up -d postgres

# 3. Copy env file (defaults work out of the box for local dev)
cp .env.example .env

# 4. Install dependencies
npm install

# 5. Create database tables + seed sample data
npm run db:migrate
npm run db:seed

# 6. Start the app
npm run dev
```

Open **http://localhost:3000** — you'll see the marketing page with
your $299/$399 pricing.

## Seeded Test Accounts

| Role | Login | Password |
|---|---|---|
| Tenant (customer dashboard) | `owner@hilltopauto.example` | `password123` |
| Operator (admin panel) | `operator@localpilot.example` | `operator123` |

## Your First Prospect (Manual — No API Keys Needed)

1. Log in as the operator at `/login`
2. Go to `/admin/prospects`
3. Use the "Add a prospect manually" form — paste a business's info
   from Google Maps (name, category, phone, city)
4. Click "Add Prospect + Generate Site"
5. A preview site is instantly created with placeholder content at the
   URL shown (e.g. `http://riverside-plumbing.localhost:3000`)

That's it — you now have a free preview site to show the business owner.

## What Works Without Any API Keys

| Feature | Status | Notes |
|---|---|---|
| Manual prospect creation | ✅ Works | Paste from Google Maps |
| Preview site generation | ✅ Works (placeholder) | Real AI copy requires `OPENAI_API_KEY` |
| Site hosting + rendering | ✅ Works | Subdomains resolve locally |
| Dashboard (all pages) | ✅ Works | Leads, calls, site editor, billing |
| Claim flow + Stripe billing | ⚠️ Needs `STRIPE_SECRET_KEY` | Use Stripe test mode (free) |
| Email outreach | ⚠️ Logged to console | Real delivery needs `SENDGRID_API_KEY` |
| AI receptionist | ❌ Skipped | Needs `RETELL_API_KEY` (add later as $399 upsell) |
| Automated discovery | ❌ Skipped | Needs `GOOGLE_PLACES_API_KEY` (add when ready to scale) |

## Adding Capabilities One at a Time

As revenue comes in, add API keys to unlock features. Each one is
independent — you don't need all of them to launch.

### 1. Stripe (free test mode → live when ready)

Required to actually accept payments. Stripe's test mode is free:

1. Create a Stripe account (stripe.com)
2. In test mode, create a Product + Price ($299/month recurring)
3. Copy the Price ID into `.env` as `STRIPE_PRICE_ID_DEFAULT_PLAN`
4. Copy your test-mode Secret Key as `STRIPE_SECRET_KEY`
5. Set up a webhook endpoint pointing at your app's
   `/api/webhooks/stripe` and copy the signing secret as
   `STRIPE_WEBHOOK_SECRET`

Now the claim flow works end-to-end with test cards.

### 2. SendGrid (free up to 100 emails/day)

For real outreach emails instead of console logging:

1. Create a SendGrid account (free tier: 100 emails/day)
2. Verify a sender identity
3. Set `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` in `.env`

### 3. OpenAI (pay-as-you-go, ~$0.01 per site generated)

For real AI-written website copy instead of placeholders:

1. Get an API key from platform.openai.com
2. Set `OPENAI_API_KEY` in `.env`
3. Also start Redis + the worker: `docker compose up -d redis` and
   `npm run worker` in a second terminal

New Prospects will now get full AI-generated content automatically.

### 4. Retell AI (for the $399/month AI receptionist upsell)

Only add this once customers are paying and asking for phone answering:

1. Create a Retell AI account
2. Set `RETELL_API_KEY` in `.env`
3. New Tenants who claim their site will automatically get a phone
   number provisioned with an AI receptionist

### 5. Google Places API (for automated discovery at scale)

Only needed once you want to stop manually finding businesses:

1. Enable "Places API (New)" in Google Cloud Console
2. Set `GOOGLE_PLACES_API_KEY` in `.env`
3. Use `/admin/discovery` to run automated discovery jobs

## The $0 → $5 → Full Stack Upgrade Path

| Stage | What you're doing | Monthly cost |
|---|---|---|
| **Testing** | Running locally, no real customers | $0 |
| **First sales** | Stripe test mode, manual prospects, console emails | $0 |
| **First paying customer** | Stripe live mode, maybe SendGrid free tier | $0 |
| **5-10 customers** | Add a $5 VPS to host it 24/7, real SendGrid | $5 |
| **20+ customers** | Add OpenAI for automated generation | $5 + ~$0.50/mo |
| **Customers want phone** | Add Retell, charge $399/mo for it | $5 + Retell costs (covered by the $100/mo upsell) |
| **Want to scale outreach** | Add Google Places, Redis, worker | $25-50 total |

## Revenue Math

| Customers | Plan | Your Revenue | Your Costs | Monthly Profit |
|---|---|---|---|---|
| 1 | $299 | $299 | $0-5 | ~$294 |
| 5 | $299 | $1,495 | ~$10 | ~$1,485 |
| 3 × $299 + 2 × $399 | Mixed | $1,695 | ~$30 | ~$1,665 |
| 10 | $299 | $2,990 | ~$50 | ~$2,940 |
| 10 × $299 + 5 × $399 | Mixed | $4,985 | ~$100 | ~$4,885 |

## Tips for Your First Sale

1. **Find a business on Google Maps** with no website (takes 2 min)
2. **Add them as a Prospect** via `/admin/prospects`
3. **Send them their preview link** — email, text, walk in, whatever
   works: "Hey, I noticed you don't have a website yet — I built you
   one for free, take a look: [preview link]"
4. **The preview site does the selling** — it shows their business name,
   location, and a professional layout; the "Claim this site" banner at
   the top links to your checkout
5. **They pay $299/month** via Stripe → they're live instantly

No cold calling, no complicated pitch. You're showing them something
that's already built FOR them, and asking "want to keep it?"
