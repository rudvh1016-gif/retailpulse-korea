# RPK Zero-Cost Hybrid Audit Gate

**Status:** Mandatory pre-implementation audit for Codex + Claude Code  
**Verified:** 2026-08-26 KST  
**Applies to:** production collection, Cloudflare Worker/D1, GitHub Actions, Forecast/Outcome, and free-tier guardrails.

This file supplements `docs/ENGINEERING_DIRECTION.md`. It exists to prevent a coding agent from treating the hybrid direction as already proven. The architecture remains **benchmark-gated and evidence-gated**.

Implementation evidence and the current 50-gate result live in `docs/PRODUCTION_HYBRID_AUDIT_50.md`. Real Cloudflare CPU/D1/domain/true-E2E gates remain blocked there.

## A. Five non-negotiable operating rules

1. **Heavy collection / normalization / Forecast / Outcome work → GitHub Actions first.**
2. **Cloudflare Worker → site delivery and small read APIs first.** Do not put bulk parsing, large hashing, heavy forecasting, or 1,000-row transformation into request-time or Cron work unless measured safe.
3. **D1 → changed-only writes where semantics did not change.** A collector receiving 1,000 records must not blindly UPDATE 1,000 records.
4. **No unlimited repeated raw snapshots.** Preserve enough evidence for audit/reproducibility, but use source-specific current/change-history/aggregate/retention policies.
5. **Free-tier protection → 70% / 85% / 95% guardrails.** Protect immutable Forecast/Outcome truth before optional history, raw payloads, backfills, or noncritical collectors.

These are design candidates, not excuses to skip measurement. If tests show a different structure is materially safer, simpler, and still zero-paid-runtime, document the evidence before changing the canonical direction.

## B. Current official planning limits

Recheck official docs immediately before production activation because limits can change.

### Cloudflare Workers Free

- 100,000 Worker requests/day.
- 10 ms CPU per HTTP invocation.
- 10 ms CPU per Cron Trigger invocation.
- 50 external subrequests per invocation.
- 5 Cron Triggers/account.
- Static assets should be kept outside unnecessary dynamic Worker execution where possible.

### Cloudflare D1 Free

- 5,000,000 rows read/day.
- 100,000 rows written/day.
- 5 GB total storage/account.
- 500 MB maximum per database.
- 10 databases/account.
- Free query limits reset daily at 00:00 UTC.
- `INSERT`, `UPDATE`, and `DELETE` count as rows written.
- Index maintenance can add additional rows written when indexed fields are written.
- Indexes also consume storage.
- D1 usage must be measured from Cloudflare query `meta`, dashboard Row Metrics, or GraphQL Analytics where available. Do not invent precise usage percentages from an internal counter and label them official.
- When Free daily read/write limits are exhausted, queries fail until reset; do not rely on an automatic paid fallback.

### GitHub Actions

- Standard GitHub-hosted runners are currently free and unlimited for public repositories.
- Do not use larger runners without explicit owner approval.
- `schedule` is not a real-time scheduler: jobs can be delayed during high load, especially near the start of an hour, and queued jobs can be dropped under sufficiently high load.
- Prefer off-minute schedules such as `:07` / `:37` when source semantics permit.
- Scheduled workflows run from the default branch.
- In a public repository, scheduled workflows can be automatically disabled after 60 days with no repository activity.
- Therefore actual `retrievedAt`/run time must be recorded; never pretend the nominal cron time was the real collection time.

## C. Ten-review conclusion before implementation

The hybrid direction was rechecked against ten failure classes. Current conclusion is **proceed to audit/implementation, not “already proven production-safe.”**

1. **Worker CPU risk:** serious if heavy collectors remain in Worker Cron. Keep heavy work in Actions unless benchmark proves safe margin below 10 ms.
2. **D1 write risk:** serious if collectors blindly UPSERT unchanged rows. Changed-only semantic writes are required.
3. **Index amplification risk:** real. Every index must justify its read benefit against extra writes/storage.
4. **D1 storage risk:** manageable initially, but repeated full snapshots can make 500 MB/database the first long-term limit.
5. **GitHub schedule risk:** real. Delay/drop/inactivity behavior means recovery, freshness truth, and idempotency are mandatory.
6. **Duplicate scheduler risk:** real. The same source must not have authoritative Worker Cron + Actions schedules simultaneously.
7. **External API quota risk:** may become the binding limit before Cloudflare; cadence must be calculated per source.
8. **Usage-monitoring risk:** 70/85/95 must distinguish `OFFICIAL_USAGE` from `INTERNAL_ESTIMATE`.
9. **Data-truth risk:** quota protection must never mutate/delete prospective predictions or mislabel stale/demo/proxy data as live/actual/sales.
10. **Cost-risk conclusion:** zero-paid-runtime is realistic for initial RPK only if the five rules above are implemented and measured. “Free forever” is not an engineering claim.

## D. Mandatory 30-pass pessimistic audit

Do not write “30-pass complete” unless each line has evidence, a test, a measured value, or an explicit `BLOCKED` reason.

1. Repo HEAD / clean tree / newer-agent diff.
2. Current Worker / Actions / Cron / D1 / collector architecture map.
3. Duplicate scheduler and double-write paths.
4. Worker HTTP CPU benchmark with production-shaped payloads.
5. Worker Cron CPU benchmark before any heavy Cron is enabled.
6. Dynamic Worker requests per user and static-asset boundary.
7. GitHub scheduled-run delay/drop/inactivity recovery design.
8. Actions timeout/concurrency/idempotency behavior.
9. External API quota worst-case by source.
10. D1 rows-written worst-case/day.
11. D1 index write amplification and index inventory.
12. Changed-only semantic-hash correctness; retrieval timestamps must not create false changes.
13. Duplicate-run idempotency.
14. Concurrent-run race conditions and DB constraints.
15. Snapshot evidence policy: neither infinite raw retention nor history destruction.
16. D1 storage model for 30d / 90d / 1y / 3y.
17. Retention / compaction policy by record class.
18. Prediction UPDATE/DELETE rejection at DB + application layer.
19. Outcome target identity and unit/definition matching.
20. Backfill isolation from prospective performance.
21. Event / available / retrieved / created / target timestamp integrity, UTC/KST included.
22. LIVE / STALE / MISSING / DEGRADED / ERROR / DEMO truth behavior.
23. Retry/backoff for 429 / 5xx / timeout / malformed data without quota storms.
24. Secret redaction across URLs, logs, frontend, history, docs, errors.
25. D1 rows-read efficiency and indexed-query trade-offs.
26. Free-usage measurement source: `OFFICIAL_USAGE` vs `INTERNAL_ESTIMATE`.
27. 70/85/95 guardrail behavior per resource.
28. No automatic paid upgrade/fallback path.
29. Migration + rollback safety for hybrid transition.
30. End-to-end: official source → collector → normalization → changed-only decision → D1 → read API/UI → later Outcome → baseline score.

## E. Guardrail policy

Thresholds are per resource, not one global number:

- Worker requests
- Worker CPU errors/near-limit evidence
- D1 rows read
- D1 rows written
- D1 storage
- external API quota
- Actions failure/delay/freshness

### 70% — NOTICE

- owner-visible warning/report
- calculate trend and projected exhaustion
- no destructive action

### 85% — PROTECT

- stop optional backfills and nonessential raw snapshots
- reduce optional collection frequency where source semantics allow
- protect Prediction/Outcome/source-health writes
- investigate query/index/write amplification before proposing Paid

### 95% — EMERGENCY

- stop noncritical collectors/writes
- keep only integrity-critical records if quota permits
- serve cached/stale/official-historical data with correct labels
- if prospective Forecast integrity cannot be maintained, mark the system `DEGRADED` or `PAUSED` rather than generating unverifiable forecasts

Never delete or rewrite immutable prospective predictions to save quota.

## F. Changed-only write rule

The semantic comparison must exclude fields that change merely because a collector ran, including candidates such as:

- `retrievedAt`
- ingestion timestamp
- collector run ID
- retry metadata

The semantic comparison should include source fields whose change matters to product truth, for example flight status, terminal, gate, check-in counter, scheduled/changed time, and other source-specific fields defined by contract.

The exact field set is source-specific and must be contract-tested.

Do not implement changed-only writes as an unbounded per-row `SELECT` loop if a bounded/batched/database-side strategy is safer. Measure both rows-read and rows-written.

## G. Snapshot / retention classes

Use explicit classes instead of “store everything forever”:

- `CURRENT`: latest canonical state.
- `CHANGE_HISTORY`: meaningful source changes only.
- `DAILY_AGGREGATE`: long-term compact statistics where appropriate.
- `PREDICTION`: immutable prospective record; long-term integrity record.
- `OUTCOME`: later actual/verification record; long-term integrity record.
- `COLLECTOR_RUN`: operational metadata with bounded retention.
- `RAW_PAYLOAD`: only when needed for audit/legal/source-contract reasons, with explicit retention and redaction.

## H. Required traffic/cost model

Before declaring the Free tier sufficient, model at least:

- 100 visitors/day
- 500
- 1,000
- 5,000
- 10,000
- 20,000

For each, calculate Best / Expected / Worst:

- dynamic Worker requests/user
- Worker requests/day
- D1 queries/user
- rows read/day
- collector rows written/day, including index amplification
- Forecast/Outcome writes
- external API calls
- storage growth

Do not claim “5,000 users/day is safe” without stating the measured/assumed dynamic requests per user.

## I. Implementation gate

Architecture-changing code should proceed in this order:

1. Research + repository audit.
2. Numeric quota/storage/traffic model.
3. Architecture decision and documented contradictions.
4. Minimal migration implementation.
5. Unit/contract/idempotency/concurrency/quota tests.
6. Real Worker/D1 benchmark when infrastructure is available.
7. Re-audit.
8. Documentation synchronization.
9. Commit + push with exact SHA and remaining blockers.

If Cloudflare account, Production D1, API keys, or real staging are absent, mark those checks `BLOCKED`; do not fake results with local-only tests.

## J. Required final report

Report in Korean:

1. start HEAD / final HEAD
2. 30-pass PASS/FAIL/BLOCKED table
3. top 10 risks found
4. chosen architecture and rejected alternatives
5. 100/500/1k/5k/10k/20k user traffic model
6. D1 read/write/storage projections
7. GitHub Actions reliability risks
8. Cloudflare risks
9. external API quota risks
10. 70/85/95 actions
11. files changed
12. tests and benchmarks actually run
13. owner actions still required
14. exact commit SHA + push status

The objective is not to keep Free at any cost. The objective is to keep fixed runtime cost at zero **before real revenue/traffic justifies Paid**, without sacrificing forecast integrity, data truth, security, or service correctness.
