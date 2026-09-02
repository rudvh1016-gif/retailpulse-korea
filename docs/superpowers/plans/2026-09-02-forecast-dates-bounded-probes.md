# Forecast Dates Bounded Probes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the growing A5 `SELECT DISTINCT target_date` read with 21 truthful indexed single-day probes and prove the reduction on Production D1.

**Architecture:** Extend the existing D1-compatible date-probe batching with a bare-date equality builder for A5. The live route and the read-budget diagnostic will share the same SQL shape, while regression tests enforce bounded semantics and prevent the rejected multi-day `UNION ALL` form from returning.

**Tech Stack:** TypeScript, Next/Vinext route handlers, Cloudflare D1 prepared statements and batch API, Node `node:test`, SQLite query-plan tests, GitHub Actions, Wrangler 4.92.0.

## Global Constraints

- Workers Paid: NO; D1 Paid: NO; paid API: NO; runtime LLM: NO.
- Exactly five Production Cron expressions; no sixth Cron and no schedule changes in Phase A.
- No provider/collector run, historical rewrite, destructive cleanup, force push, or A5/recovery refactor.
- Preserve `direction='departure'`, `is_aggregate=1`, KST service-date truth, changed-only writes, last-good behavior, and PR #71–#73 measurement/smoke protections.
- Do not add an index unless real Production EXPLAIN and rows-read evidence disproves the existing `airport_passenger_forecast_target_idx` assumption.
- Branch from actual `origin/main` SHA `fb8e1eeb5ea025bc9876604e499563023dae6720`; use PR, green CI, merged main, existing deploy workflow, and bounded Production diagnostics.

---

### Task 1: Add failing A5 date-probe regression coverage

**Files:**
- Modify: `tests/d1-read-plans.test.mjs`

**Interfaces:**
- Consumes: current `app/api/live/summary/route.ts` and all migrations.
- Produces: a query-plan fixture named `summary.availableForecastDates` and behavioral guards for official A5 aggregate-departure dates.

- [ ] **Step 1: Add the intended single-day A5 SQL fixture**

Add this helper beside the existing `probe` helper:

```js
const exactDayProbe = (table, column, filter) =>
  `SELECT ? AS day WHERE EXISTS (SELECT 1 FROM ${table} WHERE ${filter ? `${filter} AND ` : ""}${column} = ?)`;
```

Add this entry to `HOT_QUERIES`:

```js
"summary.availableForecastDates": [
  exactDayProbe("airport_passenger_forecast", "target_date", "direction = 'departure' AND is_aggregate = 1"),
  ["2026-08-31", "2026-08-31"],
],
```

- [ ] **Step 2: Add a failing route contract test**

Add a test that names the regression it catches:

```js
test("A5 date availability uses batched exact-day aggregate-departure probes", () => {
  assert.doesNotMatch(route, /SELECT DISTINCT target_date AS day FROM airport_passenger_forecast/);
  assert.match(
    route,
    /probeDays\(dayValueExistsSql\("airport_passenger_forecast", "target_date", "direction = 'departure' AND is_aggregate = 1"\)/,
  );
});
```

This must fail because current main still contains the historical `SELECT DISTINCT` statement.

- [ ] **Step 3: Add an independent semantic SQLite test**

Create a fresh migrated database, insert four complete `airport_passenger_forecast` rows with literal values:

- `2026-08-31`, departure aggregate → included;
- `2026-08-30`, arrival aggregate → excluded;
- `2026-08-29`, departure component (`is_aggregate=0`) → excluded;
- `2026-08-08`, departure aggregate outside the chosen candidate day → not returned when that day is not probed.

Execute `exactDayProbe` separately for the three in-window dates and assert the only returned day is `2026-08-31`. Derive the expected literal array directly: `[{ day: "2026-08-31" }]`.

- [ ] **Step 4: Run the targeted test and verify RED**

Run:

```bash
node --experimental-sqlite --test tests/d1-read-plans.test.mjs
```

Expected: FAIL only at `A5 date availability uses batched exact-day aggregate-departure probes`, because the route still uses `SELECT DISTINCT`; the independent SQL semantics and existing plan tests pass.

### Task 2: Implement the bounded route and matching Production measurement

**Files:**
- Modify: `app/api/live/summary/route.ts`
- Modify: `scripts/measure-production-read-budget.ts`
- Test: `tests/d1-read-plans.test.mjs`

**Interfaces:**
- Consumes: `pickerDays: string[]`, `client.batch`, `shiftKstDay`, and `safeAll`.
- Produces: `dayValueExistsSql(table: string, column: string, filter?: string): string`; `probeDays(sql: string, bindsForDay: (day: string) => unknown[]): Promise<Row[]>`; a `forecastDates` diagnostic with 21 `repeatBinds` pairs.

- [ ] **Step 1: Add an exact-value day builder to the live route**

Add beside `dayExistsSql`:

```ts
function dayValueExistsSql(table: string, column: string, filter = ""): string {
  const where = filter ? `${filter} AND ` : "";
  return `SELECT ? AS day WHERE EXISTS (SELECT 1 FROM ${table} WHERE ${where}${column} = ?)`;
}
```

- [ ] **Step 2: Generalize only the local batch adapter**

Replace the table/column-specific local helper with:

```ts
const probeDays = async (sql: string, bindsForDay: (day: string) => unknown[]) => {
  const results = await client.batch<Row>(
    pickerDays.map((day) => client.prepare(sql).bind(...bindsForDay(day))),
  );
  return results.flatMap((result) => result.results ?? []);
};
```

Call it as follows:

```ts
const flightDateRows = await safeAll<Row>(() => probeDays(
  dayExistsSql("airport_flights", "scheduled_at", "direction = 'departure'"),
  (day) => [day, day, shiftKstDay(day, 1)],
));
const forecastDateRows = await safeAll<Row>(() => probeDays(
  dayValueExistsSql("airport_passenger_forecast", "target_date", "direction = 'departure' AND is_aggregate = 1"),
  (day) => [day, day],
));
const observedDateRows = await safeAll<Row>(() => probeDays(
  dayExistsSql("seoul_realtime_area", "observed_at"),
  (day) => [day, day, shiftKstDay(day, 1)],
));
```

- [ ] **Step 3: Mirror the SQL in the read-budget diagnostic**

Add the same `dayValueExistsSql` builder. Replace only the `forecastDates` entry with:

```ts
{
  name: "forecastDates",
  sql: dayValueExistsSql(
    "airport_passenger_forecast",
    "target_date",
    "direction = 'departure' AND is_aggregate = 1",
  ),
  binds: [pickerDays[0], pickerDays[0]],
  repeatBinds: pickerDays.map((day) => [day, day]),
  guard: `probeDays(\n      dayValueExistsSql("airport_passenger_forecast", "target_date", "direction = 'departure' AND is_aggregate = 1")`,
  table: null,
},
```

Keep `HOT_QUERIES.length === 14`, the 100,000-row ceiling, read-only checks, and all existing per-query metadata unchanged.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run:

```bash
node --experimental-sqlite --test tests/d1-read-plans.test.mjs
```

Expected: all D1 plan tests pass, including the new A5 semantic and route-contract tests. The A5 plan must report no scan of `airport_passenger_forecast`.

- [ ] **Step 5: Run unit regression tests**

Run:

```bash
npm run test:unit
```

Expected: all unit tests pass with no new warnings or errors.

- [ ] **Step 6: Commit and push the implementation checkpoint**

```bash
git add app/api/live/summary/route.ts scripts/measure-production-read-budget.ts tests/d1-read-plans.test.mjs
git commit -m "perf: bound A5 date availability reads"
git push
```

### Task 3: Harden Production smoke for truthful A5 date availability

**Files:**
- Modify: `.github/workflows/site-smoke.yml`
- Modify: `tests/hybrid.test.ts`

**Interfaces:**
- Consumes: `/api/health` source status and `/api/live/summary.dateAvailability.airportPassengerForecast`.
- Produces: a smoke failure only when `INCHEON_PASSENGER_FORECAST` is `LIVE` but the A5 picker offers zero dates.

- [ ] **Step 1: Add a failing workflow contract test**

In `tests/hybrid.test.ts`, read `.github/workflows/site-smoke.yml` and assert it contains a conditional A5 availability check keyed by `INCHEON_PASSENGER_FORECAST` and `status === "LIVE"`. The current workflow must fail this assertion.

- [ ] **Step 2: Run the targeted hybrid test and verify RED**

```bash
node --experimental-sqlite --import tsx --test tests/hybrid.test.ts
```

Expected: FAIL at the new A5 smoke contract assertion because the workflow currently checks only flight and Seoul observation day lists.

- [ ] **Step 3: Add the conditional smoke assertion**

After logging `dateAvailability`, add:

```js
const a5Health = (healthBody?.sources ?? []).find(
  (source) => source.sourceId === "INCHEON_PASSENGER_FORECAST",
);
if (a5Health?.status === "LIVE") {
  check(
    "date picker offers A5 forecast days when A5 is live",
    (availability.airportPassengerForecast?.length ?? 0) > 0,
    `${availability.airportPassengerForecast?.length ?? 0} days`,
  );
}
```

This does not require events or sales and does not fail when A5 is truthfully non-LIVE.

- [ ] **Step 4: Run targeted and unit tests and verify GREEN**

```bash
node --experimental-sqlite --import tsx --test tests/hybrid.test.ts
npm run test:unit
```

Expected: both commands pass.

- [ ] **Step 5: Commit and push the smoke checkpoint**

```bash
git add .github/workflows/site-smoke.yml tests/hybrid.test.ts
git commit -m "test: require A5 picker dates when source is live"
git push
```

### Task 4: Complete local and CI verification

**Files:**
- Verify only; do not weaken tests or add unrelated changes.

**Interfaces:**
- Consumes: the completed Phase A branch.
- Produces: a green PR-ready branch and an explicit note for any Windows-only CRLF discrepancy.

- [ ] **Step 1: Run formatting and static checks**

```bash
git diff --check origin/main...HEAD
npm run secret:scan
npm run lint
npm run typecheck
```

Expected: all pass.

- [ ] **Step 2: Run build, migration, and full tests**

```bash
npm run build
npm run test:unit
npm test
node --test tests/rendered-html.test.mjs
```

Expected: all pass. If the known Windows CRLF-only source-regex discrepancy recurs while Linux CI is green, report it exactly; do not alter product code or weaken the assertion to hide it.

- [ ] **Step 3: Run environment/config validation**

```bash
npm run validate:cloudflare-env
npm run validate:production-env
npx wrangler deploy --dry-run --env production --config wrangler.production.jsonc
```

Expected: all validations pass and the config still contains exactly five Cron expressions.

- [ ] **Step 4: Review final diff and push**

```bash
git status --short
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
git push
```

Expected: only the Phase A design, route, measurement, regression test, and smoke files differ.

### Task 5: PR A, Production deploy, and measured acceptance

**Files:**
- No new code unless a measured regression requires a separately reviewed fix.

**Interfaces:**
- Consumes: green Phase A branch and existing GitHub workflows.
- Produces: merged SHA, deployed Worker version, real Production `forecastDates` and summary rows-read, smoke/health evidence.

- [ ] **Step 1: Create PR A and wait for green CI**

Create a PR titled `perf: bound A5 date availability reads` with the design, no-new-index rationale, test evidence, and rollback boundary. Review the final diff and merge only when required CI is green.

- [ ] **Step 2: Deploy merged main through the existing workflow**

Run only **Deploy Cloudflare** for Production. Verify the deployed SHA, successful Worker upload, and the five unchanged Cron expressions. Stop if deployment or Cron validation fails.

- [ ] **Step 3: Run bounded Production verification once**

Run **Measure Production Read Budget** with the default 100,000 ceiling. Record `forecastDates.statementsRun`, `rowsRead`, `rowsReturned`, plan, scans, total `rowsReadPerUncachedRequest`, and diagnostic rows. Do not rerun for prettier output.

- [ ] **Step 4: Run health and Production Site Smoke**

Verify `/api/health` is HTTP 200 with `database="ok"` and non-empty sources, then run the existing **Production Site Smoke** once. Confirm the three core areas, non-empty flight/Seoul picker days, conditional A5 days, source health, and exactly five Crons.

- [ ] **Step 5: Apply the Phase A gate**

Proceed to Phase B design only if Production proves:

- no `airport_passenger_forecast` growing scan;
- a major real reduction from the historical 1,710-row `forecastDates` and 2,795-row summary baselines;
- truthful A5 dates and green smoke/health;
- no A5/weather/Cron regression.

If the existing index is still expensive, stop safely and design a separately costed index change rather than continuing to cache work.
