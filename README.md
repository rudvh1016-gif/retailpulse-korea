# KORETAIL

**Retail Demand Signals for Korea**

KORETAIL is a Seoul-first retail/tourism demand intelligence product that combines public and official signals such as airport flow, tourism, weather, visitor presence and commercial-area context into understandable today/tomorrow retail-demand signals.

Current MVP focus:

- Myeongdong
- Hongdae
- Seongsu
- Incheon Airport T1/T2
- multilingual visitor/business experience
- today / tomorrow / best-time / why / 7-day context
- transparent distinction between official history, proxy signals, forecasts and actual outcomes

## Brand

Canonical public brand:

`KORETAIL`

Meaning:

`Korea + Retail`

Preferred descriptor:

`Retail Demand Signals for Korea`

Legacy project/repository identifiers may still contain `retailpulse-korea` temporarily for compatibility while Cloudflare, GitHub Actions and D1 migration is completed safely.

See:

- `docs/BRAND_DECISION_KORETAIL.md`
- `docs/BRAND_RESEARCH.md`
- `docs/SHARED_PROJECT_STATE.md`

## Current production state

Reference 50-GATE pessimistic audit result:

`44 PASS / 0 FAIL / 6 BLOCKED`

The completed audit does **not** mean the site is fully live or true-production verified.

Known evidence still required includes real Cloudflare Worker CPU/request telemetry, real D1 write/usage measurements, final-domain SEO/HTTPS verification, and true source-to-outcome E2E.

The production collector must remain disabled until real account/key/source gates pass.

## Architecture direction

```text
Official/public sources
  -> GitHub Actions for heavier collection / validation / normalization / hashing / forecast-outcome orchestration
  -> Cloudflare D1 for persistent canonical storage
  -> Cloudflare Worker for lightweight site delivery and indexed read APIs
```

Key safety principles:

- one authoritative collector scheduler
- no duplicate heavy Worker Cron
- semantic changed-only D1 writes
- bounded retries
- explicit retention classes
- immutable prospective forecasts
- separate outcomes
- truthful STALE / MISSING / DEGRADED states
- no automatic paid-plan upgrade

## Agent handoff

Codex and Claude Code must read before editing:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/SHARED_PROJECT_STATE.md`
4. `docs/BRAND_DECISION_KORETAIL.md`
5. relevant engineering/production/security/zero-cost docs

Always fetch and inspect the real current `origin/main` before editing. Never assume an older prompt SHA is still current.

## Legacy internal identifiers

The repository is currently still named `retailpulse-korea` and some internal resource/config identifiers may retain the legacy string during the Cloudflare transition.

Do not rename active infrastructure identifiers only for cosmetic consistency. Public-facing brand migration to KORETAIL and technical-resource migration are separate tasks.
