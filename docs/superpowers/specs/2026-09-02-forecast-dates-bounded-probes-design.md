# Forecast Dates Bounded Probes Design

## Scope

Phase A removes the remaining growing-history read from `/api/live/summary`: the A5 `forecastDates` query. It does not add Edge caching, enrich W1 weather, change A5 collection/recovery, add a Cron expression, or alter billing.

The implementation starts from `origin/main` at `fb8e1eeb5ea025bc9876604e499563023dae6720`, which already contains the fourteen-statement Production read-budget measurement and the D1-compatible single-day batching fix from PRs #71–#73.

## Current Problem

The date picker currently obtains A5 dates with:

```sql
SELECT DISTINCT target_date AS day
FROM airport_passenger_forecast
WHERE direction = 'departure'
  AND is_aggregate = 1
ORDER BY day DESC
LIMIT 21
```

Production evidence measures this statement at about 1,710 rows read, roughly 61% of the approximately 2,795-row uncached summary. Its cost grows with retained A5 history even though the picker displays only the recent 21-day service window.

## Chosen Architecture

Reuse the route's D1-compatible `probeDays` mechanism. For each of the same 21 KST candidate days already used by the flight and Seoul-observation pickers, execute one bounded statement in a single D1 batch:

```sql
SELECT ? AS day
WHERE EXISTS (
  SELECT 1
  FROM airport_passenger_forecast
  WHERE target_date = ?
    AND direction = 'departure'
    AND is_aggregate = 1
)
```

The date returned is still derived only from a real official A5 aggregate-departure row. The clock defines the bounded candidate window but never fabricates availability. KST service-date construction and the existing `dayList` normalization remain unchanged.

The first implementation uses the existing `airport_passenger_forecast_target_idx`, whose leading column is `target_date`. No migration or new index is added unless real Production EXPLAIN and `meta.rows_read` show that the existing index cannot keep each existence probe bounded.

## Data Flow

1. Compute the 21 recent KST service dates exactly as the current route does.
2. Build 21 independent prepared statements with `dayExistsSql`.
3. Bind `[day, day]` to each statement and execute them through `client.batch`.
4. Flatten successful result rows through the existing `probeDays` helper.
5. Feed the rows into the existing `dayList` function and `dateAvailability.airportPassengerForecast` response field.

The implementation must not recreate the rejected 21-way `UNION ALL` statement fixed in PR #73.

## Failure Semantics

The A5 date probe stays source-isolated through `safeAll`: a D1 error may empty only the A5 availability list and must not fabricate dates or make unrelated source blocks disappear. Production smoke continues checking that the summary is live and will additionally verify the A5 list when current source health proves usable A5 data exists.

No provider call, collector run, write statement, historical backfill, or data deletion is part of this phase.

## Regression Protection

Tests will be written before production code and must fail on the current implementation. They will enforce:

- `forecastDates` uses the same single-day batched probe pattern as the other bounded picker sources;
- every probe preserves `direction = 'departure'` and `is_aggregate = 1`;
- no historical `SELECT DISTINCT target_date` remains in the public route or measurement tool;
- no function wraps `target_date`;
- the query plan has no growing-table scan;
- a day is returned only when an official aggregate departure row exists;
- component, arrival, missing, and out-of-window rows do not create picker dates;
- the Production measurement tool executes and attributes all 21 A5 probes under the existing diagnostic ceiling.

## Production Acceptance

PR A may deploy only after CI, unit/full tests, typecheck, lint, build, secret scan, migration tests, environment validation, and D1 plan tests pass.

After deployment, run the existing bounded **Measure Production Read Budget** workflow once. Acceptance requires:

- `forecastDates` has no growing historical scan;
- its real Production rows read falls from about 1,710 to a bounded small value;
- total uncached summary cost falls materially from the measured 2,795 baseline without changing date truth;
- `/api/health` and Production Site Smoke pass;
- exactly five Cron expressions remain and A5/weather source health is not degraded.

If the existing index is unexpectedly expensive, stop before Phase B and evaluate a narrowly justified A5 availability index with measured write/storage cost. Do not add one preemptively.

## Rejected Alternatives

### Add a composite index immediately

An index beginning with `target_date` and adding `direction, is_aggregate` could make the probe more selective, but it adds write and storage amplification to every A5 change. The existing target-date-leading index must be measured first.

### Maintain a separate availability table

A materialized date table would make reads tiny but introduces synchronization, recovery, migration, and last-good failure modes for a 21-day picker. It is unnecessary unless bounded probes fail measurement.

### Keep DISTINCT and rely on Edge Cache

Phase B caching can reduce repeated executions but cannot make the uncached path safe. The growing query must be fixed before caching.

## Phase Boundary

Phase B starts only after PR A is merged, deployed, measured, and smoke-tested. Phase C starts only after Phase B proves real shared cache reuse and date-key isolation. Each phase receives its own design, plan, branch, PR, deployment, and Production gate.
