import { getDb } from "../../../../db";
import {
  SEOUL_FOREIGN_MAPPING_VERSION,
  SEOUL_FOREIGN_PRODUCT_VERSION,
  SEOUL_FOREIGN_SOURCE_ID,
} from "../../../../lib/seoul-foreign";
import {
  summarizeCurrentBusiestDepartureHalls,
  summarizeRemainingPassengerForecast,
  summarizeTodayPassengerForecast,
  summarizeTodayTopGate,
  summarizeTodayTopGateByTerminal,
  type AirportCongestionSummaryRow,
  type AirportForecastAggregateRow,
  type AirportTodayFlightRow,
} from "../../../../lib/airport-today-summary";
import {
  isValidKstDay,
  kstDayBounds,
  kstDayOf,
  kstHourStartIsoOf,
  kstNowIsoOf,
  relateKstDay,
} from "../../../../lib/kst";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const AREAS = ["myeongdong", "hongdae", "seongsu"] as const;

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
  const { startAt: dayStartAt, endAt: dayEndAt } = kstDayBounds(serviceDate);

  try {
    const db = await getDb();
    const client = db.$client;

    const sources = await safeAll<Row>(async () => (await client.prepare(
      `SELECT source_id AS sourceId, status, last_event_at AS eventAt,
        last_retrieved_at AS retrievedAt, detail FROM source_health ORDER BY source_id`,
    ).all<Row>()).results ?? []);

    const realtimeRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT area, congestion_level AS congestionLevel, congestion_label AS congestionLabel,
        population_min AS populationMin, population_max AS populationMax,
        observed_at AS observedAt, retrieved_at AS retrievedAt
      FROM seoul_realtime_area a
      WHERE observed_at = (SELECT MAX(observed_at) FROM seoul_realtime_area b WHERE b.area = a.area)`,
    ).all<Row>()).results ?? []);

    // Seoul publishes a rolling 12-hour forecast, so from mid-evening onward
    // every band it publishes falls on the next calendar day. The horizon is
    // therefore taken as-is and each band's own day is reported, instead of
    // clipping to "today" and reporting a live forecast as unavailable.
    const realtimeForecastRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT area, issued_at AS issuedAt, target_at AS targetAt, congestion_level AS congestionLevel,
        congestion_label AS congestionLabel, population_min AS populationMin, population_max AS populationMax,
        retrieved_at AS retrievedAt
      FROM seoul_realtime_forecast f
      WHERE f.issued_at = (SELECT MAX(g.issued_at) FROM seoul_realtime_forecast g WHERE g.area = f.area)
        AND f.target_at >= ?
      ORDER BY f.area, f.target_at LIMIT 120`,
    ).bind(kstHourStart).all<Row>()).results ?? []);

    const weatherRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT area, issued_at AS issuedAt, target_at AS targetAt,
        precipitation_probability AS precipitationProbability,
        temperature_tenth_c AS temperatureTenthC, condition_code AS conditionCode
      FROM weather_forecast w
      WHERE w.issued_at = (SELECT MAX(x.issued_at) FROM weather_forecast x WHERE x.area = w.area)
        AND w.target_at >= ?
      ORDER BY w.area, w.target_at LIMIT 180`,
    ).bind(kstHourStart).all<Row>()).results ?? []);

    const eventRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT area, content_id AS contentId, title, event_start AS eventStart,
        event_end AS eventEnd, distance_m AS distanceM, retrieved_at AS retrievedAt
      FROM tourism_events
      WHERE COALESCE(event_end, event_start) >= ?
      ORDER BY event_start LIMIT 30`,
    ).bind(serviceDate).all<Row>()).results ?? []);

    const salesRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT area, quarter_code AS quarterCode, trade_area_code AS tradeAreaCode,
        trade_area_name AS tradeAreaName, industry_name AS industryName,
        sales_amount AS salesAmount, retrieved_at AS retrievedAt
      FROM seoul_estimated_sales s
      WHERE quarter_code = (SELECT MAX(quarter_code) FROM seoul_estimated_sales t WHERE t.area = s.area)
      ORDER BY sales_amount DESC`,
    ).all<Row>()).results ?? []);

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

    // Recorded Seoul observations for the SELECTED day. These are measurements
    // that were stored as the day happened — never a back-filled estimate — so
    // a past day shows only the hours that were actually observed.
    const observedSeriesRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT area, observed_at AS observedAt, congestion_level AS congestionLevel,
        congestion_label AS congestionLabel, population_min AS populationMin,
        population_max AS populationMax
      FROM seoul_realtime_area
      WHERE observed_at >= ? AND observed_at < ?
      ORDER BY area, observed_at LIMIT 400`,
    ).bind(dayStartAt, dayEndAt).all<Row>()).results ?? []);

    const congestionRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT terminal, zone, wait_time_minutes AS waitTimeMinutes, wait_time_raw AS waitTimeRaw,
        waiting_count AS waitingCount, observed_at AS observedAt, retrieved_at AS retrievedAt
      FROM airport_congestion c
      WHERE observed_at = (SELECT MAX(observed_at) FROM airport_congestion d WHERE d.terminal = c.terminal)
      ORDER BY terminal, zone LIMIT 24`,
    ).all<Row>()).results ?? []);

    // A5 official aggregate departure rows only. Component rows never enter
    // the total or peak calculation, preventing provider-total double count.
    const passengerForecastRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT terminal, direction, is_aggregate AS isAggregate,
        target_date AS targetDate, time_band_raw AS timeBandRaw,
        target_start_at AS targetStartAt, target_end_at AS targetEndAt,
        expected_passengers AS expectedPassengers, retrieved_at AS retrievedAt
      FROM airport_passenger_forecast f
      WHERE f.direction = 'departure' AND f.is_aggregate = 1 AND f.target_date = ?
      ORDER BY target_start_at, terminal LIMIT 96`,
    ).bind(serviceDate).all<Row>()).results ?? []);

    const flightRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT physical_flight_id AS physicalFlightId, terminal, gate, retrieved_at AS retrievedAt
      FROM airport_flights
      WHERE direction = 'departure' AND substr(scheduled_at, 1, 10) = ?
      LIMIT 2000`,
    ).bind(serviceDate).all<Row>()).results ?? []);

    const flightCountRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT COUNT(DISTINCT physical_flight_id) AS flights
      FROM airport_flights
      WHERE direction = 'departure' AND substr(scheduled_at, 1, 10) = ?`,
    ).bind(serviceDate).all<Row>()).results ?? []);

    // A1 terminal-scoped distinct physical-flight counts. A null-terminal
    // row is never guessed into T1 or T2 — it only ever counts toward the
    // all-airport total above.
    const flightCountByTerminalRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT terminal, COUNT(DISTINCT physical_flight_id) AS flights
      FROM airport_flights
      WHERE direction = 'departure' AND substr(scheduled_at, 1, 10) = ? AND terminal IS NOT NULL
      GROUP BY terminal`,
    ).bind(serviceDate).all<Row>()).results ?? []);

    const scheduledRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT terminal, COUNT(*) AS flights, MIN(scheduled_time) AS firstTime, MAX(scheduled_time) AS lastTime,
        MAX(retrieved_at) AS retrievedAt
      FROM airport_scheduled_flights
      WHERE valid_from <= ? AND valid_to >= ?
      GROUP BY terminal ORDER BY terminal`,
    ).bind(serviceDate, serviceDate).all<Row>()).results ?? []);

    // Which KST days actually hold data, so the date picker can offer only
    // days that exist instead of inviting the reader into an empty screen.
    const flightDateRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT DISTINCT substr(scheduled_at, 1, 10) AS day FROM airport_flights
      WHERE direction = 'departure' ORDER BY day DESC LIMIT 21`,
    ).all<Row>()).results ?? []);
    const forecastDateRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT DISTINCT target_date AS day FROM airport_passenger_forecast
      WHERE direction = 'departure' AND is_aggregate = 1 ORDER BY day DESC LIMIT 21`,
    ).all<Row>()).results ?? []);
    const observedDateRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT DISTINCT substr(observed_at, 1, 10) AS day FROM seoul_realtime_area
      ORDER BY day DESC LIMIT 21`,
    ).all<Row>()).results ?? []);
    const dayList = (rows: Row[]) => rows
      .map((row) => String(row.day ?? ""))
      .filter((day) => isValidKstDay(day))
      .sort();

    const areas = Object.fromEntries(AREAS.map((area) => {
      const realtime = realtimeRows.find((row) => row.area === area) ?? null;
      const foreignPresence = foreignPresenceRows.find((row) => row.area === area) ?? null;
      const salesForArea = salesRows.filter((row) => row.area === area);
      const salesTotal = salesForArea.reduce((sum, row) => sum + Number(row.salesAmount ?? 0), 0);
      const eventsForArea = eventRows.filter((row) => row.area === area);
      return [area, {
        realtime: realtime ? { ...realtime, freshness: freshnessOf(realtime.observedAt, REALTIME_STALE_MINUTES, now) } : null,
        // The whole published horizon, not a "today" slice — see the query note.
        realtimeForecast: realtimeForecastRows.filter((row) => row.area === area).slice(0, 12),
        weather: weatherRows.filter((row) => row.area === area).slice(0, 24),
        events: eventsForArea.slice(0, 3),
        eventCount: eventsForArea.length,
        observedSeries: observedSeriesRows.filter((row) => row.area === area),
        sales: salesForArea.length ? {
          quarterCode: salesForArea[0].quarterCode,
          tradeAreaName: salesForArea[0].tradeAreaName,
          totalAmount: salesTotal,
          industryCount: salesForArea.length,
          topIndustries: salesForArea.slice(0, 3).map((row) => ({ industryName: row.industryName, salesAmount: row.salesAmount })),
        } : null,
        foreignPresence,
      }];
    }));

    const passengerToday = summarizeTodayPassengerForecast(passengerForecastRows as unknown as AirportForecastAggregateRow[], serviceDate);
    const distinctFlightsToday = Number(flightCountRows[0]?.flights ?? 0);
    const distinctFlightsByTerminal: Record<string, number> = Object.fromEntries(
      flightCountByTerminalRows.filter((row) => row.terminal).map((row) => [String(row.terminal), Number(row.flights)]),
    );
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
    const latestAirportRetrieval = [passengerToday.retrievedAt, flightsToday.retrievedAt, latestCongestionRetrieval]
      .filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    const upcomingForecast = passengerForecastRows.filter((row) => String(row.targetEndAt ?? "") >= kstNowIso)
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
        scheduled: scheduledRows,
        // FORECAST/EXPECTED passengers — semantically separate from
        // `congestion` (CURRENT/OBSERVED). Never merge these two arrays.
        passengerForecast: upcomingForecast,
      },
    }, {
      headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" },
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
        scheduled: [], passengerForecast: [],
      },
      message: "Live sources are not connected. Official historical views remain available.",
    }, { status: 200, headers: { "cache-control": "no-store" } });
  }
}
