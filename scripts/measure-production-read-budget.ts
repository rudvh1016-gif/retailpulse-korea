/**
 * Read-only Production D1 read-budget measurement.
 *
 * Answers, with real Production numbers rather than a local model, the three
 * questions the 2026-09-01 row-read incident left open:
 *
 *   1. Did every index the current hot path requires actually reach
 *      Production? (the names are read back out of sqlite_master, not inferred
 *      from a green deploy step)
 *   2. What does one uncached /api/live/summary really cost in rows read?
 *      (every hot-path statement is replayed and its `meta.rows_read` is
 *      reported, so the total is measured, not estimated)
 *   3. Does EXPLAIN still prove bounded index access before any measured query
 *      executes? A missing index, plan regression, query error, or ceiling
 *      stop fails closed instead of being reported as a deceptively cheap run.
 *
 * Safety properties, all load-bearing:
 *
 *   - Every statement is a bare SELECT or an EXPLAIN. Nothing writes.
 *   - Zero provider calls. No KMA, A1, A4, A5, TourAPI or Seoul request is
 *     made, so this can never manufacture collection evidence.
 *   - The run is bounded. Cumulative rows read are tracked against
 *     RPK_READ_BUDGET_CEILING (default 100,000). Unbounded table-count scans
 *     are deliberately excluded; this diagnostic measures only the same
 *     bounded statements the route serves.
 *   - The SQL is drift-guarded. Each measured statement must still be present
 *     in app/api/live/summary/route.ts or the script fails, so this can never
 *     quietly measure a query the live route no longer runs.
 */
import { readFileSync } from "node:fs";
import { CloudflareD1RestDatabase } from "../lib/d1-rest";
import { kstDayOf, kstHourStartIsoOf, shiftKstDay } from "../lib/kst";
import {
  SEOUL_FOREIGN_MAPPING_VERSION,
  SEOUL_FOREIGN_PRODUCT_VERSION,
  SEOUL_FOREIGN_SOURCE_ID,
} from "../lib/seoul-foreign";
import { FOREIGN_PURPOSE_MAPPING_VERSION, FOREIGN_PURPOSE_SOURCE_ID } from "../lib/foreign-purpose-mobility";
import { SEOUL_SUBWAY_MAPPING_VERSION, SEOUL_SUBWAY_SOURCE_ID } from "../lib/subway-ridership";
import { STORE_DYNAMICS_MAPPING_VERSION, STORE_DYNAMICS_SOURCE_ID } from "../lib/store-dynamics";
import { resolveProductionDatabaseConfig } from "./production-database";

/** Cloudflare's documented D1 Free daily allowance (rows read). */
const D1_FREE_DAILY_ROWS_READ = 5_000_000;

const CEILING = Number(process.env.RPK_READ_BUDGET_CEILING ?? 100_000);
if (!Number.isFinite(CEILING) || CEILING <= 0) throw new Error("invalid_read_budget_ceiling");

const ROUTE_PATH = new URL("../app/api/live/summary/route.ts", import.meta.url);
const routeSource = readFileSync(ROUTE_PATH, "utf8");

const AREAS = ["myeongdong", "hongdae", "seongsu"] as const;
const CONGESTION_TERMINALS = ["T1", "T2"] as const;
const DATE_PICKER_DAYS = 21;

// Mirrors of the route's two SQL builders. The `guard` fragment on every
// statement below is what keeps these honest: if the route stops shaping its
// SQL this way, the guard fails instead of the measurement silently drifting.
function dayExistsSql(table: string, column: string, filter = ""): string {
  const where = filter ? `${filter} AND ` : "";
  return `SELECT ? AS day WHERE EXISTS (SELECT 1 FROM ${table} WHERE ${where}${column} >= ? AND ${column} < ?)`;
}

function dayValueExistsSql(table: string, column: string, filter = ""): string {
  const where = filter ? `${filter} AND ` : "";
  return `SELECT ? AS day WHERE EXISTS (SELECT 1 FROM ${table} WHERE ${where}${column} = ?)`;
}

function latestPerKey(keys: readonly string[], build: (placeholder: string) => string): string {
  return keys.map(() => `SELECT * FROM (${build("?")})`).join(" UNION ALL ");
}

const generatedAt = new Date().toISOString();
const kstToday = kstDayOf(generatedAt);
const kstHourStart = kstHourStartIsoOf(generatedAt);
const serviceDate = kstToday;
const pickerDays = Array.from({ length: DATE_PICKER_DAYS }, (_, index) => shiftKstDay(kstToday, -index));

type HotQuery = {
  /** The block of the response this statement fills. */
  name: string;
  sql: string;
  binds: unknown[];
  /**
   * A distinctive slice of this statement that must still appear verbatim in
   * the live route, so the measurement provably tracks the shipped query.
   */
  guard: string;
  /** Table whose full size would determine the cost of an unindexed plan. */
  table: string;
  /** SQL aliases which EXPLAIN may use instead of the physical table name. */
  scanTargets?: readonly string[];
  /** Only fixed-cardinality operational tables may explicitly allow a scan. */
  allowUnindexedScan?: boolean;
  /**
   * Run this statement once per bind set and sum the rows read.
   *
   * The route sends the date-picker probes as one statement per day in a
   * single D1 batch, so the diagnostic runs them the same way and sums the
   * rows read. Measuring them as one 21-way UNION ALL is what this script
   * tried first; D1 rejects that statement, which is exactly how the live
   * bug it was hiding came to light.
   */
  repeatBinds?: unknown[][];
};

const HOT_QUERIES: HotQuery[] = [
  {
    name: "sources",
    sql: `SELECT source_id AS sourceId, status, last_event_at AS eventAt,
        last_retrieved_at AS retrievedAt, detail FROM source_health ORDER BY source_id`,
    binds: [],
    guard: "FROM source_health ORDER BY source_id",
    table: "source_health",
    allowUnindexedScan: true,
  },
  {
    name: "realtime",
    sql: latestPerKey(AREAS, () => `SELECT area, congestion_level AS congestionLevel, congestion_label AS congestionLabel,
        population_min AS populationMin, population_max AS populationMax,
        observed_at AS observedAt, retrieved_at AS retrievedAt
      FROM seoul_realtime_area WHERE area = ? ORDER BY observed_at DESC LIMIT 1`),
    binds: [...AREAS],
    guard: "FROM seoul_realtime_area WHERE area = ? ORDER BY observed_at DESC LIMIT 1",
    table: "seoul_realtime_area",
  },
  {
    name: "commercial",
    sql: latestPerKey(AREAS, () => `SELECT area, commercial_level AS commercialLevel,
        payment_count AS paymentCount, payment_amount_min AS paymentAmountMin,
        payment_amount_max AS paymentAmountMax, observed_at AS observedAt,
        retrieved_at AS retrievedAt, quality_status AS qualityStatus
      FROM seoul_realtime_commercial WHERE area = ? ORDER BY observed_at DESC LIMIT 1`),
    binds: [...AREAS],
    guard: "FROM seoul_realtime_commercial WHERE area = ? ORDER BY observed_at DESC LIMIT 1",
    table: "seoul_realtime_commercial",
  },
  {
    name: "realtimeForecast",
    sql: latestPerKey(AREAS, () => `SELECT area, issued_at AS issuedAt, target_at AS targetAt, congestion_level AS congestionLevel,
        congestion_label AS congestionLabel, population_min AS populationMin, population_max AS populationMax,
        retrieved_at AS retrievedAt
      FROM seoul_realtime_forecast
      WHERE area = ? AND issued_at = (SELECT MAX(issued_at) FROM seoul_realtime_forecast WHERE area = ?)
        AND target_at >= ?
      ORDER BY target_at LIMIT 40`),
    binds: AREAS.flatMap((area) => [area, area, kstHourStart]),
    guard: "FROM seoul_realtime_forecast\n      WHERE area = ? AND issued_at = (SELECT MAX(issued_at) FROM seoul_realtime_forecast WHERE area = ?)",
    table: "seoul_realtime_forecast",
  },
  {
    name: "weather",
    sql: latestPerKey(AREAS, () => `SELECT area, issued_at AS issuedAt, target_at AS targetAt,
        precipitation_probability AS precipitationProbability,
        temperature_tenth_c AS temperatureTenthC, condition_code AS conditionCode
      FROM weather_forecast
      WHERE area = ? AND issued_at = (SELECT MAX(issued_at) FROM weather_forecast WHERE area = ?)
        AND target_at >= ?
      ORDER BY target_at LIMIT 60`),
    binds: AREAS.flatMap((area) => [area, area, kstHourStart]),
    guard: "FROM weather_forecast\n      WHERE area = ? AND issued_at = (SELECT MAX(issued_at) FROM weather_forecast WHERE area = ?)",
    table: "weather_forecast",
  },
  {
    name: "events",
    sql: `SELECT area, content_id AS contentId, title, event_start AS eventStart,
        event_end AS eventEnd, distance_m AS distanceM, retrieved_at AS retrievedAt
      FROM tourism_events
      WHERE COALESCE(event_end, event_start) >= ?
      ORDER BY event_start LIMIT 30`,
    binds: [serviceDate],
    guard: "FROM tourism_events\n      WHERE COALESCE(event_end, event_start) >= ?",
    table: "tourism_events",
  },
  {
    name: "sales",
    sql: latestPerKey(AREAS, () => `SELECT area, quarter_code AS quarterCode, trade_area_code AS tradeAreaCode,
        trade_area_name AS tradeAreaName, industry_name AS industryName,
        sales_amount AS salesAmount, retrieved_at AS retrievedAt
      FROM seoul_estimated_sales
      WHERE area = ? AND quarter_code = (SELECT MAX(quarter_code) FROM seoul_estimated_sales WHERE area = ?)
      ORDER BY sales_amount DESC`),
    binds: AREAS.flatMap((area) => [area, area]),
    guard: "FROM seoul_estimated_sales\n      WHERE area = ? AND quarter_code = (SELECT MAX(quarter_code) FROM seoul_estimated_sales WHERE area = ?)",
    table: "seoul_estimated_sales",
  },
  {
    name: "storeDynamics",
    sql: latestPerKey(AREAS, () => `SELECT source_id AS sourceId, dataset_id AS datasetId,
        record_origin AS recordOrigin, area,
        quarter_code AS quarterCode, trade_area_code AS tradeAreaCode,
        trade_area_name AS tradeAreaName, trade_area_type_code AS tradeAreaTypeCode,
        trade_area_type_name AS tradeAreaTypeName,
        overall_store_count AS totalStoreCount, ordinary_store_count AS ordinaryStoreCount,
        franchise_store_count AS franchiseStoreCount, opening_store_count AS openingCount,
        opening_rate_tenths_percent AS openingRateTenthsPercent,
        closure_store_count AS closureCount,
        closure_rate_tenths_percent AS closureRateTenthsPercent,
        industry_count AS industryCount,
        mapping_version AS mappingVersion, retrieved_at AS retrievedAt,
        schema_version AS schemaVersion, quality_status AS qualityStatus
      FROM seoul_store_dynamics
      WHERE area = ? AND source_id = ? AND mapping_version = ?
        AND record_origin = 'OFFICIAL_HISTORICAL' AND quality_status = 'VALID'
      ORDER BY quarter_code DESC LIMIT 1`),
    binds: AREAS.flatMap((area) => [area, STORE_DYNAMICS_SOURCE_ID, STORE_DYNAMICS_MAPPING_VERSION]),
    guard: "FROM seoul_store_dynamics\n      WHERE area = ? AND source_id = ? AND mapping_version = ?",
    table: "seoul_store_dynamics",
  },
  {
    name: "foreignPresence",
    sql: `SELECT area, product_version AS productVersion, record_origin AS freshness, value, unit,
        reference_at AS referenceAt, retrieved_at AS retrievedAt,
        quality_status AS qualityStatus
      FROM seoul_foreign_presence_area a
      WHERE a.source_id = ? AND a.product_version = ? AND a.mapping_version = ?
        AND a.record_origin = 'OFFICIAL_HISTORICAL' AND a.quality_status = 'VALID'
        AND reference_at = (
        SELECT MAX(reference_at) FROM seoul_foreign_presence_area b
        WHERE b.area = a.area
          AND b.source_id = ? AND b.product_version = ? AND b.mapping_version = ?
          AND b.record_origin = 'OFFICIAL_HISTORICAL' AND b.quality_status = 'VALID'
      )`,
    binds: [
      SEOUL_FOREIGN_SOURCE_ID,
      SEOUL_FOREIGN_PRODUCT_VERSION,
      SEOUL_FOREIGN_MAPPING_VERSION,
      SEOUL_FOREIGN_SOURCE_ID,
      SEOUL_FOREIGN_PRODUCT_VERSION,
      SEOUL_FOREIGN_MAPPING_VERSION,
    ],
    guard: "FROM seoul_foreign_presence_area a",
    table: "seoul_foreign_presence_area",
    scanTargets: ["seoul_foreign_presence_area", "a", "b"],
  },
  {
    name: "foreignPurposeMobility",
    sql: latestPerKey(AREAS, () => `SELECT area, purpose, movement_value AS movementValue,
        reference_date AS referenceDate, retrieved_at AS retrievedAt,
        dataset_id AS datasetId, mapping_version AS mappingVersion,
        quality_status AS qualityStatus
      FROM seoul_foreign_purpose_mobility
      WHERE area = ? AND source_id = ? AND mapping_version = ?
        AND record_origin = 'OFFICIAL_HISTORICAL' AND quality_status = 'VALID'
        AND reference_date = (
          SELECT MAX(reference_date) FROM seoul_foreign_purpose_mobility
          WHERE area = ? AND source_id = ? AND mapping_version = ?
            AND record_origin = 'OFFICIAL_HISTORICAL' AND quality_status = 'VALID'
        )
      ORDER BY purpose LIMIT 2`),
    binds: AREAS.flatMap((area) => [
      area, FOREIGN_PURPOSE_SOURCE_ID, FOREIGN_PURPOSE_MAPPING_VERSION,
      area, FOREIGN_PURPOSE_SOURCE_ID, FOREIGN_PURPOSE_MAPPING_VERSION,
    ]),
    guard: "FROM seoul_foreign_purpose_mobility",
    table: "seoul_foreign_purpose_mobility",
  },
  {
    name: "subwayRidership",
    sql: latestPerKey(AREAS, () => `SELECT area, reference_date AS referenceDate,
        SUM(boarding_count) AS boardingCount, SUM(alighting_count) AS alightingCount,
        COUNT(*) AS selectedStationCount,
        GROUP_CONCAT(station_name || ' ' || line_name, ', ') AS selectedStations,
        MAX(retrieved_at) AS retrievedAt, dataset_id AS datasetId,
        mapping_version AS mappingVersion
      FROM seoul_subway_ridership
      WHERE area = ? AND source_id = ? AND mapping_version = ?
        AND record_origin = 'OFFICIAL_DAILY' AND quality_status = 'VALID'
        AND reference_date = (
          SELECT MAX(reference_date) FROM seoul_subway_ridership
          WHERE area = ? AND source_id = ? AND mapping_version = ?
            AND record_origin = 'OFFICIAL_DAILY' AND quality_status = 'VALID'
        )
      GROUP BY area, reference_date, dataset_id, mapping_version LIMIT 1`),
    binds: AREAS.flatMap((area) => [
      area, SEOUL_SUBWAY_SOURCE_ID, SEOUL_SUBWAY_MAPPING_VERSION,
      area, SEOUL_SUBWAY_SOURCE_ID, SEOUL_SUBWAY_MAPPING_VERSION,
    ]),
    guard: "FROM seoul_subway_ridership",
    table: "seoul_subway_ridership",
  },
  {
    name: "congestion",
    sql: latestPerKey(CONGESTION_TERMINALS, () => `SELECT terminal, zone, wait_time_minutes AS waitTimeMinutes, wait_time_raw AS waitTimeRaw,
        waiting_count AS waitingCount, observed_at AS observedAt, retrieved_at AS retrievedAt
      FROM airport_congestion
      WHERE terminal = ? AND observed_at = (SELECT MAX(observed_at) FROM airport_congestion WHERE terminal = ?)
      ORDER BY zone LIMIT 12`),
    binds: CONGESTION_TERMINALS.flatMap((terminal) => [terminal, terminal]),
    guard: "FROM airport_congestion\n      WHERE terminal = ? AND observed_at = (SELECT MAX(observed_at) FROM airport_congestion WHERE terminal = ?)",
    table: "airport_congestion",
  },
  {
    name: "passengerForecast",
    sql: `SELECT terminal, direction, is_aggregate AS isAggregate,
        target_date AS targetDate, time_band_raw AS timeBandRaw,
        target_start_at AS targetStartAt, target_end_at AS targetEndAt,
        expected_passengers AS expectedPassengers, retrieved_at AS retrievedAt
      FROM airport_passenger_forecast f
      WHERE f.direction IN ('departure', 'arrival') AND f.is_aggregate = 1 AND f.target_date = ?
      ORDER BY direction, target_start_at, terminal LIMIT 96`,
    binds: [serviceDate],
    guard: "WHERE f.direction IN ('departure', 'arrival') AND f.is_aggregate = 1 AND f.target_date = ?",
    table: "airport_passenger_forecast",
    scanTargets: ["airport_passenger_forecast", "f"],
  },
  {
    name: "flights",
    sql: `SELECT physical_flight_id AS physicalFlightId, terminal, gate, retrieved_at AS retrievedAt
      FROM airport_flights
      WHERE direction = 'departure' AND scheduled_at >= ? AND scheduled_at < ?
      LIMIT 2000`,
    binds: [serviceDate, shiftKstDay(serviceDate, 1)],
    guard: "WHERE direction = 'departure' AND scheduled_at >= ? AND scheduled_at < ?",
    table: "airport_flights",
  },
  {
    name: "scheduled",
    sql: `SELECT terminal, COUNT(*) AS flights, MIN(scheduled_time) AS firstTime, MAX(scheduled_time) AS lastTime,
        MAX(retrieved_at) AS retrievedAt
      FROM airport_scheduled_flights
      WHERE valid_from <= ? AND valid_to >= ?
      GROUP BY terminal ORDER BY terminal`,
    binds: [serviceDate, serviceDate],
    guard: "FROM airport_scheduled_flights\n      WHERE valid_from <= ? AND valid_to >= ?",
    table: "airport_scheduled_flights",
  },
  {
    name: "flightDates",
    sql: dayExistsSql("airport_flights", "scheduled_at", "direction = 'departure'"),
    binds: [pickerDays[0], pickerDays[0], shiftKstDay(pickerDays[0], 1)],
    repeatBinds: pickerDays.map((day) => [day, day, shiftKstDay(day, 1)]),
    guard: `dayExistsSql("airport_flights", "scheduled_at", "direction = 'departure'")`,
    table: "airport_flights",
  },
  {
    name: "forecastDates",
    sql: dayValueExistsSql("airport_passenger_forecast", "target_date", "direction = 'departure' AND is_aggregate = 1"),
    binds: [pickerDays[0], pickerDays[0]],
    repeatBinds: pickerDays.map((day) => [day, day]),
    guard: `dayValueExistsSql("airport_passenger_forecast", "target_date", "direction = 'departure' AND is_aggregate = 1")`,
    table: "airport_passenger_forecast",
  },
  {
    name: "observedDates",
    sql: dayExistsSql("seoul_realtime_area", "observed_at"),
    binds: [pickerDays[0], pickerDays[0], shiftKstDay(pickerDays[0], 1)],
    repeatBinds: pickerDays.map((day) => [day, day, shiftKstDay(day, 1)]),
    guard: `dayExistsSql("seoul_realtime_area", "observed_at")`,
    table: "seoul_realtime_area",
  },
];

const drifted = HOT_QUERIES.filter((query) => !routeSource.includes(query.guard)).map((query) => query.name);
if (drifted.length) {
  throw new Error(`hot_query_drifted_from_route: ${drifted.join(", ")}`);
}

const EXPECTED_INDEXES = [
  "seoul_realtime_area_area_observed_idx",
  "seoul_realtime_area_observed_idx",
  "seoul_realtime_commercial_area_observed_idx",
  "seoul_foreign_purpose_mobility_area_reference_idx",
  "seoul_subway_ridership_area_reference_idx",
  "seoul_realtime_forecast_area_issue_idx",
  "weather_forecast_area_issue_idx",
  "weather_forecast_issued_area_idx",
  "seoul_estimated_sales_area_quarter_idx",
  "seoul_store_dynamics_area_quarter_idx",
  "seoul_store_dynamics_unique",
  "airport_congestion_terminal_observed_idx",
  "airport_passenger_forecast_target_idx",
  "airport_flights_direction_scheduled_idx",
];

const { accountId, databaseId, apiToken } = resolveProductionDatabaseConfig("production");
const database = new CloudflareD1RestDatabase(accountId, databaseId, apiToken);

let rowsReadSoFar = 0;
let stoppedAtCeiling = false;

function requireRowsReadMetadata(meta: { rows_read?: unknown } | undefined): number {
  const rowsRead = meta?.rows_read;
  if (typeof rowsRead !== "number" || !Number.isSafeInteger(rowsRead) || rowsRead < 0) {
    throw new Error("invalid_rows_read_metadata");
  }
  return rowsRead;
}

async function measure(sql: string, binds: unknown[]): Promise<{ rowsRead: number; rowCount: number }> {
  if (rowsReadSoFar >= CEILING) {
    stoppedAtCeiling = true;
    throw new Error("read_budget_ceiling");
  }
  const result = await database.prepare(sql).bind(...binds).all();
  const rowsRead = requireRowsReadMetadata(result.meta);
  rowsReadSoFar += rowsRead;
  if (rowsReadSoFar > CEILING) stoppedAtCeiling = true;
  return { rowsRead, rowCount: result.results.length };
}

async function explain(sql: string, binds: unknown[]): Promise<string[]> {
  // EXPLAIN QUERY PLAN reports the plan without executing the statement, so it
  // reads no rows of its own.
  const result = await database.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...binds).all<{ detail?: unknown }>();
  return result.results.map((row) => String(row.detail ?? ""));
}

// Phase 1 — prove every currently required index actually landed.
const indexRows = await database.prepare(
  `SELECT name, tbl_name AS tableName FROM sqlite_master WHERE type = 'index' AND name IN (${EXPECTED_INDEXES.map(() => "?").join(", ")}) ORDER BY name`,
).bind(...EXPECTED_INDEXES).all<{ name?: unknown; tableName?: unknown }>();
rowsReadSoFar += requireRowsReadMetadata(indexRows.meta);
if (rowsReadSoFar > CEILING) stoppedAtCeiling = true;
const presentIndexes = indexRows.results.map((row) => String(row.name ?? ""));
const missingIndexes = EXPECTED_INDEXES.filter((name) => !presentIndexes.includes(name));

// Phase 2 — inspect every plan before executing any hot-path query. A bare
// SCAN of a growing source table is both a release failure and unsafe to run
// as a supposedly bounded diagnostic. It is reported and only that statement
// is skipped; safe statements (including Store Dynamics) can still provide
// real rows_read evidence without spending through an unrelated legacy scan.
const planChecks: Array<Record<string, unknown>> = [];
for (const query of HOT_QUERIES) {
  try {
    const plan = await explain(query.sql, query.binds);
    const scanTargets = new Set(query.scanTargets ?? [query.table]);
    const unindexedTableScans = query.allowUnindexedScan
      ? []
      : plan.filter((line) => {
        const scanned = /^SCAN\s+([A-Za-z_][A-Za-z0-9_]*)\b/i.exec(line)?.[1];
        return Boolean(scanned)
          && scanTargets.has(scanned as string)
          && !/\bUSING (?:COVERING )?INDEX\b/i.test(line);
      });
    planChecks.push({ name: query.name, table: query.table, plan, unindexedTableScans });
  } catch (error) {
    planChecks.push({ name: query.name, table: query.table, error: error instanceof Error ? error.message : String(error) });
  }
}
const planErrors = planChecks.filter((entry) => entry.error);
const scanRegressions = planChecks.filter((entry) => Array.isArray(entry.unindexedTableScans) && entry.unindexedTableScans.length > 0);
const preflightPassed = missingIndexes.length === 0 && planErrors.length === 0 && scanRegressions.length === 0;

// Phase 3 — measure every statement proven safe. If one statement has an
// unindexed scan, the complete summary number stays null and the workflow
// fails, but bounded statements retain their actual per-query evidence.
const perQuery: Array<Record<string, unknown>> = [];
for (const query of HOT_QUERIES) {
  const planCheck = planChecks.find((entry) => entry.name === query.name);
  if (missingIndexes.length > 0) {
    perQuery.push({ name: query.name, skipped: "missing_required_index" });
    continue;
  }
  if (planCheck?.error) {
    perQuery.push({ name: query.name, skipped: "plan_error" });
    continue;
  }
  if (Array.isArray(planCheck?.unindexedTableScans) && planCheck.unindexedTableScans.length > 0) {
    perQuery.push({
      name: query.name,
      table: query.table,
      skipped: "unindexed_scan",
      plan: planCheck.plan,
    });
    continue;
  }
  if (rowsReadSoFar >= CEILING || stoppedAtCeiling) {
    stoppedAtCeiling = true;
    perQuery.push({ name: query.name, skipped: "read_budget_ceiling" });
    continue;
  }
  try {
    let rowsRead = 0;
    let rowCount = 0;
    let statementsRun = 0;
    for (const binds of query.repeatBinds ?? [query.binds]) {
      const once = await measure(query.sql, binds);
      rowsRead += once.rowsRead;
      rowCount += once.rowCount;
      statementsRun += 1;
      if (stoppedAtCeiling) break;
    }
    perQuery.push({
      name: query.name,
      table: query.table,
      statementsRun,
      rowsRead,
      rowsReturned: rowCount,
      plan: planChecks.find((entry) => entry.name === query.name)?.plan,
      incomplete: stoppedAtCeiling,
    });
  } catch (error) {
    perQuery.push({ name: query.name, error: error instanceof Error ? error.message : String(error) });
  }
}

const queryErrors = perQuery.filter((entry) => entry.error);
const skippedQueries = perQuery.filter((entry) => entry.skipped || entry.incomplete);
const measurementComplete = preflightPassed
  && !stoppedAtCeiling
  && queryErrors.length === 0
  && skippedQueries.length === 0
  && perQuery.length === HOT_QUERIES.length;
const measuredSummaryRowsRead = perQuery.reduce((total, entry) => total + Number(entry.rowsRead ?? 0), 0);
const summaryRowsRead = measurementComplete ? measuredSummaryRowsRead : null;

console.log(JSON.stringify({
  diagnostic: "production-read-budget",
  generatedAt,
  serviceDate,
  requiredIndexes: {
    expected: EXPECTED_INDEXES.length,
    present: presentIndexes.length,
    missing: missingIndexes,
    applied: missingIndexes.length === 0,
  },
  preflight: {
    passed: preflightPassed,
    planErrors,
    scanRegressions,
    plans: planChecks,
  },
  liveSummary: {
    statements: perQuery.length,
    complete: measurementComplete,
    rowsReadPerUncachedRequest: summaryRowsRead,
    measuredSafeRowsRead: measuredSummaryRowsRead,
    percentOfFreeDailyAllowance: summaryRowsRead === null
      ? null
      : Number(((summaryRowsRead / D1_FREE_DAILY_ROWS_READ) * 100).toFixed(6)),
    uncachedRequestsPerDayWithinAllowance: summaryRowsRead !== null && summaryRowsRead > 0
      ? Math.floor(D1_FREE_DAILY_ROWS_READ / summaryRowsRead)
      : null,
    perQuery,
  },
  budget: {
    freeDailyRowsRead: D1_FREE_DAILY_ROWS_READ,
    diagnosticCeiling: CEILING,
    diagnosticRowsRead: rowsReadSoFar,
    stoppedAtCeiling,
  },
}, null, 2));

if (!preflightPassed || !measurementComplete) process.exitCode = 1;
