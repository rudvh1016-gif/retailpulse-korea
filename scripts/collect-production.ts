import { safeSourceFailureDetail } from "../lib/source-adapters";
import { collectHolidays, holidayHealthUpdate } from "../lib/holidays";
import { collectAirportComposition } from "../lib/airport-composition-history";
import { runPopulationPredictions } from "../lib/population-predictions";
import { refreshCommercialMonths } from '../lib/commercial-monthly-store';
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
  attentionNotices,
  hasProductionSourceFailure,
  PRODUCTION_SOURCE_NAMES,
  runSelectedProductionSources,
  type ProductionSourceName,
} from "../lib/production-runner";
import { resolveProductionDatabaseConfig } from "./production-database";
import { createForeignPurposeMobilitySource } from "./foreign-purpose-mobility-source";
import { recordExistingCompletion } from '../lib/operational-bookkeeping';

if (process.env.ENABLE_PRODUCTION_COLLECTOR !== "true") {
  throw new Error("production_collector_not_enabled");
}

/**
 * One GitHub Actions annotation. Messages are built only from secret-free
 * status fields; the workflow-command escaping keeps them on one line.
 */
function annotate(level: "warning" | "error", title: string, message: string): void {
  const data = (value: string) => value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  const property = (value: string) => data(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
  console.log(`::${level} title=${property(title)}::${data(message)}`);
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
  A1_SHARED_REQUEST_BUDGET: true,
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
  // The one window a day that refreshes today's scan rather than skipping it,
  // so gate assignments published after the early run still reach the screen.
  A1_RESCAN_TODAY: process.env.RPK_A1_RESCAN_TODAY === "true",
  A1_EXPECTED_TARGET_DATE: process.env.RPK_A1_EXPECTED_TARGET_DATE || undefined,
  // Set only by the A4 fresh-runner retry, which must never consume the quota
  // the next normal 15-minute cycle needs. Unset here means the normal ladder.
  A4_MAX_ATTEMPTS_PER_REQUEST:
    Number.isSafeInteger(Number(process.env.RPK_A4_MAX_ATTEMPTS_PER_REQUEST)) && Number(process.env.RPK_A4_MAX_ATTEMPTS_PER_REQUEST) > 0
      ? Number(process.env.RPK_A4_MAX_ATTEMPTS_PER_REQUEST)
      : undefined,
};

const results = [];
const collectionNow = new Date();
for (const source of requested) {
  const startedAt = new Date().toISOString(), before = database.usageSnapshot();
  const [result] = await runSelectedProductionSources(env, [source], collectionNow);
  results.push(result);
  const completedAt = new Date().toISOString(), after = database.usageSnapshot();
  // Bookkeeping is outside the collector result. Failure never causes an extra provider retry.
  try {
    const attempt = Math.max(1, Number(process.env.RPK_OPERATIONAL_ATTEMPT) || 1);
    const runId = `${process.env.GITHUB_RUN_ID ?? crypto.randomUUID()}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}-${attempt}:${source}`;
    const measured = after.unmeasuredStatements === before.unmeasuredStatements;
    const memory = await recordExistingCompletion(env.DB, result, {runId, startedAt, completedAt, attempt,
      rowsRead: measured ? after.rowsRead-before.rowsRead : null,
      rowsWritten: measured ? after.rowsWritten-before.rowsWritten : null});
    console.log(JSON.stringify({operationalMemory: memory.state, source, sourceCount: memory.sourceCount}));
  } catch {
    console.error(JSON.stringify({operationalMemory:'UNKNOWN',source,reason:'bookkeeping failed; collector result preserved; human review required'}));
  }
}
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
// PARTIAL / NO_DATA stay green but are announced: a green run is not "all fine".
for (const notice of attentionNotices(results)) annotate(notice.level, notice.title, notice.message);

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
  try { console.log(JSON.stringify({context:'commercial_months',...await refreshCommercialMonths(env.DB)})); }
  catch { console.error(JSON.stringify({context:'commercial_months',status:'ERROR',lastGoodPreserved:true})); process.exitCode=1; }
  try { console.log(JSON.stringify({context:'airport_composition',...await collectAirportComposition(env.DB)})); }
  catch (error) {
    console.error(JSON.stringify({context:'airport_composition',status:"ERROR",lastGoodPreserved:true,detail:safeSourceFailureDetail(error)}));
    process.exitCode=1;
  }
  // KASI holidays: auxiliary context on the A1 runs. Its states are kept apart:
  //   AUTH_BLOCKED / SKIPPED_AUTH_COOLDOWN — data.go.kr refused this key for
  //     특일 정보 (15012690). Only the account owner can change that, so it is
  //     source_health ERROR(AUTH) plus a warning, not a red airport run: from
  //     September 2026 that refusal alone kept the 00:07 and 06:07 runs red,
  //     hiding real A1 failures behind a permanently failing badge.
  //   ERROR — timeout/network after its bounded retry, schema, storage: red.
  // A person-started run (workflow_dispatch) always checks once, so the owner
  // can confirm a fix immediately instead of waiting out the cooldown.
  try {
    const holidays=await collectHolidays(env.DB,env.DATA_GO_KR_SERVICE_KEY,new Date(),
      {ignoreAuthCooldown:process.env.GITHUB_EVENT_NAME==='workflow_dispatch'});
    const update=holidayHealthUpdate(holidays);
    if(update) await writeSourceHealth(env.DB,'KASI_PUBLIC_HOLIDAYS',update.status,update.detail,update.record);
    console.log(JSON.stringify({context:'holidays',...holidays,sourceHealth:update?.status??'UNCHANGED'}));
    if(holidays.status==='ERROR') process.exitCode=1;
    if(holidays.status==='AUTH_BLOCKED'||holidays.status==='SKIPPED_AUTH_COOLDOWN') annotate('warning',`KASI holidays ${holidays.status}`,
      `data.go.kr refused this key for 한국천문연구원_특일 정보 (15012690): ${holidays.detail??''}. Owner: check 활용신청 status/period on data.go.kr. Korean holidays stay unconfirmed; no rows changed.`);
  }
  catch (error) {
    console.error(JSON.stringify({context:'holidays',status:"ERROR",detail:safeSourceFailureDetail(error)}));
    process.exitCode=1;
  }
}
if (requested.includes("seoul_realtime")) {
  try { console.log(JSON.stringify({context:"population_predictions",...await runPopulationPredictions(env.DB)})); }
  catch { console.error(JSON.stringify({context:"population_predictions",status:"ERROR",lastGoodPreserved:true})); process.exitCode=1; }
}
