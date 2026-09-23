import { getDb } from "../../../../db";
import { isValidKstDay, kstDayOf, relateKstDay, shiftKstDay } from "../../../../lib/kst";
import { readDepartureSchedule } from "../../../../lib/departure-schedule";

export const dynamic = "force-dynamic";

/** One indexed date snapshot (future) or indexed day range (recorded flights). */
export async function readFlightsForDate(client: Pick<D1Database, 'prepare'>, serviceDate: string, today: string) {
  const dayRelation = relateKstDay(serviceDate, today);
  if (dayRelation === 'FUTURE') {
    const snapshots = (await client.prepare('SELECT payload, retrieved_at AS retrievedAt FROM airport_departure_schedule WHERE service_date = ? LIMIT 1')
      .bind(serviceDate).all<{payload: string; retrievedAt: string}>()).results ?? [];
    const rows = readDepartureSchedule(snapshots[0], serviceDate).map(row => ({
      flightNumber: row.operatingFlight, airlineCode: row.airlineCode ?? null, airportCode: row.airportCode ?? null,
      direction: 'departure', terminal: row.terminal, gate: row.gate ?? null, checkinCounter: row.checkinCounter ?? null,
      status: row.status ?? 'unknown', scheduledAt: `${serviceDate}T${row.scheduledTime}:00+09:00`,
    })).sort((a,b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.flightNumber.localeCompare(b.flightNumber));
    return { basis: 'OFFICIAL_DEPARTURE_SCHEDULE', dayRelation, flights: rows.slice(0,1200), truncated: rows.length > 1200, retrievedAt: snapshots[0]?.retrievedAt ?? null };
  }
  const rows = (await client.prepare(
    `SELECT flight_number AS flightNumber, airline_code AS airlineCode,
      airport_code AS airportCode, direction, terminal, gate,
      checkin_counter AS checkinCounter, status, scheduled_at AS scheduledAt, retrieved_at AS retrievedAt
    FROM airport_flights
    WHERE direction IN ('departure', 'arrival') AND scheduled_at >= ? AND scheduled_at < ?
    ORDER BY scheduled_at, flight_number LIMIT 1201`,
  ).bind(serviceDate, shiftKstDay(serviceDate, 1)).all<Record<string, unknown>>()).results ?? [];
  return { basis: 'COLLECTED_FLIGHT_RECORDS', dayRelation, flights: rows.slice(0,1200), truncated: rows.length > 1200,
    retrievedAt: rows.map(row => String(row.retrievedAt ?? '')).filter(Boolean).sort().at(-1) ?? null };
}

/**
 * The official flight record for one KST service day.
 *
 * This lives apart from `/api/live/summary` on purpose. The board is a
 * separate screen and reads far more rows than the rest of the product
 * combined, so folding it into the summary would spend D1's free row-read
 * budget on a list most visitors never open. Fetching it only when the flights
 * tab is opened keeps the common path cheap.
 */
export async function GET(request: Request) {
  const generatedAt = new Date().toISOString();
  const kstToday = kstDayOf(generatedAt);
  const requested = (() => {
    try {
      return new URL(request.url).searchParams.get("date");
    } catch {
      return null;
    }
  })();
  const serviceDate = isValidKstDay(requested) ? requested : kstToday;

  try {
    const db = await getDb();
    const result = await readFlightsForDate(db.$client, serviceDate, kstToday);

    return Response.json({
      mode: "live-flights",
      generatedAt,
      serviceDateKst: serviceDate,
      todayKst: kstToday,
      ...result,
    }, { headers: { "cache-control": "public, max-age=120, stale-while-revalidate=600" } });
  } catch {
    // A failure here must not read as "no flights operated" — the board says
    // the record is unavailable rather than rendering an empty day.
    return Response.json({
      mode: "degraded",
      generatedAt,
      serviceDateKst: serviceDate,
      flights: [],
    }, { status: 200, headers: { "cache-control": "no-store" } });
  }
}
