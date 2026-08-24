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
