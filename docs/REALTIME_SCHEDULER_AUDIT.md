# REALTIME Scheduler Migration Audit (A4-T1 / A4-T2 / S1)

**Status:** Benchmark gate **FAIL** — Worker Cron *execution* of the realtime collectors is **rejected** and stays rejected. The **trigger-only** alternative (§6) was built, benchmarked separately, and **activated** on owner approval.
**Worker Cron:** **ACTIVE, trigger-only** — `7,22,37,52 * * * *` on `retailpulse-korea-production`; it dispatches `collect-realtime.yml` and does nothing else.
**GitHub REALTIME schedule:** **REMOVED** at activation; `workflow_dispatch` retained so the Cron can start it. GitHub Actions still performs all collection.
**Measured:** 2026-08-31 KST, against `085338d`. **Activated:** 2026-08-31 KST.

Owner approval originally covered investigation, measurement and preparation only; the benchmark result permanently rejects running collectors inside Worker Cron. Activation approval, granted separately, applies **only** to the trigger-only architecture in §6 — never to Cron-executed collection.

## 1. Why the migration was investigated

GitHub Actions is not globally broken — the daily and hourly groups do fire. The **high-frequency** realtime schedule is the problem.

`collect-realtime.yml` runs `cron: "7,22,37,52 * * * *"` (4/hour). Observed `event=schedule` delivery:

| group | cadence | expected | delivered | rate |
| --- | --- | --- | --- | --- |
| REALTIME | 4/hour | ~34 | 3 | **~9%** |
| A5 forecast | 1/hour | 6 | 2 | 33% |
| DAILY | 1/day | 1 | 1 | 100% (+2h17m late) |

Delivery degrades sharply as frequency rises. After run `33344541618` (00:25:38Z) the `00:37`, `00:52`, `01:07` and `01:22` slots never produced a run — four consecutive misses. This matches Cloudflare-independent GitHub behaviour already documented in `docs/ZERO_COST_HYBRID_AUDIT.md` §B: scheduled jobs "can be delayed during high load" and "queued jobs can be dropped".

**A later successful realtime run would not close this gap.** Collector health and schedule delivery are separate problems.

## 2. Free-tier CPU benchmark — the blocking result

**OFFICIAL LIMIT** (Cloudflare Workers Free, `docs/ZERO_COST_HYBRID_AUDIT.md` §B): **10 ms CPU per Cron Trigger invocation**, 50 external subrequests per invocation.

**MEASURED_LOCAL** — `scripts/benchmark-realtime-collectors.ts` runs the *actual* production collectors (`collectAirportCongestion`, `collectAirportCongestionT2`, `collectSeoulRealtime`) against production-shaped fixtures with a counting no-op D1. Zero provider calls, zero D1 writes. CPU via `process.cpuUsage()` (user+system), 12 iterations:

| | CPU | % of 10 ms budget |
| --- | --- | --- |
| cold (first iteration) | **142.7 ms** | 1,427% |
| warm median | **41.4 ms** | **414%** |
| warm min / max | 35.1 / 52.7 ms | 351% / 527% |

Per source, warm median: A4-T1 9.7 ms, A4-T2 12.6 ms, S1 16.1 ms.

### Root cause: changed-only integrity hashing

`lib/hash.ts` `sha256()` costs **117.8 µs** per call (measured, 370 calls warm). Each canonical row needs two digests (row id + `sourceHash`):

| source | rows/run | digests | hash CPU | % of budget |
| --- | --- | --- | --- | --- |
| A4-T1 | 50 | 100 | 11.8 ms | **118%** |
| A4-T2 | 60 | 120 | 14.1 ms | **141%** |
| S1 | 75 | 150 | 17.7 ms | **177%** |
| **total** | **185** | **370** | **43.6 ms** | **436%** |

Hashing alone accounts for essentially the entire measured warm cost.

**Every single source individually exceeds the 10 ms budget.** Splitting into three separate Cron Triggers therefore does not help either. The hashing is not incidental overhead — `docs/ZERO_COST_HYBRID_AUDIT.md` §F requires semantic change detection, so it cannot simply be removed.

**Verdict: FAIL.** The margin is ~4× on the most favourable (warm, single-runtime) reading, and >1× even for one isolated source.

### Measurement class honesty

This is Node CPU on a GitHub-hosted runner, labelled `MEASURED_LOCAL`. True Cloudflare Worker CPU accounting remains **BLOCKED**: `api.cloudflare.com` is unreachable from the audit environment, so no benchmark Worker could be deployed and no Cloudflare telemetry read. The conclusion does not depend on closing that gap — a 4× overrun is far outside any plausible runtime difference, and the per-source table shows the budget is exceeded even in isolation.

## 3. Runtime compatibility (informational — not the blocker)

The realtime collector graph is Worker-compatible on inspection: no `node:` imports and no `process.env` in `lib/collector.ts`, `lib/source-adapters.ts`, `lib/areas.ts`, `lib/hash.ts`, `lib/d1-write-counts.ts` or `lib/data-go-kr.mjs`. It uses only `fetch`, `crypto.subtle`, `crypto.randomUUID` and `TextEncoder`. Compatibility was never the obstacle; CPU is.

## 4. Provider call volume (recalculated from code)

At the unchanged 15-minute cadence, 96 executions/day:

| source | requests/run | requests/day | note |
| --- | --- | --- | --- |
| A4-T1 | 1 | 96 | one `terminalId=P01` request, `numOfRows=50` |
| A4-T2 | up to 3 | up to 288 | `A4_T2_PAGE_SIZE=20`, `A4_T2_MAX_PAGES=3`, stops early when a page is short |
| S1 | 3 | 288 | one per target area, `retries: 1` → up to 576 worst case |

Worst case ≈ 960/day; typical ≈ 480/day. **Cadence must not increase.** External subrequests per invocation (7 measured) stay far below the 50 limit, so subrequests are not a constraint.

## 5. D1 write model — now MEASURED, not estimated

PR #47 separated `changedRows` (SQLite `changes()`) from `storageWrites` (D1 `rows_written`, which includes index writes). Two Production runs then validated the amplification model exactly:

| table | indexes + PK | predicted writes/row | measured | source |
| --- | --- | --- | --- | --- |
| `airport_passenger_forecast` | 2 + PK | 4 | **4.0** (3312/828) | A5 run `33344958504` |
| `weather_forecast` | 1 + PK | 3 | **3.0** (369/123) | W1 run `33347340557` |

This resolves audit gate 20 (index amplification), previously `BLOCKED`.

Realtime group worst case (every row changes on every run), 96 runs/day:

| source | table writes/row | rows/run | storage writes/day |
| --- | --- | --- | --- |
| A4-T1 | 3 | 50 | 14,400 |
| A4-T2 | 3 | 60 | 17,280 |
| S1 | 3 | 75 | 21,600 |
| **total** | | | **≈ 53,280** |

Against the D1 Free limit of 100,000 rows written/day that is **~53% from the realtime group alone**, before the daily group and A5. This is a worst case: changed-only suppression means unchanged observations write nothing. It is nevertheless a real 70%-NOTICE-band risk that argues against raising cadence under any scheduler.

## 6. Conclusion and the safest zero-paid-runtime alternative

The Worker Cron implementation path is **stopped** per `docs/ZERO_COST_HYBRID_AUDIT.md` §I and the task's own fail-path rule. No paid tier is proposed.

**Proposed alternative — Worker Cron as a trigger only, not an executor.**

A Cron Trigger whose handler makes exactly one `fetch` to the GitHub API to dispatch `collect-realtime.yml`, doing no parsing, no hashing and no D1 work. Heavy work stays in Actions, satisfying §A.1 and §A.2.

- CPU: one fetch and a small JSON body — `INTERNAL_ESTIMATE` well under 1 ms, but this **must get its own benchmark** before activation; it is not measured yet.
- Worker requests: 96/day against 100,000/day.
- Duplicate-scheduler safety: at activation the `schedule:` block is removed from `collect-realtime.yml` in the same change, leaving Cloudflare as the sole authoritative scheduler.
- Secret: a fine-grained GitHub token limited to this repository with `actions: write`, stored as a Worker secret. The exact owner action would be documented at that time; no value is ever printed, pasted or committed.
- Caveat: dispatched runs carry `event=workflow_dispatch`, not `event=schedule`, so the `VERIFIED_AUTO_SUCCESS` definition in the status model would need restating for the realtime group.
- Rollback: delete the Cron Trigger and restore the `schedule:` block. No schema change, so no data rollback.

This alternative was subsequently **approved for implementation and built** — see §8. Activation still requires separate owner approval.

## 7. Current state

| item | state |
| --- | --- |
| Worker Cron | **ACTIVE, trigger-only** — exactly one Cron `7,22,37,52 * * * *` under `env.production` in `wrangler.production.jsonc`; staging and the default environment stay Cron-free |
| Worker Cron work performed | one authenticated GitHub `workflow_dispatch` call; **no** provider call, parsing, normalization, hashing, D1 read or D1 write |
| GitHub REALTIME cron | **OFF** — the `schedule:` block was removed at activation so only one scheduler is ever authoritative |
| GitHub REALTIME `workflow_dispatch` | **ON** — this is how the Cloudflare Cron starts the run |
| Collection engine | unchanged: GitHub Actions runs the same A4-T1/A4-T2/S1 collectors, hashing and changed-only D1 writes |
| A4-T1 collector | runtime healthy; last natural attempt ERROR `NETWORK_UND_ERR_CONNECT_TIMEOUT` during the 22:42–00:26Z outage |
| A4-T2 collector | runtime healthy; same outage; no successful run yet (`last_retrieved_at` null) |
| S1 collector | **VERIFIED_AUTO_SUCCESS** — `areas ok 3/3; changed writes 117` on run `33344541618` |
| A1/A2/A3/A5/S2/S3/W1/T1 | unchanged, remain GitHub Actions collectors |

Guardrails asserting this state live in `tests/hybrid.test.ts`.

## 8. Trigger-only implementation (built, benchmarked, NOT activated)

The owner approved implementing the §6 alternative. It is merged and inert.

### Design

```
Cloudflare Cron (NOT configured)
  -> one authenticated GitHub API request
  -> dispatch collect-realtime.yml on main
  -> GitHub Actions runs the unchanged A4-T1 / A4-T2 / S1 collectors
  -> unchanged normalization, hashing, changed-only D1 persistence
```

`lib/realtime-dispatch.ts` performs no provider call, no parsing, no
normalization, no hashing and no D1 read or write. `worker/index.ts` exposes
`scheduled()`, which is unreachable while no Cron Trigger exists.

### CPU benchmark — PASS (local)

`scripts/benchmark-realtime-dispatch.ts`, 200 iterations after 20 warm-ups,
`fetch` stubbed (zero GitHub calls, zero provider calls). Path measured:
request construction, authorization header, single fetch dispatch, response
handling. Collectors excluded by construction.

| | CPU/invocation | % of 10 ms Cron budget |
| --- | --- | --- |
| median | **0.015 ms** | 0.15% |
| p95 | **0.030 ms** | 0.30% |
| max | 0.077 ms | 0.77% |

Headroom at p95: **9.97 ms**. Compare the rejected design at 41.4 ms (414%).

**Measurement class: `MEASURED_LOCAL`.** True Cloudflare Worker CPU stays
**BLOCKED** — `api.cloudflare.com` is unreachable from the audit environment,
so no Worker could be deployed or metered. The margin is ~330x, so the
verdict does not hinge on that gap, but it must not be reported as
`MEASURED_CLOUDFLARE`.

### Call model

| metric | value |
| --- | --- |
| external subrequests / invocation | 1 (limit 50) |
| Worker Cron invocations / day | 96 (limit 100,000 requests/day) |
| GitHub dispatches / day | 96 |
| worst case GitHub requests / day | 192 (one bounded retry) |
| provider calls made by the Worker | **0** |
| D1 reads/writes made by the Worker | **0** |

Provider quota is untouched: the Actions run makes exactly the same calls it
makes today, at the same unchanged cadence.

### Failure handling

| condition | outcome | retried |
| --- | --- | --- |
| 204 | `dispatch_success` | — |
| 401 / 403 | `dispatch_auth_failed` | **no** |
| 404 | `dispatch_not_found` | **no** |
| 422 | `dispatch_invalid_request` | **no** |
| 429 | `dispatch_rate_limited` | **no** — adding load to a rate-limited endpoint is wrong |
| 5xx | `dispatch_upstream_error` | once |
| network / timeout | `dispatch_network_error` | once |
| secret absent | `dispatch_missing_token` | no request at all |

The handler returns a log record rather than throwing, so no path can leak
the token through an error message. The record carries only
`event`, `workflow`, `ref`, `status`, `attempts`, `at` — never a header,
token or authenticated URL.

### Owner action required before activation

Create a **fine-grained** GitHub personal access token:

- repository access: **only** `rudvh1016-gif/retailpulse-korea`
- repository permission: **Actions: write** (nothing else)
- store it as a Cloudflare Worker secret named `GITHUB_DISPATCH_TOKEN`,
  via the Cloudflare dashboard or `wrangler secret put`

Never paste the value into chat, a commit, `wrangler.production.jsonc`, or
this document. The code references only the binding name.

### Activation change (single atomic PR, not yet written)

1. remove the `schedule:` block from `.github/workflows/collect-realtime.yml`
   — `workflow_dispatch` stays so the Cron can trigger it
2. add the Cron Trigger `"7,22,37,52 * * * *"` to `wrangler.production.jsonc`
3. deploy, then confirm exactly one authoritative scheduler exists

Both steps ship together so GitHub `schedule:` and Worker Cron are never
simultaneously authoritative.

### Rollback

1. delete the Cron Trigger from `wrangler.production.jsonc` and deploy
2. restore the `schedule:` block in `collect-realtime.yml`
3. confirm a natural `event=schedule` run appears

No migration, no schema change, no data rollback. The `GITHUB_DISPATCH_TOKEN`
secret can be left in place or revoked independently.

### Terminology

Cloudflare-triggered runs carry **`event=workflow_dispatch`**, not
`event=schedule`. They must not be described as schedule runs. Use
**`VERIFIED_AUTO_TRIGGER_SUCCESS`** for an automated Cloudflare-triggered run
that succeeded, keeping `VERIFIED_AUTO_SUCCESS` for genuine
`event=schedule` runs.

### Current state

Worker Cron: **ACTIVE (trigger-only)**, `7,22,37,52 * * * *`, production
environment only. GitHub realtime `schedule:`: **OFF**;
`workflow_dispatch`: **ON**. The scheduled handler is now reachable and is
the sole authoritative realtime scheduler. Guardrails in
`tests/hybrid.test.ts` and `tests/realtime-dispatch.test.ts` assert all of
this, including that exactly one Cron expression exists, that staging has
none, and that the handler never grows past the single dispatch call.

A Cloudflare-triggered run appears in Actions with `event=workflow_dispatch`,
never `event=schedule`; see "Terminology" above.
