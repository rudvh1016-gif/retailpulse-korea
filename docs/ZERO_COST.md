# Zero-Cost Runtime Policy

KORETAIL targets zero paid runtime API, data and LLM cost beyond a separately approved domain.

Canonical implementation guidance:

- `docs/ENGINEERING_DIRECTION.md`
- `docs/ZERO_COST_HYBRID_AUDIT.md`

Prohibited without explicit owner approval:

- Paid API or paid data.
- Runtime OpenAI/Anthropic/Gemini/Workers AI.
- Workers Paid / D1 Paid as an automatic fallback.
- Automatic paid overage or plan upgrade.
- GitHub larger runners.
- Free trials that later require payment.

Preferred zero-cost split:

- GitHub Actions (public repo, standard hosted runner) for heavy scheduled collection, normalization, Forecast, Outcome and maintenance work.
- Cloudflare Worker Free for lightweight site delivery and small read APIs.
- Cloudflare D1 Free for canonical persistent state, immutable predictions, outcomes and compact history.

Do not assume this split is safe merely because it is preferred. Complete the applicable evidence checks in `docs/ZERO_COST_HYBRID_AUDIT.md`.

On the Workers/D1 Free plan, limits should fail closed rather than trigger paid fallback. D1 free-limit exhaustion should lead to errors/degraded mode until reset or an explicit owner decision.

The data model must not store unlimited repeated raw payloads. Prefer semantic changed-only writes, current state, meaningful change history and compact aggregates while preserving immutable Prediction/Outcome evidence.

## Guardrail levels

Thresholds are per resource, not one global percentage:

- Worker requests / CPU-limit evidence
- D1 rows read
- D1 rows written
- D1 storage
- external API quota
- GitHub Actions failures/delay/freshness

**70% — NOTICE**
- warn the owner
- calculate trend / projected exhaustion
- do not make destructive changes

**85% — PROTECT**
- stop optional backfills and nonessential raw snapshots
- reduce optional cadence where source semantics allow
- protect Prediction/Outcome/source-health writes
- inspect query/index/write amplification before discussing Paid

**95% — EMERGENCY**
- stop noncritical collectors/writes
- preserve integrity-critical Forecast/Outcome records where quota permits
- serve cached/stale/official-historical data with correct labels
- if prospective forecast integrity cannot be maintained, mark `DEGRADED` or `PAUSED` instead of fabricating continuity

Usage values must be labelled `OFFICIAL_USAGE` when obtained from an official Cloudflare/API usage source and `INTERNAL_ESTIMATE` when calculated internally. Never present an estimate as a precise official quota percentage.

The executable threshold contract is `lib/quota-guard.ts`. It does not collect official usage. Until Dashboard/GraphQL/query `meta` integration exists, its inputs remain `INTERNAL_ESTIMATE`.

Enabling any paid Cloudflare plan requires a separate explicit user decision.
