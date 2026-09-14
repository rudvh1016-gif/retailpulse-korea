# Central recovery — activation checklist

Status on 2026-09-14: **NOT ACTIVATED, and this document does not activate it.**

Central controlled recovery is dormant. Everything below is the procedure for a
future, separately approved decision to switch it on. Reading this file changes
nothing; only an owner-approved pull request that flips
`CENTRAL_RECOVERY_EXECUTION_ENABLED` does, and even that is one of four
conditions rather than the decision itself.

## The four conditions

`lib/central-recovery-gate.ts` requires all four. Any one missing keeps the gate
locked, and the gate is checked inside `executeControlledRecovery` before the D1
admission write, so a blocked call spends no attempt budget and makes no
provider request.

| # | Condition | Where it lives | Today |
|---|---|---|---|
| 1 | UI trial over (`2026-09-27T00:00:00+09:00`, exclusive) | `TRIAL_END_EXCLUSIVE` | passes after that instant |
| 2 | Owner-reviewed compiled enable | `CENTRAL_RECOVERY_EXECUTION_ENABLED` in `lib/operational-recovery-runner.ts` | **false** |
| 3 | Recorded owner approval | `RPK_CENTRAL_RECOVERY_OWNER_APPROVED` | unset |
| 4 | Production runtime enable | `RPK_CENTRAL_RECOVERY_RUNTIME_ENABLED` | unset |

The date is necessary and never sufficient. A gate that opens because a day
passed is a gate that opens while nobody is watching.

## First activation scope

Not every source. The first activation candidates are the two that already have
a bounded missing-coverage adapter, a measured request budget and an end-to-end
verification path:

| Source | Adapter | Why it qualifies |
|---|---|---|
| `INCHEON_PASSENGER_FORECAST` | `airport_passenger_forecast_recovery` | reads D1 first, requests only the missing selectdate, appears on the public summary |
| `KMA_VILAGE_FCST` | `weather_recovery` | reads D1 first, requests only the missing grids, appears on the public summary |

Everything else stays off. `lib/recovery-capability.ts` is the authority, and
`npm run health -- --json` prints the current classification under
`phase3.sourceCapabilities`.

### Allowed failure classes for the first activation

Only what both the rule table and the source support — which for these two is:

- `STALE` → `REQUEST_ONLY_MISSING_COVERAGE`
- `PARTIAL_DATA` → `REQUEST_ONLY_MISSING_COVERAGE`

`MISSED_RUN` and `EXECUTION_ERROR` resolve to `REDISPATCH_SAME_WORKFLOW`, which
neither source supports, so they stay with a person even though the rule table
approves the class.

### Attempt budget

Unchanged from `RECOVERY_RULES`: **3 attempts per logical job per KST day** for
`STALE` and `PARTIAL_DATA`. Enforced in one SQLite statement inside
`OperationalMemory.admit`, so two clients cannot both pass it.

### Provider cost ceiling

Each attempt is one bounded re-request — one selectdate for A5, the missing
grids for weather — so the worst case added by activation is 3 requests per
source per day. Nothing in this path may touch A1's ceiling, which
`.github/workflows/collect-airport-recovery.yml` already allocates in full
(3×125 + 1×125 = 500).

## Required Production evidence before switching on

Run `npm run orchestration:plan` (or the Operational Memory Inspection workflow
with `mode=plan`) against Production and confirm, from that output:

- [ ] `centralRecovery.executionGate` is `LOCKED` and names its blockers
- [ ] `capabilityCoverage.unclassified` is empty
- [ ] `stuckControlledAttempts` is empty
- [ ] every entry carries a `finalDisposition` and a `blockReason`
- [ ] no entry would act on a source outside the two above
- [ ] `providerCalls`, `d1Writes`, `deploys`, `dispatches` are all `0`

Then from `npm run health:production -- --json`:

- [ ] `phase3.centralRecoveryReadiness.readyForOwnerReview` is `true`
- [ ] `runtimeLlm` reports zero offending files
- [ ] `phase2.memory` is `PERSISTED_READ`
- [ ] `phase2.shadow` shows no `READY_FOR_OWNER_REVIEW` you have not read

At least one real incident on a candidate source should have been observed and
correctly classified by the plan before activation, so the first live decision
is not also the first decision anyone has seen.

## How to switch it on

1. Open a pull request that sets `CENTRAL_RECOVERY_EXECUTION_ENABLED = true`,
   with the plan output above quoted in the body.
2. Merge it through normal CI.
3. Set `RPK_CENTRAL_RECOVERY_OWNER_APPROVED=true` and
   `RPK_CENTRAL_RECOVERY_RUNTIME_ENABLED=true` in the Production environment.
4. Re-run the plan and confirm the gate reads `OPEN` with no blockers.

All three steps are required. Doing any two leaves the gate locked.

## How to switch it off

Fastest first — each one alone is sufficient:

1. Unset `RPK_CENTRAL_RECOVERY_RUNTIME_ENABLED` in the Production environment.
   Takes effect on the next execution with no deploy.
2. Unset `RPK_CENTRAL_RECOVERY_OWNER_APPROVED`.
3. Revert the constant to `false` and deploy.

Turning it off never needs a migration and never rewrites history. Attempts
already recorded stay recorded.

## Switch it off immediately if

- any `stuckControlledAttempts` entry appears (a controlled attempt started and
  never finished — the lock is correct and permanent, and it needs a person)
- a controlled attempt reports `RECOVERY_FAILED` twice for the same source and
  contract on the same day
- `phase2.usage` shows observed provider requests rising without a matching
  incident
- any quota resource reports `PROTECT` or `EMERGENCY`
- `phase3.centralRecoveryReadiness.unclassifiedSources` becomes non-empty — a
  new production source has been added and nobody has classified it yet
- the public summary stops carrying a source a recovery claims to have fixed

## What activation still does NOT permit

Unchanged from `FORBIDDEN_AUTOMATIC_ACTIONS`: no provider swap, no new API, no
credential change, no schema change, no deletion, no edit to a past prediction,
no model or threshold change, no paid upgrade, no code change. Automatic policy
promotion and automatic code change stay `false` whatever the gate says.
