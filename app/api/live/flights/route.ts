import {serviceDayCacheControl} from '../../../../lib/service-day-cache';
import { getDb } from "../../../../db";
import { isValidKstDay, kstDayOf, relateKstDay, shiftKstDay } from "../../../../lib/kst";
import { readDepartureSchedule } from "../../../../lib/departure-schedule";

export const dynamic = "force-dynamic";

/** The airport's held departure schedule of one date, shaped like recorded flight rows. */
async function readHeldSchedule(client: Pick<D1Database, 'prepare'>, serviceDate: string, dayRelation: string) {
  const snapshots = (await client.prepare('SELECT payload, retrieved_at AS retrievedAt FROM airport_departure_schedule WHERE service_date = ? LIMIT 1')
    .bind(serviceDate).all<{payload: string; retrievedAt: string}>()).results ?? [];
  const rows = readDepartureSchedule(snapshots[0], serviceDate).map(row => ({
    physicalFlightId: row.physicalFlightId, flightNumber: row.operatingFlight, airlineCode: row.airlineCode ?? null, airportCode: row.airportCode ?? null,
    direction: 'departure', terminal: row.terminal, gate: row.gate ?? null, checkinCounter: row.checkinCounter ?? null,
    status: row.status ?? 'unknown', scheduledAt: `${serviceDate}T${row.scheduledTime}:00+09:00`,
  })).sort((a,b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.flightNumber.localeCompare(b.flightNumber));
  return { basis: 'OFFICIAL_DEPARTURE_SCHEDULE', dayRelation, flights: rows.slice(0,1200), truncated: rows.length > 1200, retrievedAt: snapshots[0]?.retrievedAt ?? null };
}

/** One indexed date snapshot (future) or indexed day range (recorded flights). */
export async function readFlightsForDate(client: Pick<D1Database, 'prepare'>, serviceDate: string, today: string) {
  const dayRelation = relateKstDay(serviceDate, today);
  if (dayRelation === 'FUTURE') return readHeldSchedule(client, serviceDate, dayRelation);
  const rows = (await client.prepare(
    `SELECT physical_flight_id AS physicalFlightId, flight_number AS flightNumber, airline_code AS airlineCode,
      airport_code AS airportCode, direction, terminal, gate,
      checkin_counter AS checkinCounter, status, scheduled_at AS scheduledAt, retrieved_at AS retrievedAt
    FROM airport_flights
    WHERE direction IN ('departure', 'arrival') AND scheduled_at >= ? AND scheduled_at < ?
    ORDER BY scheduled_at, flight_number LIMIT 1201`,
  ).bind(serviceDate, shiftKstDay(serviceDate, 1)).all<Record<string, unknown>>()).results ?? [];
  // Today before its first collection has no recorded flights yet; the airport's
  // schedule for the day is already held until the first scan replaces it, so
  // show that (labelled as the schedule) instead of an empty day.
  if (dayRelation === 'TODAY' && rows.length === 0) {
    const held = await readHeldSchedule(client, serviceDate, dayRelation);
    if (held.flights.length) return held;
  }
  const terminalFallbacks: Record<string, {basis:'OFFICIAL_DEPARTURE_SCHEDULE'; flights:Record<string,unknown>[]; retrievedAt:string|null; truncated:boolean}> = {};
  if (dayRelation === 'TODAY' && rows.length > 0 && rows.length <= 1200) {
    const missing = ['T1','T2','CONCOURSE'].filter(terminal=>!rows.some(row=>row.direction==='departure'&&row.terminal===terminal));
    if (missing.length) {
      const held=await readHeldSchedule(client,serviceDate,dayRelation);
      for (const terminal of missing) {
        const flights=held.flights.filter(row=>row.terminal===terminal);
        if (flights.length) terminalFallbacks[terminal]={basis:'OFFICIAL_DEPARTURE_SCHEDULE',flights,retrievedAt:held.retrievedAt,truncated:held.truncated};
      }
    }
  }
  return { basis: 'COLLECTED_FLIGHT_RECORDS', dayRelation, terminalFallbacks, flights: rows.slice(0,1200), truncated: rows.length > 1200,
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
    }, { headers: { "cache-control": serviceDayCacheControl("public, max-age=120, stale-while-revalidate=600",generatedAt) } });
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
