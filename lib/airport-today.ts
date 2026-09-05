import { writeSourceHealth, writeCollectorStatus } from "./collector";
import { buildDataGoKrUrl } from "./data-go-kr.mjs";
import { describeWrites, NO_D1_WRITES, runD1Batches, type D1WriteCounts } from "./d1-write-counts";
import {
  fetchOfficialJson,
  classifySourceFetchFailure,
  isTransientSourceFailure,
  safeSourceFailureDetail,
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
 * pages and persist the official recent-history window from D-3 through the
 * requested KST service date. Future A1 rows remain excluded because A3 owns
 * future schedule semantics.
 *
 * 150 pages = at most 15,000 source rows. Each sequential page may be retried
 * once only after a timeout/5xx, so one manual run has a strict worst-case
 * ceiling of 300 A1 calls, below A1's documented 500-call development quota.
 * The recurring collector remains disabled and must not use this fallback
 * without a separate cadence and quota review.
 */
export const A1_TODAY_PAGE_SIZE = 100;
export const A1_TODAY_MAX_PAGES = 150;
/** Documented ceiling of one primary scan: every page once, plus one retry each. */
export const A1_TODAY_DEFAULT_MAX_REQUESTS = A1_TODAY_MAX_PAGES * 2;

interface AirportTodayEnv {
  DB?: D1Database;
  DATA_GO_KR_SERVICE_KEY?: string;
  /**
   * Hard budget of provider requests for one scan, retries included. The
   * daily recovery window runs with 200 so that a failed primary (≤300) plus
   * its recovery can never exceed A1's documented 500 calls/day. Exceeding
   * the budget aborts the scan before the request is made; nothing stored
   * is touched.
   */
  A1_MAX_REQUESTS?: number;
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
  windowStartDate: string;
  pagesFetched: number;
  /** Provider requests actually issued, retries included. */
  requestsIssued: number;
  totalCount: number;
  sourceRowsInRange: number;
  sourceRowsForDate: number;
  trackedToday: number;
  records: CanonicalAirportFlight[];
}

type OfficialFetcher = (url: URL, options?: { timeoutMs?: number; retries?: number; retryDelayMs?: number }) => Promise<unknown>;

export function kstDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function compactDate(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

function shiftIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
 * then retain D-3 through the requested KST service date. This deliberately scans
 * every declared page so correctness does not depend on undocumented sort
 * order. Calls are sequential to avoid a provider request burst. A page gets
 * at most one retry because the provider has shown intermittent ~10s aborts.
 */
export async function fetchA1DeparturesForDate(
  serviceKey: string,
  targetDate: string,
  fetcher: OfficialFetcher = fetchOfficialJson,
  options: { maxRequests?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<A1TodayFetchResult> {
  const targetYmd = compactDate(targetDate);
  if (!/^\d{8}$/.test(targetYmd)) throw new Error("a1_today_invalid_target_date");
  const windowStartDate = shiftIsoDate(targetDate, -3);
  const windowStartYmd = compactDate(windowStartDate);
  const maxRequests = Math.max(1, Math.min(Math.trunc(options.maxRequests ?? A1_TODAY_DEFAULT_MAX_REQUESTS), A1_TODAY_DEFAULT_MAX_REQUESTS));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let requestsIssued = 0;
  let declaredTotal = 0;
  let totalPages = 0;
  let sourceRowsInRange = 0;
  let sourceRowsForDate = 0;
  const unique = new Map<string, CanonicalAirportFlight>();
  const retrievedAt = new Date().toISOString();

  // One page, at most one retry after a failure, every attempt counted
  // against the request budget BEFORE it is issued. The retry lives here
  // rather than inside the fetcher so the count is exact, not an estimate.
  const fetchPage = async (url: URL, pageNo: number): Promise<unknown> => {
    for (let attempt = 0; ; attempt += 1) {
      if (requestsIssued >= maxRequests) throw new Error(`a1_today_request_budget_${maxRequests}_page_${pageNo}`);
      requestsIssued += 1;
      try {
        return await fetcher(url, { timeoutMs: 30_000, retries: 0 });
      } catch (error) {
        if (attempt >= 1 || !isTransientSourceFailure(classifySourceFetchFailure(error))) throw error;
        // Allow a short gateway outage to recover without adding requests.
        await sleep(20_000);
      }
    }
  };

  for (let pageNo = 1; ; pageNo += 1) {
    if (pageNo > A1_TODAY_MAX_PAGES) throw new Error("a1_today_page_bound_exceeded");
    const url = buildDataGoKrUrl(ENDPOINT, serviceKey, {
      type: "json",
      numOfRows: String(A1_TODAY_PAGE_SIZE),
      pageNo: String(pageNo),
    });
    const payload = await fetchPage(url, pageNo);
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
      if (serviceDate < windowStartYmd || serviceDate > targetYmd) continue;
      sourceRowsInRange += 1;
      if (serviceDate === targetYmd) sourceRowsForDate += 1;
      const record = await normalizeAirportFlight(item, "departure", retrievedAt);
      unique.set(record.physicalFlightId, record);
    }

    if (pageNo >= totalPages) break;
  }

  const records = [...unique.values()];
  return {
    targetDate,
    windowStartDate,
    requestsIssued,
    pagesFetched: totalPages,
    totalCount: declaredTotal,
    sourceRowsInRange,
    sourceRowsForDate,
    trackedToday: records.filter((record) => record.scheduledAt.slice(0, 10) === targetDate).length,
    records,
  };
}

async function persistTodayFlights(db: D1Database | undefined, records: CanonicalAirportFlight[]): Promise<D1WriteCounts> {
  if (!db || !records.length) return NO_D1_WRITES;
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

  return runD1Batches(db, statements);
}

async function recordSuccess(
  db: D1Database | undefined,
  fetched: A1TodayFetchResult,
  changedRows: D1WriteCounts,
): Promise<void> {
  if (!db) return;
  const finishedAt = new Date().toISOString();
  const eventAt = fetched.records.reduce<string | null>((latest, record) => {
    if (!latest || record.scheduledAt > latest) return record.scheduledAt;
    return latest;
  }, null);
  const retrievedAt = fetched.records[0]?.retrievedAt ?? finishedAt;
  const detail = `recent ${fetched.windowStartDate}..${fetched.targetDate}; pages ${fetched.pagesFetched}; requests ${fetched.requestsIssued}; population ${fetched.totalCount}; range rows ${fetched.sourceRowsInRange}; today source rows ${fetched.sourceRowsForDate}; today unique physical ${fetched.trackedToday}; range unique physical ${fetched.records.length}; ${describeWrites(changedRows)}`;

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
      fetched.totalCount,
      changedRows.changedRows,
      detail.slice(0, 500),
    )
    .run();
}

const RECENT_HISTORY_DETAIL_PREFIX = "recent ";
const RECENT_HISTORY_TARGET_DATE_PATTERN = /^recent \d{4}-\d{2}-\d{2}\.\.(\d{4}-\d{2}-\d{2});/;

interface CollectorRunDetailRow {
  detail?: unknown;
}

/**
 * A1 same-day quota guard. Returns true only when a previously SUCCESSFUL
 * run of this verified bounded recent-history scan (`collectAirportFlightsToday`,
 * via `recordSuccess` below) already covered the given KST target date.
 *
 * `recordSuccess` always writes a `collector_runs.detail` starting with
 * "recent {windowStart}..{targetDate};". The legacy first-page-only path
 * (`collectAirportFlights` in lib/collector.ts) writes a differently shaped
 * "normalized N; changed rows N; storage writes N" detail and therefore
 * never matches this
 * pattern — a shallow legacy success can never satisfy this guard. Reads
 * the most recent successful runs only, so this stays a small bounded query.
 */
export async function hasCompleteA1RecentHistoryToday(
  db: D1Database | undefined,
  targetDate: string,
): Promise<boolean> {
  if (!db) return false;
  const result = (await db
    .prepare(`SELECT detail FROM collector_runs WHERE source_id = ? AND status = 'SUCCESS' ORDER BY started_at DESC LIMIT 10`)
    .bind(SOURCE_ID)
    .run()) as unknown as { results?: CollectorRunDetailRow[] };
  const rows = result.results ?? [];
  return rows.some((row) => {
    const detail = typeof row.detail === "string" ? row.detail : "";
    if (!detail.startsWith(RECENT_HISTORY_DETAIL_PREFIX)) return false;
    return RECENT_HISTORY_TARGET_DATE_PATTERN.exec(detail)?.[1] === targetDate;
  });
}

export async function collectAirportFlightsToday(
  env: AirportTodayEnv,
  now = new Date(),
  fetcher: OfficialFetcher = fetchOfficialJson,
): Promise<{ status: string; records: number; trackedToday: number; pagesFetched: number }> {
  if (!env.DATA_GO_KR_SERVICE_KEY) {
    await writeSourceHealth(env.DB, SOURCE_ID, "MISSING", "DATA_GO_KR_SERVICE_KEY is not configured");
    return { status: "NEEDS_KEY", records: 0, trackedToday: 0, pagesFetched: 0 };
  }

  const targetDate = kstDate(now);
  try {
    const fetched = await fetchA1DeparturesForDate(env.DATA_GO_KR_SERVICE_KEY, targetDate, fetcher, { maxRequests: env.A1_MAX_REQUESTS });
    if (!fetched.records.length) throw new Error(`a1_today_no_rows_${targetDate}`);
    if (!fetched.trackedToday) throw new Error(`a1_today_no_current_rows_${targetDate}`);
    const changedRows = await persistTodayFlights(env.DB, fetched.records);
    await recordSuccess(env.DB, fetched, changedRows);
    return {
      status: "SUCCESS",
      records: changedRows.changedRows,
      trackedToday: fetched.trackedToday,
      pagesFetched: fetched.pagesFetched,
    };
  } catch (error) {
    const detail = safeSourceFailureDetail(error);
    console.error("airport_today_collector_failed", { sourceId: SOURCE_ID, error: detail.slice(0, 200) });
    // A failed refresh changes health, never the last-good rows or timestamps.
    await writeCollectorStatus(env.DB, SOURCE_ID, "ERROR", detail);
    await writeSourceHealth(env.DB, SOURCE_ID, "ERROR", detail);
    return { status: "ERROR", records: 0, trackedToday: 0, pagesFetched: 0 };
  }
}
