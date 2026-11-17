# Independent pre-operation gates: authority and read budget

Draft #600 follow-up. This document supersedes any suggestion that Actions cache is production admission authority. Base/main remains `4ade5edf6d7c60637024096ead516b85e159b2c3`; preceding draft head `34f5d855aacb46a5b0d03b8c7294519a04f444e8` CI43987789460 completed SUCCESS. No operational activation is authorized by this report. Both gates remain HOLD pending real environment evidence.

## 1. One authoritative consumed grant, not a cache lease

`lib/admission-contract.ts` defines a single conditional UPDATE from READY to INFLIGHT. Scope is exact database ID, epoch, source, reviewed commit and expiration no more than 15 minutes from claim. Database ID is the primary key: changing epoch/request ID/source cannot open a parallel grant for the same database. A cryptographic owner identifier ties completion to that consumed grant. A permit is acknowledged before the callback starts. DONE, BLOCKED, UNCERTAIN and INFLIGHT never automatically become READY. There is no reset, takeover, TTL release, bootstrap bypass, grant issuer or public approval endpoint. A successful run also consumes the one-shot approval; another run requires a separately reviewed reconciliation/grant, which is intentionally not implemented here.

`executeWithAuthority` is default disabled and invokes no provider/SQL callback without a supplied authority and successful claim. It awaits completion; loss of either claim acknowledgement or completion acknowledgement never authorizes retry. It is tested around the actual T1 collector/publication. One logical callback may contain many collector statements: this is admission at most once, NOT an exactly-once transaction covering all collection SQL or the provider. The caller must await all writes, must not spawn detached work, and must never issue a second collection inside a callback. Existing legacy workflows/collectors have NOT been switched to this adapter. Cache/state files remain advisory in the old paths; they do not close the operational gate.

Two implementations share the same SQL/state contract:

- `scripts/authoritative-admission.ts`: local reference authority, existing SQLite file, BEGIN IMMEDIATE + synchronous FULL, separate from the target SQLite DB for process-death tests. Missing file/invalid schema/lock failure denies execution. This file is NEVER a deployable Actions authority: runner disks are ephemeral and restoring/copying an older file would recreate the cache flaw. The trusted fixture provisioner is outside the executor; filesystem possession is not a new remote authentication mechanism.
- `lib/d1-admission-authority.ts`: optional, unwired D1 adapter. A single D1 UPDATE and exact `meta.changes===1` is the atomic claim; no SELECT-then-UPDATE race. No metadata/acknowledgement means no callback. Workerd tests use real local D1 and concurrent consumers. The smallest future candidate is the selected already-approved active D1 itself, with explicit `config/recovery/admission-schema.sql` applied only there. This adds no service type or DO binding and reuses the existing D1 internal write path. It must never be installed in or depend on free space of the full original archive. No schema/grant was applied to any operational DB here.

### Failure and crash boundaries

| Event | Persisted state / result | Can replacement execute? |
| --- | --- | --- |
| competing/duplicate request | only one READY→INFLIGHT UPDATE changes a row | no |
| owner dies before target write | INFLIGHT, zero target writes | no, including after expiry |
| SQL rejects with injected 7500; process exits before classifying it | INFLIGHT rather than a falsely assumed saved BLOCKED | no |
| target write commits; process dies before completion | INFLIGHT, target may have changed | no |
| owner killed while callback awaits | consumed grant remains, no lease takeover | no |
| claim commits but reply lost | INFLIGHT, callback not called | no |
| state store unavailable before claim | claim unavailable, callback not called | no |
| completion store fails after target write | INFLIGHT or terminal state if ack lost; caller errors | no |
| late/expired/wrong epoch/DB/source/commit | conditional UPDATE changes zero | no |
| another DB has its own valid grant | independent record, no broad kill switch | yes, its own source only |

Separate authority and target stores have a real crash window between claim→target and target→completion. Even co-locating the table in active D1 does NOT make all existing collector batches plus grant one atomic transaction. We deliberately sacrifice automatic liveness: unknown/partial work remains consumed and requires manual target receipt/publication reconciliation. An old executor paused after acquiring may still send a late write; expiry limits admission start, not revocation of an already in-flight SQL request. No new owner/epoch may be issued until the old process is confirmed dead AND remote writes are known complete/failed. If that cannot be established, keep HOLD. A fencing token checked only by the controller cannot revoke target SQL; target-enforced fencing/idempotency would be necessary for automatic takeover. No exactly-once or remote crash cancellation claim is made.

The trusted authority must not be restored/rolled back/recreated while old executors can run. Protect grant issuance and schema from collector-controlled reset; no such administrative permission is added here. Existing broad D1 write credentials are not a fine-grained row-authorization system. A future owner must review existing token scope/issuer separation and verify authoritative target identity from deployed configuration. If the only way to issue grants needs a new credential/permission, STOP and return for that separate decision. Fail-closed behavior relies on the selected authority remaining the single trusted store, not on an Actions branch cache. PR cache grants are never promoted into main, nor is a cache key trusted as an approval.

### Alternatives examined

Actions cache is branch/ref scoped and evictable and is rejected as authority. Repository git-ref CAS could serialize a grant, but runtime workflow tokens currently do not have an established grant-writer path; adding contents-write to collectors is not the minimum scope and is not implemented. The full original D1 cannot safely host new approvals. An independent SQLite-backed Durable Object could hold grants, but it adds a new namespace/migration/binding and an authenticated grant/execute path not present here. It is a candidate, not a requirement. Cloudflare documents SQLite DO on Free and transactional storage; local SQL tests do not prove a deployed DO or available account headroom ([overview](https://developers.cloudflare.com/durable-objects/), [storage transactionSync](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)). No DO or external authentication was created.

The smallest no-new-service operation to review is a single manually approved source/active-DB/commit/time-bounded collection using that active D1's consumed grant; no automatic reapproval or recurring retry. It is not yet wired into production and does not authorize provisioning/bindings. Before any future pilot: verify authenticated bytes/account slots, main-only trusted grant provisioning, state table and binding identity, exact guard coverage around every relevant legacy primary/recovery path, no detached/in-flight predecessor, actual claim metadata/receipt/publication, then public timestamps. Any bypass path or ambiguous predecessor leaves HOLD. Continuous operation requires a separately reviewed bounded reapproval/reconciliation protocol; this PR does not provide it.

## 2. Local Workerd read and browser budgets

`tests/overlay-read-budget.test.mjs` runs the actual summary composer against Miniflare/Workerd D1, counting native local `meta.rows_read`, rows_written, statement and D1 request counts on each database. It executes the actual transpiled browser loader/refresh policy in three independent VM clients, with three concurrent subscribers per client sharing one request. No UI/client/HTTP policy is modified. The report is generated from execution, not hard-coded row estimates.

Fixture: original A5 384 aggregate rows (today/tomorrow/-7/-28), four areas ×62 context rows, real 7/28 population/commercial baselines, active T2 and Seoul snapshots plus A5/KMA publications. T1 deliberately remains on archive without a queue row so its source status exercises the source-only recheck condition; therefore normal is a partial-route fixture, not proof that every terminal has current observations. All overlay reads execute zero SQL writes. The six status cases hold forecast coverage complete and other checkpoint clocks fresh to isolate the source-status predicate.

Half-open 30-minute window, including initial requests:

| Response/source case | Client requests (3 clients) | Native local rows/uncached response | All-miss projected local rows |
| --- | ---: | ---: | ---: |
| reads disabled / LIVE | 18 | 852 | 15,336 |
| overlay normal / LIVE | 18 | 872 | 15,696 |
| overlay source ERROR | 45 | 872 | 39,240 |
| overlay source DEGRADED | 45 | 872 | 39,240 |
| overlay source MISSING | 45 | 872 | 39,240 |
| overlay source STALE | 18 | 872 | 15,696 |
| A5 publication missing → body mode degraded | 24 | 871 | 20,904 |

Overlay normal: original 2 requests/46 statements/868 rows (includes16 baseline seeks in one batch), realtime3 requests/3 statements/2 rows, A5 1/1/1, WEATHER1/1/1: **7 D1 requests,51 statements,872 rows**, versus original1 request/30 statements/852 rows. This fixture has no baseline query misses for the published Seoul current rows. Cost depends on actual stored history and indexes; a small row delta does not imply small CPU or round-trip latency. Publication JSON parsing/validation is outside the rows count.

Disabled response earns `public, max-age=60, stale-while-revalidate=300`; overlay is `no-store`, including failures. Normal clients recheck at5 minutes; allowed fast source ERROR/DEGRADED/MISSING rechecks at2 minutes (2.5× requests). Source STALE by itself is NOT in `shortensSummaryRecheck`. Independently, incomplete forecast coverage, stale/failed/unknown checkpoint observations, cached generatedAt age and midnight can change cadence. We do not infer a five-minute guarantee from STALE alone.

Actual deployment risk discovered: a missing forecast publication marks sources STALE but also changes body mode to `degraded`. The existing browser accepts only `live-summary`, so it rejects that response, retains last good if present and follows read-failure backoff (1/2/4/5 minutes), not the source-status two-minute path. The measured missing-publication case starts with no valid previous payload; 24 requests/30minutes is a different budget. Existing refresh harness separately tests last-good retention. This compatibility behavior is NOT fixed in this gate-only change and must be reviewed before activation; do not say the client consumes every degraded overlay payload.

Rows/request are **LOCAL_WORKERD_META**, not official production usage. Window totals multiply measured cost by actual fixture-loader request counts assuming every request misses. They are a bounded fixture projection, NOT a live measurement or a universal maximum. No browser HTTP cache, shared edge HIT/SWR, real network, deployment CPU, warm/cold Worker CPU, populated production history, midnight stampede or production clients were measured. Disabled public caching may share origin reads across clients whereas no-store cannot; the all-miss comparison understates that potential amplification. Client memoization shares only one JS realm/date/month, not separate devices/tabs. Forecast publication presence now forces no-store even on archive dates in the composer; this is another candidate risk, with history values preserved but cache behavior not identical. Do not relax no-store before proving partial data cannot poison cache.

### Usage and release gate

No cost claim is established by the small fixture. Keep existing70/85/95 official-byte/usage policy distinct from these local rows. Before any future read flag: production-shaped preview dataset, all three realtime publications, normal and missing/invalid/expired paths, actual headers through gateway/edge, independent clients and date/month keys, concurrency/bursts, CPU/latency/rows metadata, per-account Free headroom and bounded daily projection. Do not run broad production diagnostics to fill the gap. Until measured, keep READS/WRITES off and operational HOLD.

No production SQL, exports, destructive maintenance, new DB/binding/service/authentication/permission/secret, external alert, schedule, billing, merge or deployment change occurred. Local fixture initialization and race subprocess writes are not operational actions.

## Final local validation

- `npm run test:unit`: 2923/2923 PASS, including10 SQLite/process/actual-collector authority tests +4 native local Workerd authority tests +1 usage/client gate.
- `npm run typecheck`: PASS. D1 metadata is optional and explicitly fails closed; the missing-metadata-after-commit case is tested.
- Build and rendered HTML54/54 PASS; secret scan/diff check PASS. Lint0 errors/25 pre-existing warnings.
- `node --import tsx scripts/health.ts`: HARNESS EXECUTION PASS / SYSTEM VERDICT UNKNOWN / PERSISTENT MEMORY UNKNOWN_NO_DATABASE.
- No actual browser/edge/production E2E, production kill/7500 injection, DO deployment or authenticated storage diagnostic was run. The native SQLite 7500 error is an injected SQL rejection, not a real production quota event.
- Raw generated report: [D1_OVERLAY_LOCAL_BUDGET_2026-11-17.json](D1_OVERLAY_LOCAL_BUDGET_2026-11-17.json). Reproduce with `RPK_OVERLAY_BUDGET_REPORT=/tmp/koretail-overlay-budget.json node --experimental-sqlite --import tsx --test tests/overlay-read-budget.test.mjs`.

Admission adds at least one conditional claim and one completion mutation per successful reviewed execution, apart from collection SQL. Its operational rows/CPU/latency costs have not been measured. The read report measures summary reads only, not collection or grant cost. Final operational verdict remains HOLD/UNKNOWN.
