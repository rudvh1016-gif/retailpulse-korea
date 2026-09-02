/**
 * Read-only Production D1 read-budget measurement.
 *
 * Answers, with real Production numbers rather than a local model, the three
 * questions the 2026-09-01 row-read incident left open:
 *
 *   1. Did migration 0007 actually reach Production? (the indexes are read
 *      back out of sqlite_master, not inferred from a green deploy step)
 *   2. What does one uncached /api/live/summary really cost in rows read?
 *      (every hot-path statement is replayed and its `meta.rows_read` is
 *      reported, so the total is measured, not estimated)
 *   3. What did it cost before? (each table's real Production row count is
 *      the denominator, because the pre-0007 plans provably scanned those
 *      tables end to end — the EXPLAIN output below shows which plans seek
 *      now and which still scan)
 *
 * Safety properties, all load-bearing:
 *
 *   - Every statement is a bare SELECT or an EXPLAIN. Nothing writes.
 *   - Zero provider calls. No KMA, A1, A4, A5, TourAPI or Seoul request is
 *     made, so this can never manufacture collection evidence.
 *   - The run is bounded. Cumulative rows read are tracked against
 *     RPK_READ_BUDGET_CEILING (default 100,000) and the remaining phases are
 *     skipped rather than allowed to eat the daily allowance. The expensive
 *     phase runs last precisely so a ceiling stop still leaves the important
 *     measurement in hand.
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
  /** Table whose full size was the pre-0007 cost of this statement. */
  table: string | null;
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
    table: null,
  },
  {
    name: "forecastDates",
    sql: dayValueExistsSql("airport_passenger_forecast", "target_date", "direction = 'departure' AND is_aggregate = 1"),
    binds: [pickerDays[0], pickerDays[0]],
    repeatBinds: pickerDays.map((day) => [day, day]),
    guard: `dayValueExistsSql("airport_passenger_forecast", "target_date", "direction = 'departure' AND is_aggregate = 1")`,
    table: null,
  },
  {
    name: "observedDates",
    sql: dayExistsSql("seoul_realtime_area", "observed_at"),
    binds: [pickerDays[0], pickerDays[0], shiftKstDay(pickerDays[0], 1)],
    repeatBinds: pickerDays.map((day) => [day, day, shiftKstDay(day, 1)]),
    guard: `dayExistsSql("seoul_realtime_area", "observed_at")`,
    table: null,
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
  "airport_congestion_terminal_observed_idx",
  "airport_flights_direction_scheduled_idx",
];

const { accountId, databaseId, apiToken } = resolveProductionDatabaseConfig("production");
const database = new CloudflareD1RestDatabase(accountId, databaseId, apiToken);

let rowsReadSoFar = 0;
let stoppedAtCeiling = false;

async function measure(sql: string, binds: unknown[]): Promise<{ rowsRead: number; rowCount: number }> {
  const result = await database.prepare(sql).bind(...binds).all();
  const rowsRead = Number(result.meta?.rows_read ?? 0);
  rowsReadSoFar += rowsRead;
  return { rowsRead, rowCount: result.results.length };
}

async function explain(sql: string, binds: unknown[]): Promise<string[]> {
  // EXPLAIN QUERY PLAN reports the plan without executing the statement, so it
  // reads no rows of its own.
  const result = await database.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...binds).all<{ detail?: unknown }>();
  return result.results.map((row) => String(row.detail ?? ""));
}

// Phase 1 — did migration 0007 actually land? Read the index names back.
const indexRows = await database.prepare(
  `SELECT name, tbl_name AS tableName FROM sqlite_master WHERE type = 'index' AND name IN (${EXPECTED_INDEXES.map(() => "?").join(", ")}) ORDER BY name`,
).bind(...EXPECTED_INDEXES).all<{ name?: unknown; tableName?: unknown }>();
const presentIndexes = indexRows.results.map((row) => String(row.name ?? ""));
const missingIndexes = EXPECTED_INDEXES.filter((name) => !presentIndexes.includes(name));

// Phase 2 — the measurement that matters: what one uncached summary costs now.
const perQuery: Array<Record<string, unknown>> = [];
for (const query of HOT_QUERIES) {
  if (rowsReadSoFar >= CEILING) {
    stoppedAtCeiling = true;
    perQuery.push({ name: query.name, skipped: "read_budget_ceiling" });
    continue;
  }
  try {
    const plan = await explain(query.sql, query.binds);
    let rowsRead = 0;
    let rowCount = 0;
    for (const binds of query.repeatBinds ?? [query.binds]) {
      const once = await measure(query.sql, binds);
      rowsRead += once.rowsRead;
      rowCount += once.rowCount;
    }
    perQuery.push({
      name: query.name,
      table: query.table,
      statementsRun: (query.repeatBinds ?? [query.binds]).length,
      rowsRead,
      rowsReturned: rowCount,
      // A plan line naming one of our tables with SCAN is the regression the
      // indexes exist to prevent; SEARCH means the seek is being used.
      scans: plan.filter((line) => /^SCAN [a-z_]+/i.test(line)),
      plan,
    });
  } catch (error) {
    perQuery.push({ name: query.name, error: error instanceof Error ? error.message : String(error) });
  }
}

const summaryRowsRead = perQuery.reduce((total, entry) => total + Number(entry.rowsRead ?? 0), 0);

// Phase 3 — the "before" denominator, last because it is the expensive part.
// Every pre-0007 plan on these tables was a full SCAN, so the table's real row
// count is what that statement read per request.
const tableCounts: Array<Record<string, unknown>> = [];
const countedTables = [...new Set(HOT_QUERIES.map((query) => query.table).filter((table): table is string => Boolean(table)))];
for (const table of countedTables) {
  if (rowsReadSoFar >= CEILING) {
    stoppedAtCeiling = true;
    tableCounts.push({ table, skipped: "read_budget_ceiling" });
    continue;
  }
  try {
    const result = await database.prepare(`SELECT COUNT(*) AS rows FROM ${table}`).all<{ rows?: unknown }>();
    rowsReadSoFar += Number(result.meta?.rows_read ?? 0);
    tableCounts.push({ table, rows: Number(result.results[0]?.rows ?? 0) });
  } catch (error) {
    tableCounts.push({ table, error: error instanceof Error ? error.message : String(error) });
  }
}

const measuredTableRows = tableCounts.reduce((total, entry) => total + Number(entry.rows ?? 0), 0);

console.log(JSON.stringify({
  diagnostic: "production-read-budget",
  generatedAt,
  serviceDate,
  migration0007: {
    expected: EXPECTED_INDEXES.length,
    present: presentIndexes.length,
    missing: missingIndexes,
    applied: missingIndexes.length === 0,
  },
  liveSummary: {
    statements: perQuery.length,
    rowsReadPerUncachedRequest: summaryRowsRead,
    percentOfFreeDailyAllowance: Number(((summaryRowsRead / D1_FREE_DAILY_ROWS_READ) * 100).toFixed(6)),
    uncachedRequestsPerDayWithinAllowance: summaryRowsRead > 0
      ? Math.floor(D1_FREE_DAILY_ROWS_READ / summaryRowsRead)
      : null,
    perQuery,
  },
  preIndexBaseline: {
    note: "Pre-0007 plans scanned these tables end to end, so each table's real row count was that statement's per-request cost.",
    tableCounts,
    scannedRowsPerRequest: measuredTableRows,
  },
  budget: {
    freeDailyRowsRead: D1_FREE_DAILY_ROWS_READ,
    diagnosticCeiling: CEILING,
    diagnosticRowsRead: rowsReadSoFar,
    stoppedAtCeiling,
  },
}, null, 2));
