# LawnMaster

Multi-tenant lawn care platform. Landscaping companies sign up, connect their own Stripe
account, draw service areas on a map, set service days and prices, and get a branded
site (on a subdomain or their own domain) where customers subscribe to mowing — weekly,
every 2 or 3 weeks, or monthly — pick a start date, and add flat-rate extras.

Stack: Next.js 16 (App Router) · Supabase (Postgres, Auth, RLS, PostGIS) · Stripe Connect · Mapbox.

## How it fits together

| Host | Serves |
| --- | --- |
| `ROOT` (e.g. `lawnmaster.app`) | Marketing, landscaper sign-up, `/dashboard` |
| `{slug}.ROOT` or a verified custom domain | That company's customer site (`app/site/[domain]`) |

`proxy.ts` routes by hostname. Payments are **direct charges on the company's connected
Stripe account**; `companies.platform_fee_percent` (default 0) turns on a platform fee.
Prices are per service area × lawn size × frequency. Visits are generated 8 weeks ahead
by `/api/cron/generate-visits` (daily, see `vercel.json`).

## Setup

1. `npm install`, then copy `.env.example` to `.env.local` and fill it in.
2. **Supabase:** apply `supabase/migrations/` to a project (`npx supabase db push`), or run
   one locally with `npx supabase start` (needs Docker).
3. **Stripe:** enable Connect on the platform account. Add a webhook endpoint for
   *events on connected accounts* at `https://ROOT/api/stripe/webhook` with
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `account.updated`.
4. **Mapbox:** a public token with the default scopes.
5. **Vercel:** add `ROOT` and the wildcard `*.ROOT` to the project. Set `VERCEL_API_TOKEN`
   and `VERCEL_PROJECT_ID` so companies' custom domains can be attached.
6. `npm run dev` → platform at `http://localhost:3000`, storefronts at `http://{slug}.localhost:3000`.

## Checks

```bash
npm test            # unit tests (scheduling, pricing, hostnames, geometry)
npm run typecheck
npm run lint
```

Database tests (tenant isolation, area lookup) against a plain local Postgres + PostGIS:

```bash
supabase/tests/run-local.sh
```

End-to-end walkthrough in a browser (needs Playwright, local Supabase, and the app built
and started with `STRIPE_API_BASE=http://localhost:12111`, `STRIPE_SECRET_KEY=sk_test_mock`,
`STRIPE_WEBHOOK_SECRET=whsec_e2e_test_secret`):

```bash
node e2e/mock-stripe.mjs &
node e2e/flow.mjs
```

The e2e run uses a stand-in Stripe server and a mocked geocoder, so it checks this app's
logic, not Stripe's or Mapbox's real behaviour.

## Not in v1

- Customers changing mowing frequency themselves (they cancel and re-subscribe).
- Inviting additional managers to a company.
- Email/SMS notices for visits and failed payments.
