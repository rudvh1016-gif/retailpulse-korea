# KORETAIL Runbook

## Cloudflare staging connection

1. Never paste a Cloudflare token into chat or a repository file.
2. Use the GitHub `staging` Environment for staging secrets and variables; use the separate `production` Environment for production.
3. Create the staging D1 first and replace only the staging placeholder ID in `wrangler.production.jsonc`.
4. Apply `npm run db:migrate:staging`, then manually run **Deploy Cloudflare → staging**.
5. During this hosting phase, verify only site health, locale routing and staging noindex behavior. Do not connect external source API keys yet.
6. `ENABLE_PRODUCTION_COLLECTOR` must remain absent or `false`; `RPK_RETAIN_FLIGHT_CHANGE_HISTORY` must remain absent or `false`.
7. Connect and verify the final `.com` before starting source API integration. Hosting Worker/D1 preparation is not permission to start data collection.

## Manual one-shot data import

1. **One-shot Data Import → Run workflow** performs a single bounded import of the selected verified sources into Production D1. It has no schedule and is not the recurring collector.
2. Type `IMPORT` in the confirm input; without it the run refuses to write. The exact source `probe_seoul_citydata_contract` with confirmation `PROBE` is the read-only S1 structure check: it receives no D1 token and never imports.
3. Choose sources from `seoul_realtime,seoul_sales,store_dynamics,weather,events,airport_congestion,airport_congestion_t2,airport_passenger_forecast,airport_flights`. Sources whose keys are still blocked report `NEEDS_KEY`/`ERROR` and write nothing except their source-health status.
4. Writes are changed-only idempotent upserts against unique semantic keys; re-running the same import produces zero changed rows.
5. Verify afterwards with `/api/health` and `/api/live/summary` (source statuses, latest timestamps) — never by editing data. `seoul_realtime` must show both `SEOUL_CITYDATA_PPLTN` and `SEOUL_CITYDATA_CMRCL`; one being healthy never hides failure in the other.
6. The recurring scheduler stays gated behind `ENABLE_PRODUCTION_COLLECTOR` and separate owner approval.

For the first Store Dynamics import, select only `store_dynamics`. A successful
run must report three exact areas and `OFFICIAL_HISTORICAL`; immediately repeat
the same selection and require zero changed rows. Then verify each area in
`/api/live/summary`, the `SEOUL_STORE_DYNAMICS` health row, the isolated Edge
Cache MISS → HIT transition, and the measured summary `rows_read`. An empty,
malformed, or mismatched provider response is a failure and must never be
treated as zero stores.

## Site does not open

1. Open GitHub → Actions → latest CI and Deploy Cloudflare runs.
2. If CI is red, open the first failed step; do not rerun deployment until CI is green.
3. In Cloudflare → Workers & Pages → `retailpulse-korea-production`, check the latest deployment and logs. This is a legacy-compatible technical resource name, not the public brand.
4. If only the domain fails but `workers.dev` works, check the custom domain DNS/SSL state.

## API data does not arrive

1. Open `/api/health`; confirm app, database and source statuses.
2. In Cloudflare Worker logs, look for the source ID and error category, not the secret URL.
3. Check that the source key exists in Worker Settings → Variables and Secrets.
4. Confirm official quota/maintenance. Keep the UI STALE or MISSING; never type in replacement numbers.
5. For collector failures, read only the bounded fields `failureClass`,
   `causeCode`, `httpStatus`, `attempts`, `elapsedMs`, `retryExhausted` and
   `providerSignal`. Never copy an authenticated URL into an issue or chat.
   The three answers that need different actions:
   - `failureClass=AUTH` (HTTP 401/403, data.go.kr 20/21/30–33): the key may
     not use that service. Nothing is retried; the owner checks the service's
     활용신청 (status 승인, 활용기간) on data.go.kr. Do not re-run to "fix" it.
   - `failureClass=NO_DATA` (resultCode 03): the provider answered with no
     rows. Last-good rows stay with their own times; the next scheduled window
     looks again. A W1 run that is entirely NO_DATA is green with a warning.
   - `failureClass=TIMEOUT|NETWORK` or `httpStatus=5xx`: transient, already
     retried within its bound; the next window or fresh runner repairs it.
   A green run is not "all data fine": read its warning annotations and
   `/api/health` source statuses (see docs/DATA_SOURCES.md, "Collection
   failure classes").
6. `retryExhausted=true` means the current natural run failed after the
   bounded recovery window. Do not rerun A1 by hand; keep last-good data and
   let the next authoritative schedule recover automatically. For the daily
   A1 scan the first window is 00:07 KST (`collect-airport-recovery.yml`, up
   to 3 fresh-runner attempts × 125 requests), and the 06:07 KST daily group
   rescans once (125). GitHub schedule times are nominal; runs can start
   hours late. A 01:15–03:00 KST A1-only fallback (`collect-realtime.yml`
   `airport_midnight_recovery`, ≤125 inside the shared rolling 500) runs only
   when the `RPK_CENTRAL_RECOVERY_*` Variables allow it and A1 source health
   is LIVE/STALE with no auth/429/schema veto; after an A1 ERROR it stays
   blocked by design. A manual `Collect Production Data` run is a further
   scan on top of a 500-call day; use it only when every scheduled window
   failed.

## Site feels slow

1. Run `site-smoke.yml` and read the timestamps: `/ko`… page lines should be
   tens of milliseconds apart; the uncached `api /api/live/summary` line
   should follow `api /api/health` within about half a second. Seconds there
   means the D1 read path has regressed to more than one round trip — check
   that `summarizeLiveSummary` still reads through `readGroups` and that
   `tests/summary-round-trips.test.mjs` passes.
2. Run `production-visual-check.yml` and read `AIRPORT_MOBILE_TIMING`:
   `summary[].duration` is the API, `dataReal` is when the airport numbers
   appeared. If the API is fast but `dataReal` is late, the cost is JavaScript
   download/hydration on the phone, not the database.
3. Do not add a paid plan, a cache TTL that outlives the data's freshness
   rule, or a runtime provider call to make a page faster.

## GitHub Action fails

1. Open the failed job and first red step.
2. CI failure means code is not released. Fix it on a branch and rerun.
3. Deploy failure with green CI usually means Cloudflare token, account ID, origin or permissions.
4. For collection, use **Collect Production Data → Run workflow** only after `ENABLE_PRODUCTION_COLLECTOR=true` and all collector secrets exist.
5. If the repository has had no activity for 60 days, confirm scheduled workflows are still enabled. Never backdate `retrievedAt` to a missed nominal schedule.

## D1 quota or migration issue

1. Open Cloudflare → D1 → Metrics and check rows read/written and storage.
2. At high usage, reduce collector frequency and stop nonessential collection.
3. Before a migration, confirm the Free plan Time Travel window; restore if the migration damages data.
4. Never delete the database to fix a schema problem without an export/recovery check.
5. At 70% record NOTICE. At 85% disable change history/optional backfills. At 95% stop noncritical collection and show DEGRADED/PAUSED.
6. Never delete immutable prediction or outcome rows to recover space.

## Domain fails

1. Confirm the domain exists in the user’s Cloudflare account.
2. Check Worker → Settings → Domains & Routes → Custom Domain.
3. Pick one canonical host (apex or `www`) and permanently redirect the other.
4. Verify HTTPS, `/ko`, `/en`, `/zh`, `/ja`, `/sitemap.xml` and `/robots.txt` while signed out.

## Recovery rule

Do not change production data manually to make a chart look normal. If live collection fails, show the last timestamp as STALE and keep official historical data available.

## Trigger-only scheduler rollback

Realtime, Forecast and Weather each have one authoritative Cloudflare alarm.
Rollback is atomic: remove that exact Cron from `wrangler.production.jsonc`
and restore the matching GitHub `schedule:` block in the same Green PR/deploy.
Never operate both paths together. No D1 migration or data rollback is part of
this procedure.

## Operational context and forecast maintenance (Sept5)

- Existing Seoul realtime Actions also collects category/environment fields from
  its existing3responses. No new upstream endpoint or Cron for this expansion.
- After18KST the same runner saves next-day population reference forecasts and
  matches previous outcomes. Missing enough same-weekday data => COLLECTING;
  no recent observation => wait for next run, not invented values.
- Existing A1 runner also refreshes compact airline/country daily aggregates for
  last29days only when collector-run evidence proves a completed bounded scan.
  Comparisons describe collected flight records, not a whole-day operational census.
- Holiday source: KASI getRestDeInfo, current+next month, one daily successful
  refresh. Source Health shows failed/unauthorized access; preserve previous rows.
  An AUTH refusal (`AUTH_BLOCKED`, e.g. HTTP 403) is a warning on the airport
  runs, not a red run, and is asked at most once per 20 h by schedule. After
  the owner fixes the 한국천문연구원_특일 정보 (15012690) application, a manual
  **One-shot Data Import** with sources `holidays` and confirmation `IMPORT`
  checks once immediately (1–2 KASI requests, no airport calls); otherwise the
  next scheduled window does.
- Context snapshots90days (max400pruned/day); forecast/input/outcome/aggregate
  history preserved. A5 aggregate revision archive is immutable and starts at
  migration; old historical source-issued versions cannot be reconstructed.
  `retrieved_at` is when we received a version, not provider issue time.
- Before every production migration, Deploy Cloudflare records a D1 Time Travel
  bookmark. Free recovery window7days. Bookmark acquisition is not a restore drill.
  Never run a production restore just to test: it rewinds canonical records.
  Keep the workflow log/time/bookmark for recovery within that window.
- Long-term canonical history stays in D1. No public GitHub dump of database rows,
  no new paid storage, no claim that this supplies an off-account long-term backup.

For initial activation after migration, use the existing manual One-shot Data
Import with sources `seoul_realtime,population_predictions,airport_composition,holidays`
and confirmation IMPORT. This reuses the same functions, adds no scheduler, and
avoids rerunning unrelated airport/provider sources. Before18KST prediction creation
waits normally; coverage accounting still runs.

## Automatic production deployment (2026-09-09 KST)

Owner requested removal of the recurring manual deployment step. Deploy Cloudflare now follows successful CI for pushes to main. It deploys the exact tested revision, rejects outdated revisions, and retains environment protection, serialized deployments, D1 recovery bookmark and migration checks. Failed CI and pull-request/fork runs never deploy. Existing manual staging/production controls remain available.

Observe CI, then Deploy Cloudflare, then verify koretaildata.com. A merge alone is not a deployment success. If deployment fails, inspect its failed step; fix the cause and merge through CI. To disable automatic releases, remove only the workflow_run trigger from deploy-cloudflare.yml; retain manual deployment. No credentials, collectors, paid services, or environment approval settings were changed.
