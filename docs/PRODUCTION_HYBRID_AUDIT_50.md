# RPK Production Zero-Cost Hybrid — 50-Gate Audit

**Audit date:** 2026-08-26 KST  
**Start GitHub HEAD:** `f41b4ea4bd1c53fb2e24aff3e22044454fa8c2e4`  
**Scope:** local/code evidence plus current official provider documentation. Cloudflare account, Production D1, API key, final domain and true source-to-UI run are not available in this environment.

`PASS` means the named code/document/local-test obligation has evidence. It does not imply Cloudflare Production is live. `BLOCKED` is used whenever a real provider account or measured Production run is required.

## Current official limits used for planning

- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/): Free 100,000 requests/day, 10 ms CPU per HTTP/Cron invocation, 50 external subrequests, 1,000 Cloudflare-service subrequests and 5 Cron Triggers/account. Worker requests reset at 00:00 UTC.
- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [limits](https://developers.cloudflare.com/d1/platform/limits/): Free 5,000,000 rows read/day, 100,000 rows written/day, 500 MB/database, 5 GB/account, 10 databases/account, 7-day Time Travel. Index writes/storage count. Free daily limits reset at 00:00 UTC and excess queries fail rather than becoming paid automatically.
- [GitHub Actions billing](https://docs.github.com/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions): standard GitHub-hosted runners are free for public repositories; larger runners are not. The workflow uploads no artifacts. `setup-node` dependency cache remains subject to GitHub's default 10 GB repository cache policy.
- [GitHub scheduled workflow behavior](https://docs.github.com/actions/reference/workflows-and-actions/events-that-trigger-workflows): schedule runs can be delayed/dropped at high load and public-repository schedules can be disabled after 60 days without activity.
- [Incheon detailed flight API](https://www.data.go.kr/data/15140153/openapi.do): free, unrestricted reuse scope shown on the listing, development quota 500 calls/day, operations increase by reviewed application. RPK's disabled-by-default two-hour schedule is 12 calls/day normally and at most 24 with one retry per run.

## Architecture decision

```text
Official source -> GitHub Actions (fetch/validate/normalize/hash)
                -> Cloudflare D1 REST query API (D1 Write token, batched)
                -> D1 canonical current state
                -> Cloudflare Worker static delivery + small read APIs
```

The Worker Free CPU budget is too small to assume that 1,000-record parsing/hashing belongs in Worker Cron. Direct D1 REST keeps heavy work off the Worker and uses a D1-write-only token in a protected GitHub environment. Cloudflare describes REST as control-plane oriented and subject to the global API rate limit, so this is acceptable only at the current 12 runs/day and must be revisited if cadence grows. An ingest Worker was rejected for P0 because large-payload validation has not been shown to fit 10 ms CPU. `wrangler d1 execute --remote` also uses REST and adds CLI/file orchestration without removing that risk.

## 50 independent gates

| # | Gate | Status | Evidence |
|---:|---|---|---|
| 01 | Actual Git HEAD | PASS | GitHub `main` fetched; reference SHA equals actual HEAD. Work started on `codex/zero-cost-hybrid-audit`. |
| 02 | Multi-agent conflict | PASS | Sites-local divergent main preserved; no reset/force push. Final upstream fetch is mandatory before push. |
| 03 | Document contradictions | PASS | Shared docs describe the same disabled-by-default Hybrid scheduler. |
| 04 | Docs vs code | PASS | Actions collector exists; heavy Worker scheduled handler and Cron trigger removed. |
| 05 | Worker Cron | PASS | `*/30 * * * *` removed from `wrangler.production.jsonc`. |
| 06 | Duplicate scheduler | PASS | Only `collect-production.yml` can schedule P0; gated by `ENABLE_PRODUCTION_COLLECTOR`. |
| 07 | Actions reliability | PASS | Off-minute two-hour schedule; delay/drop/60-day risk documented; actual retrieval time recorded. |
| 08 | Actions recovery | PASS | `workflow_dispatch` uses the same idempotent path. |
| 09 | Actions concurrency | PASS | One non-cancelling `production-collector` group serializes runs. |
| 10 | Actions cost/storage | PASS | Standard `ubuntu-latest`, no larger runner or artifact upload; npm cache only. |
| 11 | Actions to D1 method | PASS | Parameterized D1 REST batch adapter; 50-statement bound and retry. |
| 12 | Token permissions | PASS | Dedicated `CLOUDFLARE_D1_WRITE_TOKEN`; no Global API Key/frontend use. |
| 13 | Worker HTTP CPU | BLOCKED | Only real Cloudflare production-shaped CPU metrics can prove 10 ms margin. |
| 14 | Worker Cron CPU | PASS | No Production Worker Cron is enabled. |
| 15 | Worker requests/user | BLOCKED | Scenarios exist below; real Cloudflare request telemetry is absent. |
| 16 | Static/dynamic boundary | PASS | Static assets binding retained; collectors are absent from visitor requests. |
| 17 | Cache | PASS | Source-health response uses 30s cache + 120s stale revalidation; health is no-store. |
| 18 | D1 reads | PASS | Local query plans use unique indexes; read APIs scan only small `source_health`. |
| 19 | D1 indexes | PASS | One semantic lookup index per table; trade-off model below. |
| 20 | Index amplification measurement | BLOCKED | Conservative model exists; real D1 `meta.rows_written` unavailable. |
| 21 | Blind D1 writes | PASS | Conditional UPSERT writes current flight only when hash differs. |
| 22 | Changed-only hash | PASS | Canonical semantic field hash implemented/tested. |
| 23 | Volatile hash bug | PASS | Retrieval/run/retry/unknown fields excluded; test proves write 0. |
| 24 | Meaningful change definition | PASS | Flight, direction, airline/airport, terminal, gate, check-in, status and schedule/change times are versioned. |
| 25 | Conditional write | PASS | DB-side conditional UPSERT + batch; no per-row SELECT loop. |
| 26 | Idempotency | PASS | Same payload twice produces zero semantic writes on run two. |
| 27 | Concurrency race | PASS | Overlapping local runs leave one current row/version; Actions serializes runs. |
| 28 | Atomicity | PASS | Each bounded D1 batch is transactional; cross-batch partial success remains visible in run status. |
| 29 | CURRENT | PASS | `airport_flights` is canonical current state. |
| 30 | CHANGE_HISTORY | PASS | `airport_flight_changes` stores semantic versions and is separately opt-in. |
| 31 | Raw payload | PASS | No full upstream payload is persisted. |
| 32 | Retention | PASS | CURRENT current-only; change history 30d; collector runs 90d; predictions/outcomes long-term; bounded deletes. |
| 33 | Storage growth | PASS | 30d/90d/1y/3y estimates below. |
| 34 | D1 hard limit | PASS | Model shows unsafe history case; history defaults off until measured. |
| 35 | Official D1 usage | BLOCKED | Dashboard/GraphQL/real query metrics require owner Cloudflare account. |
| 36 | Usage truth | PASS | Contract distinguishes `OFFICIAL_USAGE`/`INTERNAL_ESTIMATE`. |
| 37 | 70% NOTICE | PASS | Warning without stopping critical writes. |
| 38 | 85% PROTECT | PASS | Optional writes/backfill disabled; ledger protected. |
| 39 | 95% EMERGENCY | PASS | Noncritical pause/degraded truth required. |
| 40 | External API quota | PASS | 12 normal / 24 retry calls/day below published 500 development quota. |
| 41 | External terms | PASS | Only verified Incheon source wired; others disabled/conditional. |
| 42 | Retry storm | PASS | One source retry/two D1 retries with bounded backoff; matrix tests pass. |
| 43 | Schema drift | PASS | Required-field failure and PARTIAL terminal/N/A behavior tested. |
| 44 | Secrets | PASS | History/working-tree scan, URL redaction and D1 error-redaction pass. |
| 45 | Staging SEO | PASS | Noindex header/metadata, disallow-all robots and empty sitemap. |
| 46 | Final domain SEO | BLOCKED | No `.com`, DNS, HTTPS, apex/www redirect or final curl. |
| 47 | Prediction/outcome integrity | PASS | Prediction UPDATE/DELETE blocked; outcomes separate; backfill excluded. |
| 48 | Time/baseline integrity | PASS | Time boundaries/exact-target tests pass. |
| 49 | Regression/rollback | PASS | Build/render/4-locale/mobile tests are gates; Cron removal is reversible without data migration. |
| 50 | True E2E | BLOCKED | Key + Cloudflare + Production D1 + deployed Worker + elapsed outcome absent. Fixtures are not true E2E. |

**Result:** 44 PASS / 0 FAIL / 6 BLOCKED. “Production ready” is not supported until the blocked gates are resolved.

### Cloudflare environment bridge review — 2026-08-26 KST

The deploy workflow previously accepted `staging`/`production` but invoked the same default Wrangler deployment for both. The environment bridge now selects matching Vite and Wrangler named environments, assigns distinct Worker/database names, and refuses unresolved D1 placeholder IDs. Production Worker Cron and the disabled-by-default collector policy are unchanged.

This configuration correction does **not** change the audit total. Gates 13, 15, 20, 35, 46 and 50 remain BLOCKED until actual Cloudflare/D1/domain/source evidence exists.

## Traffic model — assumptions, not measurements

`Best=1`, `Expected=5`, `Worst=20` dynamic Worker requests/user. Expected LIVE reads are 4 rows/user; worst is 80 rows/user.

| Visitors/day | Worker req best | Expected | Worst | D1 rows expected | D1 rows worst |
|---:|---:|---:|---:|---:|---:|
| 100 | 100 | 500 | 2,000 | 400 | 8,000 |
| 500 | 500 | 2,500 | 10,000 | 2,000 | 40,000 |
| 1,000 | 1,000 | 5,000 | 20,000 | 4,000 | 80,000 |
| 5,000 | 5,000 | 25,000 | 100,000 | 20,000 | 400,000 |
| 10,000 | 10,000 | 50,000 | 200,000 | 40,000 | 800,000 |
| 20,000 | 20,000 | 100,000 | 400,000 | 80,000 | 1,600,000 |

At 20 requests/user, 5,000 visitors reaches the entire Worker request allowance. At 5 requests/user, 20,000 reaches it. No visitor capacity is proven without telemetry. D1 reads are not the first modeled bottleneck, but an accidental full scan changes that.

## D1 writes — independent of visitors

Assumptions: 12 polls/day, at most 1,000 records/poll, conservative indexed-write amplification, five operational rows/run buffer. Change history defaults off.

| Scenario | Semantic change | History off writes/day | History on before retention deletes |
|---|---:|---:|---:|
| Best steady | 0% | ~60 | ~60 |
| Expected | 10% | ~1,260 | ~4,860 |
| Worst page | 100% | ~36,060 | ~72,060 |

Retention deletion adds writes. Real D1 `meta.rows_written` is required before `RPK_RETAIN_FLIGHT_CHANGE_HISTORY=true`.

## Storage model (`INTERNAL_ESTIMATE`)

Assumptions: 12 MB reserve for current tables/indexes; 90 forecast/outcome/baseline rows/day at 1 KB; expected history 1,200 rows/day at 0.8 KB; history retained 30d.

| Horizon | History off | Expected history on | Unbounded worst warning |
|---|---:|---:|---:|
| 30 days | ~15 MB | ~44 MB | ~288 MB history alone |
| 90 days | ~21 MB | ~50 MB | ~864 MB — exceeds 500 MB |
| 1 year | ~45 MB | ~74 MB | unsafe |
| 3 years | ~111 MB | ~140 MB | unsafe |

Worst-case history cannot be kept on D1 Free. Disable it, reduce scope or aggregate before considering Paid; never delete predictions/outcomes to make room.

## Top ten remaining risks

1. No real Cloudflare CPU/request/D1 metrics.
2. No Production D1; REST compatibility/index amplification unproven remotely.
3. GitHub schedules can delay/drop/disable after inactivity.
4. Direct D1 REST uses the global API control plane.
5. Collector is departure-only; arrival/other sources remain disabled.
6. Real approved-key response contract is untested.
7. Change history can exceed 500 MB if enabled carelessly.
8. A 20-request/user path exhausts Worker requests at 5,000 visitors/day.
9. Final `.com` and signed-out production behavior are untested.
10. No prospective forecasts/outcomes exist; accuracy is unknown.
