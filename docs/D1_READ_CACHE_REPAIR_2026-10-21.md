# Bounded airport monthly read-cache repair — 2026-10-21

Baseline: `9de3fff346ec0da7e55bc7ee04d961dbc1f41994` (GitHub main verified).

## Evidence and scope

`/api/live/airport-months` already emits `public, max-age=60, s-maxage=300`
for READY data and reads at most 63 compact daily projections.
`/api/live/airport-passenger-stats` already emits
`public, max-age=300, s-maxage=3600` for READY data. Both paths were missing
from the gateway's named cached-entrypoint allowlist. Default entrypoint
caching is explicitly disabled in `wrangler.production.jsonc`.
The monthly hook uses browser `cache: no-store`; as with flights, its request
cache-bypass headers must not override the route's existing shared TTL.
The monthly retry button only appears when current data is missing; those
non-ready responses remain no-store. Passenger reference's independent
Cache API / mutable-response-clone repair is untouched.

## Change

- Allow GET/HEAD on precisely these two public, header-independent routes.
- Preserve the first `month` parameter verbatim, including invalid/empty
  values. Other query parameters are ignored by these routes and removed.
- Generate `_kstDay` from current KST day, not caller input, preventing
  default-month/availability cache reuse across midnight. This parameter
  does not affect either route's response.
- Strip request Authorization/Cache-Control/Pragma on these public reads,
  preserving other headers. Existing TTL, body and source timestamps stay
  unchanged; invalid 400 responses explicitly become no-store.
- No database migration, collector, scheduler, settings, credentials,
  paid infrastructure, UI, content, aggregation or private route change.

## Quota interpretation

A cache hit avoids the route's D1 read, but account-level savings are NOT yet
measured. With N requests to the same month/day within the 300-second window
and one cache population, the ideal reduction is N-1 database read batches
(up to 63 returned monthly projection rows per avoided batch). Real results
vary by cache locality, eviction, concurrency and response readiness. Returned
row limits are not official D1 `meta.rows_read`; do not equate them.
This gap is not proven to be the cause of the account's 75% warning.
No diagnostic production database reads were performed for this repair.

## Verification boundary

Tests cover exact safe-method allowlist, configured named entrypoint wiring,
first duplicate month/invalid input, ignored query noise, KST month rollover,
request header normalization, unchanged stats response bodies/TTLs and
non-ready no-store. Existing monthly collector/store and passenger-reference
cache tests must also pass. CI build/typecheck and production cache-hit
verification remain mandatory before claiming rollout success.

Local validation: sequential focused cache/store/stats/passenger-reference suite
52/52 passed; final real invalid airport-months handler coverage 8/8 passed.
Targeted ESLint and `git diff --check` passed. Concurrent expanded test run
had one process termination (45 other tests passed); sequential rerun above
passed. Local full typecheck was OS-killed, not an assertion/type error or a
pass. Full reachable-history secret scan was interrupted to avoid competing
for shared resources; it is not reported as passed. Normal CI remains the
full-build/typecheck/secret-scan gate.
