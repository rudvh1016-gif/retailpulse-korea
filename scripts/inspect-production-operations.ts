/**
 * Safe read-only Production operations diagnostic.
 *
 * This performs ZERO provider calls and executes ZERO write statements: it
 * only SELECTs a fixed set of safe operational columns from collector_runs
 * and source_health, and every `detail` is passed through
 * sanitizeProductionDetail so authenticated URLs, service keys and bearer
 * tokens can never be printed.
 *
 * RPK_DIAGNOSTIC_SOURCES is required and narrows the inspection to a comma
 * list of production source names (or canonical source ids). An implicit
 * all-source coverage sweep is refused because several legacy coverage
 * probes are not bounded. See lib/production-diagnostics.ts.
 */
import { CloudflareD1RestDatabase } from "../lib/d1-rest";
import { COVERAGE_PROBES, buildCoverageContext, isReadOnlyProbe } from "../lib/data-coverage";
import { resolveDiagnosticSourceIds, sanitizeProductionDetail } from "../lib/production-diagnostics";
import { productionA4Overflow, resolveProductionDatabaseConfig } from "./production-database";
import { measureSource } from "../lib/operational-evidence";

const since = process.env.RPK_DIAGNOSTIC_SINCE?.trim();
if (!since || Number.isNaN(Date.parse(since))) throw new Error("invalid_diagnostic_since");

const sourceSelection = process.env.RPK_DIAGNOSTIC_SOURCES?.trim();
if (!sourceSelection) throw new Error("diagnostic_sources_required");
const sourceIds = resolveDiagnosticSourceIds(sourceSelection);
const placeholders = sourceIds.map(() => "?").join(", ");

const config=resolveProductionDatabaseConfig("production");
const { accountId, databaseId, apiToken } = config;
const database = new CloudflareD1RestDatabase(accountId, databaseId, apiToken);
const migrations = await database.prepare('SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 5').all();

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

// Data coverage: what the UI can actually render right now, which
// source_health alone cannot prove. Read-only by construction — a probe that
// is not a bare SELECT is refused rather than executed.
const coverageContext = buildCoverageContext(new Date().toISOString());
const coverage: Array<Record<string, unknown>> = [];
const selectedSourceIds = new Set(sourceIds);
const selectedCoverageProbes = COVERAGE_PROBES.filter((probe) =>
  probe.sourceIds.some((sourceId) => selectedSourceIds.has(sourceId)));
for (const probe of selectedCoverageProbes) {
  if (!isReadOnlyProbe(probe)) throw new Error(`coverage_probe_not_read_only_${probe.name}`);
  try {
    if (probe.name==='airport_congestion_latest') {
      const shard=productionA4Overflow(config) as unknown as D1Database | undefined;
      const rows=[];
      for (const id of probe.sourceIds.filter(id=>selectedSourceIds.has(id))) {
        const receipt=await measureSource(database as unknown as D1Database,id,new Date().toISOString(),{a4Overflow:shard});
        if(receipt.storageReadFailed)throw new Error('a4_coverage_storage_unverified');
        rows.push({terminal:id.endsWith('_T2')?'T2':'T1',latestObservedAt:receipt.sample[0]?.observed_at??null,
          zones:receipt.storedRows,retrievedAt:receipt.sample[0]?.retrieved_at??null,
          storage:receipt.a4Pointer?'standby':'primary',valid:receipt.dataValid});
      }
      coverage.push({probe:probe.name,meaning:probe.meaning,rows});
      continue;
    }
    const result = await database.prepare(probe.sql).bind(...probe.params(coverageContext)).run();
    coverage.push({ probe: probe.name, meaning: probe.meaning, rows: result.results ?? [] });
  } catch (error) {
    coverage.push({
      probe: probe.name,
      meaning: probe.meaning,
      error: sanitizeProductionDetail(error instanceof Error ? error.message : error),
    });
  }
}

console.log(JSON.stringify({
  diagnostic: "production-operations-read-only",
  migrationState: migrations.results,
  since,
  inspectedSourceIds: sourceIds,
  inspectedCoverageProbes: selectedCoverageProbes.map((probe) => probe.name),
  coverageContext,
  collectorRuns: safeRows(runs.results),
  sourceHealth: safeRows(health.results),
  dataCoverage: coverage,
}, null, 2));

// An explicit source-scoped verification is evidence only when its bounded
// coverage query actually succeeded. Keep the safe JSON output, then fail the
// workflow so an absent migration/query error cannot be mistaken for proof.
if (coverage.some((entry) => "error" in entry)) process.exitCode = 1;
