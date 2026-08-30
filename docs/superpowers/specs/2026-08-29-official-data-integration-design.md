# Official Data Integration Design

## Goal

Connect S2 and the six approved data.go.kr sources only after real authenticated response contracts are verified, then carry each useful source through canonical normalization, idempotent D1 persistence, source health, the internal read API, and an honest production UI.

## Delivery shape

The work is split at a hard merge boundary.

1. Phase A completes OA-23018 on `claude/latest-git-pull-check-m6piv4`, removes the obsolete discovery probe, verifies Production, and merges.
2. Phase B starts from the merged `main`, verifies the reissued data.go.kr key once, then connects successful sources. Reviewable PR splits are allowed only where they create independently deployable behavior.

This preserves the eleven research commits without merging the 629-line portal experiment as production code.

## Evidence gates

- Provider keys exist only in the GitHub `production` Environment.
- Smoke workflows are manual, bounded, read-only, and redact full request URLs and secret representations.
- S2 uses exactly `Spop250mFornTempDong`. It probes JSON once; XML is probed once only when JSON is unsupported.
- The data.go.kr request layer decodes a percent-encoded stored key once and lets `URLSearchParams` perform the single transport encoding. It never logs the input, normalized value, fragment, or fingerprint.
- A source is not called connected until a real record reaches D1, source health, the internal API, and a truthful production surface.
- After correct transport, repeated code 30 across providers is an external blocker; no random key transformations or repeated workflows are allowed.

## S2 model

OA-23018 is a new short-stay foreign living-population product, not a continuation point for the legacy bundled series. A new migration will preserve raw administrative-dong provenance separately from KORETAIL area aggregates. Canonical records preserve source/product version, mapping version, reference time, availability time when supplied, retrieval time, value/unit, verified dimensions, quality, schema version, and semantic source hash.

Area mappings are centralized in `lib/areas.ts` as `areaId -> H_DNG_CD[]` and documented with an official mapping source and version. Aggregation selects the real total row or a single verified exhaustive breakdown; it never adds a total to its own nationality, gender, or age components. Identical official observations remain one logical record when retrieval time changes.

The public label is “단기외국인 생활인구” or an equivalent locale translation. It is never labelled tourists, sales, or real-time unless the official publication timing supports that claim.

## Airport, weather, and event model

- A1 is the actual/current flight primary source.
- A2 is compared to A1 using real fields. It becomes enrichment/validation unless evidence proves a distinct physical-flight product.
- Canonical physical-flight identity uses verified operating/master fields plus direction and service date. Codeshares and A1/A2 overlap cannot increase the physical-aircraft count.
- A3 remains in a separate scheduled-flight table and can only feed future pressure.
- A4 uses only the terminal scope returned by the provider. P01/T1 is supported; P03/T2 is not fabricated.
- W1 preserves issued, target, and retrieval times and distinguishes gateway authentication from official valid no-data.
- T1 maps events by verified coordinates and bounded area radius. Event existence never becomes an attendance or sales estimate.

The prepared 60-minute airport-pressure model consumes only canonical actual or scheduled flights. Cancelled flights are excluded. Exact gates require fresh official gate evidence; gate zones require an authoritative topology; otherwise the UI falls back to terminal and time.

## Runtime and failure behavior

Visitor requests read D1 only. Provider calls occur in manual one-shot or separately approved collector workflows. `/api/live/summary` queries each source independently so one unavailable table or provider does not create a whole-response 500.

One-shot Production imports run in this order and stop for inspection between groups: S2, A1, A4, W1, T1, A2 enrichment, A3 schedule.

## UI and truth labels

The existing compact official-signals hierarchy and four locales remain. New signals appear only when official D1 records exist. The Demand Index, sample recommendations, sample dates, and `demoFlights` remain explicitly DEMO and never feed official airport pressure or source health.

## Safety invariants

- Production Collector remains OFF.
- Worker Cron remains absent.
- No paid API, plan, DNS, domain, or billing change is authorized.
- No provider secret reaches source, logs, artifacts, internal API payloads, or browser requests.
- No force push and no applied migration modification.

## Verification

Every behavior change follows red-green-refactor. Required final evidence is secret scan, lint, typecheck, unit tests, production build, rendered HTML tests, Playwright E2E, `git diff --check`, CI, bounded one-shot results, D1/source-health/API inspection, deployment, and locale/health/live-summary production smoke.
