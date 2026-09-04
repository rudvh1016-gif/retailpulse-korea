# KORETAIL Production

## Current boundary

The independently deployable runtime is a Cloudflare Worker with static assets and an optional D1 binding. `.openai/hosting.json` remains only so the existing Work Site checkpoint can be maintained; independent production uses `wrangler.production.jsonc` and does not use ChatGPT authentication headers.

Canonical engineering guidance:

- `docs/ENGINEERING_DIRECTION.md`
- `docs/ZERO_COST_HYBRID_AUDIT.md`
- `docs/CLOUDFLARE_ENVIRONMENTS.md`

## Environment boundary

The repository has one codebase and one `wrangler.production.jsonc`, with named `staging` and `production` Wrangler environments. They deploy as separate Workers and bind the same application name `DB` to different D1 databases. The deployment workflow must use the selected stage for both the Vite build (`CLOUDFLARE_ENV`) and Wrangler deploy (`--env`).

Committed D1 IDs are non-resource placeholders and the deploy preflight intentionally fails until the owner has authenticated Cloudflare, created the selected D1 database, and replaced only that environment's ID. Do not enable Wrangler automatic D1 provisioning for this repository.

## Release order

1. Run CI: secret scan, lint, typecheck, unit, build, rendered HTML, production dependency audit and browser E2E.
2. Confirm current official Cloudflare/GitHub free-tier limits and complete the applicable pessimistic audit gates.
3. Prepare only the minimum staging/production Worker and separate D1 infrastructure required to host the existing site. Keep source keys and all collectors OFF.
4. Deploy the site to staging, verify signed-out health, locale routing and noindex, then prepare the production hosting target without source integration.
5. Connect/cut over the final `.com`, select the canonical apex or `www` host, redirect the other, and verify HTTPS, canonical, hreflang, robots, sitemap, SEO and mobile access.
6. Only after the `.com` verification, add one approved source key at a time to the appropriate server-side secret store.
7. For each source, validate the real response, contract/schema, timestamps, quota, normalization, changed-only D1 write, fallback/stale/error behavior, redaction and UI output before marking it LIVE.
8. Verify the prepared Hybrid collector path while scheduled production collection remains OFF: GitHub Actions orchestration, parameterized D1 writes, lightweight Worker serving/read APIs and no Worker Cron duplicate.
9. Start immutable prospective Forecast records and later Outcomes/exact-target baselines only after actual source data is stable.
10. Consider setting `ENABLE_PRODUCTION_COLLECTOR=true` only after sufficient evidence and separate owner approval.

This owner-approved order supersedes earlier API-first sequencing. Minimum Worker/D1 creation for hosting is not API integration and does not authorize live data collection.

## Required production variables

- `NEXT_PUBLIC_SITE_ORIGIN`: public HTTPS origin. Deployment validation rejects localhost and chatgpt.site for final independent production.
- `CLOUDFLARE_ACCOUNT_ID`: GitHub production environment secret.
- `CLOUDFLARE_API_TOKEN`: least-privilege Worker/D1 deploy or approved D1-access token.
- `CLOUDFLARE_D1_DATABASE_ID`: Production D1 identifier.
- `CLOUDFLARE_D1_WRITE_TOKEN`: separate least-privilege D1 Write token for the collector; do not reuse a broad deploy token.
- `DATA_GO_KR_SERVICE_KEY`: server-side only; never in query logs or frontend code.
- `SEOUL_OPEN_DATA_KEY`: server-side only.
- KMA credential only according to the actual approved account/key model; do not duplicate secrets unnecessarily.

Beta signup is disabled by default. Do not enable it until retention, deletion, rate limiting and a real communication workflow are approved.

## Scheduler choice

The previous assumption that P0 should use one heavy Cloudflare Cron Trigger every 30 minutes is no longer authoritative.

Default production policy:

- heavy API collection / normalization / hashing / Forecast / Outcome orchestration → **GitHub Actions first**;
- Cloudflare Worker → lightweight site/API serving and indexed D1 reads;
- Cloudflare Cron → only small tasks that are explicitly benchmarked safe under the current Free CPU limit;
- never keep GitHub Actions and Worker Cron simultaneously authoritative for the same live source.

Current prepared state:

- Production Worker Cron carries **no collector work**. Since 2026-09-01 it holds exactly five **trigger-only** Crons whose handler makes a single authenticated GitHub `workflow_dispatch` call to an allowlisted workflow; heavy Cron execution of collectors stays rejected by the benchmark in `docs/REALTIME_SCHEDULER_AUDIT.md`.
  - Primary cadences: `7,22,37,52 * * * *` (realtime), `42 * * * *` (A5), `10 2,5,8,11,14,17,20,23 * * *` (weather).
  - Recovery windows: `53 * * * *` (A5), `25,40 2,5,8,11,14,17,20,23 * * *` (weather, firing at both :25 and :40 from one expression). Each reads Production D1 first and makes **zero** provider requests when the required coverage is already healthy, so the second weather window costs nothing on a healthy issuance.
  - **Five is the ceiling, not a preference.** Workers Free allows 5 Cron Triggers *per account*. A sixth is not ignored — the Cloudflare API rejects the entire schedules update (code 10072) **after** the Worker has uploaded, so the deploy fails with new code live against the old schedule. This happened once on 2026-09-01; `tests/hybrid.test.ts` now asserts the limit. Raising the *count* requires Workers Paid — but adding a firing time to an existing expression does not, because the cap counts configured expressions and the minute field accepts a comma list. That is how weather runs recovery at both :25 and :40 while the account stays at five.
- `.github/workflows/collect-production.yml` and its sibling scheduled workflows are the only collector schedulers.
- Each remains disabled unless `ENABLE_PRODUCTION_COLLECTOR=true` after all source gates pass.
- **Set `ENABLE_PRODUCTION_COLLECTOR` as a repository-level Actions variable** (Settings → Secrets and variables → Actions → Variables tab), not as a variable scoped to the `production` Environment. Every collection workflow gates on it with a **job-level** `if: vars.ENABLE_PRODUCTION_COLLECTOR == 'true'` while also declaring `environment: production` on that same job. GitHub Actions evaluates a job-level `if:` before the job's environment is resolved, so an environment-scoped variable is invisible at that point and the job will silently stay skipped even when the Environment's variable list shows it as `true`. Confirm the value in the **repository** Variables tab, not only inside the Environment's own variable list.
- Cadence is split into five independently scheduled groups, each its own workflow file, all gated behind the same repository-level `ENABLE_PRODUCTION_COLLECTOR` switch and never overlapping on the same source (see `docs/DATA_SOURCES.md` and `tests/hybrid.test.ts` for the enforced one-owner-per-source coverage check):
  - **DAILY** (`collect-production.yml`, `07 21 * * *` = 06:07 KST): `airport_recent` (A1, same-day guarded), `airport_enrichment` (A2), `airport_scheduled` (A3), `events` (T1), `seoul_foreign` (S2), `foreign_purpose_mobility` (S4, metadata-only unless a new monthly OA-22378 publication exists), `subway_ridership` (S5, up to seven completed days only on first backfill; then three station-code requests/day with a same-day zero-call guard).
  - **REALTIME** (`collect-realtime.yml`, `:07/:22/:37/:52`, ~15 min): `airport_congestion` (A4-T1), `airport_congestion_t2` (A4-T2), `seoul_realtime` (S1 integrated population + domestic-card commercial activity). S1 still makes one request per area, three/run; its two canonical source-health IDs are `SEOUL_CITYDATA_PPLTN` and `SEOUL_CITYDATA_CMRCL`. Cloudflare owns the alarm; the workflow keeps `workflow_dispatch` and no GitHub `schedule:`.
  - **WEATHER** (`collect-weather.yml`, aligned to the 02/05/08/11/14/17/20/23 KST KMA issuance): `weather` (W1). Cloudflare owns the alarm; the workflow keeps `workflow_dispatch` and no GitHub `schedule:`.
  - **FORECAST** (`collect-forecast.yml`, `:42` hourly): `airport_passenger_forecast` (A5). Cloudflare owns this alarm too; its native GitHub `schedule:` was removed after observed hourly deliveries were repeatedly dropped or delayed.
  - **SLOW** (`collect-sales.yml`, weekly Sunday 07:07 KST): `seoul_sales` (S3) and `store_dynamics` (S6). Store Dynamics uses at most five latest-quarter probes and three pages per exact mapped area, writes only validated compact aggregates, and reports `OFFICIAL_HISTORICAL` rather than `LIVE`.
- Change history is separately disabled unless `RPK_RETAIN_FLIGHT_CHANGE_HISTORY=true`; enable only after real D1 write/storage measurement.

GitHub `schedule` is not real-time. Record actual run/retrieval timestamps, design for delay/drop/retry/idempotency, and prefer off-minute schedules when source semantics permit.

## D1 write policy

Do not blindly UPSERT unchanged source rows every collection cycle.

Use source-specific semantic changed-only decisions and test that volatile collection fields such as `retrievedAt` do not cause false changes. Account for index write amplification, rows-read trade-offs and storage growth. Preserve immutable Forecast/Outcome integrity while limiting repeated raw snapshots.

## Read-path latency

The public summary (`/api/live/summary`) is read from D1 in **one batched
request** (`lib/d1-read-batch.ts`): 15 block statements plus 3 × 21 date-picker
probes leave the Worker together. Measured on Production on 2026-09-04
(site-smoke run 33836136846) the same statements awaited one after another cost
3.5–4.2 s per uncached summary — 18 Worker → D1 round trips at roughly 200 ms
each — while the payload read only ~2,500 indexed rows and a cache HIT answered
in ~65 ms. Rows read are unchanged by batching; only the round trips are.

- A D1 batch is atomic, so a rejected batch falls back to one concurrent wave
  of per-block reads; a broken statement still becomes an empty block, never a
  degraded page (`tests/summary-round-trips.test.mjs`).
- Every page preloads `/api/live/summary` from its HTML head
  (`app/[locale]/page.tsx`, `app/[locale]/[slug]/page.tsx`) so the fetch
  overlaps the JavaScript download instead of waiting for hydration.
- Verify after a deploy with `site-smoke.yml` (the time between the
  `api /api/health` line and the `api /api/live/summary` line is the uncached
  summary) and `production-visual-check.yml` (`AIRPORT_MOBILE_TIMING` in the
  log: uncached summary duration and time-to-data on a phone profile).

## Free-tier protection

Use the per-resource 70% NOTICE / 85% PROTECT / 95% EMERGENCY policy defined in `docs/ZERO_COST.md` and `docs/ZERO_COST_HYBRID_AUDIT.md`. Distinguish official provider usage from internal estimates. No code or workflow may automatically upgrade to a paid plan.
