/**
 * Read-only D1 coverage probes.
 *
 * `source_health` answers "did the collector run and what did it say".
 * It cannot answer "is there actually a row the UI can render for the hour
 * the user is looking at" — a collector can report LIVE while every stored
 * target hour is already in the past. These probes close that gap: each one
 * is a single SELECT that reports, per table, how much usable data exists
 * relative to a caller-supplied KST instant.
 *
 * Every statement here MUST stay a SELECT. They are executed by the
 * read-only production diagnostic, which runs with a D1 token, so a stray
 * write here would be a write against Production with no confirmation gate.
 * tests/data-coverage.test.mjs asserts the SELECT-only shape.
 */
import {
  STORE_DYNAMICS_MAPPING_VERSION,
  STORE_DYNAMICS_SOURCE_ID,
} from "./store-dynamics";

const STORE_DYNAMICS_AREAS = ["myeongdong", "hongdae", "seongsu"] as const;

function storeDynamicsCoverageSql(): string {
  return STORE_DYNAMICS_AREAS.map(() => `SELECT sourceId, datasetId, recordOrigin, area, quarterCode,
      tradeAreaCode, tradeAreaName, tradeAreaTypeCode, tradeAreaTypeName, mappingVersion, qualityStatus,
      totalStoreCount, ordinaryStoreCount, franchiseStoreCount, openingCount,
      openingRateTenthsPercent, closureCount, closureRateTenthsPercent, industryCount, retrievedAt, schemaVersion
    FROM (SELECT source_id AS sourceId, dataset_id AS datasetId, record_origin AS recordOrigin,
        area, quarter_code AS quarterCode, trade_area_code AS tradeAreaCode,
        trade_area_name AS tradeAreaName, trade_area_type_code AS tradeAreaTypeCode,
        trade_area_type_name AS tradeAreaTypeName, mapping_version AS mappingVersion,
        quality_status AS qualityStatus, overall_store_count AS totalStoreCount,
        ordinary_store_count AS ordinaryStoreCount, franchise_store_count AS franchiseStoreCount,
        opening_store_count AS openingCount, opening_rate_tenths_percent AS openingRateTenthsPercent,
        closure_store_count AS closureCount, closure_rate_tenths_percent AS closureRateTenthsPercent,
        industry_count AS industryCount,
        retrieved_at AS retrievedAt, schema_version AS schemaVersion
      FROM seoul_store_dynamics
      WHERE area = ? AND source_id = ? AND mapping_version = ?
        AND record_origin = 'OFFICIAL_HISTORICAL' AND quality_status = 'VALID'
      ORDER BY quarter_code DESC LIMIT 1)`).join(" UNION ALL ");
}

export interface CoverageProbe {
  /** Stable name printed in the diagnostic output. */
  name: string;
  /** Canonical source-health ids whose data this probe inspects. */
  sourceIds: readonly string[];
  /** What the row counts mean, so a reader never has to guess the semantics. */
  meaning: string;
  sql: string;
  /** Parameter builder; receives the KST instant and KST day the probe runs against. */
  params: (context: CoverageContext) => unknown[];
}

export interface CoverageContext {
  /** Current instant expressed in the same `+09:00` offset space rows are stored in. */
  kstNowIso: string;
  /** Current KST calendar day, `YYYY-MM-DD`. */
  kstToday: string;
  /** Start of the current KST hour, in `+09:00` offset space. */
  kstHourStartIso: string;
}

/**
 * Builds the KST comparison keys the probes (and the live API) need.
 *
 * Canonical rows store `+09:00` offsets, so comparisons are done in that same
 * offset space rather than against a UTC string — comparing `...Z` against
 * `...+09:00` lexicographically is silently wrong for nine hours a day.
 */
export function buildCoverageContext(nowIso: string): CoverageContext {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new Error("invalid_coverage_now");
  const kstWall = new Date(now + 9 * 3_600_000).toISOString();
  const kstNowIso = `${kstWall.slice(0, 19)}+09:00`;
  return {
    kstNowIso,
    kstToday: kstWall.slice(0, 10),
    kstHourStartIso: `${kstWall.slice(0, 13)}:00:00+09:00`,
  };
}

export const COVERAGE_PROBES: CoverageProbe[] = [
  {
    name: "seoul_realtime_area",
    sourceIds: ["SEOUL_CITYDATA_PPLTN"],
    meaning: "latest observation per area",
    sql: `SELECT area, MAX(observed_at) AS latestObservedAt, COUNT(*) AS rows
      FROM seoul_realtime_area GROUP BY area ORDER BY area`,
    params: () => [],
  },
  {
    name: "seoul_realtime_forecast_latest_issue",
    sourceIds: ["SEOUL_CITYDATA_PPLTN"],
    meaning: "latest published 12-hour forecast per area, and how much of it is still ahead of now",
    sql: `SELECT f.area,
        MAX(f.issued_at) AS latestIssuedAt,
        COUNT(*) AS bandsInLatestIssue,
        MIN(f.target_at) AS firstTargetAt,
        MAX(f.target_at) AS lastTargetAt,
        SUM(CASE WHEN f.target_at >= ? THEN 1 ELSE 0 END) AS bandsFromNow,
        SUM(CASE WHEN f.target_at >= ? THEN 1 ELSE 0 END) AS bandsFromCurrentHour,
        SUM(CASE WHEN substr(f.target_at, 1, 10) = ? THEN 1 ELSE 0 END) AS bandsToday,
        SUM(CASE WHEN substr(f.target_at, 1, 10) = ? AND f.target_at >= ? THEN 1 ELSE 0 END) AS bandsTodayFromCurrentHour
      FROM seoul_realtime_forecast f
      WHERE f.issued_at = (SELECT MAX(g.issued_at) FROM seoul_realtime_forecast g WHERE g.area = f.area)
      GROUP BY f.area ORDER BY f.area`,
    params: ({ kstNowIso, kstHourStartIso, kstToday }) => [
      kstNowIso, kstHourStartIso, kstToday, kstToday, kstHourStartIso,
    ],
  },
  {
    name: "weather_forecast_latest_issue",
    sourceIds: ["KMA_VILAGE_FCST"],
    meaning: "latest KMA issuance per area and how many target hours remain ahead",
    sql: `SELECT w.area, MAX(w.issued_at) AS latestIssuedAt, COUNT(*) AS bands,
        MIN(w.target_at) AS firstTargetAt, MAX(w.target_at) AS lastTargetAt,
        SUM(CASE WHEN w.target_at >= ? THEN 1 ELSE 0 END) AS bandsFromCurrentHour
      FROM weather_forecast w
      WHERE w.issued_at = (SELECT MAX(x.issued_at) FROM weather_forecast x WHERE x.area = w.area)
      GROUP BY w.area ORDER BY w.area`,
    params: ({ kstHourStartIso }) => [kstHourStartIso],
  },
  {
    // W1 (migration 0008) reads more of the same getVilageFcst response but
    // costs no extra request; this is the read-only check that those columns
    // actually landed in Production, not just that the migration applied.
    name: "weather_forecast_w1_sample",
    sourceIds: ["KMA_VILAGE_FCST"],
    meaning: "the earliest target hour of the latest KMA issuance per area, to confirm W1 humidity/wind/amount columns are actually populated and not just added by the migration",
    sql: `SELECT w.area, w.issued_at AS issuedAt, w.target_at AS targetAt,
        w.humidity_percent AS humidityPercent, w.wind_speed_tenth_mps AS windSpeedTenthMps,
        w.daily_min_temperature_tenth_c AS dailyMinTemperatureTenthC,
        w.daily_max_temperature_tenth_c AS dailyMaxTemperatureTenthC,
        w.precipitation_amount_raw AS precipitationAmountRaw, w.precipitation_amount_kind AS precipitationAmountKind,
        w.sky_code AS skyCode, w.precipitation_type_code AS precipitationTypeCode
      FROM weather_forecast w
      WHERE w.issued_at = (SELECT MAX(x.issued_at) FROM weather_forecast x WHERE x.area = w.area)
        AND w.target_at = (SELECT MIN(y.target_at) FROM weather_forecast y WHERE y.area = w.area AND y.issued_at = w.issued_at)
      ORDER BY w.area`,
    params: () => [],
  },
  {
    name: "tourism_events_upcoming",
    sourceIds: ["KTO_TOURAPI_EVENT"],
    meaning: "events per area still running or upcoming as of the current KST day",
    sql: `SELECT area, COUNT(*) AS upcomingEvents, MIN(event_start) AS nextStart, MAX(retrieved_at) AS retrievedAt
      FROM tourism_events WHERE (event_end >= ? OR (event_end IS NULL AND event_start >= ?))
      GROUP BY area ORDER BY area`,
    params: ({ kstToday }) => [kstToday, kstToday],
  },
  {
    name: "seoul_estimated_sales_latest",
    sourceIds: ["SEOUL_ESTIMATED_SALES"],
    meaning: "latest stored quarter per area",
    sql: `SELECT area, MAX(quarter_code) AS latestQuarter, COUNT(*) AS rows, MAX(retrieved_at) AS retrievedAt
      FROM seoul_estimated_sales GROUP BY area ORDER BY area`,
    params: () => [],
  },
  {
    name: "seoul_store_dynamics_latest",
    sourceIds: [STORE_DYNAMICS_SOURCE_ID],
    meaning: "latest valid OA-15577 compact row for each exact current area mapping",
    sql: storeDynamicsCoverageSql(),
    params: () => STORE_DYNAMICS_AREAS.flatMap((area) => [
      area, STORE_DYNAMICS_SOURCE_ID, STORE_DYNAMICS_MAPPING_VERSION,
    ]),
  },
  {
    name: "seoul_foreign_presence_latest",
    sourceIds: ["SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION"],
    meaning: "latest valid official-historical reference per area",
    sql: `SELECT area, MAX(reference_at) AS latestReferenceAt, COUNT(*) AS rows
      FROM seoul_foreign_presence_area
      WHERE record_origin = 'OFFICIAL_HISTORICAL' AND quality_status = 'VALID'
      GROUP BY area ORDER BY area`,
    params: () => [],
  },
  {
    name: "airport_congestion_latest",
    sourceIds: ["INCHEON_DEPARTURE_CONGESTION", "INCHEON_DEPARTURE_CONGESTION_T2"],
    meaning: "latest departure-hall observation per terminal, with checkpoint count",
    sql: `SELECT terminal, MAX(observed_at) AS latestObservedAt,
        COUNT(DISTINCT zone) AS zones, MAX(retrieved_at) AS retrievedAt
      FROM airport_congestion GROUP BY terminal ORDER BY terminal`,
    params: () => [],
  },
  {
    name: "airport_passenger_forecast_days",
    sourceIds: ["INCHEON_PASSENGER_FORECAST"],
    meaning: "official A5 aggregate departure bands per stored target date and terminal",
    sql: `SELECT target_date AS targetDate, terminal, COUNT(*) AS bands,
        MIN(target_start_at) AS firstBandStart, MAX(target_end_at) AS lastBandEnd,
        MAX(retrieved_at) AS retrievedAt
      FROM airport_passenger_forecast
      WHERE direction = 'departure' AND is_aggregate = 1
      GROUP BY target_date, terminal ORDER BY target_date DESC, terminal LIMIT 30`,
    params: () => [],
  },
  {
    // A2 asks a different question from source_health: not "did the collector
    // report SUCCESS" but "what is actually stored right now". Both probes are
    // bounded by the directory itself (~1.2k reference rows), and the grouped
    // one collapses to at most terminals x category groups.
    name: "airport_facility_totals",
    sourceIds: ["INCHEON_FACILITY_DIRECTORY"],
    meaning: "stored official facility directory totals: rows, area/side split, per-language name coverage and the missing-field counts that decide quality",
    sql: `SELECT COUNT(*) AS storedFacilities,
        SUM(CASE WHEN duty_area = 'DUTY_FREE' THEN 1 ELSE 0 END) AS dutyFreeArea,
        SUM(CASE WHEN duty_area = 'GENERAL' THEN 1 ELSE 0 END) AS generalArea,
        SUM(CASE WHEN duty_area IS NULL THEN 1 ELSE 0 END) AS unknownArea,
        SUM(CASE WHEN arrival_departure = 'ARRIVAL' THEN 1 ELSE 0 END) AS arrivalSide,
        SUM(CASE WHEN arrival_departure = 'DEPARTURE' THEN 1 ELSE 0 END) AS departureSide,
        SUM(CASE WHEN arrival_departure IS NULL THEN 1 ELSE 0 END) AS unknownSide,
        SUM(CASE WHEN name_ko IS NULL OR name_ko = '' THEN 1 ELSE 0 END) AS missingKoreanName,
        SUM(CASE WHEN name_en IS NULL OR name_en = '' THEN 1 ELSE 0 END) AS missingEnglishName,
        SUM(CASE WHEN name_ja IS NULL OR name_ja = '' THEN 1 ELSE 0 END) AS missingJapaneseName,
        SUM(CASE WHEN name_zh IS NULL OR name_zh = '' THEN 1 ELSE 0 END) AS missingChineseName,
        SUM(CASE WHEN business_hours_raw IS NULL OR business_hours_raw = '' THEN 1 ELSE 0 END) AS missingOfficialHours,
        SUM(CASE WHEN phone IS NULL OR phone = '' THEN 1 ELSE 0 END) AS missingPhone,
        SUM(CASE WHEN location_raw IS NULL OR location_raw = '' THEN 1 ELSE 0 END) AS missingLocationText,
        SUM(CASE WHEN terminal IS NULL THEN 1 ELSE 0 END) AS missingTerminal,
        SUM(CASE WHEN quality_status = 'VALID' THEN 1 ELSE 0 END) AS validRows,
        SUM(CASE WHEN quality_status = 'PARTIAL' THEN 1 ELSE 0 END) AS partialRows,
        MIN(retrieved_at) AS oldestRetrievedAt, MAX(retrieved_at) AS newestRetrievedAt
      FROM airport_facility`,
    params: () => [],
  },
  {
    name: "airport_facility_by_terminal_category",
    sourceIds: ["INCHEON_FACILITY_DIRECTORY"],
    meaning: "stored facility rows per terminal and KORETAIL category group, the exact breakdown the 매장·시설 filters browse",
    sql: `SELECT COALESCE(terminal, 'UNKNOWN') AS terminal, category_group AS categoryGroup,
        COUNT(*) AS facilities,
        SUM(CASE WHEN duty_area = 'DUTY_FREE' THEN 1 ELSE 0 END) AS dutyFreeArea
      FROM airport_facility
      GROUP BY COALESCE(terminal, 'UNKNOWN'), category_group
      ORDER BY terminal, categoryGroup`,
    params: () => [],
  },
  {
    name: "airport_flights_days",
    sourceIds: ["INCHEON_FLIGHT_DETAIL", "INCHEON_DUTY_FREE_ACTUAL"],
    meaning: "distinct physical departures per stored KST service date, with gate coverage",
    sql: `SELECT substr(scheduled_at, 1, 10) AS serviceDate,
        COUNT(DISTINCT physical_flight_id) AS departures,
        COUNT(DISTINCT CASE WHEN gate IS NOT NULL AND gate <> '' THEN physical_flight_id END) AS departuresWithGate,
        MAX(retrieved_at) AS retrievedAt
      FROM airport_flights WHERE direction = 'departure'
      GROUP BY serviceDate ORDER BY serviceDate DESC LIMIT 14`,
    params: () => [],
  },
];

/** Guard used by the diagnostic and asserted in tests: probes must never write. */
export function isReadOnlyProbe(probe: CoverageProbe): boolean {
  const normalized = probe.sql.replace(/\s+/g, " ").trim().toUpperCase();
  if (!normalized.startsWith("SELECT")) return false;
  return !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|PRAGMA|ATTACH)\b/.test(normalized);
}
