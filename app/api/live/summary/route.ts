import { getDb } from "../../../../db";

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

async function safeAll<T>(run: () => Promise<T[]>): Promise<T[]> {
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

    const congestionRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT terminal, zone, wait_time_minutes AS waitTimeMinutes, waiting_count AS waitingCount,
        observed_at AS observedAt
      FROM airport_congestion c
      WHERE observed_at = (SELECT MAX(observed_at) FROM airport_congestion d WHERE d.terminal = c.terminal)
      ORDER BY terminal, zone LIMIT 24`,
    ).all<Row>()).results ?? []);

    // Flight schedule timestamps carry +09:00; compare against the KST date.
    const kstToday = new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
    const flightRows = await safeAll<Row>(async () => (await client.prepare(
      `SELECT COUNT(*) AS flights, MAX(retrieved_at) AS retrievedAt FROM airport_flights
      WHERE direction = 'departure' AND substr(scheduled_at, 1, 10) = ?`,
    ).bind(kstToday).all<Row>()).results ?? []);

    const areas = Object.fromEntries(AREAS.map((area) => {
      const realtime = realtimeRows.find((row) => row.area === area) ?? null;
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
      }];
    }));

    const flightsToday = Number(flightRows[0]?.flights ?? 0);
    return Response.json({
      mode: "live-summary",
      generatedAt,
      sources,
      areas,
      airport: {
        congestion: congestionRows.map((row) => ({ ...row, freshness: freshnessOf(row.observedAt, 20, now) })),
        departuresTrackedToday: flightsToday > 0 ? flightsToday : null,
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
      airport: { congestion: [], departuresTrackedToday: null },
      message: "Live sources are not connected. Official historical and Demo-labelled views remain available.",
    }, { status: 200, headers: { "cache-control": "no-store" } });
  }
}
