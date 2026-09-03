import { getDb } from "../../../../db";
import zoneMapFile from "../../../../config/airport-zone-map.v1.json";
import { buildZoneMapIndex, resolveZoneMapping, type AirportZoneMapFile } from "../../../../lib/airport-zone-map";
import { buildFacilityOperationsBrief } from "../../../../lib/facility-operations";
import { kstDayOf } from "../../../../lib/kst";

export const dynamic = "force-dynamic";

/**
 * Airport Retail A4 — the operations brief for one selected facility.
 *
 * Deliberately its own endpoint, read only when a person selects a store.
 * Folding it into `/api/live/summary` would spend the D1 free row-read budget
 * on every page view for a screen most visitors never open — the same reason
 * the facility directory is separate.
 *
 * Every read is bounded and seeks an index:
 *   · the facility by primary key, one row
 *   · departures for that terminal inside the widest look-ahead window only,
 *     via airport_flights_direction_scheduled_idx
 *   · the day's official aggregate bands for that terminal, via
 *     airport_passenger_forecast_target_idx
 *   · the latest departure-hall observation for that terminal, via
 *     airport_congestion_terminal_observed_idx
 *
 * The A3 mapping comes from the bundled record, so it costs no read at all.
 */
const zoneMap = buildZoneMapIndex(zoneMapFile as AirportZoneMapFile);
/** The widest window the brief reports; nothing beyond it is ever fetched. */
const LOOK_AHEAD_MINUTES = 120;
const FLIGHT_ROW_LIMIT = 400;

type Row = Record<string, unknown>;

async function safeAll<T>(read: () => Promise<T[]>): Promise<T[]> {
  try {
    return await read();
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const generatedAt = new Date().toISOString();
  let facilityId: string | null = null;
  try {
    facilityId = new URL(request.url).searchParams.get("facilityId");
  } catch {
    facilityId = null;
  }
  facilityId = facilityId?.trim() || null;
  // The id is the provider's `sn`. Anything else is not a facility, and must
  // not reach a query.
  if (!facilityId || !/^\d{1,12}$/.test(facilityId)) {
    return Response.json({ mode: "invalid-facility", generatedAt, facility: null, brief: null },
      { status: 400, headers: { "cache-control": "no-store" } });
  }

  try {
    const db = await getDb();
    const client = db.$client;
    const facility = await client.prepare(
      `SELECT facility_id AS facilityId, name_ko AS nameKo, name_en AS nameEn, name_zh AS nameZh, name_ja AS nameJa,
        facility_item AS facilityItem, large_category AS largeCategory, category_group AS categoryGroup,
        terminal, floor, duty_area AS dutyArea, arrival_departure AS arrivalDeparture,
        location_raw AS locationRaw, location_en AS locationEn, business_hours_raw AS businessHoursRaw,
        goods_brands AS goodsBrands, phone, retrieved_at AS retrievedAt
      FROM airport_facility WHERE facility_id = ?`,
    ).bind(facilityId).first<Row>();

    if (!facility) {
      return Response.json({ mode: "facility-not-found", generatedAt, facility: null, brief: null },
        { status: 404, headers: { "cache-control": "no-store" } });
    }

    const mapping = resolveZoneMapping(zoneMap, {
      facilityId: String(facility.facilityId),
      terminal: (facility.terminal ?? null) as never,
      floor: (facility.floor ?? null) as string | null,
      dutyArea: (facility.dutyArea ?? null) as never,
      arrivalDeparture: (facility.arrivalDeparture ?? null) as never,
      locationRaw: (facility.locationRaw ?? null) as string | null,
    });
    const terminal = mapping.terminal;
    const serviceDate = kstDayOf(generatedAt);
    const windowEnd = new Date(Date.parse(generatedAt) + LOOK_AHEAD_MINUTES * 60_000).toISOString();

    // A facility with no recognised terminal gets no terminal numbers at all:
    // there is no terminal to attribute them to, and attributing them anyway
    // is exactly the "terminal data pretending to be store data" mistake.
    const flights = terminal ? await safeAll<Row>(async () => (await client.prepare(
      `SELECT scheduled_at AS scheduledAt, terminal, gate
      FROM airport_flights
      WHERE direction = 'departure' AND scheduled_at >= ? AND scheduled_at <= ? AND terminal = ?
      ORDER BY scheduled_at LIMIT ?`,
    ).bind(generatedAt, windowEnd, terminal, FLIGHT_ROW_LIMIT).all<Row>()).results ?? []) : [];

    const forecastBands = terminal ? await safeAll<Row>(async () => (await client.prepare(
      `SELECT target_start_at AS targetStartAt, target_end_at AS targetEndAt,
        expected_passengers AS expectedPassengers, retrieved_at AS retrievedAt
      FROM airport_passenger_forecast
      WHERE target_date = ? AND terminal = ? AND direction = 'departure' AND is_aggregate = 1
      ORDER BY target_start_at LIMIT 48`,
    ).bind(serviceDate, terminal, ).all<Row>()).results ?? []) : [];

    const checkpoints = terminal ? await safeAll<Row>(async () => (await client.prepare(
      `SELECT terminal, zone, wait_time_minutes AS waitTimeMinutes, wait_time_raw AS waitTimeRaw,
        waiting_count AS waitingCount, observed_at AS observedAt, retrieved_at AS retrievedAt
      FROM airport_congestion
      WHERE terminal = ? AND observed_at = (SELECT MAX(observed_at) FROM airport_congestion WHERE terminal = ?)
      LIMIT 24`,
    ).bind(terminal, terminal).all<Row>()).results ?? []) : [];

    const latest = (rows: Row[]) => rows.reduce<string | null>((newest, row) => {
      const value = typeof row.retrievedAt === "string" ? row.retrievedAt : null;
      return value && (!newest || value > newest) ? value : newest;
    }, null);

    const brief = buildFacilityOperationsBrief({
      mapping,
      nowIso: generatedAt,
      flights: flights as never,
      forecastBands: forecastBands as never,
      checkpoints: checkpoints as never,
      sourceRetrievedAt: {
        facility: (facility.retrievedAt ?? null) as string | null,
        flights: latest(flights),
        passengerForecast: latest(forecastBands),
        checkpoint: latest(checkpoints),
      },
    });

    return Response.json({
      mode: "facility-operations",
      generatedAt,
      serviceDateKst: serviceDate,
      facility,
      mapping,
      brief,
      // Published hours, never a live "open now" state.
      basis: "OFFICIAL_PUBLISHED_HOURS",
    }, { headers: { "cache-control": "public, max-age=120, stale-while-revalidate=600" } });
  } catch {
    // A read failure must never read as "nothing is happening at your store".
    return Response.json({ mode: "degraded", generatedAt, facility: null, brief: null },
      { status: 200, headers: { "cache-control": "no-store" } });
  }
}
