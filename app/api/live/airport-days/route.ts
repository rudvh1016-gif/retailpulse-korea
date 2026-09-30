import { getDb } from "../../../../db";
import { CONTENT_API_ROBOTS_TAG } from "../../../../lib/crawl-policy";
import { isValidKstDay, kstDayOf, shiftKstDay } from "../../../../lib/kst";
import { profileOf } from "../../../../lib/airport-day-profile";
import { terminalDay } from "../../../../lib/airport-day-compare";

export const dynamic = "force-dynamic";

/** How far back the comparison looks: eight weeks, plus a week of margin for the similar-day search. */
export const HISTORY_DAYS = 63;

/**
 * Stored daily departure profiles before a date, for the business screen's
 * "what is different today" and "days like today". One indexed range seek on
 * the table's primary key: at most 63 rows, never the flight history itself.
 * The date's own flights are not read here — the page already has them from
 * /api/live/flights (shared with the departure map).
 */
export async function readAirportDays(client: Pick<D1Database, "prepare">, date: string) {
  const rows = (await client.prepare(
    "SELECT day, payload FROM airport_daily_composition WHERE day >= ? AND day < ? ORDER BY day DESC LIMIT 63",
  ).bind(shiftKstDay(date, -HISTORY_DAYS), date).all<{ day: string; payload: string }>()).results ?? [];
  const history = [];
  let withoutProfile = 0;
  for (const row of rows) {
    let payload: unknown = null;
    try { payload = JSON.parse(row.payload); } catch { /* an unreadable day is left out */ }
    const profile = profileOf(payload);
    if (!profile || profile.day !== row.day) { withoutProfile++; continue; }
    history.push({ T1: terminalDay(profile, "T1"), T2: terminalDay(profile, "T2") });
  }
  return { rowsRead: rows.length, withoutProfile, history };
}

export async function GET(request: Request) {
  const headers = { "x-robots-tag": CONTENT_API_ROBOTS_TAG };
  const generatedAt = new Date().toISOString();
  const today = kstDayOf(generatedAt);
  const requested = new URL(request.url).searchParams.get("date");
  const date = isValidKstDay(requested) ? requested : today;
  try {
    const db = (await getDb()).$client;
    const result = await readAirportDays(db, date);
    return Response.json({ mode: "airport-days", generatedAt, date, ...result },
      { headers: { ...headers, "cache-control": "public, max-age=600" } });
  } catch {
    // Unavailable history is not "no difference": the page says it could not compare.
    return Response.json({ mode: "degraded", generatedAt, date, history: [] }, { status: 503, headers: { ...headers, "cache-control": "no-store" } });
  }
}
