# Operational harness: temporal evidence

Base: `2273f4f8da4bb8bce0df48bbb36e07171dc2ee71` (`origin/main`, fetched again
before handoff). Work is isolated from the separate shift-alert implementation.
This patch changes diagnosis only. It does not change collection, scheduling,
recovery admission, data writes, notification delivery or deployment.

## Reproduced issue and bounded fix

A successful collector status was able to reach `HEALTHY` with an invalid audit
clock, future run start/finish/retrieval/publication timestamps, or an invalid
cadence. A future heartbeat or non-finite cadence could similarly return
`ALIVE`. Negative ages and comparisons with NaN/Infinity bypassed the lateness
checks; completion used only the truthiness of its timestamp.

The source lifecycle now leaves the corresponding stage `UNKNOWN` when that
clock cannot prove an elapsed event, rather than inventing freshness or a
retryable failure. The watchdog likewise keeps future heartbeats and invalid
cadences `UNKNOWN`. Invalid cadence includes nonpositive values and arithmetic
overflow. Valid timestamps exactly at the audit instant and the existing
silence threshold still behave as before. Observations are not modified.

The health CLI captures its evaluation time **after** its asynchronous inspection.
A collector completing during the reads must not be judged against an earlier
audit-start clock. This does not give the reads a transactional snapshot or
prove that no source changed after inspection.

### Producer compatibility

`writeCollectorStatus` deliberately increments `started_at` milliseconds for
uniqueness. That field is not a measured execution-duration boundary. Its
completion time may be one millisecond earlier than its synthetic start time.
A proposed strict finish-after-start check was removed during review, and the
real +1 ms ordering is now an explicit healthy control. This patch **does not
claim to detect finish-before-start corruption** and does not alter collector
writes. Publication identity verified without an `asOf` clock also remains
supported; the inspector does not invent publication time from inspection time.

## Verification

Node `v24.22.1`; locked dependency inputs match the existing installed tree.
No dependency change or new package was needed.

- Baseline selected pure/static suites: 91 passed, 0 failed.
- Initial added scenarios: 18 failed as expected. One represented the unsupported
  finish-after-start assumption above and was replaced by a compatibility control.
  The other 17 reproductions cover the retained fixes.
- Final selected suites: 111 passed, 0 failed/skipped. Command:
  `node --import tsx --test tests/operational-harness.test.mjs tests/scheduler-truth.test.mjs tests/schedule-timeliness.test.mjs tests/ci-browser-shards.test.mjs tests/summary-refresh-harness.test.mjs`.
- Independent final pure harness run: 78 passed, 0 failed; no remaining actionable
  review findings after the producer and audit-clock corrections.
- `npm run lint`: exit 0, zero errors and 25 existing warnings.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: exit 0.
- `npm run secret:scan`: exit 0, current tree and reachable history checked.
- `npm run build`: exit 0. Existing bundler sourcemap/proxy/config warnings remain.
- Credential-free offline `scripts/health.ts --json`: exit 0, overall `UNKNOWN`.
  A checkout is not evidence of live source health or runtime enablement.
- Rendered HTML: 54 passed, 0 failed with the same `NEXT_PUBLIC_SITE_ORIGIN`
  used for the build (`http://127.0.0.1:4173`). An initial invocation omitted that
  variable and failed the four travel-record locale origin assertions (50/54);
  matching the test environment to the unchanged build fixed all four.
- Browser inventory: 2,340 cases, four disjoint shards of 585; exit 0. No browser
  was launched by this discovery command.
- Complete dependency audit: exit 0; 15 moderate, 0 high/critical findings.
- `git diff --check`: exit 0.

This remains a local handoff: the branch was not published, no draft PR exists,
and exact-head CI has not run. Publication of
`codex/stability-observation-20261110` to `rudvh1016-gif/retailpulse-korea` and a
draft PR await authorization. No full local unit or DB-backed stability-suite
pass is claimed. Browser inventory is discovery, not
browser execution. No live provider, production database, actual notification,
production deployment or free-tier capacity verification was performed.

## Applicable audit and release boundary

Scheduler ownership, trigger count, provider request budget, collector and
recovery policy, D1 schema/write paths, immutable predictions, last-good data,
UI and paid-service policy are unchanged. Changed-only D1 write efficiency,
Worker CPU, official quota/storage usage and end-to-end publication were not
remeasured. This is not the full 30-item architecture audit.

Keep the change as a draft until applicable exact-head CI and review are
complete. Do not merge or deploy based only on the focused local results.
Rollback is reverting this diagnosis-only commit; no data migration is involved.
