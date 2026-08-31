import { getDb } from "../../../../db";
import {
  SEOUL_FOREIGN_MAPPING_VERSION,
  SEOUL_FOREIGN_PRODUCT_VERSION,
  SEOUL_FOREIGN_SOURCE_ID,
} from "../../../../lib/seoul-foreign";
import {
  summarizeCurrentBusiestDepartureHalls,
  summarizeTodayPassengerForecast,
  summarizeTodayTopGate,
  type AirportCongestionSummaryRow,
  type AirportForecastAggregateRow,
  type AirportTodayFlightRow,
} from "../../../../lib/airport-today-summary";

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

export async function GET() {
  const generatedAt = new Date().toISOString();
  const now = Date.parse(generatedAt);
  // Canonical KST-sourced rows store +09:00 offsets; compare lexicographically
  // in the same offset space rather than against the UTC string.
  const kstNowIso = `${new Date(now + 9 * 3_600_000).toISOString().slice(0, 19)}+09:00`;
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

    const realtimeForecastRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT area, target_at AS targetAt, congestion_level AS congestionLevel,
        congestion_label AS congestionLabel, population_min AS populationMin, population_max AS populationMax
      FROM seoul_realtime_forecast f
      WHERE issued_at = (SELECT MAX(issued_at) FROM seoul_realtime_forecast g WHERE g.area = f.area)
        AND target_at >= ?
      ORDER BY target_at LIMIT 36`,
    ).bind(kstNowIso).all<Row>()).results ?? []);

    const weatherRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT area, issued_at AS issuedAt, target_at AS targetAt,
        precipitation_probability AS precipitationProbability,
        temperature_tenth_c AS temperatureTenthC, condition_code AS conditionCode
      FROM weather_forecast w
      WHERE issued_at = (SELECT MAX(issued_at) FROM weather_forecast x WHERE x.area = w.area)
        AND target_at >= ?
      ORDER BY target_at LIMIT 72`,
    ).bind(kstNowIso).all<Row>()).results ?? []);

    const eventRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT area, content_id AS contentId, title, event_start AS eventStart,
        event_end AS eventEnd, distance_m AS distanceM, retrieved_at AS retrievedAt
      FROM tourism_events
      WHERE COALESCE(event_end, event_start) >= ?
      ORDER BY event_start LIMIT 30`,
    ).bind(kstNowIso.slice(0, 10)).all<Row>()).results ?? []);

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

    const congestionRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT terminal, zone, wait_time_minutes AS waitTimeMinutes, wait_time_raw AS waitTimeRaw,
        waiting_count AS waitingCount, observed_at AS observedAt, retrieved_at AS retrievedAt
      FROM airport_congestion c
      WHERE observed_at = (SELECT MAX(observed_at) FROM airport_congestion d WHERE d.terminal = c.terminal)
      ORDER BY terminal, zone LIMIT 24`,
    ).all<Row>()).results ?? []);

    const kstToday = new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);

    // A5 official aggregate departure rows only. Component rows never enter
    // today's total or peak calculation, preventing provider-total double count.
    const passengerForecastRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT terminal, direction, is_aggregate AS isAggregate,
        target_date AS targetDate, time_band_raw AS timeBandRaw,
        target_start_at AS targetStartAt, target_end_at AS targetEndAt,
        expected_passengers AS expectedPassengers, retrieved_at AS retrievedAt
      FROM airport_passenger_forecast f
      WHERE f.direction = 'departure' AND f.is_aggregate = 1 AND f.target_date = ?
      ORDER BY target_start_at, terminal LIMIT 96`,
    ).bind(kstToday).all<Row>()).results ?? []);

    const flightRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT physical_flight_id AS physicalFlightId, terminal, gate, retrieved_at AS retrievedAt
      FROM airport_flights
      WHERE direction = 'departure' AND substr(scheduled_at, 1, 10) = ?
      LIMIT 2000`,
    ).bind(kstToday).all<Row>()).results ?? []);

    const flightCountRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT COUNT(DISTINCT physical_flight_id) AS flights
      FROM airport_flights
      WHERE direction = 'departure' AND substr(scheduled_at, 1, 10) = ?`,
    ).bind(kstToday).all<Row>()).results ?? []);

    const scheduledRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT terminal, COUNT(*) AS flights, MIN(scheduled_time) AS firstTime, MAX(scheduled_time) AS lastTime,
        MAX(retrieved_at) AS retrievedAt
      FROM airport_scheduled_flights
      WHERE valid_from <= ? AND valid_to >= ?
      GROUP BY terminal ORDER BY terminal`,
    ).bind(kstToday, kstToday).all<Row>()).results ?? []);

    const areas = Object.fromEntries(AREAS.map((area) => {
      const realtime = realtimeRows.find((row) => row.area === area) ?? null;
      const foreignPresence = foreignPresenceRows.find((row) => row.area === area) ?? null;
      const salesForArea = salesRows.filter((row) => row.area === area);
      const salesTotal = salesForArea.reduce((sum, row) => sum + Number(row.salesAmount ?? 0), 0);
      return [area, {
        realtime: realtime ? { ...realtime, freshness: freshnessOf(realtime.observedAt, REALTIME_STALE_MINUTES, now) } : null,
        realtimeForecast: realtimeForecastRows.filter((row) => row.area === area).slice(0, 6),
        weather: weatherRows.filter((row) => row.area === area).slice(0, 12),
        events: eventRows.filter((row) => row.area === area).slice(0, 3),
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

    const passengerToday = summarizeTodayPassengerForecast(passengerForecastRows as unknown as AirportForecastAggregateRow[]);
    const distinctFlightsToday = Number(flightCountRows[0]?.flights ?? 0);
    const flightsToday = summarizeTodayTopGate(
      flightRows as unknown as AirportTodayFlightRow[],
      0.5,
      distinctFlightsToday,
    );
    const currentBusiest = summarizeCurrentBusiestDepartureHalls(
      congestionRows.map((row) => ({ ...row, freshness: freshnessOf(row.observedAt, 20, now) })) as unknown as AirportCongestionSummaryRow[],
    );
    const latestCongestionRetrieval = congestionRows.reduce<string | null>((latest, row) => {
      const value = typeof row.retrievedAt === "string" ? row.retrievedAt : null;
      return value && (!latest || value > latest) ? value : latest;
    }, null);
    const latestAirportRetrieval = [passengerToday.retrievedAt, flightsToday.retrievedAt, latestCongestionRetrieval]
      .filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    const upcomingForecast = passengerForecastRows.filter((row) => String(row.targetEndAt ?? "") >= kstNowIso)
      .filter((row, index, all) => all.findIndex((candidate) => candidate.terminal === row.terminal) === index);
    return Response.json({
      mode: "live-summary",
      generatedAt,
      sources,
      areas,
      airport: {
        congestion: congestionRows.map((row) => ({ ...row, freshness: freshnessOf(row.observedAt, 20, now) })),
        currentBusiestDepartureHallByTerminal: currentBusiest,
        departuresTrackedToday: flightsToday.departuresTrackedToday,
        topDepartureGate: flightsToday.topDepartureGate?.gate ?? null,
        topDepartureGateTerminal: flightsToday.topDepartureGate?.terminal ?? null,
        topDepartureGateFlights: flightsToday.topDepartureGate?.flights ?? null,
        gateCoverageRatio: flightsToday.gateCoverageRatio,
        serviceDateKst: kstToday,
        periodStartAt: `${kstToday}T00:00:00+09:00`,
        periodEndAt: `${kstToday}T23:59:59+09:00`,
        latestRetrievedAt: latestAirportRetrieval,
        todayExpectedPassengersTotal: passengerToday.total,
        todayExpectedPassengersByTerminal: passengerToday.byTerminal,
        peakExpectedTimeBand: passengerToday.peak,
        peakExpectedPassengers: passengerToday.peak?.expectedPassengers ?? null,
        passengerForecastTimeline: passengerToday.timeline,
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
      sources: [],
      areas: {},
      airport: {
        congestion: [], currentBusiestDepartureHallByTerminal: {}, departuresTrackedToday: null,
        topDepartureGate: null, topDepartureGateTerminal: null, topDepartureGateFlights: null,
        gateCoverageRatio: 0, serviceDateKst: null,
        periodStartAt: null, periodEndAt: null, latestRetrievedAt: null,
        todayExpectedPassengersTotal: null, todayExpectedPassengersByTerminal: {},
        peakExpectedTimeBand: null, peakExpectedPassengers: null,
        passengerForecastTimeline: [], scheduled: [], passengerForecast: [],
      },
      message: "Live sources are not connected. Official historical and Demo-labelled views remain available.",
    }, { status: 200, headers: { "cache-control": "no-store" } });
  }
}
