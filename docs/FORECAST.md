# Forecast Contract

## Active target registry

| Target | Unit/grain | Outcome readiness | Public accuracy |
|---|---|---|---|
| `AREA_ACTIVITY` | area × time, activity index | Possible from stored Seoul snapshots | COLLECTING until enough prospective dates |
| `FOREIGN_PRESENCE` | area × time, people/index | Possible with delayed official source and stable mapping | COLLECTING |
| `FOREIGN_SHOPPING_MOVEMENT` | area × period, movement count/index | Research/deep outcome only | INACTIVE |
| `FOREIGN_RETAIL_PROXY` | area × industry × day, versioned proxy | No direct sales actual | Proxy validation only; never sales accuracy |

## Immutable prediction

Every row stores `predictionId`, `createdAt`, `targetAt`, `dataCutoff`, target, area, optional industry, value, class, confidence, model/proxy/feature versions, source versions, input hash, prediction hash and `recordOrigin=FORECAST`. Prediction rows are insert-only. Any correction creates a new model/version and a new prediction.

## Baselines

Start with same weekday, four-week average and seasonal naive. Comparisons are allowed only when target, unit, area grain, time grain and outcome source match. An official forecast used as a model feature cannot simultaneously be called an independent benchmark.

## Cutoff and leakage

Only records whose `availableAt <= dataCutoff` may become features. Event time alone is insufficient. Backfilled records never count as prospective evidence. The daily D+1 cutoff will be fixed only after P0 publication schedules are measured; changing it after seeing results requires a new contract version.

Good/Fair/Miss thresholds remain BLOCKED until a sufficient prospective error distribution exists. No numeric accuracy claim is allowed before the existing minimum unique-date and continuity gates are met.

## Population reference v1 (2026-09-05)

Separate `/ko/predictions` (also en/zh/ja). No store/POS/sales target.
`AREA_ACTIVITY` with `proxyVersion=population-midpoint-people-v1` means the
midpoint of the provider's estimated people-present range, in people. Do not mix
with the older abstract activity-index contract. Hour grain is first VALID LIVE
observation from minute00 through14 of the target KST hour. Inputs and outcomes
use this identical definition; versions must match.

Existing realtime Actions creates next-day hours after18KST, once per area/day.
Each hour needs >=2 same-weekday dates from prior28days; use all available matched
weeks, expose their dates. Unobserved hours stay absent. No weather/event/holiday
uplift or calibrated interval is invented. All own estimates remain PRELIMINARY
(no accuracy promotion implemented). Official Seoul predictions are independently
labelled and do not enter baseline inputs.

`prediction_inputs` retains exact normalized observations/hashes used at cutoff.
Prediction and inputs are insert-only; duplicated runs cannot replace either.
Later observations enter `outcomes` separately; only previous completed days,
matching source/schema/hour unit. Public recent-history list is bounded7days/168hours.
The historical mean baseline is the current model; do not claim it beats itself.
A separately stored SAME_WEEKDAY baseline exists only when the immediately prior
week is actually present.
