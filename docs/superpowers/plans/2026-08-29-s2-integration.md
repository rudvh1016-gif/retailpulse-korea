# S2 Official Data Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect OA-23018 `Spop250mFornTempDong` from one bounded authenticated response through idempotent D1 storage, `/api/live/summary`, and the four-locale production UI.

**Architecture:** Keep provider calls in GitHub Actions and one-shot collectors. Normalize real official rows into raw dong provenance and deterministic area aggregates; serve only D1 records to visitors.

**Tech Stack:** Node.js 22, TypeScript, Next/vinext, Cloudflare D1, SQLite/Drizzle, GitHub Actions, Node test runner, Playwright.

## Global Constraints

- Production Collector stays OFF and Worker Cron stays absent.
- `Spop250mFornTempDong` is the only S2 service name.
- JSON receives one probe; XML receives one probe only if JSON is unsupported.
- No secret representation or provider URL containing a key may be logged.
- Legacy and OA-23018 series remain separate; Demand Index and `demoFlights` remain DEMO.
- Already applied migrations are immutable.

---

### Task 1: Replace discovery with a bounded S2 contract smoke

**Files:**
- Modify: `.github/workflows/smoke-public-apis.yml`
- Modify: `scripts/smoke-public-apis.mjs`
- Delete: `scripts/discover-s2.mjs`
- Modify: `docs/DATA_SOURCES.md`
- Test: `tests/sources.test.mjs`

**Interfaces:**
- Produces: safe S2 result `{ sourceId, authStatus, format, officialResultCode, firstRecordFieldNames, recordCount }`.
- Consumes: `SEOUL_OPEN_DATA_KEY` only inside the production Environment workflow.

- [ ] Add a failing script-level test that supplies a controlled Seoul response and proves the result contains field names but neither the key nor a full keyed URL.
- [ ] Run `node --experimental-sqlite --import tsx --test tests/sources.test.mjs` and confirm the missing S2 smoke behavior fails.
- [ ] Replace portal discovery with the exact service and bounded JSON/XML fallback, with no D1 writes.
- [ ] Run the targeted test and confirm it passes.
- [ ] Dispatch `Smoke Public APIs` on this branch once for S2 and classify the sanitized result without exposing values.
- [ ] Update source documentation with the returned format, field names, official result semantics, and corrected legacy interpretation.
- [ ] Commit with `feat: verify official S2 contract`.

### Task 2: Add authoritative area mappings and aggregation rules

**Files:**
- Modify: `lib/areas.ts`
- Create: `lib/seoul-foreign.ts`
- Modify: `docs/DATA_SOURCES.md`
- Test: `tests/sources.test.mjs`

**Interfaces:**
- Produces: `normalizeSeoulForeignRows(rows, retrievedAt): Promise<CanonicalSeoulForeignDong[]>`.
- Produces: `aggregateSeoulForeignByArea(rows, mappings): Promise<CanonicalSeoulForeignArea[]>`.
- Produces: `areaMappings[areaId].seoulAdministrativeDongCodes: readonly string[]` and `seoulForeignMappingVersion`.

- [ ] Verify 명동·홍대·성수 codes from an authoritative Seoul administrative-dong source and record the source/version in docs.
- [ ] Add failing literal-fixture tests for one-dong mapping, multi-dong aggregation, unknown dong rejection, null values, and total/subcategory double-count prevention.
- [ ] Run the targeted tests and confirm each fails because the new interface is absent.
- [ ] Implement the smallest canonical parser and aggregation rule matching the authenticated field schema.
- [ ] Run the targeted tests and confirm they pass.
- [ ] Commit with `feat: normalize S2 area observations`.

### Task 3: Add provenance-preserving, idempotent D1 storage

**Files:**
- Create: `drizzle/0004_s2_foreign_presence.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `db/schema.ts`
- Modify: `lib/collector.ts`
- Test: `tests/migrations.test.mjs`
- Test: `tests/collector.test.mjs`

**Interfaces:**
- Produces: `collectSeoulForeignPresence(env, now?): Promise<CollectorResult>`.
- Persists raw dong observations and area aggregates with semantic unique keys that exclude `retrievedAt`.

- [ ] Add failing migration tests for required product, mapping, dong, reference, availability, dimension, quality, and hash columns.
- [ ] Add a failing collector test importing the same official payload twice and asserting one logical raw row, one aggregate per area/time, and zero second-run changed writes.
- [ ] Run migration and collector tests and confirm the expected failures.
- [ ] Add a new migration and Drizzle schema without editing migrations `0000`–`0003`.
- [ ] Implement bounded S2 collection, semantic hashing, conflict handling, and independent source health.
- [ ] Run migration and collector tests and confirm they pass.
- [ ] Commit with `feat: persist S2 provenance safely`.

### Task 4: Add S2 to the manual one-shot path

**Files:**
- Modify: `.github/workflows/import-oneshot.yml`
- Modify: `scripts/import-oneshot.ts`
- Test: `tests/collector.test.mjs`
- Test: `tests/security.test.ts`

**Interfaces:**
- Consumes: `RPK_ONESHOT_SOURCES=seoul_foreign` and literal `RPK_ONESHOT_CONFIRM=IMPORT`.
- Produces: one isolated `collectSeoulForeignPresence` run.

- [ ] Add a failing test proving `seoul_foreign` is allowed, bounded, isolated, and rejected without `IMPORT`.
- [ ] Run targeted tests and confirm failure.
- [ ] Add the source to the existing dispatcher and workflow description without adding a schedule.
- [ ] Run targeted tests and confirm pass.
- [ ] Commit with `feat: add bounded S2 import`.

### Task 5: Expose S2 in the internal API and compact UI

**Files:**
- Modify: `app/api/live/summary/route.ts`
- Modify: `app/live-signals.tsx`
- Modify: `app/globals.css`
- Test: `tests/product-signals.test.ts`
- Test: `tests/rendered-html.test.mjs`
- Test: `tests/e2e/retailpulse.spec.ts`

**Interfaces:**
- Produces: `areas[areaId].foreignPresence` with value, unit, reference time, source product, freshness, and quality.
- Consumes: only D1 area aggregates; no Seoul provider call.

- [ ] Add failing tests for source failure isolation, no-data omission, the four locale labels, delayed-publication wording, no trend arrow, and no Demo promotion.
- [ ] Run targeted unit/rendered tests and confirm failure.
- [ ] Add a safe independent D1 query and one compact official-signal row.
- [ ] Run targeted unit/rendered tests and confirm pass.
- [ ] Add and run a 390px Playwright assertion for no horizontal overflow.
- [ ] Commit with `feat: show official S2 signal`.

### Task 6: Validate, import, merge, and verify Production

**Files:**
- Modify only files required by real test or CI failures.

**Interfaces:**
- Produces: merged Phase A main with a real S2 Production record and truthful UI.

- [ ] Run `npm run secret:scan`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`, rendered tests, `npm run test:e2e`, and `git diff --check`.
- [ ] Inspect `git diff origin/main...HEAD` for secret, scheduler, Demo, and migration safety.
- [ ] Push without force, open the Phase A PR, and wait for all CI checks.
- [ ] Fix only evidence-backed failures with a failing regression test first.
- [ ] Merge the green PR and fast-forward local `main`.
- [ ] Run Production migration/deploy through the existing workflow.
- [ ] Dispatch `One-shot Data Import` for only `seoul_foreign` with `IMPORT`.
- [ ] Verify D1/source health through `/api/live/summary`, then smoke `/ko`, `/en`, `/zh`, `/ja`, `/api/health`, and `/api/live/summary`.
