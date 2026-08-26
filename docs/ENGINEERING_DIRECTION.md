# RetailPulse Korea — Engineering Direction

**Status:** Canonical engineering direction for Codex + Claude Code  
**Decision date:** 2026-08-26 KST  
**Reviewed baseline:** `8c738802211c20c5707a3612c8d61a1658043fb5`  
**Scope:** Production architecture, zero-cost operating policy, data collection, forecast/outcome validation, deployment order, and AI handoff rules.

> This document is the source of truth when an implementation prompt conflicts with an older production note. Do not silently change this direction. If a real test proves part of it wrong, document the evidence first and update this file in the same change.

## 1. Product truth that engineering must preserve

RetailPulse Korea (RPK) is a **Foreign Visitor Retail Intelligence** product, initially for Myeongdong, Hongdae, and Seongsu.

Never blur these boundaries:

- visitor != tourist
- foreign presence != tourist
- shopping-purpose movement != purchase
- domestic card spend != foreign spend
- flight/route/airline != passenger nationality
- airport flow != store footfall
- forecast != actual
- backfill != prospective forecast
- proxy != sales

Until real store ground truth exists, use terms such as **Foreign Shopping Demand Signal / Foreign Retail Signal / Proxy**. Do not call a proxy “foreign sales”.

## 2. Cost policy — hard guardrail

The operating target is **zero fixed runtime cost**, excluding an explicitly approved `.com` domain.

Allowed by default:

- standard GitHub-hosted runners for this public repository
- Cloudflare Workers Free
- Cloudflare D1 Free
- free official/public APIs whose commercial + automated reuse terms have been verified
- GitHub Secrets / Cloudflare Secrets

Not allowed without explicit owner approval:

- Workers Paid or automatic paid-plan upgrade
- paid API/data fallback
- paid runtime LLM / Workers AI
- GitHub larger runners
- any service that can create an unbounded bill

If a free limit is too small, **degrade, reduce cadence, batch, or stop** before proposing paid infrastructure.

### Current free-plan limits to design against

These are planning limits, not permanent promises. Recheck official docs immediately before production activation.

- Cloudflare Workers Free: 100,000 Worker requests/day; 10 ms CPU per HTTP request and per Cron invocation; 5 Cron Triggers/account.
- Cloudflare D1 Free: 5,000,000 rows read/day; 100,000 rows written/day; 5 GB total storage; 500 MB max per database; 10 databases/account.
- GitHub Actions: standard GitHub-hosted runners are currently free for public repositories. Do not use larger runners.

Because the Worker Free CPU budget is only 10 ms, **do not assume heavy source parsing, hashing, forecasting, or bulk writes belong in a Worker Cron**.

## 3. Architecture decision — HYBRID, benchmark-gated

The preferred production shape is:

```text
Official APIs / public sources
        ↓
GitHub Actions (scheduled heavy collection + normalization + forecast/outcome jobs)
        ↓
Cloudflare D1 (canonical persistent store)
        ↓
Cloudflare Worker / static assets (small read APIs + site delivery)
        ↓
retailpulsekorea.com or final approved .com
```

### Why this split

**GitHub Actions = back-office worker**

Use it for work that can be CPU-heavy or bursty:

- official API collection
- JSON/file parsing
- normalization
- hashing
- feature building
- forecast generation
- outcome collection/matching
- backfills
- maintenance jobs

This avoids forcing heavy jobs into the Worker Free 10 ms CPU ceiling.

**Cloudflare Worker = storefront/API counter**

Keep request-time work small and predictable:

- serve static assets
- read already-prepared records from D1
- return `/api/health`, source status, and compact product responses
- no expensive forecast computation on a visitor request
- no direct official-source calls on ordinary visitor requests

**Cloudflare D1 = persistent ledger**

Use D1 for:

- source snapshots / source health
- immutable prospective predictions
- outcomes
- baseline scores
- collector run metadata
- canonical history needed by the product

Do not use GitHub-generated `.js/.json` files as the primary long-term RPK database merely because GAEO uses that pattern. GAEO and RPK have different data/validation needs.

### Cloudflare Cron policy

The existing 30-minute Worker Cron is **not the default heavy collector path anymore**.

Before enabling any Worker Cron job:

1. benchmark real CPU time with production-shaped payloads;
2. prove comfortable margin below the Free 10 ms CPU limit;
3. prove source quota, retries, parsing, hashing, and D1 writes remain safe;
4. otherwise keep that job in GitHub Actions.

Cloudflare Cron may remain for very small health/housekeeping work if measured safe. Do not keep duplicate live schedulers for the same collector.

## 4. Runtime rule: collect first, serve second

Visitor requests must normally read previously collected data.

Bad pattern:

```text
visitor → RPK → official API → wait → parse → return
```

Preferred pattern:

```text
scheduled collector → official API → normalize → D1
visitor → RPK → D1 → return
```

Benefits:

- protects official API quotas
- isolates source outages from visitors
- makes timestamps/audits reproducible
- prevents secret keys reaching frontend code
- makes forecast-vs-actual validation deterministic

## 5. Forecast and outcome rules — non-negotiable

### Prediction

A prospective prediction is append-only/immutable and must preserve at least:

`predictionId, createdAt, targetDate/targetAt, targetHour, area, industry, targetId, forecastValue/value, forecastClass, confidence, modelVersion, proxyVersion, featureVersion, dataCutoff, sourceVersions, availableDataHash/inputHash, predictionHash, recordOrigin`.

Never edit or delete a prediction after its outcome could be known.

### Outcome

Outcome is separate from prediction and must preserve at least:

`predictionId, targetId, outcomeType, eventDate/eventAt, availableAt, collectedAt, actualValue, actualUnit, source/sourceId, sourceVersion, verificationLevel, qualityStatus`.

Keep these times distinct:

- event time
- source availability/publication time
- ingestion time

Backfilled historical values are not prospective forecasts.

### Baselines

Always compare the **same target** against simple baselines such as:

- same weekday last week
- four-week average
- seasonal naive

Do not publish a vague “accuracy %”. Use target-appropriate metrics such as MAE, directional hit rate, rank correlation, baseline improvement, coverage/calibration.

Until at least 30 unique prospective forecast dates exist, public status should remain `COLLECTING` or `PRELIMINARY`. Promotion decisions require materially longer evidence.

## 6. Source activation rule

No source becomes `LIVE` merely because a key exists.

Each source passes, in order:

1. official terms + automated/commercial reuse check
2. key/approval check
3. real HTTP contract check
4. timestamp semantics check
5. quota/cadence calculation
6. parser/schema tests
7. D1 idempotent write test
8. missing/error/stale behavior test
9. redaction/log test
10. staging observation
11. only then `LIVE`

Statuses remain distinct: `LIVE`, `STALE`, `MISSING`, `DEGRADED`, `ERROR`, `OFFICIAL_HISTORICAL`, `DEMO`.

## 7. Current source priority

P0 order:

1. Incheon Airport detailed flight status
2. Seoul real-time city data
3. KMA short-term forecast + later observed weather
4. Seoul foreign-presence data only after the post-July-2026 grid/API mapping and reuse terms are reverified

Tourism-purpose movement, TourAPI, ECOS, search-trend sources, carrier/mobile datasets, etc. are later/conditional. Do not expand P0 merely because an API exists.

## 8. Secrets

Never place actual keys/tokens in:

- Git history
- frontend bundles
- screenshots sent to AI
- issue/PR text
- logs
- example URLs that may be persisted

Expected secret classes include:

- `DATA_GO_KR_SERVICE_KEY`
- `SEOUL_OPEN_DATA_KEY`
- KMA credential only as required by the actual approved account/key model
- Cloudflare account/deploy/D1 credentials required by the selected GitHub Action writer

GitHub Actions receives collection secrets from GitHub Secrets. Cloudflare receives only the secrets it actually needs. Prefer least privilege.

## 9. Domain strategy — buy early, cut over late

To avoid repeatedly changing API-application URLs:

1. choose and purchase the final `.com` early;
2. put it under Cloudflare DNS/zone management;
3. use the final domain as the declared service URL where appropriate;
4. keep production cutover controlled while collectors/D1 are tested;
5. route the final `.com` to the production Worker only after staging, D1, API, SEO, and signed-out smoke tests pass.

So **domain ownership can happen early; final traffic cutover happens late**.

## 10. Implementation migration from the current tree

At the reviewed baseline, production structure exists but live production is incomplete. The 2026-08-26 Hybrid audit then removed the duplicate-risk Worker Cron and prepared the disabled GitHub scheduler:

- independent Cloudflare Worker config exists
- D1 schema/migrations exist locally
- immutable prediction/outcome/baseline contracts exist
- the Worker no longer has the 30-minute collector hook or trigger
- `.github/workflows/collect-production.yml` is the single disabled-by-default authoritative scheduler candidate
- D1 current writes use semantic conditional UPSERT; optional semantic change history is separately gated
- airport departure collection is the most implemented live collector path
- Seoul/KMA collection paths are not yet complete live collectors
- Production D1 is not yet created/connected
- official keys are not yet connected
- public product values remain Demo/official-historical where labelled

Next architecture work should therefore be incremental, not a rewrite.

### Required migration tasks

1. Preserve the existing frontend/product design and production contracts.
2. Keep collector/forecast logic runnable from standard Node/GitHub Actions without duplicating business rules.
3. Activate the existing single GitHub Actions orchestration only after its Cloudflare/API secrets and source gates pass.
4. Write to Production D1 through a secure, least-privilege Cloudflare mechanism (for example approved Wrangler/Cloudflare API use). Never expose D1 write credentials to frontend code.
5. Keep writes idempotent and bounded; batch where possible.
6. Do not restore duplicate heavy Worker Cron collection while GitHub Actions is authoritative.
7. Benchmark Worker request CPU with production-shaped routes. Push pages toward static/pre-rendered delivery where possible; keep dynamic APIs small.
8. Add usage telemetry/guard checks for Worker requests, D1 rows read/written, storage growth, API quotas, and Action failures.
9. Fail closed on missing secrets and fail visibly/degraded on source outages; never fabricate data.
10. Activate sources one at a time.

## 11. Recommended execution order from here

1. **Fetch latest `origin/main` and audit before editing.**
2. Reserve the final `.com` and configure Cloudflare account/zone, but do not rush production cutover.
3. Finish official key/applications using the final service domain where accepted.
4. Create Production D1 and apply migrations.
5. Deploy a staging Worker (`workers.dev`) and verify `/api/health` + signed-out behavior.
6. Implement the hybrid GitHub Actions collector path and secure D1 writer.
7. Connect Incheon Airport first; verify real source → normalized record → D1 → API/UI.
8. Connect Seoul real-time city data.
9. Connect KMA forecast/observed weather.
10. Reverify and then connect foreign-presence data.
11. Start immutable prospective forecast archive.
12. Start outcomes + baselines.
13. Run several days of staging/production observation and quota/error tests.
14. Cut the final `.com` over to the production Worker, verify canonical/hreflang/sitemap/robots/HTTPS/apex-www redirect.
15. Add Search Console/Bing and continue evidence collection.

## 12. AI collaboration protocol — Codex + Claude Code

Every coding session must begin with:

1. `git fetch origin`
2. inspect actual `origin/main` HEAD
3. read root `AGENTS.md`
4. read root `CLAUDE.md`
5. read this file `docs/ENGINEERING_DIRECTION.md`
6. read the relevant production/data/forecast/security docs
7. compare current code against this direction before changing anything

Rules:

- Never assume a SHA in a prompt is still latest.
- If another AI has pushed work since the prompt was written, audit that diff first.
- Do not independently redesign architecture, naming, product truth, or cost policy.
- If a contradiction is found, stop and report it rather than choosing silently.
- Do not create parallel collectors/schedulers that duplicate the same live source.
- Do not mark anything `LIVE`, `PASS`, or “bug-free” without evidence.
- Do not add a paid dependency to solve a free-tier limit.
- Preserve public-site truth labels and immutable forecast/outcome boundaries.
- Before push: run the applicable lint/typecheck/unit/build/render/E2E/secret tests.
- After work: commit, push, and report exact commit SHA, changed files, tests, remaining blockers, and any owner action required.

## 13. Definition of “ready”

RPK is not production-ready merely because the UI opens.

Minimum operational readiness means:

- final domain owned and production routing verified
- Cloudflare Free limits confirmed current
- Production D1 connected and migrated
- live-source keys stored only in secret stores
- P0 sources contract-tested and timestamp-correct
- collector runs are scheduled without duplicate execution
- source health/error/stale behavior works
- immutable predictions are actually being created prospectively
- outcomes are actually being collected later
- baselines score the exact same target
- no public claim outruns the evidence
- zero-paid-runtime guard remains intact

That is the engineering direction until evidence justifies a documented change.
