# KORETAIL — Claude Code Handoff

## Canonical brand

The owner approved the final public brand on 2026-08-26 KST:

`KORETAIL`

Meaning: **Korea + Retail**

Preferred descriptor:

`Retail Demand Signals for Korea`

`RetailPulse Korea` is now a legacy public name. New public-facing UI, SEO, marketing copy and documentation should use `KORETAIL` unless a compatibility reason temporarily requires the legacy identifier.

For branding/naming work, read:

- `docs/BRAND_DECISION_KORETAIL.md`
- `docs/BRAND_RESEARCH.md`

Do not blindly rename active technical identifiers such as repository slug, Cloudflare Worker/D1 IDs, environment variables, secret names or deployment bindings. Migrate them only with a compatibility-safe plan.

Claude Code must treat `docs/ENGINEERING_DIRECTION.md` as the canonical cross-agent engineering direction and `docs/ZERO_COST_HYBRID_AUDIT.md` as the mandatory pessimistic audit gate.

At the start of every session:

1. `git fetch origin`
2. inspect real `origin/main` HEAD
3. read `AGENTS.md`
4. read this file
5. read `docs/SHARED_PROJECT_STATE.md`
6. read `docs/BRAND_DECISION_KORETAIL.md` when branding/naming is involved
7. read `docs/ENGINEERING_DIRECTION.md`
8. read `docs/ZERO_COST_HYBRID_AUDIT.md`
9. read relevant `docs/PRODUCTION.md`, `docs/DATA_SOURCES.md`, `docs/FORECAST.md`, `docs/OUTCOMES.md`, `docs/SECURITY.md`, `docs/ZERO_COST.md`, and `docs/RUNBOOK.md`
10. if another agent pushed newer commits, audit that diff before editing

Current architectural intent:

- zero fixed runtime cost except an explicitly approved `.com` domain
- benchmark-gated hybrid model: GitHub Actions for heavier scheduled data/forecast/outcome work; Cloudflare Worker for lightweight site/API serving; Cloudflare D1 for persistent canonical data
- Worker Cron is not automatically authoritative for heavy collectors; real Free-tier CPU measurements are required
- changed-only semantic D1 writes; no blind repeated UPSERT of unchanged source rows
- no unlimited repeated raw snapshots; use explicit retention classes while preserving forecast/audit evidence
- free-tier guardrails: 70% NOTICE / 85% PROTECT / 95% EMERGENCY per resource, with `OFFICIAL_USAGE` distinguished from `INTERNAL_ESTIMATE`
- no paid API/data/runtime LLM unless owner explicitly approves
- no duplicate live schedulers for the same source
- current prepared scheduler is disabled-by-default `.github/workflows/collect-production.yml`; Worker Cron has been removed
- activate P0 sources one at a time with real contract/timestamp/quota/error verification
- preserve immutable prospective prediction archive and separate later outcomes
- preserve truth labels and never relabel proxy as actual foreign sales

Do not claim that the hybrid model, a traffic level, or the Free tier is safe merely because it is documented. Complete the applicable evidence checks in `docs/ZERO_COST_HYBRID_AUDIT.md`.

If an older production document or implementation conflicts with canonical direction, do not silently choose one. Report the conflict, inspect current code, and deliberately synchronize the outdated implementation/docs.

Do not expose secrets in prompts, code, logs, screenshots, commits, or frontend bundles.

## Reporting to the owner

Write to the owner in Korean.

Put every completion/handoff report inside **one single fenced code block**, so
the owner can copy the whole thing with one button and paste it elsewhere
(ChatGPT handoff, records). Do not split a report across several blocks, and do
not leave half of it as ordinary prose outside the fence — a report that has to
be selected by hand is a report the owner cannot use.

Short answers to a direct question do not need the fence. A report does.

Before finishing:

- run applicable checks and audit gates
- inspect diff
- commit + push
- report exact SHA, files changed, tests/benchmarks actually run, remaining blockers, and what the owner must do next
