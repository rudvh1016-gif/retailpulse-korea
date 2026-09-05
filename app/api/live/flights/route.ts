import { getDb } from "../../../../db";
import { isValidKstDay, kstDayOf } from "../../../../lib/kst";

export const dynamic = "force-dynamic";

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
    const rows = (await db.$client.prepare(
      `SELECT flight_number AS flightNumber, airline_code AS airlineCode,
        airport_code AS airportCode, direction, terminal, gate,
        checkin_counter AS checkinCounter, status, scheduled_at AS scheduledAt
      FROM airport_flights
      WHERE substr(scheduled_at, 1, 10) = ?
      ORDER BY scheduled_at, flight_number LIMIT 1201`,
    ).bind(serviceDate).all<Record<string, unknown>>()).results ?? [];

    return Response.json({
      mode: "live-flights",
      generatedAt,
      serviceDateKst: serviceDate,
      flights: rows.slice(0, 1200),
      truncated: rows.length > 1200,
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
