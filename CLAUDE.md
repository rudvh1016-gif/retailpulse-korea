# RetailPulse Korea — Claude Code Handoff

Claude Code must treat `docs/ENGINEERING_DIRECTION.md` as the canonical cross-agent engineering direction.

At the start of every session:

1. `git fetch origin`
2. inspect real `origin/main` HEAD
3. read `AGENTS.md`
4. read this file
5. read `docs/ENGINEERING_DIRECTION.md`
6. read relevant `docs/PRODUCTION.md`, `docs/DATA_SOURCES.md`, `docs/FORECAST.md`, `docs/OUTCOMES.md`, `docs/SECURITY.md`, `docs/ZERO_COST.md`, and `docs/RUNBOOK.md`
7. if another agent pushed newer commits, audit that diff before editing

Current architectural intent:

- zero fixed runtime cost except an explicitly approved `.com` domain
- hybrid execution model: GitHub Actions for heavier scheduled data/forecast/outcome work; Cloudflare Worker for lightweight site/API serving; Cloudflare D1 for persistent canonical data
- Worker Cron is not automatically the authoritative heavy collector path; benchmark first because the Free CPU ceiling is restrictive
- no paid API/data/runtime LLM unless owner explicitly approves
- no duplicate live schedulers for the same source
- activate P0 sources one at a time with real contract/timestamp/quota/error verification
- preserve immutable prospective prediction archive and separate later outcomes
- preserve truth labels and never relabel proxy as actual foreign sales

If an older production document or implementation conflicts with `docs/ENGINEERING_DIRECTION.md`, do not silently choose one. Report the conflict, inspect current code, and update the outdated implementation/docs deliberately.

Do not expose secrets in prompts, code, logs, screenshots, commits, or frontend bundles.

Before finishing:

- run applicable checks
- inspect diff
- commit + push
- report exact SHA, files changed, tests, remaining blockers, and what the owner must do next
