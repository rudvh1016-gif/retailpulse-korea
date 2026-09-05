import { flightScopeCounts } from "../../../../lib/flight-scope";
import { compareComposition } from "../../../../lib/airport-composition-history";
import type { AirlineRankingSummary } from "../../../../lib/airline-ranking";
import { getDb } from "../../../../db";
import { rangeChange, withAreaBaselines } from "../../../../lib/period-comparison";
import {
  SEOUL_FOREIGN_MAPPING_VERSION,
  SEOUL_FOREIGN_PRODUCT_VERSION,
  SEOUL_FOREIGN_SOURCE_ID,
} from "../../../../lib/seoul-foreign";
import {
  FOREIGN_PURPOSE_MAPPING_VERSION,
  FOREIGN_PURPOSE_SOURCE_ID,
} from "../../../../lib/foreign-purpose-mobility";
import {
  SEOUL_SUBWAY_DATASET_ID,
  SEOUL_SUBWAY_MAPPING_VERSION,
  SEOUL_SUBWAY_SOURCE_ID,
  SUBWAY_AREA_STATIONS,
} from "../../../../lib/subway-ridership";
import { SUBWAY_TREND_WINDOW_DAYS, summarizeSubwayTrend } from "../../../../lib/subway-trend";
import {
  STORE_DYNAMICS_MAPPING_VERSION,
  STORE_DYNAMICS_SOURCE_ID,
  isValidStoredStoreDynamicsRow,
} from "../../../../lib/store-dynamics";
import {
  summarizeCurrentBusiestDepartureHalls,
  summarizeNextPassengerForecastBand,
  summarizePassengerForecast,
  summarizeRemainingPassengerForecast,
  summarizeTodayPassengerForecast,
  summarizeTodayTopGate,
  summarizeTodayTopGateByTerminal,
  type AirportCongestionSummaryRow,
  type AirportForecastAggregateRow,
  type AirportTodayFlightRow,
} from "../../../../lib/airport-today-summary";
import { prepareEventsForPresentation } from "../../../../lib/event-presentation";
import { summarizeAirlineRanking, type AirlineRankingFlightRow } from "../../../../lib/airline-ranking";
import { AIRLINE_COUNTRY_SOURCE, lookupAirline } from "../../../../lib/airline-country";
import { summaryCacheControl, SUMMARY_NO_STORE } from "../../../../lib/summary-cache-policy";
import { readGroups, type ReadClient } from "../../../../lib/d1-read-batch";
import {
  isValidKstDay,
  kstDayBounds,
  kstDayOf,
  kstHourStartIsoOf,
  kstNowIsoOf,
  relateKstDay,
  shiftKstDay,
} from "../../../../lib/kst";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const AREAS = ["myeongdong", "hongdae", "seongsu"] as const;
/** Incheon's two passenger terminals; congestion is only ever published for these. */
const CONGESTION_TERMINALS = ["T1", "T2"] as const;
/** The date picker never offers more than this many days. */
const DATE_PICKER_DAYS = 21;

/** A corrupt row is isolated to its area instead of entering the public payload. */
export function isValidStoredStoreDynamics(area: (typeof AREAS)[number], row: Row | undefined): boolean {
  return isValidStoredStoreDynamicsRow(area, row);
}

/**
 * "Does this one day hold data?" as a single bounded existence probe.
 *
 * The old form was `SELECT DISTINCT substr(col, 1, 10) … ORDER BY day DESC
 * LIMIT 21`, which had to visit every historical row to learn the distinct
 * days — a full scan of a forever-growing table, on every request, just to
 * populate a picker. Asking whether any row exists in one day's range is the
 * same answer for a fixed cost: an index seek that stops at the first match,
 * measured at exactly one row read per day on Production.
 *
 * One statement per day, not one statement for all of them. Joining the 21
 * probes with UNION ALL into a single 63-parameter statement is what shipped
 * first, and D1 rejects that statement outright — on the Workers binding and
 * on the REST endpoint alike. Because safeAll turns a failing statement into
 * an empty list, the failure was invisible: every day list came back empty and
 * the date picker silently offered nothing while the endpoint answered 200.
 * The probes are therefore sent as a batch of single-day statements, which is
 * one round trip and the same total rows read.
 */
function dayExistsSql(table: string, column: string, filter = ""): string {
  // `filter` supplies the index's leading column so the probe is a range seek
  // that stops at the first row, rather than a scan of the whole index.
  const where = filter ? `${filter} AND ` : "";
  return `SELECT ? AS day WHERE EXISTS (SELECT 1 FROM ${table} WHERE ${where}${column} >= ? AND ${column} < ?)`;
}

/** Exact-value variant for columns already stored as a canonical KST day. */
function dayValueExistsSql(table: string, column: string, filter = ""): string {
  const where = filter ? `${filter} AND ` : "";
  return `SELECT ? AS day WHERE EXISTS (SELECT 1 FROM ${table} WHERE ${where}${column} = ?)`;
}

/**
 * Latest-row-per-key without scanning the table.
 *
 * `WHERE col = (SELECT MAX(col) … WHERE b.key = a.key)` reads well but forces
 * SQLite to SCAN the outer table: it cannot know a row's key without visiting
 * it. On D1 that scan is billed as rows read, and these tables grow forever —
 * which is how one uncached request came to read six figures of rows.
 *
 * One seek per known key is the same answer for a bounded, tiny cost, because
 * the key set (3 areas, 2 terminals) is fixed by the product.
 */
function latestPerKey(keys: readonly string[], build: (placeholder: string) => string): string {
  return keys.map(() => `SELECT * FROM (${build("?")})`).join(" UNION ALL ");
}


function areaComparisons(row: Row, min: string, max: string) {
  return Object.fromEntries([7, 28].map((days) => {
    try {
      const raw = row[`baseline${days}`];
      const baseline = typeof raw === "string" ? JSON.parse(raw) : null;
      return [days, baseline ? rangeChange(row[min], row[max], baseline.min, baseline.max, baseline.observedAt) : null];
    } catch { return [days, null]; }
  }));
}

/** Minutes after which a real-time observation is labelled STALE, not LIVE. */
const REALTIME_STALE_MINUTES = 40;

function freshnessOf(observedAt: unknown, staleMinutes: number, now: number): "LIVE" | "STALE" {
  const observed = typeof observedAt === "string" ? Date.parse(observedAt) : Number.NaN;
  if (!Number.isFinite(observed)) return "STALE";
  return now - observed <= staleMinutes * 60_000 ? "LIVE" : "STALE";
}

export async function safeAll<T>(run: () => Promise<T[]>): Promise<T[]> {
  // Each source block fails independently: one broken table or query must
  // never take down the whole summary response.
  try {
    return await run();
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const generatedAt = new Date().toISOString();
  const now = Date.parse(generatedAt);
  // Canonical KST-sourced rows store +09:00 offsets; compare lexicographically
  // in the same offset space rather than against the UTC string.
  const kstNowIso = kstNowIsoOf(generatedAt);
  const kstToday = kstDayOf(generatedAt);
  // Hourly bands are keyed by their start, so the band the reader is standing
  // in must be kept — filtering at the exact instant would drop it.
  const kstHourStart = kstHourStartIsoOf(generatedAt);

  // An explicit ?date= selects a KST service day for the day-scoped blocks
  // (airport forecast, flights, recorded Seoul observations). Anything that is
  // not a real calendar day falls back to today rather than erroring, so a
  // hand-edited URL can never blank the page.
  const requestedDateRaw = (() => {
    try {
      return new URL(request.url).searchParams.get("date");
    } catch {
      return null;
    }
  })();
  const serviceDate = isValidKstDay(requestedDateRaw) ? requestedDateRaw : kstToday;
  const dayRelation = relateKstDay(serviceDate, kstToday);
  const { startAt: dayStartAt } = kstDayBounds(serviceDate);

  try {
    const client = await getDb().then((db) => db.$client);
    return await summarizeLiveSummary(client, {
      generatedAt, now, kstNowIso, kstToday, kstHourStart, serviceDate, dayRelation, dayStartAt,
    });
  } catch {
    return degradedSummary({ generatedAt, kstToday, serviceDate, dayRelation });
  }
}

/** Everything a summary is computed from, resolved once by GET. */
export interface SummaryClock {
  generatedAt: string;
  now: number;
  kstNowIso: string;
  kstToday: string;
  kstHourStart: string;
  serviceDate: string;
  dayRelation: ReturnType<typeof relateKstDay>;
  dayStartAt: string;
}

/** The slice of the D1 binding the summary reads through; tests pass a double. */
export type SummaryClient = ReadClient & { prepare(sql: string): D1PreparedStatement };

/**
 * Builds the summary from prepared D1 statements. Exported so a test can hand
 * in a counting double and assert the read path stays one round trip.
 */
export async function summarizeLiveSummary(client: SummaryClient, clock: SummaryClock): Promise<Response> {
  const { generatedAt, now, kstNowIso, kstToday, kstHourStart, serviceDate, dayRelation, dayStartAt } = clock;
  const statementGroups = {
    sources: [client.prepare(
      `SELECT source_id AS sourceId, status, last_event_at AS eventAt,
        last_retrieved_at AS retrievedAt, detail FROM source_health ORDER BY source_id`,
    )],

    contextRows: [client.prepare(latestPerKey(AREAS, () => `SELECT area,payload,retrieved_at AS retrievedAt FROM seoul_context WHERE area=? ORDER BY observed_at DESC LIMIT 1`)).bind(...AREAS)],
    holidayRows: [client.prepare('SELECT month,payload,retrieved_at AS retrievedAt FROM holiday_months WHERE month>=? ORDER BY month LIMIT 2').bind(serviceDate.slice(0,7))],
    compositionRows: [client.prepare('SELECT day,payload FROM airport_daily_composition WHERE day IN (?,?)').bind(shiftKstDay(serviceDate,-7),shiftKstDay(serviceDate,-28))],
    realtimeRows: [client.prepare(
      withAreaBaselines(latestPerKey(AREAS, () => `SELECT area, source_id AS sourceId, schema_version AS schemaVersion, quality_status AS qualityStatus, congestion_level AS congestionLevel, congestion_label AS congestionLabel,
        population_min AS populationMin, population_max AS populationMax,
        observed_at AS observedAt, retrieved_at AS retrievedAt
      FROM seoul_realtime_area WHERE area = ? ORDER BY observed_at DESC LIMIT 1`), "seoul_realtime_area", "population_min", "population_max"),
    ).bind(...AREAS)],

    commercialRows: [client.prepare(
      withAreaBaselines(latestPerKey(AREAS, () => `SELECT area, source_id AS sourceId, schema_version AS schemaVersion, commercial_level AS commercialLevel,
        payment_count AS paymentCount, payment_amount_min AS paymentAmountMin,
        payment_amount_max AS paymentAmountMax, observed_at AS observedAt,
        retrieved_at AS retrievedAt, quality_status AS qualityStatus
      FROM seoul_realtime_commercial WHERE area = ? ORDER BY observed_at DESC LIMIT 1`), "seoul_realtime_commercial", "payment_amount_min", "payment_amount_max"),
    ).bind(...AREAS)],

    // Seoul publishes a rolling 12-hour forecast, so from mid-evening onward
    // every band it publishes falls on the next calendar day. The horizon is
    // therefore taken as-is and each band's own day is reported, instead of
    // clipping to "today" and reporting a live forecast as unavailable.
    realtimeForecastRows: [client.prepare(
      latestPerKey(AREAS, () => `SELECT area, issued_at AS issuedAt, target_at AS targetAt, congestion_level AS congestionLevel,
        congestion_label AS congestionLabel, population_min AS populationMin, population_max AS populationMax,
        retrieved_at AS retrievedAt
      FROM seoul_realtime_forecast
      WHERE area = ? AND issued_at = (SELECT MAX(issued_at) FROM seoul_realtime_forecast WHERE area = ?)
        AND target_at >= ?
      ORDER BY target_at LIMIT 40`),
    ).bind(...AREAS.flatMap((area) => [area, area, kstHourStart]))],

    weatherRows: [client.prepare(
      latestPerKey(AREAS, () => `SELECT area, issued_at AS issuedAt, target_at AS targetAt,
        precipitation_probability AS precipitationProbability,
        temperature_tenth_c AS temperatureTenthC, condition_code AS conditionCode,
        precipitation_type_code AS precipitationTypeCode,
        humidity_percent AS humidityPercent, wind_speed_tenth_mps AS windSpeedTenthMps,
        daily_min_temperature_tenth_c AS dailyMinTemperatureTenthC,
        daily_max_temperature_tenth_c AS dailyMaxTemperatureTenthC,
        precipitation_amount_raw AS precipitationAmountRaw,
        precipitation_amount_kind AS precipitationAmountKind,
        precipitation_amount_tenth_mm AS precipitationAmountTenthMm,
        snow_amount_raw AS snowAmountRaw, snow_amount_kind AS snowAmountKind,
        snow_amount_tenth_cm AS snowAmountTenthCm
      FROM weather_forecast
      WHERE area = ? AND issued_at = (SELECT MAX(issued_at) FROM weather_forecast WHERE area = ?)
        AND target_at >= ?
      ORDER BY target_at LIMIT 60`),
    ).bind(...AREAS.flatMap((area) => [area, area, kstHourStart]))],

    eventRows: [client.prepare(
      latestPerKey(AREAS, () => `SELECT area, content_id AS contentId, title, event_start AS eventStart,
        event_end AS eventEnd, distance_m AS distanceM, retrieved_at AS retrievedAt,
        category_name AS categoryName, address, address_detail AS addressDetail,
        overview, homepage
      FROM tourism_events
      WHERE (event_end >= ? OR (event_end IS NULL AND event_start >= ?))
        AND area = ?
      ORDER BY event_start, content_id LIMIT 30`),
    ).bind(...AREAS.flatMap(area => [serviceDate, serviceDate, area]))],

    salesRows: [client.prepare(
      latestPerKey(AREAS, () => `SELECT area, quarter_code AS quarterCode, trade_area_code AS tradeAreaCode,
        trade_area_name AS tradeAreaName, industry_name AS industryName,
        sales_amount AS salesAmount, retrieved_at AS retrievedAt
      FROM seoul_estimated_sales
      WHERE area = ? AND quarter_code = (SELECT MAX(quarter_code) FROM seoul_estimated_sales WHERE area = ?)
      ORDER BY sales_amount DESC`),
    ).bind(...AREAS.flatMap((area) => [area, area]))],

    storeDynamicsRows: [client.prepare(
      latestPerKey(AREAS, () => `SELECT source_id AS sourceId, dataset_id AS datasetId,
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
    ).bind(...AREAS.flatMap((area) => [
      area, STORE_DYNAMICS_SOURCE_ID, STORE_DYNAMICS_MAPPING_VERSION,
    ]))],

    foreignPresenceRows: [client.prepare(
      `SELECT area, product_version AS productVersion, record_origin AS freshness, value, unit,
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
    ).bind(
      SEOUL_FOREIGN_SOURCE_ID,
      SEOUL_FOREIGN_PRODUCT_VERSION,
      SEOUL_FOREIGN_MAPPING_VERSION,
      SEOUL_FOREIGN_SOURCE_ID,
      SEOUL_FOREIGN_PRODUCT_VERSION,
      SEOUL_FOREIGN_MAPPING_VERSION,
    )],

    foreignPurposeRows: [client.prepare(
      latestPerKey(AREAS, () => `SELECT area, purpose, movement_value AS movementValue,
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
    ).bind(...AREAS.flatMap((area) => [
      area, FOREIGN_PURPOSE_SOURCE_ID, FOREIGN_PURPOSE_MAPPING_VERSION,
      area, FOREIGN_PURPOSE_SOURCE_ID, FOREIGN_PURPOSE_MAPPING_VERSION,
    ]))],

    subwayRows: [client.prepare(
      latestPerKey(AREAS, () => `SELECT source_id AS sourceId, dataset_id AS datasetId,
        record_origin AS recordOrigin, area, reference_date AS referenceDate,
        station_code AS stationCode, station_number AS stationNumber,
        station_name AS stationName, line_name AS lineName,
        boarding_count AS boardingCount, alighting_count AS alightingCount,
        retrieved_at AS retrievedAt, mapping_version AS mappingVersion,
        quality_status AS qualityStatus
      FROM seoul_subway_ridership
      WHERE area = ? AND mapping_version = ? AND reference_date <= ?
        AND station_code = ? AND station_number = ?
        AND station_name = ? AND line_name = ?
        AND source_id = ? AND dataset_id = ?
        AND record_origin = 'OFFICIAL_DAILY' AND quality_status = 'VALID'
      ORDER BY reference_date DESC LIMIT ${SUBWAY_TREND_WINDOW_DAYS}`),
    ).bind(...AREAS.flatMap((area) => {
      const station = SUBWAY_AREA_STATIONS[area][0];
      return [
        area, SEOUL_SUBWAY_MAPPING_VERSION, kstToday,
        station.stationCode, station.stationNumber, station.stationName, station.lineName,
        SEOUL_SUBWAY_SOURCE_ID, SEOUL_SUBWAY_DATASET_ID,
      ];
    }))],

    congestionRows: [client.prepare(
      latestPerKey(CONGESTION_TERMINALS, () => `SELECT terminal, zone, wait_time_minutes AS waitTimeMinutes, wait_time_raw AS waitTimeRaw,
        waiting_count AS waitingCount, observed_at AS observedAt, retrieved_at AS retrievedAt
      FROM airport_congestion
      WHERE terminal = ? AND observed_at = (SELECT MAX(observed_at) FROM airport_congestion WHERE terminal = ?)
      ORDER BY zone LIMIT 12`),
    ).bind(...CONGESTION_TERMINALS.flatMap((terminal) => [terminal, terminal]))],

    // A5 official aggregate rows for both directions. Component rows never
    // enter a total or peak calculation, preventing provider-total double count.
    passengerForecastRows: [client.prepare(
      `SELECT terminal, direction, is_aggregate AS isAggregate,
        target_date AS targetDate, time_band_raw AS timeBandRaw,
        target_start_at AS targetStartAt, target_end_at AS targetEndAt,
        expected_passengers AS expectedPassengers, retrieved_at AS retrievedAt
      FROM airport_passenger_forecast f
      WHERE f.direction IN ('departure', 'arrival') AND f.is_aggregate = 1 AND f.target_date IN (?, ?, ?)
      ORDER BY target_date DESC, direction, target_start_at, terminal LIMIT 288`,
    ).bind(serviceDate, shiftKstDay(serviceDate, -7), shiftKstDay(serviceDate, -28))],

    historicalFlightCounts: [7, 28].map((days) => client.prepare(
      `SELECT ? AS baselineDate, terminal, COUNT(*) AS flights FROM
        (SELECT DISTINCT physical_flight_id, terminal FROM airport_flights
         WHERE direction = 'departure' AND scheduled_at >= ? AND scheduled_at < ?
           AND physical_flight_id IS NOT NULL LIMIT 2001)
       GROUP BY terminal`,
    ).bind(shiftKstDay(serviceDate, -days), shiftKstDay(serviceDate, -days), shiftKstDay(serviceDate, 1 - days))),

    // One read of the day's departures serves the rows, the all-airport count
    // and the per-terminal counts.
    //
    // These were three separate statements, each re-deriving the same set with
    // `substr(scheduled_at, 1, 10) = ?`. Wrapping the column in a function
    // makes every index on it unusable, so all three fully scanned a table that
    // grows by ~1,100 rows a day. A bare-date range is exactly equivalent —
    // `x >= '2026-08-31' AND x < '2026-09-01'` selects precisely the strings
    // whose first ten characters are that day, whatever the suffix — and it
    // seeks. Deriving the counts from the rows already fetched also makes the
    // payload self-consistent: the counts can no longer disagree with the rows.
    flightRows: [client.prepare(
      `SELECT physical_flight_id AS physicalFlightId, terminal, gate, retrieved_at AS retrievedAt,
        flight_number AS operatingFlight
      FROM airport_flights
      WHERE direction = 'departure' AND scheduled_at >= ? AND scheduled_at < ?
      LIMIT 2000`,
    ).bind(serviceDate, shiftKstDay(serviceDate, 1))],

    scheduledRows: [client.prepare(
      `SELECT terminal, COUNT(*) AS flights, MIN(scheduled_time) AS firstTime, MAX(scheduled_time) AS lastTime,
        MAX(retrieved_at) AS retrievedAt
      FROM airport_scheduled_flights
      WHERE valid_from <= ? AND valid_to >= ?
      GROUP BY terminal ORDER BY terminal`,
    ).bind(serviceDate, serviceDate)],
  };

  // Which KST days actually hold data, so the date picker can offer only
  // days that exist instead of inviting the reader into an empty screen.
  const pickerDays = Array.from({ length: DATE_PICKER_DAYS }, (_, index) => shiftKstDay(kstToday, -index));
  // Still one statement per day (D1 rejects the 63-parameter UNION ALL form);
  // the statements now travel inside the single batch below.
  const probeDays = (sql: string, bindsForDay: (day: string) => unknown[]) =>
    pickerDays.map((day) => client.prepare(sql).bind(...bindsForDay(day)));
  const probeGroups = {
    flightDateRows: probeDays(
      dayExistsSql("airport_flights", "scheduled_at", "direction = 'departure'"),
      (day) => [day, day, shiftKstDay(day, 1)],
    ),
    forecastDateRows: probeDays(
      dayValueExistsSql("airport_passenger_forecast", "target_date", "direction = 'departure' AND is_aggregate = 1"),
      (day) => [day, day],
    ),
    observedDateRows: probeDays(
      dayExistsSql("seoul_realtime_area", "observed_at"),
      (day) => [day, day, shiftKstDay(day, 1)],
    ),
  };

  // Every statement above — 15 blocks plus 3 × 21 picker probes — leaves the
  // Worker in ONE D1 request. Awaiting them one after another was 18 full
  // Worker → D1 round trips and, measured on Production, 3.5–4.2 s per
  // uncached summary (see lib/d1-read-batch.ts). Rows read are unchanged.
  const { rows: blocks } = await readGroups(client, { ...statementGroups, ...probeGroups });
  const {
    sources, contextRows, holidayRows, compositionRows, realtimeRows, commercialRows, realtimeForecastRows, weatherRows, eventRows, salesRows,
    storeDynamicsRows, foreignPresenceRows, foreignPurposeRows, subwayRows, congestionRows,
    passengerForecastRows: allPassengerForecastRows, historicalFlightCounts, flightRows, scheduledRows, flightDateRows, forecastDateRows, observedDateRows,
  } = blocks;
  const passengerForecastRows = allPassengerForecastRows.filter((row) => row.targetDate === serviceDate);
  const dayList = (rows: Row[]) => rows
    .map((row) => String(row.day ?? ""))
    .filter((day) => isValidKstDay(day))
    .sort();

  const areas = Object.fromEntries(AREAS.map((area) => {
    const realtime = realtimeRows.find((row) => row.area === area) ?? null;
    const commercial = commercialRows.find((row) => row.area === area) ?? null;
    const foreignPresence = foreignPresenceRows.find((row) => row.area === area) ?? null;
    const purposeRows = foreignPurposeRows.filter((row) => row.area === area);
    const subwayTrend = summarizeSubwayTrend(area, subwayRows);
    const subwayRidership = subwayTrend ? { ...subwayTrend.latest, trend: subwayTrend.trend } : null;
    const salesForArea = salesRows.filter((row) => row.area === area);
    const salesTotal = salesForArea.reduce((sum, row) => sum + Number(row.salesAmount ?? 0), 0);
    const eventsForArea = prepareEventsForPresentation(
      eventRows.filter((row) => row.area === area).map((row) => ({
        ...row,
        title: String(row.title ?? ""),
        eventStart: String(row.eventStart ?? ""),
        eventEnd: row.eventEnd ? String(row.eventEnd) : null,
        distanceM: row.distanceM === null || row.distanceM === undefined ? null : Number(row.distanceM),
        contentId: row.contentId ? String(row.contentId) : null,
        address: row.address ? String(row.address) : null,
        overview: row.overview ? String(row.overview) : null,
        homepage: row.homepage ? String(row.homepage) : null,
      })),
      serviceDate,
    );
    const contextRow = contextRows.find(row=>row.area===area);
    let context = null;
    try { if(contextRow) context={...JSON.parse(String(contextRow.payload)),retrievedAt:contextRow.retrievedAt}; } catch { /* malformed optional context is unavailable */ }
    return [area, {
      context,
      realtime: realtime ? { ...realtime, comparisons: areaComparisons(realtime, "populationMin", "populationMax"), freshness: freshnessOf(realtime.observedAt, REALTIME_STALE_MINUTES, now) } : null,
      commercial: commercial ? { ...commercial, comparisons: areaComparisons(commercial, "paymentAmountMin", "paymentAmountMax"), freshness: freshnessOf(commercial.observedAt, REALTIME_STALE_MINUTES, now) } : null,
      // The whole published horizon, not a "today" slice — see the query note.
      realtimeForecast: realtimeForecastRows.filter((row) => row.area === area).slice(0, 12),
      weather: weatherRows.filter((row) => row.area === area).slice(0, 24),
      events: eventsForArea,
      eventCount: eventsForArea.length,
      sales: salesForArea.length ? {
        quarterCode: salesForArea[0].quarterCode,
        tradeAreaName: salesForArea[0].tradeAreaName,
        totalAmount: salesTotal,
        industryCount: salesForArea.length,
        // Already selected by the query above; carried through so the screen
        // can say whether this quarter is the provider's newest publication
        // or a sign collection has stopped. No extra read.
        retrievedAt: salesForArea[0].retrievedAt ?? null,
        topIndustries: salesForArea.slice(0, 3).map((row) => ({ industryName: row.industryName, salesAmount: row.salesAmount })),
      } : null,
      storeDynamics: (() => {
        const row = storeDynamicsRows.find((candidate) => candidate.area === area);
        if (!isValidStoredStoreDynamics(area, row)) return null;
        return {
          datasetId: row?.datasetId,
          quarterCode: row?.quarterCode,
          tradeAreaCode: row?.tradeAreaCode,
          tradeAreaName: row?.tradeAreaName,
          tradeAreaTypeCode: row?.tradeAreaTypeCode,
          tradeAreaTypeName: row?.tradeAreaTypeName,
          totalStoreCount: row?.totalStoreCount,
          ordinaryStoreCount: row?.ordinaryStoreCount,
          franchiseStoreCount: row?.franchiseStoreCount,
          openingCount: row?.openingCount,
          closureCount: row?.closureCount,
          // The stored *_rate_tenths_percent columns are a KORETAIL-derived
          // ratio, not an official area-wide 개/폐업률; they stay private.
          mappingVersion: row?.mappingVersion,
          retrievedAt: row?.retrievedAt,
        };
      })(),
      foreignPresence,
      foreignPurposeMobility: purposeRows.length ? {
        referenceDate: purposeRows[0].referenceDate,
        retrievedAt: purposeRows[0].retrievedAt,
        datasetId: purposeRows[0].datasetId,
        mappingVersion: purposeRows[0].mappingVersion,
        shopping: purposeRows.find((row) => row.purpose === "shopping")?.movementValue ?? null,
        tourism: purposeRows.find((row) => row.purpose === "tourism")?.movementValue ?? null,
      } : null,
      subwayRidership,
    }];
  }));

  const departurePassengerForecastRows = passengerForecastRows.filter((row) => row.direction === "departure");
  const arrivalPassengerForecastRows = passengerForecastRows.filter((row) => row.direction === "arrival");
  const passengerToday = summarizeTodayPassengerForecast(
    departurePassengerForecastRows as unknown as AirportForecastAggregateRow[],
    serviceDate,
  );
  const arrivalToday = summarizePassengerForecast(
    arrivalPassengerForecastRows as unknown as AirportForecastAggregateRow[],
    serviceDate,
    "arrival",
  );
  const nextArrivalBand = dayRelation === "TODAY"
    ? summarizeNextPassengerForecastBand(
      arrivalPassengerForecastRows as unknown as AirportForecastAggregateRow[],
      "arrival",
      generatedAt,
    )
    : null;
  // Physical-flight de-duplication, unchanged: a codeshare pair shares one
  // physicalFlightId and is counted once.
  const distinctFlightsToday = new Set(flightRows.map((row) => String(row.physicalFlightId ?? ""))).size;
  const distinctFlightsByTerminal: Record<string, number> = {};
  const seenPerTerminal = new Map<string, Set<string>>();
  for (const row of flightRows) {
    const terminal = row.terminal ? String(row.terminal) : null;
    if (!terminal) continue;
    const seen = seenPerTerminal.get(terminal) ?? new Set<string>();
    seen.add(String(row.physicalFlightId ?? ""));
    seenPerTerminal.set(terminal, seen);
  }
  for (const [terminal, seen] of seenPerTerminal) distinctFlightsByTerminal[terminal] = seen.size;
  const flightsToday = summarizeTodayTopGate(
    flightRows as unknown as AirportTodayFlightRow[],
    0.5,
    distinctFlightsToday,
  );
  // Airline ranking from the same de-duplicated physical rows. The
  // country comes from a reference table, never from the provider, and is
  // reported as UNVERIFIED whenever the table cannot vouch for it.
  const airlineRanking = summarizeAirlineRanking(flightRows as unknown as AirlineRankingFlightRow[], lookupAirline, 300);
  const periodComparisons = Object.fromEntries(["all", "T1", "T2"].map((scope) => [scope,
    Object.fromEntries(([7, 28] as const).map((days) => {
      const baselineDate = shiftKstDay(serviceDate, -days);
      const past = summarizeTodayPassengerForecast(allPassengerForecastRows.filter((row) => row.targetDate === baselineDate) as unknown as AirportForecastAggregateRow[], baselineDate);
      const currentPassengers = scope === "all" ? passengerToday.total : passengerToday.totalByTerminal[scope];
      const pastPassengers = scope === "all" ? past.total : past.totalByTerminal[scope];
      const pastRows = historicalFlightCounts.filter((row) => row.baselineDate === baselineDate);
      const allPastCount = pastRows.reduce((sum, row) => sum + Number(row.flights), 0);
      const pastCount = scope === "all" ? allPastCount : Number(pastRows.find((row) => row.terminal === scope)?.flights ?? 0);
      const currentCount = scope === "all" ? airlineRanking.all.totalFlights : airlineRanking.byTerminal[scope]?.totalFlights;
      let composition = null;
      try {
        const raw = compositionRows.find(row=>row.day===baselineDate);
        const history: AirlineRankingSummary | null = raw ? JSON.parse(String(raw.payload)) : null;
        const baseline = scope==='all' ? history?.all : history?.byTerminal[scope];
        const current = scope==='all' ? airlineRanking.all : airlineRanking.byTerminal[scope];
        if(baseline && current && flightRows.length<2000) composition={baselineDate,...compareComposition(current,baseline)};
      } catch { /* missing or invalid history is not zero */ }
      return [days, {
        composition,
        passengers: rangeChange(currentPassengers, currentPassengers, pastPassengers, pastPassengers, baselineDate),
        // These are collected physical-flight records, not a verified whole-day operational census.
        flightRecords: allPastCount > 0 && allPastCount < 2001 && flightRows.length < 2000
          ? rangeChange(currentCount, currentCount, pastCount, pastCount, baselineDate) : null,
      }];
    }))]));
  const flightsTodayByTerminal = summarizeTodayTopGateByTerminal(
    flightRows as unknown as AirportTodayFlightRow[],
    0.5,
    distinctFlightsByTerminal,
  );
  const currentBusiest = summarizeCurrentBusiestDepartureHalls(
    congestionRows.map((row) => ({ ...row, freshness: freshnessOf(row.observedAt, 20, now) })) as unknown as AirportCongestionSummaryRow[],
  );
  const latestCongestionRetrieval = congestionRows.reduce<string | null>((latest, row) => {
    const value = typeof row.retrievedAt === "string" ? row.retrievedAt : null;
    return value && (!latest || value > latest) ? value : latest;
  }, null);
  // `latestRetrievedAt` means "the latest retrieval among airport
  // datasets" — it never implies every metric below shares that
  // freshness. Each metric also carries its own retrieval timestamp.
  const latestAirportRetrieval = [passengerToday.retrievedAt, arrivalToday.retrievedAt, flightsToday.retrievedAt, latestCongestionRetrieval]
    .filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  const upcomingForecast = departurePassengerForecastRows.filter((row) => String(row.targetEndAt ?? "") >= kstNowIso)
    .filter((row, index, all) => all.findIndex((candidate) => candidate.terminal === row.terminal) === index);

  // "From this hour to the end of the day" is only meaningful for a day that
  // is still running, and only when full-day coverage is proven.
  const remainingAll = dayRelation === "TODAY"
    ? summarizeRemainingPassengerForecast(passengerToday.timeline, passengerToday.coverage.all, generatedAt)
    : null;
  const remainingByTerminal = Object.fromEntries(
    Object.entries(passengerToday.timelineByTerminal).map(([terminal, timeline]) => [
      terminal,
      dayRelation === "TODAY"
        ? summarizeRemainingPassengerForecast(timeline, passengerToday.coverage.byTerminal[terminal] ?? "UNAVAILABLE", generatedAt)
        : null,
    ]),
  );

  const topDepartureGateByTerminal = Object.fromEntries(
    Object.entries(flightsTodayByTerminal).map(([terminal, summary]) => [
      terminal,
      summary.topDepartureGate ? { gate: summary.topDepartureGate.gate, flights: summary.topDepartureGate.flights } : null,
    ]),
  );
  const busyDepartureGatesByTerminal = Object.fromEntries(
    Object.entries(flightsTodayByTerminal).map(([terminal, summary]) => [terminal, summary.busyDepartureGates]),
  );
  const departuresTrackedTodayByTerminal = Object.fromEntries(
    Object.entries(flightsTodayByTerminal).map(([terminal, summary]) => [terminal, summary.departuresTrackedToday]),
  );
  const gateCoverageRatioByTerminal = Object.fromEntries(
    Object.entries(flightsTodayByTerminal).map(([terminal, summary]) => [terminal, summary.gateCoverageRatio]),
  );
  const departureGateRetrievedAtByTerminal = Object.fromEntries(
    Object.entries(flightsTodayByTerminal).map(([terminal, summary]) => [terminal, summary.retrievedAt]),
  );
  const peakExpectedPassengersByTerminal = Object.fromEntries(
    Object.entries(passengerToday.peakByTerminal).map(([terminal, band]) => [terminal, band?.expectedPassengers ?? null]),
  );

  return Response.json({
    mode: "live-summary",
    generatedAt,
    todayKst: kstToday,
    serviceDateKst: serviceDate,
    dayRelation,
    dateAvailability: {
      airportFlights: dayList(flightDateRows),
      airportPassengerForecast: dayList(forecastDateRows),
      seoulObserved: dayList(observedDateRows),
    },
    holidays: holidayRows.flatMap(row=>{ try { return [{month:row.month,days:JSON.parse(String(row.payload)),retrievedAt:row.retrievedAt}]; } catch { return []; } }),
    sources,
    areas,
    airport: {
      periodComparisons,
      congestion: congestionRows.map((row) => ({ ...row, freshness: freshnessOf(row.observedAt, 20, now) })),
      currentBusiestDepartureHallByTerminal: currentBusiest,
      departuresTrackedToday: flightsToday.departuresTrackedToday,
      departuresTrackedTodayByTerminal,
      flightScope: { ...flightScopeCounts(flightRows), capped: flightRows.length >= 2000 },
      departuresTrackedTodayRetrievedAt: flightsToday.retrievedAt,
      topDepartureGate: flightsToday.topDepartureGate?.gate ?? null,
      topDepartureGateTerminal: flightsToday.topDepartureGate?.terminal ?? null,
      topDepartureGateFlights: flightsToday.topDepartureGate?.flights ?? null,
      topDepartureGateByTerminal,
      busyDepartureGates: flightsToday.busyDepartureGates,
      busyDepartureGatesByTerminal,
      topDepartureGateRetrievedAt: flightsToday.retrievedAt,
      topDepartureGateRetrievedAtByTerminal: departureGateRetrievedAtByTerminal,
      gateCoverageRatio: flightsToday.gateCoverageRatio,
      gateCoverageRatioByTerminal,
      airlineRanking: { all: {...airlineRanking.all,airlines:airlineRanking.all.airlines.slice(0,10),countries:airlineRanking.all.countries.slice(0,10)}, byTerminal:Object.fromEntries(Object.entries(airlineRanking.byTerminal).map(([key,value])=>[key,{...value,airlines:value.airlines.slice(0,10),countries:value.countries.slice(0,10)}])), countrySource: AIRLINE_COUNTRY_SOURCE },
      serviceDateKst: serviceDate,
      periodStartAt: dayStartAt,
      periodEndAt: `${serviceDate}T23:59:59+09:00`,
      latestRetrievedAt: latestAirportRetrieval,
      todayExpectedPassengersTotal: passengerToday.total,
      todayExpectedPassengersByTerminal: passengerToday.totalByTerminal,
      remainingExpectedPassengers: remainingAll,
      remainingExpectedPassengersByTerminal: remainingByTerminal,
      passengerForecastRetrievedAt: passengerToday.retrievedAt,
      passengerForecastRetrievedAtByTerminal: passengerToday.retrievedAtByTerminal,
      peakExpectedTimeBand: passengerToday.peak,
      peakExpectedTimeBandByTerminal: passengerToday.peakByTerminal,
      peakExpectedPassengers: passengerToday.peak?.expectedPassengers ?? null,
      peakExpectedPassengersByTerminal,
      passengerForecastTimeline: passengerToday.timeline,
      passengerForecastTimelineByTerminal: passengerToday.timelineByTerminal,
      forecastCoverage: passengerToday.coverage,
      arrivalForecast: {
        todayExpectedPassengersTotal: arrivalToday.total,
        todayExpectedPassengersByTerminal: arrivalToday.totalByTerminal,
        nextExpectedTimeBand: nextArrivalBand,
        peakExpectedTimeBand: arrivalToday.peak,
        passengerForecastRetrievedAt: arrivalToday.retrievedAt,
        forecastCoverage: arrivalToday.coverage,
      },
      scheduled: scheduledRows,
      // FORECAST/EXPECTED passengers — semantically separate from
      // `congestion` (CURRENT/OBSERVED). Never merge these two arrays.
      passengerForecast: upcomingForecast,
    },
  }, {
    // Decided by the payload, not the status code: a 200 that carries no
    // sources or no area data is an outage in disguise and must never be
    // admitted to the shared edge cache.
    headers: { "cache-control": summaryCacheControl({ sources, areas }) },
  });
}

function degradedSummary({ generatedAt, kstToday, serviceDate, dayRelation }: Pick<SummaryClock, "generatedAt" | "kstToday" | "serviceDate" | "dayRelation">): Response {
  return Response.json({
    mode: "degraded",
    generatedAt,
    todayKst: kstToday,
    serviceDateKst: serviceDate,
    dayRelation,
    dateAvailability: { airportFlights: [], airportPassengerForecast: [], seoulObserved: [] },
    sources: [],
    areas: {},
    airport: {
      congestion: [], currentBusiestDepartureHallByTerminal: {}, departuresTrackedToday: null,
      departuresTrackedTodayByTerminal: {}, departuresTrackedTodayRetrievedAt: null,
      topDepartureGate: null, topDepartureGateTerminal: null, topDepartureGateFlights: null,
      topDepartureGateByTerminal: {}, topDepartureGateRetrievedAt: null, topDepartureGateRetrievedAtByTerminal: {},
      busyDepartureGates: [], busyDepartureGatesByTerminal: {},
      gateCoverageRatio: 0, gateCoverageRatioByTerminal: {},
      airlineRanking: { all: { totalFlights: 0, airlines: [], countries: [], retrievedAt: null }, byTerminal: {}, countrySource: AIRLINE_COUNTRY_SOURCE },
      serviceDateKst: serviceDate,
      periodStartAt: null, periodEndAt: null, latestRetrievedAt: null,
      todayExpectedPassengersTotal: null, todayExpectedPassengersByTerminal: {},
      remainingExpectedPassengers: null, remainingExpectedPassengersByTerminal: {},
      passengerForecastRetrievedAt: null, passengerForecastRetrievedAtByTerminal: {},
      peakExpectedTimeBand: null, peakExpectedTimeBandByTerminal: {},
      peakExpectedPassengers: null, peakExpectedPassengersByTerminal: {},
      passengerForecastTimeline: [], passengerForecastTimelineByTerminal: {},
      forecastCoverage: { all: "UNAVAILABLE", byTerminal: {} },
      arrivalForecast: {
        todayExpectedPassengersTotal: null, todayExpectedPassengersByTerminal: {},
        nextExpectedTimeBand: null, peakExpectedTimeBand: null,
        passengerForecastRetrievedAt: null,
        forecastCoverage: { all: "UNAVAILABLE", byTerminal: {} },
      },
      scheduled: [], passengerForecast: [],
    },
    message: "Live sources are not connected. Official historical views remain available.",
  }, { status: 200, headers: { "cache-control": SUMMARY_NO_STORE } });
}
