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
3. Reserve/configure the final domain/Cloudflare zone, but do not rush final traffic cutover.
4. Deploy to `workers.dev` and complete signed-out smoke tests.
5. Create and verify staging D1 first; only after staging passes create Production D1, apply migrations, add the separate `DB` binding, and verify `/api/health`.
6. Add only approved source keys to appropriate server-side secret stores.
7. Verify the prepared Hybrid collector path: disabled-by-default two-hour GitHub Actions orchestration, direct parameterized D1 REST batches using a D1-write-only token, lightweight Worker serving/read APIs, and no Worker Cron duplicate.
8. Enable each source as LIVE only after contract, timestamp, quota, parser, changed-only D1 write, fallback/stale/error, redaction and staging checks pass.
9. Start immutable prospective Forecast archive, later Outcomes and exact-target baselines.
10. After operational observation, connect/cut over the custom `.com`, redirect the non-canonical hostname, and verify SEO/HTTPS output.

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

- Production Worker Cron is removed.
- `.github/workflows/collect-production.yml` is the only collector scheduler.
- It remains disabled unless `ENABLE_PRODUCTION_COLLECTOR=true` after all source gates pass.
- Initial cadence is every two hours at minute 07: 12 calls/day, at most 24 with one retry.
- Change history is separately disabled unless `RPK_RETAIN_FLIGHT_CHANGE_HISTORY=true`; enable only after real D1 write/storage measurement.

GitHub `schedule` is not real-time. Record actual run/retrieval timestamps, design for delay/drop/retry/idempotency, and prefer off-minute schedules when source semantics permit.

## D1 write policy

Do not blindly UPSERT unchanged source rows every collection cycle.

Use source-specific semantic changed-only decisions and test that volatile collection fields such as `retrievedAt` do not cause false changes. Account for index write amplification, rows-read trade-offs and storage growth. Preserve immutable Forecast/Outcome integrity while limiting repeated raw snapshots.

## Free-tier protection

Use the per-resource 70% NOTICE / 85% PROTECT / 95% EMERGENCY policy defined in `docs/ZERO_COST.md` and `docs/ZERO_COST_HYBRID_AUDIT.md`. Distinguish official provider usage from internal estimates. No code or workflow may automatically upgrade to a paid plan.
