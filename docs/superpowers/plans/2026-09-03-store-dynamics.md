# Store Dynamics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add verified OA-15577 quarterly store dynamics for three Seoul areas without geographic double counting, high-frequency collection, or realtime claims.

**Architecture:** A dedicated pure normalization/aggregation module validates OA-15577 rows and a versioned one-code-per-area mapping. The existing collector and weekly SLOW workflow persist one changed-only aggregate row per area/quarter; the summary route reads three indexed latest rows and the existing cached multilingual UI renders them as historical context.

**Tech Stack:** TypeScript, Node test runner, SQLite/D1, Cloudflare Worker, React, GitHub Actions.

## Global Constraints

- Source is OA-15577 `VwsmTrdarStorQq`; only verified published fields are accepted.
- Mapping is `oa-15577-standard-area-2026-09-03-v1` with exactly one unique official code per product area.
- Store dynamics is historical quarterly context, never realtime or a quality/success/risk judgement.
- Preserve Last-good; missing/error data is never replaced with zero.
- Use compact changed-only D1 rows and indexed bounded reads.
- Add no Cloudflare Cron; Production remains exactly five Cron expressions.
- Add no paid API, paid runtime, runtime LLM, or Demand Index change.
- Do not modify local main or any historical dirty worktree.

---

### Task 1: Lock the contract and geographic mapping

**Files:**
- Create: `lib/store-dynamics.ts`
- Create: `tests/store-dynamics.test.ts`

**Interfaces:**
- Produces: `STORE_DYNAMICS_SOURCE_ID`, `STORE_DYNAMICS_DATASET_ID`, `STORE_DYNAMICS_MAPPING_VERSION`, `storeDynamicsMappings`, `storeDynamicsQuarterCandidates(now)`, `normalizeStoreDynamicsRow(raw, expected, retrievedAt)`, and `aggregateStoreDynamicsRows(rows, expected, retrievedAt)`.
- Produces type `CanonicalStoreDynamicsAggregate` with area, quarter, official geography, five counts, two tenths-percent rates, industry count, retrieval time, validation fields, and hash.

- [ ] **Step 1: Write failing mapping and normalizer tests**

Use hand-checked fixtures for `20261`, codes `3001492`, `3120103`, and
`3110131`. Assert exact area names and unique codes; reject a wrong quarter,
wrong code/type/name, missing official field, negative count, non-integral
count, rate outside 0–100, and `total !== ordinary + franchise`.

- [ ] **Step 2: Run RED**

Run: `node --experimental-sqlite --import tsx --test tests/store-dynamics.test.ts`

Expected: FAIL because `lib/store-dynamics.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure module**

The aggregate must calculate literal official-formula rates as:

```ts
const rateTenths = total === 0 ? 0 : Math.round((count * 1_000) / total);
```

Its semantic hash excludes retrieval time. It must require at least one valid
industry and reject duplicate industry codes so a repeated row cannot inflate
the result.

- [ ] **Step 4: Run GREEN**

Run the Task 1 command and require all tests to pass.

### Task 2: Add compact additive storage

**Files:**
- Create: `drizzle/0013_seoul_store_dynamics.sql`
- Modify: `db/schema.ts`
- Modify: `tests/migrations.test.mjs`

**Interfaces:**
- Produces table `seoul_store_dynamics` unique on `(source_id, mapping_version, area, quarter_code)`.
- Produces index `seoul_store_dynamics_area_quarter_idx` on `(area, quarter_code DESC)`.

- [ ] **Step 1: Add a failing migration test**

Apply all migrations to a fresh SQLite database, insert distinct mapping
versions, assert duplicate semantic keys are rejected, and verify no existing
prediction/outcome row can be changed.

- [ ] **Step 2: Run RED**

Run: `node --experimental-sqlite --import tsx --test tests/migrations.test.mjs`

Expected: FAIL because the table is absent.

- [ ] **Step 3: Add the table, unique constraint, and latest index**

Use only `CREATE TABLE` and `CREATE INDEX`; no backfill, update, delete, drop,
or destructive rewrite.

- [ ] **Step 4: Run GREEN**

Run the Task 2 command and require all tests to pass.

### Task 3: Collect OA-15577 safely

**Files:**
- Modify: `lib/collector.ts`
- Modify: `tests/sources.test.mjs`

**Interfaces:**
- Produces: `collectStoreDynamics(env, now): Promise<CollectorResult>`.
- Consumes: the Task 1 mappings, candidate quarters, and aggregation function.

- [ ] **Step 1: Add failing collector tests**

Exercise the real collector with only `fetch` and D1 transport substituted.
Assert one latest-quarter probe, one exact-code page per area, bounded paging,
three stored aggregates, changed-only second run, wrong-code rejection,
partial-area failure, and provider failure preserving a pre-existing row with
`sourceHealth: "STALE"`.

- [ ] **Step 2: Run RED**

Run: `node --experimental-sqlite --import tsx --test tests/sources.test.mjs`

Expected: FAIL because `collectStoreDynamics` is not exported.

- [ ] **Step 3: Implement minimal collection**

Build URLs as
`VwsmTrdarStorQq/{start}/{end}/{quarter}/{tradeAreaCode}`, enforce response
identity, keep at most five probes and three pages per area, batch three
changed-only upserts, and write secret-redacted health detail.

- [ ] **Step 4: Run GREEN**

Run the Task 3 command and require all tests to pass.

### Task 4: Join the existing SLOW operations path

**Files:**
- Modify: `lib/production-runner.ts`
- Modify: `lib/production-diagnostics.ts`
- Modify: `scripts/import-oneshot.ts`
- Modify: `.github/workflows/collect-sales.yml`
- Modify: `.github/workflows/import-oneshot.yml`
- Modify: `tests/production-runner.test.mjs`
- Modify: `tests/hybrid.test.ts`

**Interfaces:**
- Produces runner/diagnostic name `store_dynamics` mapped to `SEOUL_STORE_DYNAMICS`.
- Weekly SLOW run sets `RPK_PRODUCTION_SOURCES: seoul_sales,store_dynamics`.

- [ ] **Step 1: Add failing runner and schedule behavior tests**

Assert selection invokes the store collector once, diagnostics resolves its
source ID, the weekly group owns it exactly once, and production Cron count
remains five.

- [ ] **Step 2: Run RED**

Run the production-runner and hybrid tests; expect the new source assertions
to fail.

- [ ] **Step 3: Wire the collector into the existing weekly workflow**

Do not add a workflow schedule or Cloudflare trigger. Keep the repository
gate, production environment, existing secret, timeout, and sequential run.

- [ ] **Step 4: Run GREEN**

Run both test files and require all tests to pass.

### Task 5: Add the bounded summary read and multilingual historical card

**Files:**
- Modify: `app/api/live/summary/route.ts`
- Modify: `app/live-signals.tsx`
- Modify: `app/globals.css`
- Modify: `e2e/production.spec.ts`
- Modify: `tests/product-signals.test.ts`
- Modify: `tests/ux-truth.test.mjs`
- Modify: `tests/edge-cache.test.mjs`
- Modify: `tests/d1-read-plans.test.mjs`
- Modify: `scripts/measure-production-read-budget.ts`

**Interfaces:**
- Summary area block gains `storeDynamics: LiveStoreDynamics | null`.
- `LiveStoreDynamics` exposes official counts, derived tenths-percent rates,
  quarter, official geography, dataset ID, mapping version, and retrieval time.

- [ ] **Step 1: Add failing API/UI behavior tests**

Assert a latest indexed row per area, cache eligibility, correct quarter and
official geography, four-language labels, visible neutral limitation, and
absence of realtime/today/current-store, good/bad, survival, success, quality,
and risk claims.

- [ ] **Step 2: Run RED**

Run the focused UI, read-plan, and cache tests; expect the store card/query to
be missing.

- [ ] **Step 3: Implement the smallest summary and card change**

Add one three-area indexed query and render a dedicated card after estimated
sales inside the existing past group. Format rates from stored tenths without
reinterpreting them.

- [ ] **Step 4: Run GREEN**

Run focused tests, then browser E2E at 390, 768, 1280, 1440, and 1920 pixels.

### Task 6: Synchronize documentation and release evidence

**Files:**
- Modify: `docs/DATA_SOURCES.md`
- Modify: `docs/PRODUCTION.md`
- Modify: `docs/RUNBOOK.md`
- Modify: `docs/SHARED_PROJECT_STATE.md`

**Interfaces:**
- Documents the exact current contract, mapping/version, source cadence,
  truth boundaries, request ceiling, and recovery behavior.

- [ ] **Step 1: Run the full verification matrix**

Run secret scan, lint, typecheck, unit, full test/build/render, production
dependency audit, Playwright, migration/query-plan tests, and git diff review.

- [ ] **Step 2: Commit and normally push the focused branch**

No force, rebase, reset, squash, or local-main change.

- [ ] **Step 3: PR, CI, merge, and explicit Production deployment**

Merge only after all required CI is green. Dispatch the existing Cloudflare
workflow with `stage: production`; verify additive migration and Worker
version.

- [ ] **Step 4: Verify Production evidence**

Run authenticated bounded collection, repeat it for idempotency, inspect all
three stored rows, confirm Source Health/Last-good, four locales, responsive
layout, Edge Cache MISS/HIT and isolation, actual summary rows_read, D1 Free
impact, and exactly five deployed Cron expressions.

