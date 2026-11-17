# Canary local closure; production remains HOLD

This follow-up supersedes the partial-forecast compatibility defect and the unwired-authority descriptions in D1_ADMISSION_AND_READ_BUDGET_2026-11-17.md. It does not authorize production or new service/database/configuration changes. Main/base remains `4ade5edf6d7c60637024096ead516b85e159b2c3`.

## Source-local forecast failure and client/cache compatibility

A missing/corrupt/expired A5 or KMA publication no longer adds a fictitious whole `sources` SQL read failure. Other real read failures still have their original degraded-mode/failure behavior. A publication-only failure keeps mode `live-summary`, reports `readStatus.status=DEGRADED`, lists failed families and `fallback=ARCHIVE_STALE`, and marks just their source status STALE with storedStatus/recoveryStatus. The existing original forecast values and their retrieval/issuance/target dates remain unchanged; no replacement clock or LIVE label is invented. We deliberately use the original archived fallback, not a hidden browser merge of new active-only history. If the archived item is absent it remains absent. Other successfully validated sources and fresh receipts are accepted by the actual existing client.

The source-status screen already lists non-LIVE sources, including STALE; existing forecast collected-time labels use the preserved collected timestamp. This change does not redesign the UI or change the client data contract. Missing publication metadata identifies the failed family rather than hiding it as a global network failure. When the archived source_health row is absent, a STALE/UNAVAILABLE source entry with storedStatus=MISSING and null clocks still exposes the failure; no timestamp is synthesized.

TODAY configured overlay (including unavailable binding) remains no-store. Past/future queries do not apply publications and now retain original cache admission, as well as original values. The browser loader's existing per-date/month pending/cache maps, validation, older/wrong-date rejection, bounded cadence and genuine read-failure backoff remain unchanged. There is no unverified shared-edge-cache optimization. A source STALE alone does not trigger2-minute fast rechecks; other independent incomplete coverage or old checkpoints can. Complete archived fallback with other healthy data remains on5minutes, and concurrent subscribers share one request.

Actual client tests accept new KMA values alongside an archived stale A5 value, keep the old A5 collected time, reject wrong dates, share concurrent loads and avoid clientRefresh failure/backoff on publication-only failure. The local Workerd API→actual VM-client budget fixture now accepts missing A5:3 clients/30minutes =18requests ×871local rows =15,678all-miss projected rows (previous incompatible mode:24requests/20,904rows). Normal overlay18×872=15,696, source ERROR/DEGRADED/MISSING45×872=39,240, source STALE18×872. These are native local rows/request and a fixture projection, not actual production/edge/CPU usage. The original route's public cache sharing may still make no-store relatively much more expensive. Operational edge/CPU/Free headroom checks remain mandatory.

## Actual canary writers and default-deny coverage

| Exact canary source | Actual runner/write route | Collector INSERT targets beyond shared source_health/collector_runs |
| --- | --- | --- |
| airport_congestion | collect-production → runCanaryCollector → collectRecoverySource | airport_congestion, recovery_public_snapshots |
| airport_congestion_t2 | same shared realtime route | airport_congestion, recovery_public_snapshots |
| seoul_realtime | same shared realtime route | seoul_realtime_area/commercial/forecast, seoul_context, recovery_public_snapshots |
| airport_passenger_forecast | collect-production → forecast-recovery-runner → runCanaryCollector → collectForecastPublication | airport_passenger_forecast, recovery_forecast_publications; existing immutable archive triggers run as part of canonical inserts |
| weather | same separate forecast family route | weather_forecast, recovery_forecast_publications |

`runCanaryCollector` denies by default. It requires enabled=true, main ref, workflow_dispatch event, valid reviewed SHA, exact one selected source, epoch and request ID. The durable D1 grant must independently match database/epoch/source/SHA/expiry. The session initially permits only the exact conditional grant claim/completion SQL. Collector table INSERT/UPSERTs are permitted only inside the granted, awaited callback and only for that source. DDL, DELETE, control-state rewrites and unrelated writer tables are denied. The capability closes after success/failure, including leaked handles; late writes cannot use it. A grant is not reset or reissued. Expiry does not cancel already-issued remote SQL; no new grant until old executions and remote writes are settled.

`CloudflareD1RestDatabase` refuses direct mutation of any configured realtime/A5/WEATHER active ID without the session gate, even if that writer's flag is false. The REST adapter is shared by the existing trusted Actions scripts. Source identity validation still rejects aliases to original/other families. The actual production entrypoint's active branches now use the canary session; forecast/realtime cache files are advisory notices/trends only, never approval. A missing/stale cache cannot authorize a run. Post-collector active operational bookkeeping is skipped, so it cannot write outside the grant. Shared collector_runs/source_health remain inside the actual collector callback. Official returned size metadata remains associated with the session DB.

Excluded from active canary: A1 airport_recent/all flight/history/schedule/context/holiday enrichers, *_recovery variants (including A5/weather), fresh-runner retries, independent import/forecast/outcome scripts, transfer forecasts, facility/usual/other source writers, prune/DDL/maintenance and operational-memory bookkeeping. They have no active capability. Ordinary unrelated original-DB collection is not globally killed by this canary code; its own pre-existing authorization still applies. To pause an active family retain its ID and set WRITES=false; never remove the ID and fall back to writing the full original.

Boundary: this is a code-path/identity guard for trusted reviewed code, not a new database ACL or sandbox against a holder of broad D1 credentials. Every future caller must have the configured active identity list. Raw Cloudflare bindings or independently rewritten code with broad credentials can bypass a client-side guard; no permission change was made to solve that. Only reviewed entrypoints may receive the selected active DB access. Binding/token scoping and absence of alternate active write paths must be independently checked before operational use. Source tables are allowlisted, not arbitrary SQL supplied by a user.

Existing workflow definitions do not expose/forward the new RPK_CANARY_* activation values; they remain unable to activate this session as configured today. This is deliberate HOLD, not a hidden automatic pilot. No new workflow/input/schedule/permission was added. A future single manually reviewed main job/command needs exact source selection and explicit ephemeral values (RPK_CANARY_ENABLED, SOURCE, EPOCH, REQUEST_ID plus trusted GitHub SHA/ref/event), the existing source-specific writer ID/flag and existing scoped token/provider key. Do not use repository standing vars alone to let the regular scheduled/Worker dispatch consume a pilot grant. A dedicated reviewed manual invocation/input with defaultfalse must distinguish it from scheduled dispatch before activation. The normal realtime3-source group is not a single canary approval: use one source/job at a time. No activation procedure is executed here.

## Read-only reconciliation, not reapproval automation

Local CLI (existing disposable SQLite only):

```
node --experimental-sqlite --import tsx scripts/reconcile-canary.ts --local /path/to/disposable-active.sqlite EXACT_DATABASE_ID
```

It opens SQLite readOnly, performs bounded grant/publication metadata SELECTs, prints no credentials or raw source payload, and never UPDATEs/resets/grants/retries. Missing grant/schema/evidence is HOLD/unknown; even DONE returns MANUAL_REVIEW_REQUIRED and eligibleForReapproval=false. CLI output is evidence for a human, not permission. No remote mode or new auth is provided. Do not export an operating DB just to run it. Once existing remote access is available, perform equivalent bounded SELECTs through that approved read-only path and validate the actual publication separately.

Human reapproval conditions: confirm previous runner terminated and every remote write resolved; match exact source receipt and publication payload/timestamps; account for partial staging versus last published snapshot; verify original immutable/archive evidence unchanged; authenticate current main/deployment and exact source/DB/epoch; verify actual bytes/Free headroom; review remaining provider quota and edge/CPU/read budget; owner approves one next window. INFLIGHT/UNCERTAIN/BLOCKED cannot be cleared merely because a TTL elapsed or no new rows appeared. Reapproval/schema provisioning is intentionally absent.

## Local evidence and remaining operational order

`tests/canary-writer-e2e.test.mjs`: actual REST adapter bridged to migrated SQLite + actual five collectors/parsers/publications, no-grant/duplicate/direct legacy writes, late leaked handle, excluded source/ref/event/SHA and SQL-table controls. Actual collect-production subprocess proves grant consumption, zero original REST requests and no out-of-grant operational bookkeeping. Reconciliation is read-only. Existing multi-process/native Workerd races and crash/acknowledgement tests remain in the full suite. This is local E2E, not a real Cloudflare permission or CPU test.

Smallest remaining sequence, after access opens:

1. Existing authenticated metadata: official bytes/account DB count+aggregate/Free headroom; inspect actual deployed version/bindings. No new authentication, export or broad retry loop.
2. Review source/DB/token/binding identity and all writers; select one source. Confirm no predecessor/in-flight SQL. Separately approve any required active resource/schema/grant provisioning; nothing here authorizes it.
3. Non-production preview with production-shaped data: one manual defaultfalse invocation, real headers/gateway/edge behavior, CPU/latency/rows and source-local missing/corrupt/expiry paths; original/date/history cache compatibility. No production secrets in PR/preview code.
4. Owner separately approves exact main/source/DB/epoch/SHA/window/manual job and one durable grant. No continuous/scheduled/recovery retries. Validate stored claim → actual collector receipt → publication readback → public observed/issuance/checkedAt and deployed SHA. Stop on ambiguity/quota/state-store/public mismatch.
5. For a second sequential collection, human reconciliation and a separate reviewed approval are required. Recheck public evidence and original/archive preservation. Keep read flag off until gates pass. Rollback by retaining IDs, WRITES=false and selected READS=false/previous reviewed Worker; preserve active data for review.

Actual Cloudflare auth, Free headroom and edge/CPU remain inaccessible/unmeasured. Production HOLD remains. No operational SQL/service/database/binding/secret/auth/permission/cost/schedule/merge/deployment change occurred.

## Final validation and blocked optional workflow preparation

- Full unit2932/2932 PASS; all five actual canary collectors and actual collect-production entrypoint pass through local REST/grant/publication E2E (canary suite8/8).
- Actual API/Workerd/client budget and source-local fallback, null-clock absence, wrong-date/old-response checks, and exact past/future cache assertions PASS. Focused API/operational suite54/54 PASS.
- Typecheck/build PASS; rendered54/54 PASS; lint0errors/25existing warnings; secret scan/diff check PASS. Local health HARNESS PASS / SYSTEM UNKNOWN.
- No production collector, remote reconciliation, deployment, edge/CPU benchmark or authenticated Cloudflare capacity diagnostic was executed.

Automatic approval review denied the optional action to add `.github/workflows/collect-canary.yml`, because a persistent workflow referencing production write credentials is an operational capability/configuration change despite default-off gates and conflicts with the current HOLD. The tool invocation was rejected before execution. Read-only inspection confirmed the file does not exist, tests/docs from that attempted invocation were not applied, and no workflow was run. User-history lookup supplied no new authorization for that specific action. It was not retried or reproduced indirectly. The existing workflow definitions/permissions remain unchanged. Future manual workflow preparation/activation is a separate owner decision; the local source gate, reconciliation and tests above do not depend on adding it.
