# Native collector schedule observation

Base: `c107c84e860410ea3a1ceb1baa7138adfee65510`. Independent checkout/branch:
`koretail-autonomy`, `codex/collector-orchestration-audit-20261106`. The four
airport test-scope files and the other agent's checkout are untouched.

## Observed problem and change

The existing heartbeat allows three cadence intervals plus five minutes. A daily
job can therefore be hours late and still ALIVE. A source's collector timestamp
also cannot prove which workflow ran (A1 has early and daily owners). This change
does not alter those historical evidence semantics or award false heartbeat credit.

An additional read-only observer job shares the existing realtime trigger. It has
no needs edge to/from collection or recovery and shares no collector lock. It
derives native collector cron expressions from real workflow files,
reads one public GitHub runs page per scheduled workflow, and reports nominal UTC
slot, created_at, run_started_at, status and conclusion separately. It filters
`event=schedule`; manual/deploy dispatches cannot prove scheduled execution.
Multiple expressions are treated as one workflow union because GitHub's run object
does not identify the originating expression. Only the five newest scheduled runs
are requested. This is not a complete schedule-delivery history.

30 minutes is a diagnostic notice grace, not a data freshness/SLA/recovery change.
After that, an unobserved current slot is OVERDUE; a late-created successful run
stays LATE_CREATED. Before the grace ends it is AWAITING_SLOT. A recently created
run is RECENT_SCHEDULE_RUN, never a claim that collection/data is healthy. API
failure, absence of runs, unsupported cron or invalid time is UNKNOWN. Creation
delay is explicitly a **lower bound** inferred using current config: an entire
cycle of delay can alias to a later slot, and schedule changes need manual review.
No direct cause of GitHub's schedule latency has been established.

## Before/after evidence

Read 2026-11-06 UTC from GitHub's actual run records:

| Workflow | Nominal UTC slot | Created/start (equal) | Observer result |
|---|---|---|---|
| early A1 | Nov 5 15:07 | Nov 5 21:26:46 | LATE_CREATED, lower bound 6h19m46s, creation-to-start 0 |
| daily | Nov 5 21:07 | Nov 6 01:28:31 | LATE_CREATED, lower bound 4h21m31s, creation-to-start 0 |

Both concluded success. Run start is GitHub's run timestamp, not measurement of
an individual job's runner acquisition. Evidence:
[early](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/42112706791),
[daily](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/42144076847).
Before this change those delays were not a distinct schedule diagnostic; the
new observer reproduced both from public metadata on 2026-11-06 at 14:19 UTC.

Repository variable ENABLE_PRODUCTION_COLLECTOR was read as true. main was
unprotected and the rulesets response was empty; no setting was changed.
The live `/api/health` at 14:19 UTC reported app/database ok, Seoul population
and commercial LIVE, KASI_PUBLIC_HOLIDAYS ERROR. These source-health labels are
not full lifecycle proof. A fresh existing read-only Operational Memory Inspection
[42232904123](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/42232904123)
completed its inspection, then health exited 1 for system ERROR, with 12 unresolved
incidents. A successful observer does not erase that result. UNKNOWN publication,
extent and quota evidence remains UNKNOWN. No provider request was made for this audit.

## Safety, budget and remaining boundary

- No new service, secret, receiver, permission, cron, paid runner or dependency.
- Existing five Worker expressions and trigger-only dispatch remain unchanged.
- No provider/D1/Worker API reads or writes in the new observer. No data, design,
  immutable prediction, recovery gate, provider request budget or snapshot changes.
- Four native workflows today: four unauthenticated GitHub GETs per existing
  primary cycle; nominal 96 cycles/day = 384 GETs/day, 16/hour. The public API's
  shared-IP limit can reject calls; that remains UNKNOWN, with no retries. Eight
  seconds/request and a three-minute independent job ceiling bound overhead.
  One additional standard ubuntu-latest job per cycle installs the existing locked
  dependencies with scripts disabled. No larger runner is used. API waits, setup
  or observer failure cannot delay or change the source-specific recovery job.
- The observer receives no production environment/secrets and checkout credentials
  are not persisted. Unexpected checker failure stays a failed observer job;
  `continue-on-error` never masks a collector or observer result.
- Adds log warnings and a job summary, not an external notification. It detects
  sibling schedule lateness while realtime runs; it cannot observe total GitHub,
  Worker-trigger or joint outage. Monitor silence still needs external review.
- No automated redispatch is authorized by this report. Auth/schema incidents,
  absent origin evidence, unsupported contracts, locked/pending recovery and
  branch protection changes remain human review boundaries.

The observer makes diagnosis actionable without another timed owner. Moving daily
work to Worker alarms or widening generic recovery would require a separate quota,
five-trigger routing, lock and missed-slot design; neither is silently activated.

## Validation and resumption

Focused regression tests cover the two real late runs, stale prior-day heartbeat,
30-minute boundary, manual/invalid/missing/future evidence, weekly UTC wrap,
unsupported cron, multiple-expression union, and the no-secret/no-dispatch wiring.
Use `node --import tsx --test tests/schedule-timeliness.test.mjs` and
`npx --no-install tsx scripts/check-schedule-timeliness.ts` (read-only network).
Local typecheck and focused ESLint passed. The focused scheduler/harness suite
passed 78/78. Full unit/secret/CI/release results and final SHAs belong in the PR.

Local full unit attempt: 2,814 tests, 2,785 passed / 29 failed on this restricted
Windows host. Failures include CRLF-sensitive assertions in unmodified workflows,
blocked loopback fetch (`connect EACCES 127.0.0.1`), temporary `git init`, and
platform/module tests. These are not waived: Linux CI must pass before merge.
Full ESLint completed with 0 errors / 25 existing warnings. Full reachable-history
secret scan passed. Build/render/browser checks are delegated to mandatory CI;
no local pass is claimed. Pre-change public HTML build SHA observed at 14:25 UTC:
`82735a2aa933df33cd2149b2a844449e654f5fc6` (different from current main).

First Linux CI (`42233819172`, head `01ee05b2`) found one real wiring-contract
failure: continue-on-error in the collector cycle violated the existing no-masked-
failure guard. Review also found that placing observation after retry_decision
still delayed retry_congestion (it needs the complete collect job) by up to 32s.
Both are corrected by an independent job in collect-realtime.yml; the reusable
collector cycle is restored byte-for-byte. The original contract is not weakened.
The new regression asserts no dependency in either direction, no collector lock,
no secrets/environment, no suppressed failures and unchanged source-specific retry
gating. New-head mandatory CI is required; the first run is not called a pass.

After safe merge, inspect the next naturally occurring Collect Realtime Signals
run's observation step and summary; do not dispatch a provider collector just to
test this observer. Verify its checkout SHA. Normal main CI/deployment remain the
release gates. Rollback is removal of the observer step; collector behavior is
unchanged. Public build SHA is available in `koretail-build-sha` HTML metadata.

Applicable pessimistic audit: scheduler graph/duplicates, concurrency separation,
UTC/actual timestamps, quota/redaction, last-good/prediction preservation and
no-paid-fallback are covered by unchanged collectors plus new regression tests.
Worker CPU, D1 official usage/storage/write amplification, traffic capacity and
source-to-outcome end-to-end are **not remeasured** by this metadata-only change;
no new claim of free-tier capacity or fully autonomous operation is made.
