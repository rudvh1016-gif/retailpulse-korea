import { getDb } from "../../../../db";
import { isValidKstDay, kstDayOf } from "../../../../lib/kst";
import { prepareEventsForPresentation, type EventPresentationInput } from "../../../../lib/event-presentation";

export const dynamic = "force-dynamic";
/** Explicitly requested pages only; the normal summary stays small. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const area = params.get("area");
  const offset = Number(params.get("offset") ?? 0);
  if (!["myeongdong", "hongdae", "seongsu"].includes(area ?? "") || !Number.isSafeInteger(offset) || offset < 0) {
    return Response.json({ error: "invalid_parameters" }, { status: 400 });
  }
  const date = params.get("date");
  const serviceDate = isValidKstDay(date) ? date : kstDayOf(new Date().toISOString());
  try {
    const db = await getDb();
    const rows = (await db.$client.prepare(`SELECT content_id AS contentId, title,
      event_start AS eventStart, event_end AS eventEnd, distance_m AS distanceM,
      category_name AS categoryName, address, address_detail AS addressDetail, overview, homepage
      FROM tourism_events
      WHERE (event_end >= ? OR (event_end IS NULL AND event_start >= ?)) AND area = ?
      ORDER BY event_start, content_id LIMIT 41 OFFSET ?`).bind(serviceDate, serviceDate, area, offset)
      .all<EventPresentationInput>()).results ?? [];
    return Response.json({ events: prepareEventsForPresentation(rows.slice(0, 40), serviceDate),
      nextOffset: rows.length > 40 ? offset + 40 : null, serviceDateKst: serviceDate },
      { headers: { "cache-control": "public, max-age=120" } });
  } catch {
    return Response.json({ error: "events_unavailable" }, { status: 503 });
  }
}
