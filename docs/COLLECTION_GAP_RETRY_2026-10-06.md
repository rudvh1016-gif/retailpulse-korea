# Collection gap retry handoff — 2026-10-06

Baseline: `ef0e98c79ab92bafe5418c8baea0e62329d0c126`. Scope is the existing
collector recovery paths. No scheduler, source, table, key, permission, paid
service, UI or METAR change. Merge/deployment belong to the integration owner.

## Existing attempts retained

| Service | Within one request | Later recovery | Bound / limitation |
| --- | --- | --- | --- |
| A4 T1 | Up to 4 attempts; 2 / 10 / 45 s waits, ≤500 ms jitter; 30 s timeout | One extra runner, one request, only this cycle's T1 connect-timeout failure; next normal cycle ~15 min later | 96 × (4+1) = 480/day; official dev quota 1,000/day |
| A4 T2 | Up to 3 attempts/page; 5 / 30 s waits, ≤500 ms jitter; 30 s timeout; ≤3 pages | One extra runner, one page/attempt, only this cycle's T2 connect-timeout failure | One-page dataset ceiling 384/day; structural ceiling 960/day including the extra request. Official account quota not verified from checkout |
| S1 Seoul | 2 attempts/failed area; 2 s + ≤500 ms jitter; 8 s timeout | Next normal ~15 min cycle; successful area calls are not repeated by the failed area's retry | Current code has **4 areas**, 384 typical / 768 worst-case requests/day. No verified official shared-key quota; these are internal estimates |
| A5 airport forecast | 2 attempts/page/day; 2 s + ≤500 ms jitter; 30 s timeout; ≤3 pages/day | Existing max 3 jobs/window, now ≥10 s between retry jobs; :53 recovery reads D1 first, skips healthy days and asks only for missing coverage | Extra jobs only after ERROR with classified network/timeout/5xx failures. PARTIAL belongs to targeted :53 recovery. No added attempts |
| W1 KMA | Existing 3 attempts/grid; 5 / 30 s waits, ≤500 ms jitter; 10 s timeout | Existing :25/:40 recovery skips grids already stored for the expected issuance | Current code has 4 grids, ≤3 jobs/recovery window. Policy/issuance/scheduler unchanged |

A1's existing recent D-3..today scan and 300+200 daily request ceilings,
A2/A3/TourAPI's existing four-attempt policy, and dated/quarterly services are
unchanged. No repeated stability audit or authenticated provider probe was run.

## Minimal corrections

- A4 T1 no longer calls a successful **empty** response SUCCESS/LIVE. T1/T2
  distinguish `NO_DATA` from malformed envelope/row `SCHEMA`; both retain an
  unsuccessful run, preserve last-good rows/timestamps, and spend no parser retry.
  An absent/non-operating gate is never filled with a zero row.
- A4 details include `requestedAt` so a failed collection window can be compared
  with the preserved `source_health.last_event_at`. S1 transport failures also
  include each area's request time. These identify failed collection times,
  not the precise source observation that might have existed while unreachable.
- S1 distinguishes an empty population list from a malformed list. S1/A5 retain
  two attempts but space their short retry by 2 seconds rather than 250/500 ms.
  A5 also separates empty day data from malformed envelopes so a mixed empty/
  transient failure cannot cause both days to be blindly re-requested.
- The shared HTTP helper stops the current request when a provider's Retry-After
  exceeds its wait budget, instead of truncating a longer cooldown to 60 seconds.
  A5 fresh-runner jobs do not bypass this deferral or HTTP 429. This is a
  per-request/run policy; a provider cooldown across separate scheduled runs
  is not a persisted global rate-limit ledger.
- The existing A5 job ladder now reads its own source result. Authentication,
  permanent 4xx, malformed JSON/schema/validation, empty data, missing logs and
  already-successful results cannot spend a fresh runner. Initial failed jobs
  retain their failed conclusion even if a later job recovers.
- Existing `ON CONFLICT ... DO NOTHING` for A4 observations and semantic
  changed-only forecast writes are reused. No historical row deletion or
  overwrite policy was introduced.

## What recovery can actually retrieve

- [Seoul OA-21285 official FAQ](https://data.seoul.go.kr/dataList/OA-21285/A/1/datasetView.do)
  explicitly says past real-time data cannot be provided. S1 recovery gets the
  provider's later current observation with its real PPLTN/CMRCL timestamp.
- [A4 T1 official dataset](https://www.data.go.kr/data/15148225/openapi.do)
  is real-time and lists the 1,000 dev traffic allowance. The existing verified
  T1/T2 request contracts expose terminal/gate/pagination, no historical-time
  selector. T2 may return the latest available observation, not the requested
  past minute (see `DATA_SOURCES.md`, A4-T2 contract). Historical-time recovery
  is **not supported by these contracts**.
- A5's owner-verified V5.0 contract allows `selectdate=0/1` only. Recovery can
  obtain the currently published today/tomorrow forecast; it cannot recover a
  past forecast revision. Stored old target dates remain preserved.
- W1 selects forecast issuance using `base_date/base_time`; existing recovery
  repairs missing grids of the expected issuance, not past observed weather.

The reported 16:40–17:20 observation gap is 40 minutes. The existing chart
breaks lines across gaps exceeding 30 minutes, and that rule is unchanged.
Provider omission versus collection failure during this specific interval is
**unconfirmed**. A later current value must never be inserted at a missing
past timestamp. Retrying cannot be claimed to reconstruct data the provider
does not supply.

The delegation reports recent recovery evidence: realtime run `37472255285`
collected T1/T2/Seoul 12/8/56 records, and forecast run `37458140836` recovered
48 rows with complete Oct 6–7 coverage in the same run. These are supplied
incident context, not a new production verification performed here. Failure
email/run conclusion alone cannot prove the entire collection round stopped.

## Verification and integration

Fixture tests cover transient recovery/exhaustion, numeric/date Retry-After,
long-cooldown deferral, auth/schema/empty-data discrimination, selective A4/A5
job decisions, zero-call healthy A5/W1 recovery, request ceilings, append-only
A4 timestamps, no duplicate observation and no fabricated 40-minute backfill.
Actual commands/results and exact pushed head are recorded in the draft PR.

Shared collector files touched: `lib/collector.ts`, `lib/source-adapters.ts`,
`lib/congestion-retry.ts`, `scripts/decide-congestion-retry.ts`, and the shared
`collect-attempt.yml`. Integration must compare those paths with concurrent
UI/METAR work. Production effect remains pending merge, main CI and deployment.
