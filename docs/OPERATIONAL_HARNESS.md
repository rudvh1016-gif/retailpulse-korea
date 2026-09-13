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

Phase 2 persists this contract in D1 (`0020_operational_memory.sql`). An insert-once
incident event folds atomically into its incident via a SQLite trigger. The event key
includes the stable fingerprint, event kind and underlying run identity: repeated
inspection of ONE failed run is not a second occurrence. Different failed executions
increment lifetime recurrence, including after resolution. First-seen survives restart.
An affected-run sample is bounded to 50 recent events and evidence to ten sanitized
500-character lines; normalized events preserve the older audit trail. No evidence is
deleted by Phase 2. A ledger over 500 incidents or a source scorecard window over 1,000
attempts requires review rather than silently truncating the result.

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
| L3 post-deploy | only on a real deploy | Phase 2 memory record/read/health follows deployment; existing visual workflow remains unchanged |
| L4 daily rollup | once daily | built as a report; not scheduled |
| L5 watchdog | heartbeat staleness | built, with `WATCHDOG_COVERAGE_GAP` |

Deliberately NOT "check everything every hour". The harness is driven by existing
completion events and by `npm run health`; nothing new polls.


## Phase 2 — operational memory (2026-09-13)

Base inspected: `65907c971b5e279da48525875df6c972ab998c64` (Owner UI Lock, PR #172).
This section supersedes Phase 1's unwired-memory descriptions above. Older deployment
setup notes in SHARED_PROJECT_STATE/ENGINEERING_DIRECTION describe historical activation,
not current schedule enablement. Existing schedulers are preserved verbatim.

### Active versus dormant

- **Existing collector completions:** `scripts/collect-production.ts` records bounded
  source evidence, incidents, observed usage and existing recovery outcomes after each
  selected collector. It never adds a provider request or changes a result. An observer
  failure logs UNKNOWN/human review without turning a successful collector into another
  provider retry. If migration 0020 is absent it reports DORMANT_MIGRATION_UNAVAILABLE.
- **Read-only health:** `npm run health` reads persisted memory when authenticated; no
  provider calls, no writes, no public HTTP requests. Offline evidence remains UNKNOWN.
- **Stronger read-only check:** `npm run health:production` additionally reads KORETAIL's
  own today/tomorrow summary once each. It never calls an upstream provider or writes.
- **Existing post-deployment event:** the protected deploy job records measured evidence,
  re-reads it in a separate process and reports operational health. No new trigger or
  recurring job; operational results remain separate from deployment success.
- **Manual recording:** Operational Memory Inspection / `npm run operations:memory`
  supports inspect, record, recover. `record` persists actual observations without any
  provider call. `recover` only prints the dormant gate; it cannot execute collection.
  The workflow has only workflow_dispatch and receives no provider credentials.
- **Central controlled recovery:** library admission → existing adapter → verify →
  durable outcome is implemented and tested, but its Production entry point remains
  dormant during AND after the trial until a separate reviewed activation. A1 has no
  spare quota outside its already-budgeted windows; no new A1 redispatch is allowed here.
  A5/weather reuse their existing missing-coverage runners. Existing scheduled recovery
  is observed, not replaced or controlled by this new admission path.
- **Policy promotion and arbitrary code changes:** always false. No clock/date flips
  either permission to true. No new recurring Production schedule or analytics event.

### Evidence matrix and last-good meaning

| Source | Contract evidence | Storage / payload evidence | Publication |
|---|---|---|---|
| Seoul population / domestic commercial | source_health schema_version; matching canonical rows | latest indexed observation per each of three areas; real range/quality/time checks | exact selected area, original observation time, values/schema comparison |
| KMA weather | stored schema_version | existing expected issuance; one usable upcoming row per required area (same grid-presence scope as current recovery) | matching issuance, target hour, temperature and precipitation probability |
| A5 passengers | stored schema_version | existing readRequiredForecastCoverage, both days/T1/T2; bounded aggregate rows | both dated summaries, terminal totals, original retrieval times AND complete terminal timelines |
| A4 T1/T2 queues | stored schema_version | latest reported checkpoint rows, validity and observation age | matching terminal/checkpoint/time/wait values; completeness of every possible checkpoint stays UNKNOWN |
| A1 flights / A2 enrichment | stored schema_version | targeted current-day presence; enrichment hash separately | full-scan/public equivalence UNKNOWN in central health |
| A2 directory / A3 schedules | stored schema_version | bounded terminal/current-season presence witness | central publication verification UNKNOWN; existing separate site-smoke remains available |
| Seoul sales / Store Dynamics / foreign presence / purpose / subway | stored schema_version plus existing canonical mapping versions where defined | indexed scoped reference sample; presence is not whole-dataset coverage | UNKNOWN; existing source-specific acceptance checks remain separate |
| Tourism events | stored schema_version | current-period event presence; no events is not automatically a persistence failure | UNKNOWN |
| Transfer / holidays / other context health IDs | stored source-health schema when available | dedicated existing collectors retain their own checks; central completeness UNKNOWN | UNKNOWN |

A missing or unavailable schema stays UNKNOWN_CONTRACT. An actual stored schema can
supply the version where source-health metadata has none. Versions are not fabricated.
`lastGoodAt` is the time an inspection proved current valid data, readable storage and
matching public projection, with completed collector evidence. It is NOT the source's
publication timestamp. Process exit, stale row presence, a preserved last_retrieved_at,
or an HTTP 200 alone earns nothing. An unmeasured publication remains null and cannot
resolve an incident. Contract changes do not borrow last-good from a different contract.
Different source definitions and current/predicted/reference values remain separate.

### Durable recovery admission and outcome

- Execution identity: source + targetDate + scheduledSlot + operation, unchanged.
- Attempt identity includes the actual run identity; admission atomically checks the
  daily source/logical-job budget and a partial UNIQUE index forbids concurrent controlled
  work even across different slots. Contract/operation/process changes do not reset budget.
- No time-based lease expiry. A lost/uncompleted attempt stays locked and escalates.
- Only completed failed work can be reconsidered within the remaining budget. Recovered
  or unverified-pending executions cannot be silently re-executed.
- Completion records data/storage/public booleans independently, verified outcome,
  duration and genuinely measured cost. Result and incident event are in one D1 batch.
- Existing-run observations do not pretend their original failure was known: without
  a matching prior incident it is RECOVERY_PENDING. A successful exit is not RECOVERED.
- Manual healthy observation may resolve an incident later, but does not retroactively
  award a specific unverified recovery credit when another collector could have fixed it.

### Scorecard, shadow evaluation and regression candidates

`lib/recovery-scorecard.ts` groups persisted attempts by source, failure class, contract,
logical job and action. Verified rate = three-layer verified recoveries / ALL attempts
in the inspected group. Missing verification is shown, not removed from the denominator.
Median latency uses measured completed durations with its measured count. Request totals
are observed lower bounds, with the number of measured attempts beside them.

Shadow comparison requires **10 distinct execution identities per action across at least
3 target days**, with complete data/storage/public, cost and latency evidence. This is a
conservative deterministic screening minimum, not statistical confidence. Unknown cause,
different contracts/jobs/sources or too-small samples cannot establish superiority.
Candidate recovery rate, consecutive-failure rate, mean requests and median latency must
all be non-worse, with no increased invalid-data/storage/publication failure rates. At
least one improvement yields READY_FOR_OWNER_REVIEW; equal results remain SHADOW_ONLY.
Other outputs are KEEP_CURRENT, INSUFFICIENT_EVIDENCE and REJECT_CANDIDATE.
`automaticPolicyChangeAllowed=false` for EVERY outcome, including owner-review ready.

Recurring known incident shapes produce small deterministic regression candidates:
fingerprint, failure class, real contract, occurrence count and expected closed-rule
answer. No raw payload, credentials, generated patch, automated code edit or merge.

### Heartbeat and usage limits

Source completion timestamps now persist in a small source-state table in D1, readable
from either platform with existing permissions. This proves recorded collector execution,
not whether it began from a Cron, a manual dispatch or a retry. Trigger origin remains
UNKNOWN and health no longer labels inferred Worker origin as independent observation.
No new Worker reads, writes, Cron expressions or public API were added to expose a beat.
GitHub total scheduling failure, Cloudflare Cron total failure and both-platform outage
remain WATCHDOG_COVERAGE_GAP. No paid independent monitor was added.

The existing REST adapter accumulates returned `meta.rows_read/rows_written`; operational
bookkeeping stores only measured deltas, excluding its own later overhead. Per-source UTC-day
aggregates are **OBSERVED_LOWER_BOUND**, not account-wide official usage; unmeasured provider
calls, other scripts, retries without returned metadata and public reads remain outside it.
Missing metadata/counters stay UNKNOWN. Companion commercial data does not double-count
its shared population request. No estimate is presented as exact and no quota percent is
computed from incomplete usage. Existing 70/85/95 thresholds are unchanged.

### Forecast/outcome connection

Central health reads the existing population predictions, frozen inputs, baselines and
outcomes in a bounded window (seven completed days through tomorrow, <=216 hourly rows
per area). It checks input hashes, cutoff/creation/target ordering, source version and
same-hour 00..14-minute outcome identity. No prediction, outcome, formula or weight changes.
An absent/malformed/unmatched input remains explicit. SAME_WEEKDAY shares model inputs;
BASELINE_NOT_INDEPENDENT and no performance claim remain in force. Operational scoring
is not proof that the forecast is commercially useful.

### Diagnostic activation classification

| Diagnostic | During trial | Later |
|---|---|---|
| Existing post-deploy Production Visual Check | EVENT_DRIVEN_SAFE_NOW, unchanged | preserve event-driven |
| Existing collector completion bookkeeping | EVENT_DRIVEN_SAFE_NOW, zero added provider requests | preserve bounded observer |
| Post-deployment memory record/read/health | EVENT_DRIVEN_SAFE_NOW, attached to the existing protected Production deploy | preserve event-driven |
| Production Site Smoke | MANUAL_ONLY_DURING_TRIAL | post-2026-09-26 event-driven candidate after its old hero-copy assertion is deliberately updated |
| Smoke Public APIs / network reachability | SHOULD_REMAIN_MANUAL (calls providers) | no recurring activation proposed |
| Inspect Production Operations / operational memory | MANUAL_ONLY_DURING_TRIAL | POST_2026_09_26_PERIODIC_CANDIDATE only after overhead/evidence review |
| Measure Production Read Budget | SHOULD_REMAIN_MANUAL | explicit bounded benchmark only |
| Central controlled recovery / policy promotion | DORMANT / promotion false | separate owner-reviewed activation; never enabled by the date alone |

No diagnostics were turned into hourly polling. Existing site-smoke's old hero phrase is
a known stale test assertion, not grounds to alter the locked UI; Production Visual Check
is the current public rendering gate. No claim that every manual diagnostic is green.

After an existing Production deployment succeeds, its existing protected job records
bounded source/publication evidence, then a separate process re-reads persistent memory,
then reports explicit Production health. These steps have no provider credentials or
dispatch capability and add four read-only requests to KORETAIL's own public summaries
(two for recording, two for health). Their outcomes are separate from deployment: failed
bookkeeping or unhealthy data is visible in the step logs, never evidence that a deploy
failed or succeeded. No automatic provider retry follows an operational check failure.

### Migration, cost and rollback

`0020_operational_memory.sql` adds five isolated operational tables, five indexes (including
one partial unique in-flight constraint), and one event-fold trigger. It uses only additive
CREATE IF NOT EXISTS; no existing product table/index/trigger/data is rewritten or dropped.
Wrangler applies SQL filenames. The historical Drizzle generation journal ends at 0004;
Phase 2 leaves it intact rather than inventing entries. Before choosing 0020 the inspected
latest Production deploy (job 103666916127, 2026-09-13 03:35 UTC) had 0000..0019 in its source
and reported `No migrations to apply!`. Current migration metadata is also printed by the
existing read-only inspection. Application/deployment evidence belongs in the PR/run logs;
a committed migration alone is never described as applied.

The first Phase 2 deployment (run 34748715214) stopped before Worker deployment with
`incomplete input` while applying 0020. The exact installed Wrangler statement splitter
reproduced the truncated trigger: an unparenthesized CASE expression ended its trigger
state early. Parenthesizing CASE/END preserves identical SQLite semantics and allows the
split statements to apply, including the migration marker. A regression executes the
actual installed splitter, not just SQLite's whole-file parser. No earlier migration or
metadata is rewritten; the failed 0020 remains idempotent and the next protected deploy
prints the actual pending migration list first. Memory remains dormant unless all five
tables, five required indexes and the event trigger exist.

The closure gate runs **inside the existing protected GitHub Actions deployment** with
the existing `secrets.CLOUDFLARE_API_TOKEN`. Codex needs no Production token. After the
recovery bookmark and migration list, `scripts/operational-migration-preflight.ts` makes
read-only Wrangler queries of `d1_migrations` and `sqlite_master`. Existing object SQL is
compared with the corrected 0020 definition by tokens, preserving quoted values. Only
whitespace, comments, keyword case and SQLite's removal of `IF NOT EXISTS` are ignored;
unproven semantic equivalence is rejected, not silently rewritten. Unexpected triggers on
the five operational tables also stop deployment. No raw query/provider payload or token
is logged: the report contains migration filenames, object names, counts and gate reasons.

| Classification | Required action |
|---|---|
| STATE_A_EMPTY_PENDING | SAFE_TO_APPLY after confirmed empty schema and pending registration |
| STATE_B_PARTIAL_PENDING | SAFE_TO_APPLY only for compatible existing definitions and safe resume evidence |
| STATE_C_FULL_PENDING | SAFE_TO_APPLY only after all definitions match; Wrangler registers it normally |
| STATE_D_FULL_APPLIED | ALREADY_VALID only for the complete compatible schema; no replay of applied 0020 |
| STATE_E_APPLIED_INCOMPLETE | UNSAFE; stop before migration/deployment |
| STATE_F_UNKNOWN | UNSAFE; failed/malformed/unavailable inspection never means an empty database |

Incompatible definitions stop in every state. For a pending partial schema, existing event
rows without the fold trigger require review because their historical folding cannot be
proved. Conflicting in-flight attempts without the unique lock index likewise stop; neither
case deletes or repairs evidence automatically. The additional checks use targeted SELECTs
only, during this deployment event. Local simulations cover empty, one-table, several-table,
partial-index, missing-trigger and complete pending installations, preserving existing
counts/rows and proving insert-once folding through the installed Wrangler splitter.

The normal migration command retains its existing Production-only gate. Wrangler applies
only filenames pending in its recorded history: applied 0020 is not replayed, and later
pending filenames still use the normal migration path. After application, the workflow lists migrations again and runs
the same gate with `--after`: registered 0020, compatible 5/5 tables, 5/5 indexes, 1/1 trigger
and no remaining pending migration are mandatory **before Worker deployment**. Both gates
fail the deployment job on UNKNOWN/UNSAFE; neither has `continue-on-error`. No new workflow,
schedule, provider call or automatic recovery/policy activation is introduced. These are
implemented protections, not a claim that Production preflight or application has passed;
the actual classification and each post-deploy result must be read from the deployment run.

Operational tables never appear in hot public page queries. Source-state/day counters are
compact; incident events are written only for actual failures/recovery transitions, not for
every healthy heartbeat. At roughly 500 source observations/day, the two compact UPSERTs
plus their indexes are on the order of a few thousand extra storage writes/day; failures add
indexed event writes. This is a planning estimate, NOT an official measured daily total or a
free-tier guarantee. Probes use existing indexes and explicit returned-row bounds; historical
presence is a witness, not a large COUNT scan. Manual reports use bounded incident/history
windows and refuse overflow. No automatic evidence deletion/retention job is activated.

D1 batch/metadata contracts and current free-tier planning limits were checked against
[Cloudflare D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/) and
[Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).
Retain the existing pre-migration Time Travel bookmark/deployment protection. For rollback,
revert the Phase 2 application/workflow changes through a green PR, leaving additive tables
and evidence intact. Do not rewind operational/product data or run a destructive down migration.

Focused SQLite/child-process tests prove restart, duplicate/concurrent admission, immutable
outcome, exhausted budgets, no timed unlock, unknown evidence, shadow gates and UI/schedule
locks. Local simulations never inject incidents or fixtures into Production.
