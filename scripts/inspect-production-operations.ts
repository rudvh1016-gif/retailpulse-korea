/**
 * Safe read-only Production operations diagnostic.
 *
 * This performs ZERO provider calls and executes ZERO write statements: it
 * only SELECTs a fixed set of safe operational columns from collector_runs
 * and source_health, and every `detail` is passed through
 * sanitizeProductionDetail so authenticated URLs, service keys and bearer
 * tokens can never be printed.
 *
 * RPK_DIAGNOSTIC_SOURCES optionally narrows the inspection to a comma list
 * of production source names (or canonical source ids); absent, every known
 * source is inspected. See lib/production-diagnostics.ts.
 */
import { CloudflareD1RestDatabase } from "../lib/d1-rest";
import { resolveDiagnosticSourceIds, sanitizeProductionDetail } from "../lib/production-diagnostics";
import { resolveProductionDatabaseConfig } from "./production-database";

const since = process.env.RPK_DIAGNOSTIC_SINCE?.trim();
if (!since || Number.isNaN(Date.parse(since))) throw new Error("invalid_diagnostic_since");

const sourceIds = resolveDiagnosticSourceIds(process.env.RPK_DIAGNOSTIC_SOURCES);
const placeholders = sourceIds.map(() => "?").join(", ");

const { accountId, databaseId, apiToken } = resolveProductionDatabaseConfig("production");
const database = new CloudflareD1RestDatabase(accountId, databaseId, apiToken);

const runs = await database.prepare(`SELECT source_id, status, started_at, finished_at,
    records_read, records_written, detail
  FROM collector_runs
  WHERE source_id IN (${placeholders}) AND started_at >= ?
  ORDER BY started_at DESC LIMIT 120`)
  .bind(...sourceIds, since)
  .run();

const health = await database.prepare(`SELECT source_id, status, last_event_at,
    last_published_at, last_retrieved_at, consecutive_failures, schema_version,
    detail, updated_at
  FROM source_health
  WHERE source_id IN (${placeholders})
  ORDER BY source_id`)
  .bind(...sourceIds)
  .run();

function safeRows(rows: unknown[] | undefined): Array<Record<string, unknown>> {
  return (rows ?? []).map((row) => {
    const safe = { ...(row as Record<string, unknown>) };
    if ("detail" in safe) safe.detail = sanitizeProductionDetail(safe.detail);
    return safe;
  });
}

console.log(JSON.stringify({
  diagnostic: "production-operations-read-only",
  since,
  inspectedSourceIds: sourceIds,
  collectorRuns: safeRows(runs.results),
  sourceHealth: safeRows(health.results),
}, null, 2));
