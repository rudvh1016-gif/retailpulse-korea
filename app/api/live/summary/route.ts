import { getDb } from "../../../../db";
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
  SEOUL_SUBWAY_MAPPING_VERSION,
  SEOUL_SUBWAY_SOURCE_ID,
} from "../../../../lib/subway-ridership";
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
import { cleanOfficialText } from "../../../../lib/source-adapters";
import { summaryCacheControl, SUMMARY_NO_STORE } from "../../../../lib/summary-cache-policy";
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

/** Two lines of official description on a card; the full text stays in D1. */
const EVENT_OVERVIEW_EXCERPT_CHARS = 220;

const AREAS = ["myeongdong", "hongdae", "seongsu"] as const;
/** Incheon's two passenger terminals; congestion is only ever published for these. */
const CONGESTION_TERMINALS = ["T1", "T2"] as const;
/** The date picker never offers more than this many days. */
const DATE_PICKER_DAYS = 21;

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
    const db = await getDb();
    const client = db.$client;

    const sources = await safeAll<Row>(async () => (await client.prepare(
      `SELECT source_id AS sourceId, status, last_event_at AS eventAt,
        last_retrieved_at AS retrievedAt, detail FROM source_health ORDER BY source_id`,
    ).all<Row>()).results ?? []);

    const realtimeRows = await safeAll<Row>(async () => (await client.prepare(
      latestPerKey(AREAS, () => `SELECT area, congestion_level AS congestionLevel, congestion_label AS congestionLabel,
        population_min AS populationMin, population_max AS populationMax,
        observed_at AS observedAt, retrieved_at AS retrievedAt
      FROM seoul_realtime_area WHERE area = ? ORDER BY observed_at DESC LIMIT 1`),
    ).bind(...AREAS).all<Row>()).results ?? []);

    const commercialRows = await safeAll<Row>(async () => (await client.prepare(
      latestPerKey(AREAS, () => `SELECT area, commercial_level AS commercialLevel,
        payment_count AS paymentCount, payment_amount_min AS paymentAmountMin,
        payment_amount_max AS paymentAmountMax, observed_at AS observedAt,
        retrieved_at AS retrievedAt, quality_status AS qualityStatus
      FROM seoul_realtime_commercial WHERE area = ? ORDER BY observed_at DESC LIMIT 1`),
    ).bind(...AREAS).all<Row>()).results ?? []);

    // Seoul publishes a rolling 12-hour forecast, so from mid-evening onward
    // every band it publishes falls on the next calendar day. The horizon is
    // therefore taken as-is and each band's own day is reported, instead of
    // clipping to "today" and reporting a live forecast as unavailable.
    const realtimeForecastRows = await safeAll<Row>(async () => (await client.prepare(
      latestPerKey(AREAS, () => `SELECT area, issued_at AS issuedAt, target_at AS targetAt, congestion_level AS congestionLevel,
        congestion_label AS congestionLabel, population_min AS populationMin, population_max AS populationMax,
        retrieved_at AS retrievedAt
      FROM seoul_realtime_forecast
      WHERE area = ? AND issued_at = (SELECT MAX(issued_at) FROM seoul_realtime_forecast WHERE area = ?)
        AND target_at >= ?
      ORDER BY target_at LIMIT 40`),
    ).bind(...AREAS.flatMap((area) => [area, area, kstHourStart])).all<Row>()).results ?? []);

    const weatherRows = await safeAll<Row>(async () => (await client.prepare(
      latestPerKey(AREAS, () => `SELECT area, issued_at AS issuedAt, target_at AS targetAt,
        precipitation_probability AS precipitationProbability,
        temperature_tenth_c AS temperatureTenthC, condition_code AS conditionCode,
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
    ).bind(...AREAS.flatMap((area) => [area, area, kstHourStart])).all<Row>()).results ?? []);

    const eventRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT area, content_id AS contentId, title, event_start AS eventStart,
        event_end AS eventEnd, distance_m AS distanceM, retrieved_at AS retrievedAt,
        category_name AS categoryName, address, address_detail AS addressDetail,
        overview, homepage
      FROM tourism_events
      WHERE COALESCE(event_end, event_start) >= ?
      ORDER BY event_start LIMIT 30`,
    ).bind(serviceDate).all<Row>()).results ?? []).then((rows) => rows.map((row): Row => ({
      // The stored overview is the provider's full text (≤800 chars); the card
      // shows an excerpt cut at a word boundary. Same official words, shorter.
      ...row,
      overview: cleanOfficialText(row.overview, EVENT_OVERVIEW_EXCERPT_CHARS),
    })));

    const salesRows = await safeAll<Row>(async () => (await client.prepare(
      latestPerKey(AREAS, () => `SELECT area, quarter_code AS quarterCode, trade_area_code AS tradeAreaCode,
        trade_area_name AS tradeAreaName, industry_name AS industryName,
        sales_amount AS salesAmount, retrieved_at AS retrievedAt
      FROM seoul_estimated_sales
      WHERE area = ? AND quarter_code = (SELECT MAX(quarter_code) FROM seoul_estimated_sales WHERE area = ?)
      ORDER BY sales_amount DESC`),
    ).bind(...AREAS.flatMap((area) => [area, area])).all<Row>()).results ?? []);

    const foreignPresenceRows = await safeAll<Row>(async () => (await client.prepare(
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
    ).all<Row>()).results ?? []);

    const foreignPurposeRows = await safeAll<Row>(async () => (await client.prepare(
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
    ])).all<Row>()).results ?? []);

    const subwayRows = await safeAll<Row>(async () => (await client.prepare(
      latestPerKey(AREAS, () => `SELECT area, reference_date AS referenceDate,
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
    ).bind(...AREAS.flatMap((area) => [
      area, SEOUL_SUBWAY_SOURCE_ID, SEOUL_SUBWAY_MAPPING_VERSION,
      area, SEOUL_SUBWAY_SOURCE_ID, SEOUL_SUBWAY_MAPPING_VERSION,
    ])).all<Row>()).results ?? []);

    const congestionRows = await safeAll<Row>(async () => (await client.prepare(
      latestPerKey(CONGESTION_TERMINALS, () => `SELECT terminal, zone, wait_time_minutes AS waitTimeMinutes, wait_time_raw AS waitTimeRaw,
        waiting_count AS waitingCount, observed_at AS observedAt, retrieved_at AS retrievedAt
      FROM airport_congestion
      WHERE terminal = ? AND observed_at = (SELECT MAX(observed_at) FROM airport_congestion WHERE terminal = ?)
      ORDER BY zone LIMIT 12`),
    ).bind(...CONGESTION_TERMINALS.flatMap((terminal) => [terminal, terminal])).all<Row>()).results ?? []);

    // A5 official aggregate rows for both directions. Component rows never
    // enter a total or peak calculation, preventing provider-total double count.
    const passengerForecastRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT terminal, direction, is_aggregate AS isAggregate,
        target_date AS targetDate, time_band_raw AS timeBandRaw,
        target_start_at AS targetStartAt, target_end_at AS targetEndAt,
        expected_passengers AS expectedPassengers, retrieved_at AS retrievedAt
      FROM airport_passenger_forecast f
      WHERE f.direction IN ('departure', 'arrival') AND f.is_aggregate = 1 AND f.target_date = ?
      ORDER BY direction, target_start_at, terminal LIMIT 96`,
    ).bind(serviceDate).all<Row>()).results ?? []);

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
    const flightRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT physical_flight_id AS physicalFlightId, terminal, gate, retrieved_at AS retrievedAt
      FROM airport_flights
      WHERE direction = 'departure' AND scheduled_at >= ? AND scheduled_at < ?
      LIMIT 2000`,
    ).bind(serviceDate, shiftKstDay(serviceDate, 1)).all<Row>()).results ?? []);

    const scheduledRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT terminal, COUNT(*) AS flights, MIN(scheduled_time) AS firstTime, MAX(scheduled_time) AS lastTime,
        MAX(retrieved_at) AS retrievedAt
      FROM airport_scheduled_flights
      WHERE valid_from <= ? AND valid_to >= ?
      GROUP BY terminal ORDER BY terminal`,
    ).bind(serviceDate, serviceDate).all<Row>()).results ?? []);

    // Which KST days actually hold data, so the date picker can offer only
    // days that exist instead of inviting the reader into an empty screen.
    const pickerDays = Array.from({ length: DATE_PICKER_DAYS }, (_, index) => shiftKstDay(kstToday, -index));
    const probeDays = async (sql: string, bindsForDay: (day: string) => unknown[]) => {
      const results = await client.batch<Row>(
        pickerDays.map((day) => client.prepare(sql).bind(...bindsForDay(day))),
      );
      return results.flatMap((result) => result.results ?? []);
    };
    const flightDateRows = await safeAll<Row>(() => probeDays(
      dayExistsSql("airport_flights", "scheduled_at", "direction = 'departure'"),
      (day) => [day, day, shiftKstDay(day, 1)],
    ));
    const forecastDateRows = await safeAll<Row>(() => probeDays(
      dayValueExistsSql("airport_passenger_forecast", "target_date", "direction = 'departure' AND is_aggregate = 1"),
      (day) => [day, day],
    ));
    const observedDateRows = await safeAll<Row>(() => probeDays(
      dayExistsSql("seoul_realtime_area", "observed_at"),
      (day) => [day, day, shiftKstDay(day, 1)],
    ));
    const dayList = (rows: Row[]) => rows
      .map((row) => String(row.day ?? ""))
      .filter((day) => isValidKstDay(day))
      .sort();

    const areas = Object.fromEntries(AREAS.map((area) => {
      const realtime = realtimeRows.find((row) => row.area === area) ?? null;
      const commercial = commercialRows.find((row) => row.area === area) ?? null;
      const foreignPresence = foreignPresenceRows.find((row) => row.area === area) ?? null;
      const purposeRows = foreignPurposeRows.filter((row) => row.area === area);
      const subwayRidership = subwayRows.find((row) => row.area === area) ?? null;
      const salesForArea = salesRows.filter((row) => row.area === area);
      const salesTotal = salesForArea.reduce((sum, row) => sum + Number(row.salesAmount ?? 0), 0);
      const eventsForArea = eventRows.filter((row) => row.area === area);
      return [area, {
        realtime: realtime ? { ...realtime, freshness: freshnessOf(realtime.observedAt, REALTIME_STALE_MINUTES, now) } : null,
        commercial: commercial ? { ...commercial, freshness: freshnessOf(commercial.observedAt, REALTIME_STALE_MINUTES, now) } : null,
        // The whole published horizon, not a "today" slice — see the query note.
        realtimeForecast: realtimeForecastRows.filter((row) => row.area === area).slice(0, 12),
        weather: weatherRows.filter((row) => row.area === area).slice(0, 24),
        events: eventsForArea.slice(0, 3),
        eventCount: eventsForArea.length,
        sales: salesForArea.length ? {
          quarterCode: salesForArea[0].quarterCode,
          tradeAreaName: salesForArea[0].tradeAreaName,
          totalAmount: salesTotal,
          industryCount: salesForArea.length,
          topIndustries: salesForArea.slice(0, 3).map((row) => ({ industryName: row.industryName, salesAmount: row.salesAmount })),
        } : null,
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
      sources,
      areas,
      airport: {
        congestion: congestionRows.map((row) => ({ ...row, freshness: freshnessOf(row.observedAt, 20, now) })),
        currentBusiestDepartureHallByTerminal: currentBusiest,
        departuresTrackedToday: flightsToday.departuresTrackedToday,
        departuresTrackedTodayByTerminal,
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
  } catch {
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
        gateCoverageRatio: 0, gateCoverageRatioByTerminal: {}, serviceDateKst: serviceDate,
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
}
