# Duty-free six-month observed-day trend

Base: GitHub main `8b7690155e55129add5579e2f0d4ad912f185e0d` (API verified; local mirror origin/main is stale).

## Data boundary

`0024_duty_free_exchange_daily.sql` has one vendor/KST-day primary-key row. Migration preserved the one existing actual current observation only; no historical backfill was supplied. Storage inventory class C_AGGREGATE is unpruned. Existing public API exposes yesterday/today/tomorrow only. **Exact production historical coverage is unknown**: no approved direct D1 session was available, and no provider request, collector, credential, guard or schedule was changed. The public monthly endpoint must establish actual coverage after normal reviewed deployment; do not claim six months of observations.

The new button lives inside the existing FX detail. It requests history only after opening, with no polling or automatic retries. Six KST calendar-month slots include the current partial month. Each value averages only actual stored Shilla online-shop USD observations, with observation/calendar-day counts and current-month status. Empty slots remain null / no data; future dates, other vendors and other source URLs are excluded. Data is not market FX or an airport-store payment guarantee. The chart connects adjacent non-null months only, uses 1.25px thin strokes like the country trend, and has pointer/touch/keyboard readouts plus all six textual rows. No motion or chart library is added.

## Bounded cost and cache

One SELECT uses PK(vendor,service_date_kst) over at most 184 daily records and returns at most six groups. SQLite EXPLAIN proves indexed date-range search, not table scan. No new tables/indexes/writes/storage/provider requests. Existing cache gateway adds only the exact safe GET/HEAD path; ignored parameters collapse to one cache key. Browser TTL <=300s; shared TTL <=3600s; both capped at KST midnight. Storage errors return 503/no-store, never an empty successful history.

Internal uncached upper-bound model (not official D1 usage): 1 query/184 daily rows per trend open; at 100/500/1k/5k/10k/20k opens, at most 18,400/92,000/184,000/920,000/1,840,000/3,680,000 logical rows, plus engine index amplification. Shared cache should reduce this but hit rate and Worker CPU are unmeasured. No site-wide free-tier sufficiency claim. Existing 70/85/95 guardrails unchanged. Current-rate polling and last-good recovery remain independent.

## Local evidence / limitations

75 focused regression tests passed (monthly, existing automated FX, font coverage, storage inventory, cache key/routing). 44 operational-phase2 tests also passed, including unchanged Owner UI Lock; Wrangler emitted a nonfatal missing log-directory warning. Scoped ESLint and diff whitespace checks passed. Eight new Playwright cases cover four languages and 360/1280 widths; test discovery only, browser execution pending normal CI. First concurrent full TypeScript process was killed by the environment; a serial `tsc --noEmit --incremental false` rerun completed without diagnostics. Browser launch was previously denied in the parent task; not retried or bypassed. No browser visual/E2E, production coverage, real D1 meta/CPU or live deployment verification claimed. Root reviewed and approved a separate draft PR only. Changed-file secret scan passed; full reachable-history scan remains pending and normal CI remains a merge/deploy gate. No merge/deploy performed.
