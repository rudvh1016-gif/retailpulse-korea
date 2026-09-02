# A5 Arrival Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse stored A5 official arrival aggregate rows as compact Seoul inbound demand-reference signals while preserving the Airport departure experience.

**Architecture:** One bounded summary query reads departure and arrival aggregate bands for the selected KST day, then splits them in memory. A direction-aware pure summarizer applies the existing full-day honesty gate to both directions; an additive arrival block feeds only the Seoul signal list while existing departure response fields continue feeding the Airport view.

**Tech Stack:** TypeScript 5.9, React 19, vinext/Cloudflare Workers, D1/SQLite, Node test runner, Playwright.

## Global Constraints

- Start from `origin/main` SHA `e3065350c5bc0318c4c88bd32e7c2a063662bfe4`.
- Use only `airport_passenger_forecast` rows where `is_aggregate = 1`.
- New provider calls: `0`; new Cron expressions: `0`; Production Cron count remains `5`.
- Do not change Demand Index weights or inputs.
- Do not modify W1, A5 last-good collection, D1 indexes, Edge Cache routing or paid infrastructure.
- Forecast wording must never imply actual/observed arrivals, area visitors or sales.
- Airport departure UI and response contract remain valid.
- Stop and optimize if measured uncached summary cost exceeds approximately `1,500 rows_read`.

---

### Task 1: Direction-aware official aggregate summarization

**Files:**
- Modify: `lib/airport-today-summary.ts`
- Modify: `tests/airport-today-summary.test.mjs`

**Interfaces:**
- Consumes: `AirportForecastAggregateRow[]`, KST service date and direction.
- Produces: `summarizePassengerForecast(rows, serviceDateKst, direction): TodayPassengerForecastSummary` while retaining `summarizeTodayPassengerForecast(rows, serviceDateKst)` as the departure-compatible API.
- Produces: `summarizeNextPassengerForecastBand(timelineByTerminal, nowIso): ForecastBand | null` for a safe T1+T2 current/non-ended band.

- [ ] **Step 1: Write failing arrival tests**

Add literal-fixture tests proving that 24 T1 arrival aggregate bands at `100` plus 24 T2 bands at `50` yield total `3600`, peak `150`, and COMPLETE coverage, while departure rows and `isAggregate: 0` arrival rows are ignored.

```js
const summary = summarizePassengerForecast(rows, SERVICE_DATE, "arrival");
assert.equal(summary.total, 3600);
assert.equal(summary.peak.expectedPassengers, 150);
assert.equal(summary.coverage.all, "COMPLETE");
```

- [ ] **Step 2: Write failing next-band and PARTIAL tests**

Use hand-written bands around `2026-08-31T15:30:00+09:00`. Assert the combined `15:00–16:00` band equals the T1 plus T2 literals, mismatched T1/T2 intervals return null, and a missing daily band keeps total and peak null.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
node --experimental-sqlite --import tsx --test tests/airport-today-summary.test.mjs
```

Expected: FAIL because the direction-aware and next-band exports do not exist.

- [ ] **Step 4: Implement the minimal direction-aware summarizer**

Filter official rows with the requested direction, reuse the existing coverage evaluation unchanged, keep the departure wrapper, and combine a next band only when T1 and T2 contain the same non-ended interval.

```ts
export function summarizePassengerForecast(
  rows: AirportForecastAggregateRow[],
  serviceDateKst: string | undefined,
  direction: "departure" | "arrival",
): TodayPassengerForecastSummary
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the same focused test command. Expected: all tests pass with zero failures.

- [ ] **Step 6: Commit**

```powershell
git add lib/airport-today-summary.ts tests/airport-today-summary.test.mjs
git commit -m "feat: summarize official arrival forecasts"
```

### Task 2: One bounded A5 read and additive arrival API contract

**Files:**
- Modify: `app/api/live/summary/route.ts`
- Modify: `app/live-signals.tsx`
- Modify: `tests/d1-read-plans.test.mjs`
- Modify: `tests/rendered-html.test.mjs`
- Modify: `scripts/measure-production-read-budget.ts`

**Interfaces:**
- Consumes: the Task 1 summarizer functions.
- Produces: `airport.arrivalForecast` with daily total, terminal totals, next band, peak, retrieval timestamp and coverage.
- Preserves: every existing departure field under `airport`.

- [ ] **Step 1: Write failing route/read-plan tests**

Assert the route has one `FROM airport_passenger_forecast` hot-path read, filters `direction IN ('departure', 'arrival')`, retains `is_aggregate = 1` and exact `target_date = ?`, caps at 96, splits direction in memory, and exposes `arrivalForecast` without changing the departure date probe.

- [ ] **Step 2: Write failing degraded-payload test**

Assert the real route response contains an arrival block with null/empty honest defaults when D1 is unavailable and keeps `cache-control: no-store`.

- [ ] **Step 3: Update the read-budget diagnostic test contract first**

Add the new A5 SQL shape and route guard to `scripts/measure-production-read-budget.ts` so Production measurement replays the exact shipped statement instead of an obsolete departure-only query.

- [ ] **Step 4: Run focused tests and verify RED**

```powershell
node --experimental-sqlite --import tsx --test tests/d1-read-plans.test.mjs tests/rendered-html.test.mjs
```

Expected: FAIL because the route remains departure-only and has no arrival block.

- [ ] **Step 5: Implement the single-query split and payload**

Read at most 96 official aggregate rows, split by `direction`, keep all existing departure calculations, compute arrival summary/next band, and add the defensive degraded shape. Update the client `LiveSummary` type additively.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the focused command again. Expected: zero failures.

- [ ] **Step 7: Run the read-plan guard**

```powershell
node --experimental-sqlite --import tsx --test tests/d1-read-plans.test.mjs
```

Expected: bounded route/diagnostic guards pass.

- [ ] **Step 8: Commit**

```powershell
git add app/api/live/summary/route.ts app/live-signals.tsx tests/d1-read-plans.test.mjs tests/rendered-html.test.mjs scripts/measure-production-read-budget.ts
git commit -m "feat: expose bounded A5 arrival summary"
```

### Task 3: Replace Seoul departure rows with four-language inbound signals

**Files:**
- Modify: `app/live-signals.tsx`
- Modify: `tests/product-signals.test.ts`
- Modify: `tests/rendered-html.test.mjs`
- Modify: `tests/ux-truth.test.mjs`

**Interfaces:**
- Consumes: `summary.airport.arrivalForecast`.
- Produces: up to three compact Seoul-area rows for daily expected arrivals, next official arrival band and expected arrival peak.
- Preserves: `AirportTodaySummary` departure labels, charts, checkpoints and terminal selection.

- [ ] **Step 1: Write failing four-language truth tests**

Assert visible strings exist in Korean, English, Simplified Chinese and Japanese for expected arrivals, official forecast, peak and the Seoul leading-reference caveat. Assert the arrival block does not contain actual/current/observed-arrival, area-visitor or sales claims.

- [ ] **Step 2: Write failing information-hierarchy tests**

Assert `AreaLiveSignals` no longer constructs T1/T2 departure-hall or departure-forecast rows, constructs arrival rows from `arrivalForecast`, omits confident total/peak under PARTIAL coverage, and still leaves the Airport detail copy intact.

- [ ] **Step 3: Run focused tests and verify RED**

```powershell
node --experimental-sqlite --import tsx --test tests/product-signals.test.ts tests/rendered-html.test.mjs tests/ux-truth.test.mjs
```

Expected: FAIL because the area list still renders four departure rows.

- [ ] **Step 4: Implement minimal compact arrival rows**

Add four-language semantic labels and source notes. Render total only for COMPLETE coverage, next band only when the API supplies a safe combined band, and peak only for COMPLETE coverage. Keep T1/T2 totals in secondary note text when available.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the same focused command. Expected: zero failures.

- [ ] **Step 6: Commit**

```powershell
git add app/live-signals.tsx tests/product-signals.test.ts tests/rendered-html.test.mjs tests/ux-truth.test.mjs
git commit -m "feat: show inbound airport signals for Seoul"
```

### Task 4: Full verification, Production measurement and PR 1 gate

**Files:**
- Modify if evidence requires: `docs/superpowers/specs/2026-09-02-a5-arrival-signals-design.md`
- Create: PR description through GitHub tooling; no repository report file is required.

**Interfaces:**
- Consumes: Tasks 1–3 completed tree.
- Produces: green PR 1 and Production evidence, or a safe stop report without starting Phase 2.

- [ ] **Step 1: Verify the worktree and residual isolation**

Confirm `git status`, `git diff origin/main...HEAD`, and the original phase-b worktree status. The three residual Edge Cache files must remain untouched and absent from this branch.

- [ ] **Step 2: Run full local validation**

```powershell
npm run typecheck
npm run lint
npm run secret:scan
npm run test:unit
npm test
npm run build
npm run test:e2e
```

Every command must exit 0. Investigate and fix any failure before proceeding.

- [ ] **Step 3: Measure Production baseline/after read budget**

Use the repository's read-only `Measure Production Read Budget` workflow or the local script with an already-configured protected credential. Never print credentials. Record exact uncached `rows_read`; stop and optimize above 1,500.

- [ ] **Step 4: Verify no forbidden changes**

Inspect diff for provider calls, Cron count, migrations, Demand Index, W1, cache routing and paid dependencies. Expected: none changed; `wrangler.production.jsonc` still contains five Cron expressions.

- [ ] **Step 5: Push and create PR 1**

Push `feat/a5-arrival-signals` without force, create a focused PR against `main`, and wait for all required CI. If GitHub authentication remains invalid, preserve the branch and report that single external blocker.

- [ ] **Step 6: Merge only green and deploy**

Merge without history rewrite, wait for the production deployment workflow and verify the deployed SHA. Do not start Phase 2 during this gate.

- [ ] **Step 7: Production smoke**

Verify `/api/health`, arrival aggregate existence for T1/T2, daily total, next band, peak, no double-count, four locales, Airport departure preservation, Edge Cache MISS→HIT/body reuse, date isolation, truthful Source Health, D1 budget and exactly five Crons.

- [ ] **Step 8: Report PR 1 gate**

Report exact starting SHA, PR URL, merged/deployed SHA, zero new provider calls, arrival values and coverage, rows-read before/after, Edge Cache result, Cron count and any W1 natural evidence. Proceed to a separate Phase 2 design only when every PR 1 gate is supported by Production evidence.
