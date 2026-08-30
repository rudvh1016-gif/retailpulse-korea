/**
 * Selectable Production collector runner.
 *
 * Recurring/scheduled collection stays gated behind ENABLE_PRODUCTION_COLLECTOR
 * and separate owner approval. This script is deliberately source-agnostic:
 * RPK_PRODUCTION_SOURCES names which sources run, each one reusing its
 * existing verified collector (lib/collector.ts, lib/airport-today.ts) via
 * lib/production-runner.ts. Sources run sequentially and one source's
 * failure never blocks another's run.
 *
 * A1 (`airport_recent`) additionally enforces a same-day quota guard: if a
 * COMPLETE verified recent-history A1 run (collectAirportFlightsToday, the
 * D-3..today bounded scan) already succeeded for the current KST service
 * date, this makes ZERO provider calls and reports
 * SKIPPED_ALREADY_COMPLETE_TODAY. A legacy first-page-only success never
 * satisfies this guard. See lib/airport-today.ts:hasCompleteA1RecentHistoryToday.
 */
import { pruneOperationalHistory } from "../lib/collector";
import { CloudflareD1RestDatabase } from "../lib/d1-rest";
import { PRODUCTION_SOURCE_NAMES, runSelectedProductionSources, type ProductionSourceName } from "../lib/production-runner";
import { resolveProductionDatabaseConfig } from "./production-database";

if (process.env.ENABLE_PRODUCTION_COLLECTOR !== "true") {
  throw new Error("production_collector_not_enabled");
}

// The account/database are always the pinned wrangler config values, never a
// CLOUDFLARE_ACCOUNT_ID secret. See scripts/production-database.ts.
const { accountId, databaseId, apiToken } = resolveProductionDatabaseConfig("production");
const database = new CloudflareD1RestDatabase(accountId, databaseId, apiToken);

const requested = (process.env.RPK_PRODUCTION_SOURCES ?? "airport_recent")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const unknown = requested.filter((name) => !PRODUCTION_SOURCE_NAMES.includes(name as ProductionSourceName));
if (unknown.length) throw new Error(`unknown_sources_${unknown.join("_")}`);
if (!requested.length) throw new Error("no_sources_selected");

const env = {
  DB: database as unknown as D1Database,
  // Individual collectors report NEEDS_KEY for their own source when a key
  // is absent; a source that does not need a given key must still run.
  DATA_GO_KR_SERVICE_KEY: process.env.DATA_GO_KR_SERVICE_KEY?.trim() || undefined,
  SEOUL_OPEN_DATA_KEY: process.env.SEOUL_OPEN_DATA_KEY?.trim() || undefined,
  retainChangeHistory: process.env.RPK_RETAIN_FLIGHT_CHANGE_HISTORY === "true",
};

const results = await runSelectedProductionSources(env, requested);
for (const result of results) {
  console.log(JSON.stringify({
    source: result.source,
    status: result.status,
    changedRows: result.records,
    ...(result.trackedToday === undefined ? {} : { trackedToday: result.trackedToday }),
    ...(result.pagesFetched === undefined ? {} : { pagesFetched: result.pagesFetched }),
    ...(result.detail ? { detail: result.detail } : {}),
  }));
}

// A source is only a real failure at ERROR/NEEDS_KEY; SKIPPED_* is an
// intentional, healthy outcome. The whole run only fails closed when every
// requested source failed — one bad source must never mask the others.
const failed = results.filter((result) => result.status === "ERROR" || result.status === "NEEDS_KEY");
if (failed.length === results.length) process.exitCode = 1;

// Bounded maintenance, decoupled from which sources ran this invocation.
// This only prunes the optional flight change-history log (empty unless
// RPK_RETAIN_FLIGHT_CHANGE_HISTORY=true) and old collector_runs metadata —
// it never touches airport_flights, so accumulated A1 history is preserved.
const now = new Date();
if ((now.getUTCHours() + 9) % 24 === 3) {
  const prunedRows = await pruneOperationalHistory(database as unknown as D1Database, now);
  console.log(JSON.stringify({ maintenance: "retention", prunedRows }));
}
