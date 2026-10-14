# D1 composition no-op request optimization — revised review draft

The final proposal replaces the rejected trigger/proof design from `fff7450` with one bounded change: read and recompute every covered date as before, but do not send an aggregate UPSERT when the retained payload is valid and its count hash already matches. No raw-read cache, new schema, triggers, tokens, producer options or writes are added.

## Why this option

The existing raw query already uses `airport_flights_direction_scheduled_idx`. Without an authoritative change journal, A2/manual corrections can change historical fields without changing retrieved_at or collector timestamps; narrowing the 29-day window or trusting completion alone would miss them. Current/history/manual callers therefore keep the same raw ranges, 2,001-row guard and completion checks. Missing, incomplete and empty days still take their existing paths. Empty/capped dates preserve the existing no-write policy rather than inventing zero totals or deleting history.

The prior proof design increased local reads because its repeated trigger validation scans sqlite_master. A once-per-run schema-check comparison improved large unchanged input but still added trigger writes and up to 28 proof writes after a new scan. It also required stable schema during a run. Neither is selected. Historical analysis and reproduction are preserved at https://github.com/rudvh1016-gif/retailpulse-korea/pull/376#issuecomment-6157438054

## Measured local Workerd cost

Full repository schema, independent freshly seeded databases, warmed repeated runs, compatibility date 2026-05-22 supported by the installed local runtime. This is local engine meta.rows_read/rows_written, not production billing or remote latency.

| Unchanged input | Existing reads | Revised reads | Existing SQL calls | Revised SQL calls | Writes both |
|---|---:|---:|---:|---:|---:|
| 2 days x 1 departure | 8 | 6 | 6 | 4 | 0 |
| 29 days x 1 departure | 116 | 87 | 60 | 31 | 0 |
| 29 days x 100 departures | 2987 | 2958 | 60 | 31 | 0 |

At 29x100 the SELECT count remains 31, including all 29 daily raw reads. The 29 removed calls are no-op UPSERTs: each still looked up a stored aggregate despite performing zero writes. Read savings are only 29/2987, about 0.97%; SQL call reduction is about 48%. No general latency, account-quota or capacity claim is made.

For the same 29x100 input, a single A2 correction costs 2987 reads/1 write before and 2959/1 after; a new successful scan or retrieval-only refresh costs 2987/0 before and 2958/0 after. Moving a flight across dates costs 2987/2 before and 2960/2 after. Deleting one of many flights costs 2986/1 before and 2958/1 after; reinsertion costs 2987/1 before and 2959/1 after. Source mutation read/write costs stay identical because no observer exists. Updating all 2900 retrieved_at values still writes 2900 source rows in both implementations, with zero aggregate writes.

## Correctness and limits

Only a valid retained aggregate with the same newly recomputed hash skips its UPSERT. Damaged JSON/hash fails closed and is repaired even when its stored hash happens to equal the correct new hash; untrusted monthly extensions are discarded before the existing monthly builder restores them. SELECT failures with partial results are rejected. In-memory provenance is refreshed before skipping so monthly preparation receives the same data it did after a no-op UPSERT. Retrieval-only changes retain the existing count-hash behavior and do not force provenance writes.

No raw change detection is removed. A2/manual changes without timestamps, missing aggregates, new scans, retrieval-only changes, date moves, deletion and reinsertion were compared. Numeric aggregate equality excludes only independently generated monthly preparedAt and retrieval provenance as explicitly excluded by the existing count hash. This does not redesign monthly invalidation or empty-day history policy.

Concurrent changes before a raw SELECT are observed; changes after that SELECT are observed on the next run, matching the existing non-transactional boundary. No serializable snapshot is claimed. Skipping an unchanged UPSERT does not intentionally overwrite another writer's later aggregate; existing monthly compare-and-swap protection remains unchanged.

## Focused validation and release boundary

New no-op/correction/error/race regressions plus existing monthly store and phase-2 UI/prediction locks: 58 PASS. Typecheck and changed-file lint are recorded with the final PR status. Local source-vs-main Workerd fixtures verify cost and equality. The full test suite is not repeated for this review. Existing CI results belong to their exact prior SHAs, not automatically to the revised code.

No production DB query, remote migration, provider call, forced collection, shared cache, schedule, merge or deployment. No public deployment approval is implied. The draft is suitable for review as a small query/request reduction, not as a solution to account-wide D1 pressure. Identifying the dominant remaining consumer requires separately authorized per-query/account evidence.