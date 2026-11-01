# A4 unresolved-incident publication recheck

Reviewed base: `ffc8d330775f29f476f093dd3977ef8d6bb6ae54` (latest fetched main). This branch contains no UI, shopping draft, schedule, credential, provider adapter, migration, or production data changes.

## Problem and behavior

`recordExistingCompletion` measures storage but normally has no public evidence. An existing retry can therefore correctly finish `RECOVERY_PENDING`, while subsequent successful regular collections never supply the missing third verification layer and leave its incident `DEGRADED`.

After a successful first-attempt regular T1/T2 congestion collection, inspect only unresolved incidents of that source, logical job and contract. With no unresolved incident, make no public request. Otherwise reuse the exact projection comparison used by `operations:memory` with one fixed own-origin `/api/live/summary` read (15-second timeout, no cache busting, no provider authentication). Additionally require an exact terminal checkpoint set, unique zones, original observed/retrieved clocks, raw wait ranges, valid counts and LIVE freshness. The 20-minute public freshness bound matches the existing summary projection; it does not change the collector's 35-minute diagnostic rule. Missing, capped, stale, partial, future or mismatched evidence stays unresolved.

A guarded INSERT appends a new verified HEALTHY event only while collector identity/status/times, source health, observed source-state snapshot and all latest stored rows still match. The incident fold and source-state proof update run in the same D1 batch. Changed incident versions and newer/tied competing collection runs also prevent closure. No historical attempt outcome is changed; RECOVERY_PENDING attempts remain pending in historical scorecards even after the current incident is resolved. Failure counts, source data, provider counters and retries are preserved.

## Bounds and safety

- No scheduler or new collection; GitHub Actions remains the execution platform. Zero additional provider requests. No Worker request-time import.
- One indexed incident query per eligible healthy regular source completion, capped at501 (more than500 requires review); no network read for resolved sources. Stored sample is already bounded at30; capped samples are rejected.
- At most one fixed own-site read for an unresolved eligible source per existing regular collection. No independent polling or retry loop.
- At most two bounded SQL statements per matching unresolved incident: guarded new event plus current source-proof update. Existing event idempotency prevents duplicate events. No migrations, index changes or raw snapshots.
- SQLite regression tests verify transactional compare-and-set behavior. Official D1 row metrics/latency, live incident closure and actual usage remain UNMEASURED: no production command or ledger update was executed. No free-tier capacity or usage percentage is inferred.
- Concurrency proof covers observable database/incident changes. An upstream request that has not produced any database evidence cannot be detected; the verdict describes the exact stable snapshot verified at that moment, not a promise about later collections.

## Validation

Local full units2668/2668 (including25 new regression cases), TypeScript, ESLint (24 pre-existing warnings), offline health, RSC-gated build and rendered HTML53/53 passed. Cases include both terminals, zero/null/raw range preservation, historical pending-attempt immutability, missing/extra/duplicate checkpoints, cached clocks, stale LIVE cache, future clocks, partial collector status, changed health/rows/run/incident/source-state races, three unverified normal completions and no-unresolved-source no-fetch behavior. Complete dependency audit passed with0 high/critical and23 existing moderate findings; full working-tree/reachable-history secret scan passed. Source counters are unchanged by revalidation. No new UI browser suite is needed for an observer-only branch; remote mandatory CI has not run.

Remote publication is BLOCKED pending explicit approval: automatic approval review rejected a malformed PR-tool invocation without repository/branch/title/scope, also citing unclear publication authorization for this recovery change. No PR was created; no push or alternate publication was attempted. Needed scope: publish `codex/congestion-recovery-recheck-20261101` to `rudvh1016-gif/retailpulse-korea`, create a PR, run mandatory CI. Merge/deployment must follow the applicable owner authorization and successful exact-HEAD checks. This must not carry any separate mobile/desktop/shopping changes.
