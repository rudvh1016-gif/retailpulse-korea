# Cloudflare environments — safe connection plan

**Status:** code prepared; Cloudflare resources not created

**Reviewed:** 2026-08-27 KST

**Collector:** OFF

## One codebase, two isolated environments

RPK uses one repository and one Wrangler configuration. Named Wrangler environments create separate Workers:

| Environment | Worker | D1 binding | Actual database |
| --- | --- | --- | --- |
| staging | `retailpulse-korea-staging` | `DB` | `retailpulse-korea-staging` |
| production | `retailpulse-korea-production` | `DB` | `retailpulse-korea-production` |

Cloudflare documents that `wrangler deploy --env staging` and `--env production` address separate environment Workers. Bindings are not inherited, so each environment declares its own `DB` binding. See [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/) and [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).

The committed D1 IDs are deliberate non-resource placeholders. `npm run deploy:cloudflare` refuses to deploy until the selected environment's real database ID replaces its placeholder. This prevents accidental automatic provisioning, shared databases, or a deployment that appears healthy without the intended database.

## Required order

1. Authenticate the owner's Cloudflare account.
2. Create `retailpulse-korea-staging` D1.
3. Replace only the staging placeholder ID.
4. Apply staging migrations with `npm run db:migrate:staging`.
5. Deploy staging with the GitHub **staging** environment and test `/api/health`, signed-out access, four locales, staging `noindex`, one manual source response, and repeated semantic writes.
6. Only after staging evidence, create and migrate the production D1 and prepare the production Worker.
7. Keep scheduled collection disabled until source terms, real API contracts, D1 metrics, error handling, and redaction pass.

## Claude staging handoff — account-authorized next step

This repository is ready for an agent that already has the owner's Cloudflare authorization. Codex did not create a token or make any remote Cloudflare change during the KORETAIL brand migration.

Run these steps from a fresh checkout of the latest `main`:

1. Confirm the repository and Cloudflare identity:

   ```bash
   git fetch origin
   git status --short
   git rev-parse HEAD
   git rev-parse origin/main
   npx --no-install wrangler whoami
   npx --no-install wrangler d1 list --json
   ```

2. If and only if `retailpulse-korea-staging` is absent, create that staging database only:

   ```bash
   npx --no-install wrangler d1 create retailpulse-korea-staging --location apac
   ```

   Do not let Wrangler rewrite unrelated environments. Copy the returned database ID and replace only `env.staging.d1_databases[0].database_id` in `wrangler.production.jsonc`. Leave the production placeholder unchanged.

3. Validate the selected environment and rerun the local release gates:

   ```bash
   RPK_DEPLOYMENT_STAGE=staging npm run validate:cloudflare-env
   npm run secret:scan
   npm run lint
   npm run typecheck
   npm run test:unit
   ```

4. Apply migrations to staging only:

   ```bash
   npm run db:migrate:staging
   ```

5. Set the staging origin to its HTTPS `workers.dev` origin, then deploy staging only. The repository deploy wrapper validates the D1 ID, builds with `CLOUDFLARE_ENV=staging`, and passes `--env staging` to Wrangler:

   ```bash
   NEXT_PUBLIC_SITE_ORIGIN="https://<staging-worker-host>" \
   RPK_DEPLOYMENT_STAGE=staging \
   npm run deploy:cloudflare
   ```

6. Verify `/api/health`, `/ko`, `/en`, `/zh`, `/ja`, `robots.txt`, the `X-Robots-Tag` header, and an empty staging sitemap. Do not connect an external source key yet.

7. Commit only the staging database ID/config change after the checks pass. Do not replace the production placeholder, create production resources, enable `ENABLE_PRODUCTION_COLLECTOR`, or enable `RPK_RETAIN_FLIGHT_CHANGE_HISTORY` in this handoff.

These commands match the checked-in Wrangler `4.92.0`, `wrangler.production.jsonc`, and current package scripts. Re-read current Cloudflare documentation before execution because CLI behavior can change.

Do not paste API tokens or database credentials into chat, issues, code, logs, or documentation. GitHub environment secrets hold deployment credentials. D1 database IDs are resource identifiers rather than secret keys, but they must refer to the correct account resource.

## Current Free-plan facts

These limits were rechecked on 2026-08-26 and must be checked again before activation:

- Workers Free: 100,000 requests/day, 10 ms CPU/request, 50 external subrequests/request, 5 Cron Triggers/account ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).
- D1 Free: 10 databases/account, 500 MB/database, 5 GB/account, 5 million rows read/day, 100,000 rows written/day; daily usage resets at 00:00 UTC ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)).
- D1 indexes consume storage and indexed writes add rows written. Staging plus production consumes two of the ten Free databases.
- Standard GitHub-hosted runners are free for public repositories; larger runners are not. Artifact/cache storage is a separate metered concern, so the collector uploads no artifacts ([GitHub Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)).

The 70% NOTICE / 85% PROTECT / 95% EMERGENCY policy remains a conservative internal guardrail. It is not an assertion of official usage; only D1 query metadata, Cloudflare Analytics/Dashboard, or the provider's official quota counter may be labeled `OFFICIAL_USAGE`.

## Deployment safety

- The deployment workflow maps its `staging` or `production` choice to the same-named GitHub Environment and Wrangler environment.
- `CLOUDFLARE_ENV` is set during the Vite build, then Wrangler receives the same explicit `--env`. This follows Cloudflare's Vite environment guidance and prevents cross-environment builds.
- Production Worker Cron remains absent.
- `.github/workflows/collect-production.yml` remains the only prepared scheduled collector and its job does not run unless repository variable `ENABLE_PRODUCTION_COLLECTOR` is exactly `true`.
- `RPK_RETAIN_FLIGHT_CHANGE_HISTORY` remains false/unset until real remote D1 measurements exist.

## Evidence still blocked

Cloudflare authentication alone does not resolve these gates:

- Gate 13: real Worker HTTP CPU
- Gate 15: real dynamic requests per visitor
- Gate 20: real D1 index write amplification
- Gate 35: official D1 usage measurements
- Gate 46: final `.com` SEO, HTTPS and redirect
- Gate 50: official source through later Actual and baseline comparison
