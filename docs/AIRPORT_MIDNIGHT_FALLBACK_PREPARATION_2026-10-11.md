# A1 midnight fallback preparation — direct reusable jobs, execution blocked

Historical preparation record. The later explicit owner approval, A1-only code scope and runtime-last sequence are documented in [AIRPORT_MIDNIGHT_ACTIVATION_2026-10-11.md](AIRPORT_MIDNIGHT_ACTIVATION_2026-10-11.md). Old false constants and registry descriptions below apply to the preparation head, not the activation revision.

This is stacked on PR331 (`3812a0102e15df52b1b9b7757ea8da0d18ca0ae9`).
PR330/331 are unchanged; reviewed main is
`70ec17577c7ff9fb4b4beffae21c647a9e05532e`. No merge, deployment or
operational activation is performed.

## Current implementation

The existing 15-minute witness performs read-only candidate checks and exports a
fixed KST date. Its alert remains red after the 01:15 grace window; a missing
observation never becomes zero flights or a current held schedule. No candidate
acquires a recovery admission, including one whose queued job is replaced.

A conditional `airport_midnight_recovery` job directly calls the existing
`collect-attempt.yml`. No workflow-dispatch POST, `actions:write`, new token,
secret, cron, Worker path or schema is required. The previous HTTP helpers are
retained as isolated preparation/test code, with permission confirmation false;
they are no longer called by production witness integration. Direct and HTTP
attempts retain the SAME source/KST day/00:07/operation identity and daily budget.
There is no automatic HTTP route running beside the direct job.

The actual reusable collector starts only after acquiring the existing
`production-collector` concurrency group. It rechecks the central compiled,
owner and runtime gate, A1 review/capability, exact repository/main/caller/job/
run attempt, A1-only source, target date, single attempt, rescan=false and125
request bound. It then checks current coverage, bounded original-run history,
all active original statuses, known source protection and remaining shared budget.
The original-run scan includes old active daily runs and fails closed on
truncation or unavailable contracts. An early run already created today belongs
to its own existing retry ladder and is never restarted by this fallback.

Only then does `OperationalMemory.admit` acquire one atomic controlled admission
for that day. All eligibility and protection conditions are checked again before
the collector. A proven pre-collection abort closes its unused lock while keeping
today's admission spent. A crashed, uncorrelated or uncertain child keeps its
persistent lock, including across dates. Elapsed time does not unlock it.

The adapter reuses `runSelectedProductionSources` for `airport_recent` only. The
collector itself keeps the atomic conservative rolling24h+30m shared500 bound,
actual request settlement, complete-scan skip, queued target date check and
source429/auth/schema guard. On actual A1 SUCCESS it reuses the existing
DB-only `collectAirportComposition` daily/monthly preparation. It adds no A2,
holidays, commercial source requests, raw cleanup or prediction changes.

A receipt records this exact parent run/attempt, fixed caller, callee job and
commit identity. The in-process A1 result is measured independently of the
parent's A4/Seoul outcome. A failed parent can contain a verified A1 child;
a successful parent is never A1 evidence. Only the actual A1 result, measured
request counter, current complete DB witness and verified public projection
permit RECOVERED. A failed/unknown public read or receipt leaves human review;
no provider or transport retry is added.

## Realtime lock preservation

Keeping the old workflow-wide realtime lock around a20-minute A1 child would
block later15-minute cycles. The original A4/Seoul primary and fresh retry are
therefore moved unchanged into `collect-realtime-cycle.yml`. Their caller holds
`production-collector-realtime` across BOTH jobs. The root workflow has no
whole-run lock, while FX retains its own concurrency group and durable lease.
The A1 child is independent and shares native early/daily's production group.
The callees do not acquire their caller's same group again. Merely locking
primary and retry separately would allow another cycle between them and is not
used. GitHub may still replace pending work under its default queue policy;
no pending candidate owns a D1 recovery admission.

## Current activation blockers — unchanged

1. `CENTRAL_RECOVERY_EXECUTION_ENABLED=false` and existing owner/runtime approval
   conditions remain enforced at the actual execution boundary. YAML explicitly
   maps existing variables into production processes but does not change their
   stored values or claim they are enabled.
2. `A1_MIDNIGHT_RECOVERY_REVIEWED=false`; the generic A1 registry remains
   HUMAN_REVIEW_ONLY, unsupported and ineligible. A future reviewed activation
   must scope capability to this fixed A1 midnight adapter/logical job, not
   broaden the generic executor or another source.

GitHub permission expansion is NOT an activation requirement for this direct
path. All workflows retain contents:read. Production never supplies the test
activation override. Merging the preparation alone cannot activate the fallback.
PR331 still handles publication waits after its first native workflow starts.
GitHub delivery and provider publication remain external limits, not guarantees.

## Verification record

Historical HTTP preparation head `4cf58190b00897dd606565aad3829825eb6c37f4`:
[CI38071933452](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/38071933452)
completed SUCCESS. Unit1353/HTML46/E2E1163 passed; E2E35.7minutes. That result
is historical evidence and does not apply to the new direct implementation head.

Direct implementation: related unit197 passed; final child identity unit39 and
final full local unit1370 passed,0 failed/0 skipped. Typecheck, related lint,
reachable-history plus final-working-tree secret checks and the local empty-binding
Native Node build passed. Normal full CI must be confirmed for the published final
head separately and recorded in PR332. The original primary/retry job contents
match the historical source after line-ending normalization. Actual migrated
SQLite and fake provider/GitHub adapters verify gated zero-side-effects,
read-only candidates, canceled pending/repeated delivery, simultaneous jobs,
canonical once/day identity, native arrival, changed coverage/protection/budget,
next-day unused admission, crash/receipt persistence locks, fixed caller/date,
A1 result vs parent badge, measured requests and three-layer truth. Existing
scheduler truth, source budgets, central gates and Owner UI Lock remain enforced.
No approval fixtures or UI-lock tests are disabled or updated.

Operational activation has not been tested: no manual production dispatch,
remote DB write/migration, new credentials, permission/security setting change,
paid service, deletion, merge or deployment occurred. Local tests/build are not
production verification or deployment. Future separately approved A1 writes
are limited to existing recovery/receipt and budget records, changed flight/
departure-schedule storage, source/collector records and DB-only preparation.

Official contracts: [reusable caller permissions and concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations#supported-keywords-for-jobs-that-call-a-reusable-workflow),
[run/job identity variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables),
[schedule delivery](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
