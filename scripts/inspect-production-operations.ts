import { CloudflareD1RestDatabase } from "../lib/d1-rest";
import { sanitizeProductionDetail } from "../lib/production-diagnostics";
import { resolveProductionDatabaseConfig } from "./production-database";

const since = process.env.RPK_DIAGNOSTIC_SINCE?.trim();
if (!since || Number.isNaN(Date.parse(since))) throw new Error("invalid_diagnostic_since");

const sourceIds = [
  "INCHEON_DUTY_FREE_ACTUAL",
  "INCHEON_SCHEDULED_DUTY_FREE",
  "KTO_TOURAPI_EVENT",
] as const;

const { accountId, databaseId, apiToken } = resolveProductionDatabaseConfig("production");
const database = new CloudflareD1RestDatabase(accountId, databaseId, apiToken);

const runs = await database.prepare(`SELECT source_id, status, started_at, finished_at,
    records_read, records_written, detail
  FROM collector_runs
  WHERE source_id IN (?, ?, ?) AND started_at >= ?
  ORDER BY started_at DESC LIMIT 30`)
  .bind(...sourceIds, since)
  .run();

const health = await database.prepare(`SELECT source_id, status, last_event_at,
    last_published_at, last_retrieved_at, consecutive_failures, schema_version,
    detail, updated_at
  FROM source_health
  WHERE source_id IN (?, ?, ?)
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
  collectorRuns: safeRows(runs.results),
  sourceHealth: safeRows(health.results),
}, null, 2));
