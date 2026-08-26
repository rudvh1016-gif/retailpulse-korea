# KORETAIL — Shared Project State

**Last synchronized:** 2026-08-27 KST  
**Audience:** Codex, Claude Code, future coding agents  
**Purpose:** one shared snapshot of product intent, current production state, safety rules, next step, and brand-name status.

> This document is a shared handoff, not a substitute for current Git state. Always fetch `origin/main` first and audit anything newer than the reference SHA below.

## 1. Canonical brand decision

**Canonical product brand is now `KORETAIL`.**

This is an owner-approved decision as of 2026-08-26 KST.

Brand meaning:

`KORETAIL` = **Korea + Retail**

Preferred descriptive line:

`Retail Demand Signals for Korea`

Legacy public brand:

`RetailPulse Korea`

From this point onward, new public-facing product/marketing/SEO copy should use `KORETAIL` unless a compatibility reason temporarily requires the legacy name.

Read the canonical brand decision before any naming/branding work:

- `docs/BRAND_DECISION_KORETAIL.md`
- `docs/BRAND_RESEARCH.md`

Technical identifiers such as repository name, Cloudflare Worker/D1 names, environment variables, secret names or deployment IDs must **not** be renamed blindly. Migrate them only when it is safe and will not break Cloudflare/GitHub Actions/D1/DNS work in progress.

## 2. Product purpose

KORETAIL is a Seoul-first retail/tourism demand intelligence product.

Initial focus:

- Myeongdong
- Hongdae
- Seongsu
- Incheon Airport T1/T2 flows
- foreign-visitor / tourism / shopping-demand signals
- today / tomorrow / best-time / why / 7-day context
- practical output for tourists and retail/business operators

Long-term intent is to combine official/public signals such as airport, tourism, weather, population and commercial-district data into a useful demand signal while keeping strict truth boundaries between proxies, forecasts and actual outcomes.

## 3. Current Git / audit reference

Reference merged main SHA at the end of the 50-GATE pessimistic production audit:

`2ed9133f77db057c61cc1eb5c74ea45cccbf32d8`

Merged PR:

`#5 Harden zero-cost hybrid production pipeline`

Audit result:

`44 PASS / 0 FAIL / 6 BLOCKED`

Do not assume this SHA remains latest. Fetch and inspect the actual current `origin/main` before every task.

## 4. Confirmed production architecture direction

Preferred zero-fixed-runtime architecture:

```text
Official/public sources
  -> GitHub Actions for heavier collection / validation / normalization / hashing / forecast-outcome orchestration
  -> Cloudflare D1 for persistent canonical storage
  -> Cloudflare Worker for lightweight site delivery and small indexed read APIs
```

Hard architectural decisions already made:

- GitHub Actions is the prepared authoritative collector scheduler.
- Heavy duplicate Worker Cron collection was removed.
- `.github/workflows/collect-production.yml` remains disabled unless `ENABLE_PRODUCTION_COLLECTOR=true`.
- Do not enable a second authoritative scheduler for the same source.
- D1 current-state writes use semantic changed-only logic rather than blind repeated writes.
- volatile retrieval fields such as `retrievedAt` must not create fake semantic changes.
- repeated identical semantic payload must produce zero current-state semantic writes on the second run.
- retries must remain bounded.
- prediction records are immutable / append-only; outcomes remain separate.
- raw repeated snapshots must not grow without an explicit retention policy.

## 5. Zero-cost policy

Default policy is zero paid runtime unless the owner explicitly approves a final custom domain or another cost.

Do not automatically upgrade to a paid Cloudflare/API/LLM plan.

Free-tier protection policy:

- 70% = NOTICE
- 85% = PROTECT
- 95% = EMERGENCY

At pressure points, prefer:

- stopping optional history
- reducing collection cadence
- stopping optional backfills
- showing STALE / DEGRADED / PAUSED truthfully

Never delete immutable forecast/outcome evidence just to recover free-tier space.

## 6. Current production boundary

The codebase has passed local/CI evidence for the completed gates, but LIVE Production is not yet proven.

Current known blockers from the 50-GATE audit:

- Gate 13 — real Cloudflare Worker HTTP CPU evidence
- Gate 15 — real Worker requests/user telemetry
- Gate 20 — real D1 index/write amplification measurement
- Gate 35 — official D1 usage metrics
- Gate 46 — final custom-domain SEO / DNS / HTTPS verification
- Gate 50 — true source-to-outcome E2E

Do not convert these to PASS merely because a Cloudflare account becomes connected.

## 7. Current next phase: Cloudflare bridge

The owner has already sent Codex a Cloudflare-safe-connection prompt.

The intended next phase is:

1. re-fetch and audit current `origin/main`
2. keep one codebase
3. use the simplest supported Cloudflare environment separation for staging vs production
4. keep staging and production D1 data physically separate
5. keep the production collector OFF
6. connect Cloudflare only when real owner authentication is available
7. validate staging first
8. test real API contract and remote D1 writes manually
9. verify identical semantic payload => zero second current-state semantic writes
10. only then prepare production infrastructure
11. keep scheduled production collection OFF until evidence gates pass
12. connect the final custom domain only as a later explicit step

The staging environment is an internal safety layer, not a second product the owner should have to manage manually.

## 8. Recommended environment shape

Prefer one repository / one codebase with lightweight Cloudflare environment separation.

Conceptual target:

```text
KORETAIL codebase
  -> staging Worker -> staging D1
  -> production Worker -> production D1
```

Suggested D1 naming may remain legacy/internal during the transition if Cloudflare work is already in progress. Do not rename active resources just for cosmetic consistency.

Application binding can remain `DB` in both environments while binding to different actual databases.

Do not let staging overwrite production resources or share the production database without an explicit, evidence-based decision.

## 9. Collector safety

Until the real environment is verified:

- `ENABLE_PRODUCTION_COLLECTOR` must remain false / disabled.
- `RPK_RETAIN_FLIGHT_CHANGE_HISTORY` should remain false / disabled until real D1 write/storage usage is measured.
- first real runs should be manual, not scheduled.
- source activation should happen one source at a time after terms, endpoint, response contract, timestamps, quota, parser, changed-only write, fallback/stale/error and secret-redaction checks pass.

Never request that the owner paste secrets into AI chat.

## 10. Main-branch safety

At the audit reference state, `main` branch protection was not enabled.

Before full production operation, evaluate a minimal safe policy such as:

- PR-based merge
- required green CI
- accidental direct-push prevention

Do not apply a disruptive repository policy without understanding the owner's current workflow.

## 11. Brand-name status

Final brand decision:

`KORETAIL`

Preferred descriptor:

`Retail Demand Signals for Korea`

`RetailPulse Korea` is the legacy former public name. Current public UI, SEO, PWA, share, accessibility and 404 surfaces use `KORETAIL`; remaining occurrences are historical records or compatibility-sensitive technical identifiers.

`Korea Retail Signal` is **not** the final brand and should not be introduced as such.

Brand research remains documented in:

- `docs/BRAND_RESEARCH.md`

Canonical decision is documented in:

- `docs/BRAND_DECISION_KORETAIL.md`

## 12. Competitive landscape snapshot

KORETAIL is not entering an empty market.

Relevant adjacent/direct competitors or substitutes include:

### Korea / Seoul public and institutional substitutes

- Seoul Commercial District Analysis Service: sales, stores, floating population, residential population, area/industry analysis
- Seoul tourism/commercial-district tourism activation indicators using foreign short-stay population and foreign spending signals
- Seoul AI Foundation / Seoul Metropolitan Government analyses of foreign-tourist movement using telecom foot-traffic data

### Korea retail-market intelligence

- CBRE Korea Retail Insights: Korean retail-market analysis and practical intelligence for brands/investors
- Cushman & Wakefield Korea: major Seoul high-street retail analysis including Myeongdong, Hongdae, Seongsu, foreign-tourist inflow and market outlooks

### Global / adjacent signal products

- Retail Signal (NYC): retail market intelligence, site selection, corridor analysis and lease advisory
- Propheus Retail Signal: store-level forward outlook using events, competitor promotions, weather and demand signals
- Placer.ai and other location-intelligence products: foot traffic / trade-area / retail location analytics

### Current differentiation target

KORETAIL should not try to beat every commercial-district dashboard on raw data volume.

Its useful wedge is:

- Seoul-first and foreign-visitor/shopping specific
- today/tomorrow and best-time oriented rather than only historical quarterly analysis
- airport + tourism + weather + area signals connected in one product
- transparent distinction between official history, proxy signals, forecast and actual outcome
- multilingual tourist/business usability
- prospective forecast archive with later outcome scoring

This differentiation is a product hypothesis and must be validated with users and measured forecast quality; do not present it as proven market leadership.

## 13. AI-agent coordination rules

Codex and Claude Code must both:

1. fetch `origin/main`
2. inspect actual current HEAD
3. read `AGENTS.md`
4. read `CLAUDE.md`
5. read this file: `docs/SHARED_PROJECT_STATE.md`
6. read `docs/BRAND_DECISION_KORETAIL.md` for any branding/naming work
7. read canonical engineering / zero-cost / production documents relevant to the task
8. inspect commits newer than any prompt reference SHA
9. avoid overwriting work from another agent

Do not treat a prompt's stale snapshot as current truth.

## 14. Owner communication

The owner is non-developer and should not be asked to reason through implementation details unnecessarily.

When owner action is required, report:

**지금 네가 할 일 1개**

and provide one simple action at a time.

Do not ask the owner to paste secret/API token values into chat.

## 15. Final truth rule

Do not claim any of the following without evidence:

- LIVE
- Production verified
- 50/50 PASS
- bug-free
- free-tier safe at a given traffic level
- official foreign sales
- forecast accuracy
- true E2E

If evidence is missing, say BLOCKED / PENDING / NOT VERIFIED.
