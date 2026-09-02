# Seoul Realtime Commercial Signal Implementation Plan

**Goal:** Ship Phase 2 OA-21285 realtime commercial activity from contract proof through Production evidence, without extra normal provider calls or misleading sales labels.

**Architecture:** Replace the three `citydata_ppltn` calls with three integrated `citydata` calls, fan each response into independently normalized population and commercial records, persist commercial observations in a dedicated changed-only table, and expose one bounded summary/UI row per area.

**Execution rule:** Strict red-green-refactor for every behavior. Run the named focused test and observe the expected failure before production code is changed.

## Task 1: Add the secret-safe integrated contract probe

**Files:**

- Create: `scripts/probe-seoul-citydata-contract.ts`
- Modify: `.github/workflows/import-oneshot.yml`
- Test: `tests/product-signals.test.ts`

1. Add a behavior test that runs the probe against a complete sanitized
   integrated response and asserts only structural booleans/status are printed.
2. Add a second fixture containing sentinel secret/payment values and assert
   none appear in stdout/stderr.
3. Run the focused test and observe failure because the probe does not exist.
4. Implement an injectable probe runner plus a CLI that requires
   `SEOUL_OPEN_DATA_KEY`, makes one request per configured POI, uses no retry,
   never prints values/raw payload/URL, and exits non-zero on authorization or
   required-shape failure.
5. Add a separately gated `PROBE` path to the existing manual-only workflow.
   The probe step receives no D1 credentials and has no schedule; the existing
   `IMPORT` path remains unchanged.
6. Re-run the focused test, typecheck, secret scan, and workflow safety tests.
7. Commit the probe gate, push the feature branch, dispatch it once, and record
   the three-area structural result before continuing.

## Task 2: Normalize the commercial record

**Files:**

- Modify: `lib/source-adapters.ts`
- Test: `tests/sources.test.mjs`

1. Add a full sanitized `CITYDATA` fixture mirroring the verified provider
   structure.
2. Add failing tests for official level/time parsing, numeric strings/numbers,
   suppressed optional fields becoming `null`, semantic hash stability across
   retrieval times, and schema rejection when required level/time is absent.
3. Run the focused source tests and observe the missing normalizer failure.
4. Implement `CanonicalSeoulRealtimeCommercial` and
   `normalizeSeoulRealtimeCommercial` with source ID
   `SEOUL_CITYDATA_CMRCL`, `LIVE` origin, and schema v1.
5. Re-run focused tests to green and refactor only after behavior passes.

## Task 3: Add changed-only D1 persistence and independent health

**Files:**

- Modify: `db/schema.ts`
- Create: `drizzle/0010_seoul_realtime_commercial.sql`
- Modify: `lib/collector.ts`
- Modify: `tests/sources.test.mjs`
- Modify: `tests/migrations.test.mjs`
- Modify: `tests/production-runner.test.mjs`

1. Add failing migration tests for the table, unique semantic key, and
   `(area, observed_at DESC)` index.
2. Add failing collector tests proving exactly one integrated request per area,
   both blocks persist from that response, a second identical run changes zero
   rows, commercial suppression stays nullable, and a commercial-only failure
   leaves population usable while commercial health is not `LIVE`.
3. Run the focused migration/source/runner tests and observe failures.
4. Add schema and migration.
5. Refactor `collectSeoulRealtime` to extract `CITYDATA`, normalize the two
   blocks independently, batch writes, and write separate collector/source
   health for `SEOUL_CITYDATA_PPLTN` and `SEOUL_CITYDATA_CMRCL`.
6. Keep the existing bounded retry behavior and redact failure detail.
7. Re-run focused tests and verify one-call-per-area plus changed-only counts.

## Task 4: Expose a bounded summary contract

**Files:**

- Modify: `app/api/live/summary/route.ts`
- Modify: `scripts/measure-d1-read-plans.mjs`
- Modify: `scripts/measure-production-read-budget.ts`
- Modify: `tests/d1-read-plans.test.mjs`
- Modify: `tests/edge-cache.test.mjs`

1. Add a failing read-plan test for three per-area latest commercial seeks and
   the required index.
2. Add a failing summary/edge fixture assertion that each area can carry a
   nullable `commercial` block without changing cache admission semantics.
3. Run the focused tests and observe the missing query/field failures.
4. Add `latestCommercial` through the existing `latestPerKey` pattern and map
   freshness with the realtime threshold.
5. Add the query and index to local and Production rows-read diagnostics.
6. Re-run the focused tests and compare measured local rows read against the
   pre-change baseline; investigate any unbounded plan.

## Task 5: Render the truthful four-locale signal

**Files:**

- Modify: `app/live-signals.tsx`
- Modify: `tests/rendered-html.test.mjs`
- Modify: `tests/ux-truth.test.mjs`
- Modify: `tests/product-signals.test.ts`
- Modify: `tests/e2e/retailpulse.spec.ts`

1. Add failing behavior tests that a commercial block renders immediately
   after population, all four locales contain the domestic-consumer/not-total
   disclaimer, suppressed values do not render as zero, and absence omits the
   row.
2. Run the focused tests and observe failure.
3. Add the client type, locale copy, safe amount formatting, row construction,
   and `hasArea` eligibility.
4. Re-run focused unit/render/browser tests to green.

## Task 6: Synchronize source and operating documentation

**Files:**

- Modify: `docs/DATA_SOURCES.md`
- Modify: `docs/PRODUCTION.md`
- Modify: `docs/RUNBOOK.md`
- Modify: `docs/SHARED_PROJECT_STATE.md`
- Modify: `.github/workflows/collect-realtime.yml`

1. Document the integrated endpoint, verified response blocks, domestic-card
   truth boundary, suppression behavior, unchanged request budget, separate
   health identity, and rollback.
2. Update workflow comments only; do not add a scheduler or Cron.
3. Run workflow ownership/Cron-limit tests and secret scan.

## Task 7: Verify, review, and release Phase 2

1. Run focused tests, then `npm test`, lint, typecheck, secret scan, local D1
   read-plan measurement, rendered HTML, and four-locale Playwright.
2. Inspect the full diff for secret leakage, accidental scheduler changes,
   data-label truth, and unrelated files. Self-review is used because this
   session forbids spawning review agents.
3. Fetch `origin/main`, merge it without rewriting the feature commits if
   needed, and rerun verification.
4. Commit all implementation evidence and push without force.
5. Open the Phase 2 PR, wait for CI, merge only when green, and wait for the
   exact merge-SHA Production deployment and site smoke.
6. Run one bounded Production realtime collection, then verify:
   - 3/3 population and 3/3 commercial coverage;
   - separate `SEOUL_CITYDATA_CMRCL` source health;
   - changed-only second-run behavior where safe;
   - summary and four-locale UI truth labels;
   - Edge Cache MISS then HIT;
   - exact Cloudflare Cron count remains five;
   - actual uncached summary `rows_read` remains within the documented Free
     guardrails.
7. Do not start Phase 3 until every Phase 2 Production gate above is proven.
