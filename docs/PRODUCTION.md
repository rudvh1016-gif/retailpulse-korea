# RetailPulse Korea Production

## Current boundary

The independently deployable runtime is a Cloudflare Worker with static assets and an optional D1 binding. `.openai/hosting.json` remains only so the existing owner-only Work Site can be maintained; the independent production deployment uses `wrangler.production.jsonc` and does not use ChatGPT authentication headers.

## Release order

1. Run CI: secret scan, lint, typecheck, unit, build, rendered HTML, production dependency audit and browser E2E.
2. Set `NEXT_PUBLIC_SITE_ORIGIN` to the final HTTPS apex or `www` origin.
3. Deploy to `workers.dev` and complete signed-out smoke tests.
4. Create D1, apply migrations, add the `DB` binding, and verify `/api/health`.
5. Add only approved source keys as Cloudflare secrets.
6. Connect the custom domain, redirect the non-canonical hostname, and verify SEO output.
7. Enable each source as LIVE only after contract, timestamp, quota, fallback and terms checks pass.

## Required production variables

- `NEXT_PUBLIC_SITE_ORIGIN`: public HTTPS origin. Deployment validation rejects localhost and chatgpt.site.
- `CLOUDFLARE_ACCOUNT_ID`: GitHub production environment secret.
- `CLOUDFLARE_API_TOKEN`: least-privilege Worker/D1 deploy token.
- `DATA_GO_KR_SERVICE_KEY`: server-side only; never in query logs or frontend code.
- `SEOUL_OPEN_DATA_KEY`: server-side only.
- `KMA_SERVICE_KEY`: server-side only.

Beta signup is disabled by default. Do not enable it until retention, deletion, rate limiting and a real communication workflow are approved.

## Scheduler choice

P0 uses one Cloudflare Cron Trigger every 30 minutes. This keeps D1 access and source secrets in the same runtime and avoids duplicated GitHub schedules. If a later source needs Python or bulk file backfill, use a manually triggered GitHub workflow rather than creating a second live scheduler.
