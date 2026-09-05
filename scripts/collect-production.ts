import { safeSourceFailureDetail } from "../lib/source-adapters";
import { collectHolidays } from "../lib/holidays";
import { collectAirportComposition } from "../lib/airport-composition-history";
import { runPopulationPredictions } from "../lib/population-predictions";
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
import { pruneOperationalHistory, writeSourceHealth } from "../lib/collector";
import { CloudflareD1RestDatabase } from "../lib/d1-rest";
import {
  hasProductionSourceFailure,
  PRODUCTION_SOURCE_NAMES,
  runSelectedProductionSources,
  type ProductionSourceName,
} from "../lib/production-runner";
import { resolveProductionDatabaseConfig } from "./production-database";
import { createForeignPurposeMobilitySource } from "./foreign-purpose-mobility-source";

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
  FOREIGN_PURPOSE_SOURCE: createForeignPurposeMobilitySource(),
  retainChangeHistory: process.env.RPK_RETAIN_FLIGHT_CHANGE_HISTORY === "true",
  // A1 request budget for this invocation. The recovery window sets 200 so
  // primary (≤300) + recovery (≤200) can never exceed A1's 500/day quota.
  A1_MAX_REQUESTS: Number.isSafeInteger(Number(process.env.RPK_A1_MAX_REQUESTS)) && Number(process.env.RPK_A1_MAX_REQUESTS) > 0
    ? Number(process.env.RPK_A1_MAX_REQUESTS)
    : undefined,
};

const results = await runSelectedProductionSources(env, requested);
for (const result of results) {
  // One structured, secret-free line per source. `providerRequests: 0` beside
  // SKIPPED_ALREADY_HEALTHY is the proof that a recovery window cost nothing;
  // `lastGoodPreserved` is the proof that a failed attempt destroyed nothing.
  console.log(JSON.stringify({
    source: result.source,
    mode: result.mode ?? "PRIMARY",
    status: result.status,
    changedRows: result.records,
    ...(result.providerRequests === undefined ? {} : { providerRequests: result.providerRequests }),
    ...(result.sourceHealth === undefined ? {} : { sourceHealth: result.sourceHealth }),
    ...(result.lastGoodPreserved === undefined ? {} : { lastGoodPreserved: result.lastGoodPreserved }),
    ...(result.trackedToday === undefined ? {} : { trackedToday: result.trackedToday }),
    ...(result.pagesFetched === undefined ? {} : { pagesFetched: result.pagesFetched }),
    ...(result.detail ? { detail: result.detail } : {}),
  }));
}

// A source is only a real failure at ERROR/NEEDS_KEY; SKIPPED_* is an
// intentional, healthy outcome. Every selected source has already attempted
// collection above, so failing the job here preserves source isolation while
// making any partial outage visible to GitHub Actions monitoring.
if (hasProductionSourceFailure(results)) process.exitCode = 1;

// Bounded maintenance, decoupled from which sources ran this invocation.
// This only prunes the optional flight change-history log (empty unless
// RPK_RETAIN_FLIGHT_CHANGE_HISTORY=true) and old collector_runs metadata —
// it never touches airport_flights, so accumulated A1 history is preserved.
const now = new Date();
if ((now.getUTCHours() + 9) % 24 === 3) {
  const prunedRows = await pruneOperationalHistory(database as unknown as D1Database, now);
  console.log(JSON.stringify({ maintenance: "retention", prunedRows }));
}

// Additional user-authorized context stays in the existing runner; no duplicate scheduler.
if (requested.includes("airport_recent")) {
  for (const [name,run] of [
    ["airport_composition",()=>collectAirportComposition(env.DB)],
    ["holidays",()=>collectHolidays(env.DB,env.DATA_GO_KR_SERVICE_KEY)],
  ] as const) {
    try {
      const result=await run();
      console.log(JSON.stringify({context:name,...result}));
      if(name==='holidays') await writeSourceHealth(env.DB,'KASI_PUBLIC_HOLIDAYS',result.status==='SUCCESS'?'LIVE':'MISSING',result.status,
        result.status==='SUCCESS'?{retrievedAt:new Date().toISOString(),schemaVersion:'kasi-holidays-v1'}:undefined);
    }
    catch (error) {
      const detail=safeSourceFailureDetail(error);
      console.error(JSON.stringify({context:name,status:"ERROR",lastGoodPreserved:true,detail}));
      if(name==='holidays') await writeSourceHealth(env.DB,'KASI_PUBLIC_HOLIDAYS','ERROR',detail);
      process.exitCode=1;
    }
  }
}
if (requested.includes("seoul_realtime")) {
  try { console.log(JSON.stringify({context:"population_predictions",...await runPopulationPredictions(env.DB)})); }
  catch { console.error(JSON.stringify({context:"population_predictions",status:"ERROR",lastGoodPreserved:true})); process.exitCode=1; }
}
