import { buildDataGoKrUrl } from "./data-go-kr.mjs";
import {
  fetchOfficialJson,
  normalizeAirportFlight,
  type CanonicalAirportFlight,
} from "./source-adapters";

const SOURCE_ID = "INCHEON_FLIGHT_DETAIL";
const ENDPOINT = "https://apis.data.go.kr/B551177/statusOfAllFltDeOdp/getFltDeparturesDeOdp";

/**
 * A1 exposes a D-3..D+6 population when called without its optional time
 * filters. The portal confirms date/time filtering exists, but the exact
 * parameter names are not present in the public metadata we have verified.
 * Until those names are verified, do not guess them: scan bounded 100-row
 * pages and persist only the requested KST service date.
 *
 * 150 pages = at most 15,000 source rows / 150 calls for one manual run,
 * below A1's documented 500-call development quota. The recurring collector
 * remains disabled and must not use this fallback without a separate cadence
 * and quota review.
 */
export const A1_TODAY_PAGE_SIZE = 100;
export const A1_TODAY_MAX_PAGES = 150;

interface AirportTodayEnv {
  DB?: D1Database;
  DATA_GO_KR_SERVICE_KEY?: string;
}

interface A1Body {
  items?: unknown[] | { item?: unknown[] | unknown };
  totalCount?: number | string;
}

interface A1Envelope {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: A1Body;
  };
}

export interface A1TodayFetchResult {
  targetDate: string;
  pagesFetched: number;
  totalCount: number;
  sourceRowsForDate: number;
  records: CanonicalAirportFlight[];
}

type OfficialFetcher = (url: URL, options?: { timeoutMs?: number; retries?: number }) => Promise<unknown>;

export function kstDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function compactDate(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

function pageItems(body: A1Body | undefined): unknown[] {
  const raw = body?.items;
  if (Array.isArray(raw)) return raw;
  const nested = raw?.item;
  if (Array.isArray(nested)) return nested;
  return nested ? [nested] : [];
}

function scheduledDateOf(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>).scheduleDatetime;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(0, 8) : null;
}

function totalCountOf(body: A1Body | undefined): number {
  const value = Number(body?.totalCount);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function assertSuccess(payload: unknown, pageNo: number): A1Body {
  const root = payload as A1Envelope;
  const resultCode = root?.response?.header?.resultCode;
  if (resultCode !== "00") throw new Error(`a1_today_result_${String(resultCode ?? "missing")}_page_${pageNo}`);
  const body = root?.response?.body;
  if (!body || typeof body !== "object") throw new Error(`a1_today_schema_page_${pageNo}`);
  return body;
}

/**
 * Read the complete bounded A1 D-3..D+6 population in provider-safe pages,
 * then retain only the requested KST service date. This deliberately scans
 * every declared page so correctness does not depend on undocumented sort
 * order. Calls are sequential to avoid a provider request burst.
 */
export async function fetchA1DeparturesForDate(
  serviceKey: string,
  targetDate: string,
  fetcher: OfficialFetcher = fetchOfficialJson,
): Promise<A1TodayFetchResult> {
  const targetYmd = compactDate(targetDate);
  if (!/^\d{8}$/.test(targetYmd)) throw new Error("a1_today_invalid_target_date");

  let declaredTotal = 0;
  let totalPages = 0;
  let sourceRowsForDate = 0;
  const unique = new Map<string, CanonicalAirportFlight>();
  const retrievedAt = new Date().toISOString();

  for (let pageNo = 1; ; pageNo += 1) {
    if (pageNo > A1_TODAY_MAX_PAGES) throw new Error("a1_today_page_bound_exceeded");
    const url = buildDataGoKrUrl(ENDPOINT, serviceKey, {
      type: "json",
      numOfRows: String(A1_TODAY_PAGE_SIZE),
      pageNo: String(pageNo),
    });
    const payload = await fetcher(url, { timeoutMs: 30_000, retries: 0 });
    const body = assertSuccess(payload, pageNo);
    const items = pageItems(body);

    if (pageNo === 1) {
      declaredTotal = totalCountOf(body);
      if (!declaredTotal) throw new Error("a1_today_missing_total_count");
      totalPages = Math.ceil(declaredTotal / A1_TODAY_PAGE_SIZE);
      if (totalPages > A1_TODAY_MAX_PAGES) {
        throw new Error(`a1_today_population_exceeds_bound_${totalPages}`);
      }
    }

    if (pageNo < totalPages && items.length === 0) {
      throw new Error(`a1_today_incomplete_page_${pageNo}`);
    }

    for (const item of items) {
      const serviceDate = scheduledDateOf(item);
      if (!serviceDate) throw new Error(`a1_today_missing_schedule_date_page_${pageNo}`);
      if (serviceDate !== targetYmd) continue;
      sourceRowsForDate += 1;
      const record = await normalizeAirportFlight(item, "departure", retrievedAt);
      unique.set(record.physicalFlightId, record);
    }

    if (pageNo >= totalPages) break;
  }

  return {
    targetDate,
    pagesFetched: totalPages,
    totalCount: declaredTotal,
    sourceRowsForDate,
    records: [...unique.values()],
  };
}

async function persistTodayFlights(db: D1Database | undefined, records: CanonicalAirportFlight[]): Promise<number> {
  if (!db || !records.length) return 0;
  const statements = records.map((record) => db.prepare(`INSERT INTO airport_flights (
      id, source_id, record_origin, direction, flight_number, airline_code,
      airport_code, terminal, gate, checkin_counter, status, scheduled_at,
      changed_at, event_at, published_at, retrieved_at, freshness,
      schema_version, quality_status, source_hash, physical_flight_id,
      upstream_fid, master_flight_number, codeshare
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(physical_flight_id) DO UPDATE SET
      airline_code = excluded.airline_code,
      airport_code = excluded.airport_code,
      terminal = excluded.terminal,
      gate = excluded.gate,
      checkin_counter = excluded.checkin_counter,
      status = excluded.status,
      changed_at = excluded.changed_at,
      event_at = excluded.event_at,
      published_at = excluded.published_at,
      retrieved_at = excluded.retrieved_at,
      freshness = excluded.freshness,
      schema_version = excluded.schema_version,
      quality_status = excluded.quality_status,
      source_hash = excluded.source_hash,
      upstream_fid = excluded.upstream_fid,
      master_flight_number = excluded.master_flight_number,
      codeshare = excluded.codeshare
    WHERE airport_flights.source_hash <> excluded.source_hash`)
    .bind(
      record.physicalFlightId,
      record.sourceId,
      record.recordOrigin,
      record.direction,
      record.flightNumber,
      record.airlineCode,
      record.airportCode,
      record.terminal,
      record.gate,
      record.checkinCounter,
      record.status,
      record.scheduledAt,
      record.changedAt,
      record.eventAt,
      record.publishedAt,
      record.retrievedAt,
      record.freshness,
      record.schemaVersion,
      record.qualityStatus,
      record.sourceHash,
      record.physicalFlightId,
      record.upstreamFid,
      record.masterFlightNumber,
      record.codeshare,
    ));

  let rowsWritten = 0;
  for (let offset = 0; offset < statements.length; offset += 40) {
    const results = await db.batch(statements.slice(offset, offset + 40));
    rowsWritten += results.reduce((sum, result) => sum + Number(result.meta?.rows_written ?? 0), 0);
  }
  return rowsWritten;
}

async function recordSuccess(
  db: D1Database | undefined,
  fetched: A1TodayFetchResult,
  changedRows: number,
): Promise<void> {
  if (!db) return;
  const finishedAt = new Date().toISOString();
  const eventAt = fetched.records.reduce<string | null>((latest, record) => {
    if (!latest || record.scheduledAt > latest) return record.scheduledAt;
    return latest;
  }, null);
  const retrievedAt = fetched.records[0]?.retrievedAt ?? finishedAt;
  const detail = `today ${fetched.targetDate}; pages ${fetched.pagesFetched}; population ${fetched.totalCount}; source rows ${fetched.sourceRowsForDate}; unique physical ${fetched.records.length}; changed writes ${changedRows}`;

  await db.prepare(`INSERT INTO source_health (
      source_id, status, last_event_at, last_published_at, last_retrieved_at,
      consecutive_failures, schema_version, detail, updated_at
    ) VALUES (?, 'LIVE', ?, NULL, ?, 0, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET
      status = 'LIVE',
      last_event_at = COALESCE(excluded.last_event_at, source_health.last_event_at),
      last_retrieved_at = excluded.last_retrieved_at,
      consecutive_failures = 0,
      schema_version = excluded.schema_version,
      detail = excluded.detail,
      updated_at = excluded.updated_at`)
    .bind(SOURCE_ID, eventAt, retrievedAt, fetched.records[0]?.schemaVersion ?? "airport-v1", detail.slice(0, 500), finishedAt)
    .run();

  await db.prepare(`INSERT INTO collector_runs (
      run_id, source_id, started_at, finished_at, status,
      records_read, records_written, detail
    ) VALUES (?, ?, ?, ?, 'SUCCESS', ?, ?, ?)`)
    .bind(
      crypto.randomUUID(),
      SOURCE_ID,
      retrievedAt,
      finishedAt,
      fetched.sourceRowsForDate,
      changedRows,
      detail.slice(0, 500),
    )
    .run();
}

export async function collectAirportFlightsToday(
  env: AirportTodayEnv,
  now = new Date(),
): Promise<{ status: string; records: number; trackedToday: number; pagesFetched: number }> {
  if (!env.DATA_GO_KR_SERVICE_KEY) {
    return { status: "NEEDS_KEY", records: 0, trackedToday: 0, pagesFetched: 0 };
  }

  const targetDate = kstDate(now);
  try {
    const fetched = await fetchA1DeparturesForDate(env.DATA_GO_KR_SERVICE_KEY, targetDate);
    if (!fetched.records.length) throw new Error(`a1_today_no_rows_${targetDate}`);
    const changedRows = await persistTodayFlights(env.DB, fetched.records);
    await recordSuccess(env.DB, fetched, changedRows);
    return {
      status: "SUCCESS",
      records: changedRows,
      trackedToday: fetched.records.length,
      pagesFetched: fetched.pagesFetched,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "a1_today_collector_error";
    console.error("airport_today_collector_failed", { sourceId: SOURCE_ID, error: detail.slice(0, 200) });
    // Keep the last-good A1 source-health snapshot intact. This auxiliary,
    // manual current-date scan failing must not relabel previously verified
    // official rows as fabricated or unavailable.
    return { status: "ERROR", records: 0, trackedToday: 0, pagesFetched: 0 };
  }
}
