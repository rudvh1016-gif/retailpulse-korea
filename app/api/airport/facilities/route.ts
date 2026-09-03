import { getDb } from "../../../../db";
import { FACILITY_CATEGORY_GROUPS, FACILITY_TERMINALS } from "../../../../lib/airport-facilities";

export const dynamic = "force-dynamic";

/**
 * The official passenger-terminal facility directory (A2, data.go.kr
 * 15095064), read from D1 only.
 *
 * Kept out of `/api/live/summary` deliberately: this is a browsable
 * directory of ~1,200 rows that most visitors never open, and folding it
 * into the summary would spend the D1 free row-read budget on every page
 * view. It is fetched only when the 매장·시설 tab opens.
 *
 * Every request seeks an index. The statement always carries a leading
 * equality on `terminal` or `category_group` — when the caller supplies
 * neither, the default terminal below fills that in — so the query never
 * scans the table. The remaining filters (floor, duty area, arrival side,
 * text query) narrow inside that seek.
 */
const LIMIT = 60;
const MAX_LIMIT = 120;
const DEFAULT_TERMINAL = "T1";

function param(url: URL, key: string): string | null {
  const value = url.searchParams.get(key);
  return value && value.trim() ? value.trim() : null;
}

export async function GET(request: Request) {
  const generatedAt = new Date().toISOString();
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    url = new URL("https://koretaildata.com/api/airport/facilities");
  }

  const requestedTerminal = param(url, "terminal");
  const terminal = requestedTerminal && (FACILITY_TERMINALS as readonly string[]).includes(requestedTerminal) ? requestedTerminal : null;
  const requestedCategory = param(url, "category");
  const category = requestedCategory && (FACILITY_CATEGORY_GROUPS as readonly string[]).includes(requestedCategory) ? requestedCategory : null;
  const floor = param(url, "floor");
  const dutyArea = param(url, "area") === "DUTY_FREE" ? "DUTY_FREE" : param(url, "area") === "GENERAL" ? "GENERAL" : null;
  const side = param(url, "side") === "ARRIVAL" ? "ARRIVAL" : param(url, "side") === "DEPARTURE" ? "DEPARTURE" : null;
  const query = param(url, "q");
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(param(url, "limit")) || LIMIT));
  const offset = Math.max(0, Number(param(url, "offset")) || 0);
  // The index needs a leading equality; without either filter the directory
  // opens on T1 rather than scanning every terminal.
  const seekTerminal = terminal ?? (category ? null : DEFAULT_TERMINAL);

  const where: string[] = [];
  const binds: unknown[] = [];
  if (seekTerminal) { where.push("terminal = ?"); binds.push(seekTerminal); }
  if (category) { where.push("category_group = ?"); binds.push(category); }
  if (floor) { where.push("floor = ?"); binds.push(floor); }
  if (dutyArea) { where.push("duty_area = ?"); binds.push(dutyArea); }
  if (side) { where.push("arrival_departure = ?"); binds.push(side); }
  if (query) {
    where.push("(name_ko LIKE ? OR name_en LIKE ? OR goods_brands LIKE ? OR facility_item LIKE ?)");
    const needle = `%${query.replaceAll("%", "").replaceAll("_", "")}%`;
    binds.push(needle, needle, needle, needle);
  }

  try {
    const db = await getDb();
    const rows = (await db.$client.prepare(
      `SELECT facility_id AS facilityId, name_ko AS nameKo, name_en AS nameEn, name_zh AS nameZh, name_ja AS nameJa,
        facility_item AS facilityItem, large_category AS largeCategory, medium_category AS mediumCategory,
        small_category AS smallCategory, category_group AS categoryGroup, terminal, floor,
        duty_area AS dutyArea, arrival_departure AS arrivalDeparture, location_raw AS locationRaw,
        location_en AS locationEn, business_hours_raw AS businessHoursRaw, goods_brands AS goodsBrands,
        phone, retrieved_at AS retrievedAt
      FROM airport_facility
      WHERE ${where.join(" AND ")}
      ORDER BY name_ko LIMIT ? OFFSET ?`,
    ).bind(...binds, limit + 1, offset).all<Record<string, unknown>>()).results ?? [];

    const hasMore = rows.length > limit;
    return Response.json({
      mode: "airport-facilities",
      generatedAt,
      scope: { terminal: seekTerminal, category, floor, dutyArea, side, query, limit, offset },
      hasMore,
      facilities: rows.slice(0, limit),
      // Nothing here is real-time: hours are the provider's published hours.
      basis: "OFFICIAL_PUBLISHED_HOURS",
    }, { headers: { "cache-control": "public, max-age=600, stale-while-revalidate=3600" } });
  } catch {
    // A read failure must never read as "no stores here": the directory says
    // it is unavailable instead of rendering an empty terminal.
    return Response.json({
      mode: "degraded",
      generatedAt,
      scope: { terminal: seekTerminal, category, floor, dutyArea, side, query, limit, offset },
      hasMore: false,
      facilities: [],
      basis: "OFFICIAL_PUBLISHED_HOURS",
    }, { status: 200, headers: { "cache-control": "no-store" } });
  }
}
