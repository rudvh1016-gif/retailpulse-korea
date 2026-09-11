# KORETAIL Operational Harness — zero runtime LLM

Audit date: 2026-09-11 KST. Audited against `origin/main` at `708f8dc`.

`RUNTIME_LLM_CALLS = 0 VERIFIED` — mechanised by `lib/runtime-llm-scan.ts`, asserted
on every CI run via `npm run health`. Development-time model use (the session that
wrote this) is out of scope and allowed; a model call in shipped code is not.

## The one command

```
npm run health            # human-readable summary, exit 1 only on ERROR
npm run health -- --json  # the same report as JSON
```

With no credentials it reports everything derivable from a checkout. With Production
D1 credentials it additionally SELECTs `collector_runs` and `source_health` and walks
each source through the lifecycle. It performs zero provider calls, zero writes and
zero deploys.

An offline run reports **UNKNOWN**, and that is the correct answer. A checkout cannot
know whether production collected anything this morning.

## What the audit actually found

| # | Finding | Evidence | Status |
|---|---|---|---|
| 1 | `CLAUDE.md` and `AGENTS.md` both claimed "Worker Cron has been removed" / "keep it disabled" while five Production Cron expressions were live and `collect-production.yml` had an active `schedule:` block | `wrangler.production.jsonc` line 44; `collect-production.yml` line 20 | FIXED — both files synchronized; `tests/scheduler-truth.test.mjs` now fails on a repeat |
| 2 | Nothing distinguished "schedule declared" from "schedule actually runs". `collect-production.yml` is gated by `vars.ENABLE_PRODUCTION_COLLECTOR`, which is GitHub state, not repository state | `collect-production.yml` line 32 | FIXED — `RUNTIME_ENABLE_STATE_UNKNOWN` is now a first-class state and blocks HEALTHY |
| 3 | `lib/quota-guard.ts` had **zero** production callers. The 70/85/95 thresholds were implemented and tested and consulted by nothing | grep: only `tests/hybrid.test.ts` imported it | FIXED — wrapped by `lib/quota-observation.ts`, which the health entry point calls |
| 4 | `lib/collection-recovery.ts` covers **2 of 15** sources (A5 forecast, KMA weather). The other thirteen had no recovery layer at all | the module's own exports | DOCUMENTED — the orchestration layer above it now states per-source recovery scope instead of implying coverage |
| 5 | `lib/production-diagnostics.ts` is a source-id table plus a log sanitizer, not diagnostics. Its name overstated it | 85 lines, two exports | DOCUMENTED — the lifecycle evaluation that the name implies now exists in `lib/source-lifecycle.ts` |
| 6 | `inspect-production-operations.yml`, `site-smoke.yml` and `smoke-public-apis.yml` are `workflow_dispatch` only. Nothing routinely verifies storage or the public surface | workflow `on:` blocks | REPORTED — `manualOnly` in the health report; scheduling them is the owner's call |
| 7 | No incident ledger, no watchdog, no central health status existed | repository grep | BUILT |

## The five states that are never conflated

```
실행 성공  ≠  자료 정상  ≠  저장 성공  ≠  사이트 반영 성공  ≠  복구 성공
```

`lib/operational-states.ts` enforces this as a forward-only walk:

```
EXPECTED → TRIGGERED → RUNNING → COLLECTED → VALIDATED → PERSISTED → PUBLISHED → HEALTHY
```

`HEALTHY` is the name for "all seven earlier stages proven", not a measurement. Three
rules make it unreachable by accident:

1. A **missing** evidence entry stops the walk at UNKNOWN. Absent evidence is never success.
2. An **UNPROVABLE** entry stops the walk at UNKNOWN. A source whose publication could
   not be checked is never HEALTHY.
3. The **first DISPROVEN** stage decides the failure class. A source that failed to
   persist is reported as `PERSISTENCE_FAILED`, not rescued by a stale public surface.

`rollUp` ranks UNKNOWN **above** DEGRADED, so one unmeasured signal cannot be diluted
by nine healthy ones.

## Automatic recovery: what is allowed

`lib/recovery-orchestration.ts` holds a **closed** rule table. Anything not in it is
`HUMAN_REVIEW_REQUIRED`.

| Failure class | Action | Attempts |
|---|---|---|
| `MISSED_RUN` | re-dispatch the unchanged workflow | 3 |
| `STALE` | request only the missing coverage | 3 |
| `PARTIAL_DATA` | request only the missing coverage | 3 |
| `EXECUTION_ERROR` | re-dispatch (a fresh runner) | 2 |

Never automatic, asserted against the rule table in tests: provider swap, new API,
auth fix, schema change, data deletion, past-prediction edit, model weight or
threshold change, paid-plan upgrade, code change, unknown-bug fix.

Idempotency is a stable execution id of `source + targetDate + scheduledSlot + operation`.
**A timeout alone never releases the lock** — elapsed time is not evidence the earlier
attempt stopped, so a stuck lock escalates to a person rather than admitting a second
run against the same provider window.

A recovery is `RECOVERED` only after data, storage **and** the public surface are each
re-verified. An unmeasured layer leaves it `RECOVERY_PENDING`; it is never called fixed
on the strength of a run that exited zero.

## Watchdog: the gap is reported, not closed

`lib/watchdog.ts` reports `WATCHDOG_COVERAGE_GAP` permanently, for three scopes no
in-repository check can observe:

- GitHub Actions itself not dispatching scheduled workflows
- Cloudflare Worker Cron triggers not firing at all
- both platforms down simultaneously

Consequently the watchdog's own severity can never be HEALTHY, and therefore neither
can the overall report. On free infrastructure with no paid external monitor this is the
honest ceiling. A green board produced by the dead system itself would be worse than an
explicit gap, because it converts an outage into silence.

## Incident ledger

Fingerprint: `sourceId :: failureClass :: contractVersion :: logicalJob`. Not the
timestamp (every occurrence would be new), not the error message (provider text varies),
and the contract version is included so a failure before a schema change is not merged
with one after it.

The same failure **increments one row**. A recurrence after resolution reopens that row
rather than creating a second, so `occurrenceCount` means "times this has ever happened",
not "times since someone last closed it". An unverified recovery leaves the incident
`DEGRADED`, never `RESOLVED`.

**Current limitation, stated plainly:** nothing persists the ledger yet. A single
`npm run health` run can therefore only report `occurrenceCount: 1`, and the repeat
counters stay at zero until the ledger is given a D1 table. The fingerprinting and
counting rules are finished and tested; the storage is not built.

## Comparability guard

`lib/comparability.ts` inverts the default: **NOT_COMPARABLE unless every facet matches**
(population universe, period, time window, area, terminal scope, unit, metric definition).
Six named rules are checked first, so relabelling facets to match cannot bypass them:

flight origin ≠ nationality · station alighting ≠ unique visitors · foreign presence ≠
foreign sales · airport passengers ≠ store traffic · domestic card spend ≠ foreign spend ·
event date range ≠ open now

## Quota

Audited, not rebuilt. `lib/quota-guard.ts` keeps the only definition of 70/85/95;
`lib/quota-observation.ts` adds the state it could not express: **UNKNOWN**.

All four tracked resources are `OBSERVE_ONLY` today, because no free authenticated usage
API is available to this harness for Workers requests, D1 rows read/written, or the
data.go.kr daily ceiling. **UNKNOWN is not 0** and is never rendered as a percentage.
No state can authorise a paid upgrade.

## Forecast / outcome

Monitor only. No formula, weight or threshold is touched; no past prediction is edited.
The one claim it blocks is `BASELINE_NOT_INDEPENDENT`: if the model's error is within 2%
of the same-weekday baseline, no skill claim may be published however good the error
looks.

## Files

| File | Role |
|---|---|
| `lib/operational-states.ts` | lifecycle + failure states, evidence walk, severity rollup |
| `lib/scheduler-truth.ts` | real scheduler graph from config; doc-drift detection; cron cadence |
| `lib/source-lifecycle.ts` | L1 per-source evaluation into lifecycle evidence |
| `lib/recovery-orchestration.ts` | rule-gated recovery, idempotency, L2 re-verification |
| `lib/incident-ledger.ts` | fingerprinting and repeat counting |
| `lib/watchdog.ts` | L5 heartbeats and the declared coverage gap |
| `lib/comparability.ts` | comparability guard |
| `lib/quota-observation.ts` | UNKNOWN / OBSERVE_ONLY wrapper over `quota-guard` |
| `lib/forecast-pipeline-state.ts` | forecast/outcome pipeline states, monitor only |
| `lib/improvement-priorities.ts` | deterministic P0–P3 ranking, no code change authorised |
| `lib/operational-health.ts` | central report and human summary |
| `lib/runtime-llm-scan.ts` | the zero-runtime-LLM proof |
| `scripts/health.ts` | the `npm run health` entry point |
| `tests/operational-harness.test.mjs` | 55 cases incl. the mutation test and the all-healthy control |
| `tests/scheduler-truth.test.mjs` | 13 cases against the REAL workflows and Wrangler config |

## Check levels

| Level | When | Status |
|---|---|---|
| L1 post-collection | per collector, focused | built (`evaluateSource`) |
| L2 post-recovery | must re-verify | built (`verifyRecovery`) |
| L3 post-deploy | only on a real deploy | not wired — `production-visual-check.yml` already runs on `workflow_run` after Deploy Cloudflare |
| L4 daily rollup | once daily | built as a report; not scheduled |
| L5 watchdog | heartbeat staleness | built, with `WATCHDOG_COVERAGE_GAP` |

Deliberately NOT "check everything every hour". The harness is driven by existing
completion events and by `npm run health`; nothing new polls.
