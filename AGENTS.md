# KORETAIL — Shared AI Instructions

This repository is worked on by multiple coding agents, including Codex and Claude Code.

## Canonical brand

The owner approved the final public brand on 2026-08-26 KST:

`KORETAIL`

Meaning: **Korea + Retail**

Preferred descriptor:

`Retail Demand Signals for Korea`

`RetailPulse Korea` is now a legacy public name. New public-facing UI, SEO, marketing copy and documentation should use `KORETAIL` unless a compatibility reason temporarily requires the legacy identifier.

For any branding/naming task, read:

- `docs/BRAND_DECISION_KORETAIL.md`
- `docs/BRAND_RESEARCH.md`

Do **not** blindly rename active technical identifiers such as repository slug, Cloudflare Worker/D1 IDs, environment variables, secret names or deployment bindings. Migrate them only with a compatibility-safe plan.

Before changing anything:

1. `git fetch origin`
2. inspect actual `origin/main` HEAD
3. read this file
4. read `CLAUDE.md`
5. read `docs/SHARED_PROJECT_STATE.md`
6. read `docs/BRAND_DECISION_KORETAIL.md` when branding/naming is involved
7. read `docs/ENGINEERING_DIRECTION.md`
8. read `docs/ZERO_COST_HYBRID_AUDIT.md`
9. read relevant production/data/forecast/security docs
10. audit any commits newer than the SHA mentioned in the prompt

Canonical engineering direction:

- `docs/ENGINEERING_DIRECTION.md`
- `docs/ZERO_COST_HYBRID_AUDIT.md` is the mandatory pessimistic audit gate before architecture-changing implementation.

Hard rules:

- Never assume the prompt's SHA is latest.
- Preserve the zero-paid-runtime policy except for an explicitly approved domain.
- Prefer the benchmark-gated hybrid architecture: GitHub Actions for heavier scheduled collection/forecast/outcome work, Cloudflare Worker for lightweight serving/read APIs, Cloudflare D1 for persistent canonical storage.
- Heavy Worker Cron work is not authoritative by default; benchmark first.
- Do not enable duplicate live schedulers for the same source.
- D1 collectors must not blindly rewrite unchanged rows; semantic changed-only writes must be measured and tested.
- The only prepared authoritative collector scheduler is `.github/workflows/collect-production.yml`; keep it disabled until account/key/source gates pass. Do not restore Worker Cron in parallel.
- Do not keep unlimited repeated raw snapshots; use explicit current/change-history/aggregate/retention classes while preserving audit evidence.
- Free-tier guardrails are 70% NOTICE / 85% PROTECT / 95% EMERGENCY per resource, and must distinguish official usage from internal estimates.
- Do not claim `LIVE`, `PASS`, free-tier safety, traffic capacity, or bug-free without evidence.
- Do not expose API keys or credentials in code, Git history, frontend bundles, logs, screenshots, or AI messages.
- Preserve truth boundaries: visitor != tourist; foreign presence != purchase; proxy != sales; flight != passenger nationality; forecast != actual; backfill != prospective.
- Predictions are immutable/append-only and outcomes remain separate.
- Activate sources one at a time after terms, HTTP contract, timestamps, quotas, parser, D1 write, stale/error, and redaction checks pass.
- If current code conflicts with canonical docs, report and resolve the conflict deliberately rather than silently following an older note.
- Preserve the existing product/UI direction unless the owner explicitly asks for redesign.

Before push:

- run applicable lint/typecheck/unit/build/render/E2E/secret checks;
- run the applicable items in `docs/ZERO_COST_HYBRID_AUDIT.md`;
- commit and push;
- report exact commit SHA, changed files, tests run, remaining blockers, and any owner action required.
