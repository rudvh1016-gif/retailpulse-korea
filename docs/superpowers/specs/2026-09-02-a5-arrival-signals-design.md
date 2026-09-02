# A5 Arrival Signals Design

**Status:** Owner-approved design for PR 1 only

**Starting point:** `origin/main` at `e3065350c5bc0318c4c88bd32e7c2a063662bfe4`

**Branch:** `feat/a5-arrival-signals`

## Objective

Use the official A5 arrival forecast rows already stored in
`airport_passenger_forecast` to replace the departure-oriented airport rows on
Seoul business-area signal lists with a compact inbound leading signal. The
Airport view continues to show its existing departure forecast, departure
flight and departure-hall information unchanged.

This PR does not add a provider request, API source, Cron trigger, migration,
paid service, runtime model, browser-to-provider request, or Demand Index
input.

## Product truth

A5 is a forecast. Every visible label in Korean, English, Simplified Chinese
and Japanese must say expected, forecast or official forecast. It must never
say or imply actual arrivals, current arrivals, observed arrivals, Seoul
visitors, Myeongdong visitors or store traffic.

The Seoul signal note describes airport arrivals as a leading reference signal
for Seoul consumer demand. It does not claim that arriving passengers enter a
particular area or make a purchase.

## Read architecture

The live summary keeps one bounded A5 statement for the selected KST service
date. It reads only official aggregate rows:

```sql
WHERE direction IN ('departure', 'arrival')
  AND is_aggregate = 1
  AND target_date = ?
ORDER BY direction, target_start_at, terminal
LIMIT 96
```

The limit covers exactly two directions, two terminals and 24 hourly official
aggregate bands. Component rows never enter the result. The existing
`airport_passenger_forecast_target_idx` leads with `target_date`, so the query
remains a bounded date seek. A new index is not added unless Production
`EXPLAIN` and `meta.rows_read` prove the existing plan unsafe.

The route splits this one result into departure and arrival arrays in memory.
Departure rows continue through the existing Airport response contract.
Arrival rows feed a new additive `airport.arrivalForecast` response block.

The existing date-picker availability probe remains departure-scoped in this
PR because the Airport date picker describes the departure-detail view.

## Direction-aware summarization

The existing A5 summarizer becomes direction-aware without weakening any
coverage rule. A compatibility wrapper or explicit departure call preserves
the current Airport behavior.

For either direction:

- only `isAggregate === 1` rows of the requested direction are accepted;
- duplicate time intervals are kept once and disqualify COMPLETE coverage;
- a terminal is COMPLETE only when its intervals cover the exact KST day from
  00:00 to next-day 00:00 without gaps or overlaps;
- an all-airport total and peak require both T1 and T2 to be COMPLETE on the
  same interval grid;
- T1+T2 means the official T1 aggregate plus the official T2 aggregate only;
- PARTIAL never produces a confident all-airport total or peak;
- UNAVAILABLE never becomes zero.

The next arrival band is the first non-ended official band returned for the
current KST day. It is combined only when T1 and T2 contain the same interval;
otherwise the combined next-band value is absent. The in-progress official
hour is retained, matching the current summary's whole-band convention; the UI
prints the exact interval so the reader can see what the number covers. Past
and future selected dates do not receive a misleading "next" claim.

## API contract

The existing departure fields under `airport` remain unchanged. The additive
arrival block contains:

- `todayExpectedPassengersTotal`
- `todayExpectedPassengersByTerminal`
- `nextExpectedTimeBand`
- `peakExpectedTimeBand`
- `passengerForecastRetrievedAt`
- `forecastCoverage`

Whole-day fields are null when coverage is not COMPLETE. The block is present
with honest null/empty values in degraded responses so client rendering stays
defensive and stable.

## Seoul UI

Only `AreaLiveSignals` changes its airport portion. It removes these four
departure-oriented rows from Seoul signal lists:

- T1 current departure-hall wait
- T2 current departure-hall wait
- T1 next-band expected departures
- T2 next-band expected departures

It replaces them with at most three compact arrival rows:

1. today's expected arrivals, T1+T2;
2. next available expected-arrival band with exact KST interval;
3. today's expected-arrival peak with exact KST interval.

The terminal totals are optional secondary text and never visually dominate.
When coverage is PARTIAL, the confident daily total and peak rows are omitted;
the UI does not replace them with a partial sum or zero. When no safe arrival
metric exists, no arrival placeholder row is fabricated.

All four locales preserve forecast semantics and include official Incheon
Airport attribution plus a short statement equivalent to "leading reference
signal for Seoul consumer demand, not actual area visitors."

The Airport view, Airport SEO description and departure-specific detail copy
remain unchanged.

## Tests

TDD regression coverage will prove:

- arrival summarization accepts arrival aggregate rows and rejects departure
  rows and component rows;
- T1 and T2 official aggregates are combined once, with no component
  double-count;
- complete coverage yields the correct daily total and peak;
- the next non-ended matching T1/T2 band is correct;
- PARTIAL coverage hides confident whole-airport total and peak;
- mismatched terminal bands do not produce a combined next-band value;
- existing departure Airport summaries remain unchanged;
- the route still performs one A5 D1 statement and no provider call;
- the query stays bounded and the existing index remains usable;
- Seoul signal lists contain arrival forecast truth labels in four languages
  and no longer contain the four prominent departure rows;
- Airport detail still contains departure forecast and departure-hall copy;
- Demand Index inputs and weights do not change;
- production Cron count remains exactly five.

## Verification and stop gate

Before coding, run the existing Production read-budget measurement to record
the actual uncached baseline. GitHub authentication must be restored for the
production-environment workflow if no safe local credential is available.

Before PR creation run typecheck, lint, secret scan, unit tests, full tests,
build, applicable Playwright tests and the read-plan guard. No success claim is
made without fresh command output.

After green CI, merge and deploy PR 1 separately, then verify in Production:

- arrival rows exist for T1 and T2 official aggregates;
- daily total, next band and peak match the stored aggregate rows;
- no component or cross-direction double-count occurs;
- four locales render forecast wording;
- Airport departure UI remains intact;
- Edge Cache demonstrates MISS then HIT/body reuse;
- uncached summary rows read show no material regression and remain below the
  1,500-row investigation threshold;
- Production still has exactly five Cron expressions;
- Source Health remains truthful, including unchanged W1 last-good behavior.

If any of these checks fails, PR 1 stops for correction. Phase 2 design and
implementation do not begin until this Production gate passes.

## Out of scope

- OA-21285 commercial integration
- OA-22379 foreign-purpose mobility
- Demand Index scoring or weights
- W1 changes
- new D1 tables, indexes or historical raw ingestion
- any Airport departure-detail redesign
