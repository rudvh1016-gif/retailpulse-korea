# RetailPulse Korea — Shared AI Instructions

This repository is worked on by multiple coding agents, including Codex and Claude Code.

Before changing anything:

1. `git fetch origin`
2. inspect actual `origin/main` HEAD
3. read this file
4. read `CLAUDE.md`
5. read `docs/ENGINEERING_DIRECTION.md`
6. read relevant production/data/forecast/security docs
7. audit any commits newer than the SHA mentioned in the prompt

Canonical engineering direction:

- `docs/ENGINEERING_DIRECTION.md`

Hard rules:

- Never assume the prompt's SHA is latest.
- Preserve the zero-paid-runtime policy except for an explicitly approved domain.
- Prefer the hybrid architecture documented in `docs/ENGINEERING_DIRECTION.md`: GitHub Actions for heavier scheduled collection/forecast/outcome work, Cloudflare Worker for lightweight serving/read APIs, Cloudflare D1 for persistent canonical storage.
- Do not enable duplicate live schedulers for the same source.
- Do not claim `LIVE`, `PASS`, or bug-free without evidence.
- Do not expose API keys or credentials in code, Git history, frontend bundles, logs, screenshots, or AI messages.
- Preserve truth boundaries: visitor != tourist; foreign presence != purchase; proxy != sales; flight != passenger nationality; forecast != actual; backfill != prospective.
- Predictions are immutable/append-only and outcomes remain separate.
- Activate sources one at a time after terms, HTTP contract, timestamps, quotas, parser, D1 write, stale/error, and redaction checks pass.
- If current code conflicts with `docs/ENGINEERING_DIRECTION.md`, report the conflict and resolve it deliberately rather than silently following an older note.
- Preserve the existing product/UI direction unless the owner explicitly asks for redesign.

Before push:

- run applicable lint/typecheck/unit/build/render/E2E/secret checks;
- commit and push;
- report exact commit SHA, changed files, tests run, remaining blockers, and any owner action required.
