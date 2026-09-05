# Operational context and prospective population forecast

Baseline main: 865c6411dfa25208a739b7a60885df5b8d356200 (PR141).
Scope authorized: category activity, airline/country comparisons, holidays, environment,
a separate prediction surface, history integrity. Store sales/POS excluded.

## Pre-implementation decision

Reuse integrated Seoul payload (zero additional provider calls). Keep heavy work in
existing Actions collection runner. Worker serves bounded precomputed records only.
Existing trigger-only Cron is authoritative; AGENTS/CLAUDE's old disabled-scheduler
note predates ENGINEERING_DIRECTION's explicit trigger-only exception. No new Cron.

Start an interpretable same-weekday population baseline, not a sales model. Predict
next-day hourly snapshot midpoint only with at least two valid same-weekday hourly
observations from preceding four weeks, ingestion before cutoff, and recent data.
Snapshot midpoint is estimated people present, never cumulative visitors. Published
status remains PRELIMINARY; no accuracy percentage or calibrated confidence interval.
Inputs and prediction are immutable; later exact-time outcome is separate. Missing
hours stay missing. Holiday/weather are explanatory context, not invented causal effects.

## Bounded resource model (INTERNAL_ESTIMATE, not account usage)

- Seoul: unchanged 3 requests/run, 96 runs/day; same 288 typical/576 retry ceiling.
- Context: one compact current row per area; changed-only, no repeated raw payloads.
- Forecast: <=72 predictions/day (3 areas x24 hours); one daily creation key and
  matching outcome key. <=2,160 predictions/month,26,280/year,78,840/3years.
  Budget 2KB/prediction with feature evidence: ~53MB/year,158MB/3years before indexes.
- A5: preserve changed aggregate versions only, not raw zone payload duplicates.
  Integrity archive must not be deleted to save space. Storage growth is monitored;
  70/85/95 thresholds require measured usage, not these assumptions.
- Holiday: one month response for current+next month on first run; refresh daily;
  <=4 requests/day with one retry. Failures preserve last-good rows.
- New prediction page: one read request, bounded indexed queries; no upstream call.
  Additional requests for100/500/1k/5k/10k/20k daily prediction-page visitors:
  100/500/1000/5000/10000/20000. These do not prove total-site free-tier safety.

## Activation evidence to append

Parser, cutoff/leakage, duplicate runs, DB immutability, missing/error UI and query
plans must pass locally; required CI then standard Deploy Cloudflare and production
checks. Cloudflare actual account usage/CPU/restore verification remains UNVERIFIED
until evidence obtained. Migration is additive; rollback application leaves archives.

Official references checked Sept5:
- https://data.seoul.go.kr/dataList/OA-21285/A/1/datasetView.do (KOGL1)
- https://www.data.go.kr/data/15012690/openapi.do (free/unrestricted;10k/day)
- https://developers.cloudflare.com/d1/platform/limits/ (Free500MB/database)
- https://developers.cloudflare.com/d1/reference/time-travel/ (Free7-day recovery;
  this describes product capability, not a completed restore test).

## Scoped gate evidence before PR

| Audit items | Result / evidence |
|---|---|
|1 latest main, clean base|PASS actual GitHub main865c641; original4faf6a6 untouched|
|2–3 architecture/duplicate schedulers|PASS existing Actions only; no new Cron|
|4 Worker CPU|UNVERIFIED real measurement; no new heavy request compute|
|5 heavy Cron|N/A no heavy Cron added|
|6 request boundary|PASS one optional prediction API; context joins existing summary batch|
|7–8 retries/concurrency|PASS existing concurrency; insert-only keys, focused duplicate-run test|
|9 provider quota|Seoul unchanged; holiday <=4/day; actual entitlement pending|
|10–11 writes/indexes|Compact coverage3rows/hour; forecasts<=72/day; selective indexes|
|12–14 semantic/idempotent/race|PASS stable hashes; inputs/baseline tied to winning input hash|
|15–17 history/storage|90d context; immutable forecast/input/outcome/A5 changes; no raw dumps|
|18 immutability|PASS SQLite rejects prediction/input/A5 archive UPDATE/DELETE|
|19–21 outcome/cutoff/times|PASS exact version/hour definition and cutoff tests; no backfill inputs|
|22 states|COLLECTING/PRELIMINARY vs unavailable, separate official forecast labels|
|23 provider retry|Existing bounded fetch helper; no auth retry loop|
|24 secrets|Local scan passed; CI repeats; content-free failure codes|
|25 read efficiency|PASS population range EXPLAIN indexed; summary one batch remains|
|26–27 usage/guardrails|Account usage UNVERIFIED; no claim current utilization/safety|
|28 billing|PASS no paid source/runtime/storage added|
|29 rollback|Additive schema; pre-migration Time Travel bookmark check; restore not tested|
|30 real end-to-end|PENDING PR/deploy/actual collection; never inferred from fixtures|

Top risks: holiday entitlement; source field suppression; provider delay; incomplete
weekday hours; missing past whole-scan proof; long-term archive growth; Actions
delay; actual Free usage unknown; Time Travel only7days; forecast model does not
account for causal weather/event/holiday effects. Each stays explicit rather than
being presented as zero/accurate/complete.

Updated per-request model: prediction API reads two point records plus <=168
prediction/outcome rows, independent of total raw history. Hourly coverage is
precomputed by Actions (3*24*~2688 = ~193536 typical raw-row reads/day).
At100/500/1000/5000/10000/20000 uncached prediction-page views, internal upper
row-return estimates are17000/85000/170000/850000/1700000/3400000 (index lookup
reads add overhead). Shared120s cache may lower this; other site traffic and
collectors still count. No total-site traffic safety claim.

A5 archive holds aggregate semantic changes, not repeated raw payloads; volume
must be measured after activation. A2/day under source revision is not predictable
from a simple constant. Keep this as UNVERIFIED instead of fabricating a 3-year
forecast. Context90days at288records/day and2KB/record estimates52MB beforeindexes;
this combines with forecast~53MB/year and existing data, so500MB is not unlimited.
