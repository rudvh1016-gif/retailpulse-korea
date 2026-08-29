# Data.go.kr Official Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the merged Phase A main, authenticate and connect A1/A2/A3/A4/W1/T1 through real schemas, idempotent D1 models, internal APIs, and truthful production UI.

**Architecture:** A single secret-safe request builder owns service-key normalization. Actual flights, scheduled flights, congestion, weather forecasts, and events remain separate canonical products and fail independently.

**Tech Stack:** Node.js 22, TypeScript, Next/vinext, Cloudflare D1, SQLite/Drizzle, GitHub Actions, Node test runner, Playwright.

## Global Constraints

- Start from Phase A's merged `origin/main` on a fresh branch.
- Run one full data.go.kr smoke; allow one additional run only after one justified transport fix.
- Production Collector stays OFF, Worker Cron stays absent, and provider calls remain server-side.
- A3 never enters actual-flight truth; no invented passenger count, gate, gate range, or T2 congestion.
- Demand Index and `demoFlights` remain DEMO.

---

### Task 1: Normalize data.go.kr service-key transport

**Files:**
- Create: `lib/data-go-kr.ts`
- Modify: `scripts/smoke-public-apis.mjs`
- Modify: `lib/collector.ts`
- Test: `tests/sources.test.mjs`
- Test: `tests/security.test.ts`

**Interfaces:**
- Produces: `normalizeDataGoKrServiceKey(value: string): string`.
- Produces: `buildDataGoKrUrl(endpoint: string, serviceKey: string, params: Record<string,string>): URL`.

- [ ] Add failing literal tests proving decoded and percent-encoded inputs produce the same single-encoded outgoing `serviceKey`, and malformed percent input is not double-decoded.
- [ ] Add a failing redaction test proving neither representation nor keyed URL reaches diagnostics.
- [ ] Run targeted tests and confirm failures.
- [ ] Implement one-time percent decoding and a shared URL builder; remove raw/encoded retry construction.
- [ ] Run targeted tests and confirm passes.
- [ ] Commit with `fix: normalize data go kr service keys`.

### Task 2: Restore and run the full read-only authentication smoke

**Files:**
- Modify: `.github/workflows/smoke-public-apis.yml`
- Modify: `scripts/smoke-public-apis.mjs`
- Modify: `docs/DATA_SOURCES.md`

**Interfaces:**
- Produces per source: `PASS | VALID_NO_DATA | AUTH_BLOCKED | REQUEST_ERROR | SCHEMA_ERROR`, record count, and field names only.

- [ ] Remove `SMOKE_SCOPE=seoul` and keep `workflow_dispatch`, bounded rows, no persistence, and redaction.
- [ ] Push the request-layer commit and dispatch one production Environment smoke on the branch.
- [ ] Record sanitized formats, result codes, field names, and no-data semantics for A1/A2/A3/A4/W1/T1.
- [ ] If and only if code 30 exposes one request-construction defect, write a failing regression test, fix it, and dispatch one final smoke.
- [ ] If code 30 persists across providers, mark those sources externally blocked and continue only successful sources.
- [ ] Commit with `docs: record verified public api contracts`.

### Task 3: Canonicalize A1 actual flights and A2 enrichment

**Files:**
- Create: `lib/airport-flights.ts`
- Modify: `lib/source-adapters.ts`
- Modify: `lib/collector.ts`
- Modify: `db/schema.ts`
- Create: `drizzle/0005_airport_source_identity.sql`
- Test: `tests/sources.test.mjs`
- Test: `tests/collector.test.mjs`

**Interfaces:**
- Produces: `canonicalPhysicalFlightId(record): string` from verified master/operating fields, direction, and service date.
- Produces: `mergeActualFlightSources(a1, a2): CanonicalAirportFlight[]` with A1 primary and documented A2 enrichment unless distinctness is proven.

- [ ] Add failing real-shape fixture tests for A1 mapping, A1/A2 overlap, codeshare, same number on another date, changed departure, and cancellation.
- [ ] Run targeted tests and confirm failures.
- [ ] Implement the canonical identity and evidence-based A2 role.
- [ ] Add only the migration columns/tables required to retain source provenance and physical identity.
- [ ] Run targeted tests and confirm passes, including zero duplicate physical aircraft.
- [ ] Commit with `feat: connect canonical actual flights`.

### Task 4: Keep A3 scheduled flights separate

**Files:**
- Modify: `lib/airport-flights.ts`
- Modify: `lib/source-adapters.ts`
- Modify: `lib/collector.ts`
- Modify: `db/schema.ts`
- Create: `drizzle/0006_airport_schedules.sql`
- Test: `tests/sources.test.mjs`
- Test: `tests/collector.test.mjs`

**Interfaces:**
- Produces: `CanonicalAirportSchedule` with season/validity/weekday/flight/terminal/route/time/provenance fields verified from A3.
- Persists: `airport_flight_schedules`; never `airport_flights`.

- [ ] Add failing tests for real A3 mapping, idempotency, schedule/actual separation, and same weekly service across validity periods.
- [ ] Run targeted tests and confirm failures.
- [ ] Add the new migration, schema, adapter, and collector.
- [ ] Run targeted tests and confirm passes.
- [ ] Commit with `feat: connect scheduled airport flights`.

### Task 5: Correct A4, W1, and T1 real contracts

**Files:**
- Modify: `lib/source-adapters.ts`
- Modify: `lib/collector.ts`
- Modify: `lib/areas.ts`
- Test: `tests/sources.test.mjs`
- Test: `tests/collector.test.mjs`

**Interfaces:**
- A4 produces only terminals actually returned by the provider.
- W1 returns `SUCCESS | NO_DATA | AUTH_BLOCKED | ERROR` while preserving issuance and target times.
- T1 returns geographically mapped official events or a legitimate zero-event success.

- [ ] Add failing real-shape tests for A4 P01-only behavior and rejection of fabricated P03/T2.
- [ ] Add failing W1 tests for current issuance slots, official `03` no-data, and gateway authentication errors.
- [ ] Add failing T1 tests for current endpoint fields, zero events, date overlap, and literal-radius area mapping.
- [ ] Run targeted tests and confirm failures.
- [ ] Implement minimal contract corrections based only on smoke evidence.
- [ ] Run targeted tests and confirm passes.
- [ ] Commit with `feat: connect congestion weather and events`.

### Task 6: Serve real airport pressure and source-isolated summaries

**Files:**
- Modify: `lib/airport-pressure.ts`
- Modify: `app/api/live/summary/route.ts`
- Modify: `app/live-signals.tsx`
- Modify: `app/retailpulse-app.tsx`
- Modify: `app/globals.css`
- Test: `tests/product-signals.test.ts`
- Test: `tests/rendered-html.test.mjs`
- Test: `tests/e2e/retailpulse.spec.ts`

**Interfaces:**
- Produces actual 60-minute pressure from A1/A2 plus A4 and future pressure from A3.
- Produces exact-gate, authoritative-zone, or terminal fallback without invented precision.

- [ ] Add failing tests for 60-minute boundaries, cancelled exclusion, changed-time bucket, missing-gate fallback, no invented zone, actual/scheduled separation, and provider failure isolation.
- [ ] Add failing rendered tests for all four locales, no Demo/LIVE crossover, and no fake passenger wording.
- [ ] Run targeted tests and confirm failures.
- [ ] Wire canonical D1 records into the prepared pressure model and compact UI.
- [ ] Run targeted tests and confirm passes.
- [ ] Run 390px Playwright checks for navigation, critical content, and no horizontal overflow.
- [ ] Commit with `feat: show official airport pressure`.

### Task 7: Validate, merge, import sequentially, deploy, and accept Production

**Files:**
- Modify only files required by evidence-backed test or CI failures.

**Interfaces:**
- Produces merged, deployed, source-backed Production behavior for every source that passed authentication and real-schema gates.

- [ ] Run secret scan, lint, typecheck, unit, production build, rendered HTML, Playwright E2E, dependency audit when dependencies changed, and `git diff --check`.
- [ ] Inspect the full branch diff for secrets, Collector OFF, no Cron, no paid/DNS changes, Demo labels, and immutable migration history.
- [ ] Push without force, create focused PR(s), wait for CI, and merge only green changes.
- [ ] Run existing migration-before-deploy workflow from merged `main`.
- [ ] Run one-shot imports separately in order: A1, A4, W1, T1, A2 enrichment, A3 schedule.
- [ ] After each import verify D1 evidence via source health and `/api/live/summary`; stop that source on failure without hiding successful sources.
- [ ] Verify `/ko`, `/en`, `/zh`, `/ja`, `/api/health`, and `/api/live/summary` with no 5xx, no browser provider call, and no exposed key.
- [ ] Confirm Production Collector OFF, Worker Cron absent, paid API zero, and final `main` SHA.
