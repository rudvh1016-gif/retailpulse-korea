# D1 completed-day composition reuse — review draft

Base: `fcf529e0ec8405d10d3ba724a469eeab67fc3e71`, isolated branch `codex/d1-composition-guard-20261014`

## Scope and prerequisite

This is a schema-assisted optimization, not a timestamp-only guard. No operational migration, merge, deployment, production SQL, collection, public request, scheduler change, paid service or account usage query was performed. Migration `0027_airport_composition_observer.sql` must be reviewed and separately authorized before operational application. Without its complete, exact trigger definitions the collector retains raw reads. Manual/import/midnight callers retain forced reads by default; only the existing production postprocessing caller opts into reuse. No API/shared cache/UI/protected manifest changes.

The observed warning was an account-level 75% email at 19:50:44 UTC on October 13 against a 5-million read threshold. Current consumption, KORETAIL contribution and actual savings are unknown. A skipped A1 collection previously still ran daily composition raw reads; the existing monthly `rawRows: 0` did not measure those reads.

## Proof and failure behavior

A completed past day can be reused only with the same successful covering scan evidence, observer epoch and date token, calculation version, actual classification contents (gate/destination tables, airline registry and suppression table), and a matching aggregate hash. `calculated_at` is never freshness evidence: monthly preparation can overwrite it. Missing/legacy/incomplete/current-day data takes the existing read path. A calculation/normalization code change must bump `CALCULATION_VERSION` even when classification tables are unchanged.

INSERT/UPDATE/DELETE triggers observe fields actually consumed by daily composition, including direction/physical identity inclusion, old/new scheduled dates, terminal/destination A2 enrichment without a retrieval timestamp update, and manual changes with the same source hash. Same-value or unrelated-field updates add no observer row change. Token changes roll back atomically with raw changes. Missing date tokens use the installation epoch; no raw backfill is needed. Epoch recreation invalidates old proofs. Trigger definitions are SHA-verified, not merely counted by name. SELECT failures are not interpreted as successful proofs.

The collector checks tokens before reuse and again after a raw rebuild. A concurrent mutation during rebuilding prevents proof publication. A write after the final token check is necessarily outside that read snapshot; it invalidates reuse on the next run, just as raw changes after an ordinary SELECT do. No cross-request serializability claim is made. Dropping/changing observer schema outside migrations requires a new epoch and forced repair; do not remove tracking temporarily and restore an old epoch.

Hash-damaged daily rows are repaired even if their stored hash equals the newly computed correct hash. Untrusted monthly extensions are discarded so existing monthly preparation rebuilds them rather than certifying corrupted content. Missing/capped raw dates keep the existing no-write behavior and keep being reread; this change does not redefine empty-day history or monthly aggregation.

## Local measurements and tradeoff

The two-date fixture has one completed past day and one incomplete current day. First pass reads both daily raw ranges; unchanged repeated input reads only the current range (2 to 1 raw SELECT calls), with identical stored payload and zero aggregate writes. Forced repair still reads both and yields identical semantic output. These are local call counts, not Cloudflare `rows_read` savings.

SQLite `total_changes()` shows 0 added token-row changes for same-value/unrelated updates, 1 for an in-day relevant change/insert/delete, and 2 for a move across departure dates. Index amplification, D1 billed `rows_written`, production daily mutation volume and overall net quota benefit are NOT measured. Date tokens occupy one compact row per touched departure date; no raw snapshots are added. Changed scan evidence, classification or raw tokens can require up to 28 additional daily proof-payload writes even if numeric aggregates stay equal; no-change repeats remain zero-write. Initial migration creates empty tracking tables and one epoch row with no raw SELECT. Runtime proof checks add bounded metadata queries; schema/epoch/token queries can outweigh benefits for tiny raw days. Existing source changed-only writes remain intact.

Before any deployment, assess additional write/storage budget against observed read benefit using authorized account evidence. This draft does not establish free-tier safety and does not automatically apply schema.

The 29-day x 100-departures synthetic fixture measured unchanged repeat runs: legacy 31 SELECT calls / 2,930 returned rows / 29 raw SELECTs / 0 SQLite row changes; reuse 90 SELECT calls / 303 returned rows / 1 raw SELECT / 0 SQLite row changes. All aggregate contents match after excluding the independently generated monthly preparedAt provenance and internal proof metadata. Remote-adapter latency is unmeasured; the extra sequential metadata calls can increase runtime. Query-count overhead increases by 59 calls; this is not hidden by the raw-query reduction. These returned-row counts are not D1 rows_read or index-work estimates.

## Verification

- Targeted daily proof/day radar/monthly-store regression suite: 45 tests including storage-inventory and synthetic workload checks
- Full unit suite: 1,571 PASS including UI Lock; latest proof regression: 15 PASS; typecheck PASS; full lint PASS with 12 pre-existing warnings and changed-file lint clean; native vinext build PASS; rendered HTML 49 PASS; same-pattern working-tree/full-history secret check PASS (1,257 revisions)
- Local Wrangler/Workerd `d1 migrations apply --local` applied all migrations through 0027 to an isolated throwaway database; the production helper accepted the actual resulting trigger-definition fingerprint
- Fixture cases: raw mutation without hash/timestamp changes, A2 enrichment, partial-failure marker, inclusion transitions, old/new day movement, last-row deletion, same-value updates, rollback, epoch change, damaged payload, invalid profile, scan/classification changes, observer failure/absence/altered definitions, before-reuse and during-read races
- No browser-facing changes; browser E2E remains CI coverage rather than a claim of new local mobile testing
- UI Lock remains enabled; all existing protected paths and approval receipts are unchanged

Audit gates: no new provider calls, no retry loops, no timers, no cache mixing, no prediction/outcome mutation, no operational activation. Actual D1 cost/index amplification and production runtime are BLOCKED pending separately authorized operational evidence, not marked safe or passed.
