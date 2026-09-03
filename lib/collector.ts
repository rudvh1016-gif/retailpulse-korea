import {
  DATA_GO_KR_LOW_CALL_POLICY,
  DATA_GO_KR_PAGED_POLICY,
  KMA_GRID_RETRY_POLICY,
  fetchOfficialJson,
  normalizeAirportCongestion,
  normalizeAirportCongestionT2,
  normalizeAirportFlight,
  normalizeAirportPassengerForecastRow,
  normalizeScheduledAirportFlight,
  normalizeEstimatedSales,
  normalizeSeoulRealtime,
  normalizeSeoulRealtimeCommercial,
  normalizeTourismEvent,
  normalizeTourismEventDetail,
  normalizeWeatherForecast,
  redactSeoulUrl,
  redactServiceKey,
  safeSourceFailureDetail,
  type CanonicalAirportCongestion,
  type CanonicalAirportFlight,
  type CanonicalAirportPassengerForecastRow,
  type CanonicalScheduledAirportFlight,
  type CanonicalEstimatedSales,
  type CanonicalSeoulRealtime,
  type CanonicalSeoulRealtimeCommercial,
  type CanonicalTourismEvent,
  type CanonicalWeatherForecast,
  type TourismEventDetail,
} from "./source-adapters";
import { buildDataGoKrUrl } from "./data-go-kr.mjs";
import { describeWrites, NO_D1_WRITES, runD1Batches, type D1WriteCounts } from "./d1-write-counts";
import { allAreaIds, areaMappings, distanceMeters, uniqueKmaGrids, type AreaId } from "./areas";
import { summarizeTodayPassengerForecast, type AirportForecastAggregateRow } from "./airport-today-summary";
import { sha256 } from "./hash";
import {
  aggregateSeoulForeignByArea,
  normalizeSeoulForeignRows,
  SEOUL_FOREIGN_SOURCE_ID,
  type CanonicalSeoulForeignArea,
  type CanonicalSeoulForeignDong,
} from "./seoul-foreign";
import {
  aggregateForeignPurposeMobility,
  FOREIGN_PURPOSE_DATASET_ID,
  FOREIGN_PURPOSE_MAPPING_VERSION,
  FOREIGN_PURPOSE_SCHEMA_VERSION,
  FOREIGN_PURPOSE_SOURCE_ID,
  type ForeignPurposeMobilitySource,
} from "./foreign-purpose-mobility";
import {
  createSeoulSubwayRidershipSource,
  normalizeSubwayRidershipPayload,
  SEOUL_SUBWAY_DATASET_ID,
  SEOUL_SUBWAY_MAPPING_VERSION,
  SEOUL_SUBWAY_SCHEMA_VERSION,
  SEOUL_SUBWAY_SOURCE_ID,
  SUBWAY_STATION_REQUESTS,
  subwayBackfillDates,
  type SubwayRidershipSource,
} from "./subway-ridership";
import {
  STORE_DYNAMICS_DATASET_ID,
  STORE_DYNAMICS_MAPPING_VERSION,
  STORE_DYNAMICS_SCHEMA_VERSION,
  STORE_DYNAMICS_SOURCE_ID,
  aggregateStoreDynamicsRows,
  isValidStoredStoreDynamicsRow,
  normalizeStoreDynamicsRow,
  parseStoreDynamicsResponse,
  storeDynamicsMappings,
  storeDynamicsQuarterCandidates,
  type CanonicalStoreDynamicsAggregate,
} from "./store-dynamics";
import { kstDayOf, shiftKstDay } from "./kst";

export interface CollectorEnv {
  DB?: D1Database;
  DATA_GO_KR_SERVICE_KEY?: string;
  SEOUL_OPEN_DATA_KEY?: string;
  KMA_SERVICE_KEY?: string;
  FOREIGN_PURPOSE_SOURCE?: ForeignPurposeMobilitySource;
  SUBWAY_RIDERSHIP_SOURCE?: SubwayRidershipSource;
  retainChangeHistory?: boolean;
  /** Hard request budget for one A1 scan (recovery windows use a smaller one). */
  A1_MAX_REQUESTS?: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

let lastCollectorStartedAtMs = 0;

function uniqueCollectorStartedAt(): string {
  const timestamp = Math.max(Date.now(), lastCollectorStartedAtMs + 1);
  lastCollectorStartedAtMs = timestamp;
  return new Date(timestamp).toISOString();
}

export async function writeCollectorStatus(
  db: D1Database | undefined,
  sourceId: string,
  status: string,
  detail: string,
  recordsRead = 0,
  recordsWritten = 0,
): Promise<void> {
  if (!db) return;
  await db.prepare(`INSERT INTO collector_runs (run_id, source_id, started_at, finished_at, status, records_read, records_written, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), sourceId, uniqueCollectorStartedAt(), nowIso(), status, recordsRead, recordsWritten, detail.slice(0, 500))
    .run();
}

interface HealthSnapshot {
  eventAt?: string | null;
  publishedAt?: string | null;
  retrievedAt: string;
  schemaVersion: string;
}

export async function writeSourceHealth(
  db: D1Database | undefined,
  sourceId: string,
  status: SourceHealthStatus,
  detail: string,
  record?: HealthSnapshot,
): Promise<void> {
  if (!db) return;
  await db.prepare(`INSERT INTO source_health (
      source_id, status, last_event_at, last_published_at, last_retrieved_at,
      consecutive_failures, schema_version, detail, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET
      status = excluded.status,
      last_event_at = COALESCE(excluded.last_event_at, source_health.last_event_at),
      last_published_at = COALESCE(excluded.last_published_at, source_health.last_published_at),
      last_retrieved_at = COALESCE(excluded.last_retrieved_at, source_health.last_retrieved_at),
      consecutive_failures = CASE WHEN excluded.status IN ('ERROR', 'STALE') THEN source_health.consecutive_failures + 1 ELSE 0 END,
      schema_version = CASE WHEN excluded.schema_version = 'unavailable' THEN source_health.schema_version ELSE excluded.schema_version END,
      detail = excluded.detail,
      updated_at = excluded.updated_at`)
    .bind(
      sourceId,
      status,
      record?.eventAt ?? null,
      record?.publishedAt ?? null,
      record?.retrievedAt ?? null,
      status === "ERROR" ? 1 : 0,
      record?.schemaVersion ?? "unavailable",
      detail.slice(0, 500),
      nowIso(),
    )
    .run();
}

async function persistAirportFlights(db: D1Database | undefined, records: CanonicalAirportFlight[], retainChangeHistory: boolean): Promise<D1WriteCounts> {
  if (!db || !records.length) return NO_D1_WRITES;
  const statements: D1PreparedStatement[] = [];
  for (const record of records) {
    const id = record.physicalFlightId;
    if (retainChangeHistory) statements.push(db.prepare(`INSERT INTO airport_flight_changes (
        id, source_id, direction, flight_number, scheduled_at, changed_at,
        terminal, gate, checkin_counter, status, semantic_hash, observed_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM airport_flights
        WHERE source_id = ? AND flight_number = ? AND direction = ? AND scheduled_at = ?
          AND source_hash = ?
      )
      ON CONFLICT(source_id, flight_number, direction, scheduled_at, semantic_hash) DO NOTHING`)
      .bind(
        crypto.randomUUID(),
        record.sourceId,
        record.direction,
        record.flightNumber,
        record.scheduledAt,
        record.changedAt,
        record.terminal,
        record.gate,
        record.checkinCounter,
        record.status,
        record.sourceHash,
        record.retrievedAt,
        record.sourceId,
        record.flightNumber,
        record.direction,
        record.scheduledAt,
        record.sourceHash,
      ));
    statements.push(db.prepare(`INSERT INTO airport_flights (
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
        id,
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
  }

  return runD1Batches(db, statements);
}

export async function collectAirportFlights(env: CollectorEnv): Promise<{ status: string; records: number }> {
  if (!env.DATA_GO_KR_SERVICE_KEY) {
    await writeCollectorStatus(env.DB, "INCHEON_FLIGHT_DETAIL", "NEEDS_KEY", "DATA_GO_KR_SERVICE_KEY is not configured");
    await writeSourceHealth(env.DB, "INCHEON_FLIGHT_DETAIL", "MISSING", "DATA_GO_KR_SERVICE_KEY is not configured");
    return { status: "NEEDS_KEY", records: 0 };
  }

  const url = buildDataGoKrUrl(
    "https://apis.data.go.kr/B551177/statusOfAllFltDeOdp/getFltDeparturesDeOdp",
    env.DATA_GO_KR_SERVICE_KEY,
    // The official gateway returns the 11k-row D-3..D+6 population when the
    // request is unfiltered. A 1,000-row page repeatedly hit its ~10s upstream
    // timeout in GitHub Actions, while bounded samples returned normally.
    { type: "json", numOfRows: "100", pageNo: "1" },
  );

  try {
    const payload = await fetchOfficialJson(url, { timeoutMs: 30_000, retries: 0 });
    const root = payload as { response?: { header?: { resultCode?: string }; body?: { items?: unknown[] | { item?: unknown[] | unknown } } } };
    if (root?.response?.header?.resultCode !== "00") throw new Error(`airport_result_${String(root?.response?.header?.resultCode ?? "missing")}`);
    const items = dataGoKrItems(root?.response?.body);
    if (!items.length) throw new Error("airport_no_data");
    const retrievedAt = nowIso();
    const normalized = await Promise.all(items.map((item) => normalizeAirportFlight(item, "departure", retrievedAt)));
    const written = await persistAirportFlights(env.DB, normalized, env.retainChangeHistory === true);
    await writeSourceHealth(env.DB, "INCHEON_FLIGHT_DETAIL", "LIVE", `normalized ${normalized.length}; ${describeWrites(written)}`, normalized.at(-1));
    await writeCollectorStatus(env.DB, "INCHEON_FLIGHT_DETAIL", "SUCCESS", `normalized ${normalized.length}; ${describeWrites(written)}`, items.length, written.changedRows);
    return { status: "SUCCESS", records: written.changedRows };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "collector_error";
    console.error("airport_collector_failed", { sourceId: "INCHEON_FLIGHT_DETAIL", error: detail });
    await writeCollectorStatus(env.DB, "INCHEON_FLIGHT_DETAIL", "ERROR", detail);
    await writeSourceHealth(env.DB, "INCHEON_FLIGHT_DETAIL", "ERROR", detail);
    return { status: "ERROR", records: 0 };
  }
}

/** A2 validates and enriches A1 rows; it never inserts a second physical flight. */
export async function collectAirportFlightEnrichment(env: CollectorEnv): Promise<CollectorResult> {
  const sourceId = "INCHEON_DUTY_FREE_ACTUAL";
  if (!env.DATA_GO_KR_SERVICE_KEY) {
    await writeCollectorStatus(env.DB, sourceId, "NEEDS_KEY", "DATA_GO_KR_SERVICE_KEY is not configured");
    await writeSourceHealth(env.DB, sourceId, "MISSING", "DATA_GO_KR_SERVICE_KEY is not configured");
    return { status: "NEEDS_KEY", records: 0 };
  }
  const url = buildDataGoKrUrl(
    "https://apis.data.go.kr/B551177/statusOfAPaxFlt4DutyFree/getAPaxFlt4DutyFreeDepartures",
    env.DATA_GO_KR_SERVICE_KEY,
    { type: "json", numOfRows: "100", pageNo: "1" },
  );
  try {
    const payload = await fetchOfficialJson(url, DATA_GO_KR_LOW_CALL_POLICY);
    const root = payload as { response?: { header?: { resultCode?: string }; body?: { items?: unknown[] | { item?: unknown[] | unknown } } } };
    if (root?.response?.header?.resultCode !== "00") throw new Error(`airport_a2_result_${String(root?.response?.header?.resultCode ?? "missing")}`);
    const items = dataGoKrItems(root?.response?.body);
    if (!items.length) throw new Error("airport_a2_no_data");
    const retrievedAt = nowIso();
    const normalized = await Promise.all(items.map((item) => normalizeAirportFlight(item, "departure", retrievedAt, sourceId)));
    const statements = normalized.map((record) => env.DB?.prepare(`UPDATE airport_flights SET
        upstream_fid = COALESCE(upstream_fid, ?),
        master_flight_number = COALESCE(master_flight_number, ?),
        codeshare = COALESCE(codeshare, ?),
        airline_code = COALESCE(airline_code, ?),
        airport_code = COALESCE(airport_code, ?),
        terminal = COALESCE(terminal, ?),
        a2_source_hash = ?
      WHERE physical_flight_id = ? AND COALESCE(a2_source_hash, '') <> ?`)
      .bind(record.upstreamFid, record.masterFlightNumber, record.codeshare, record.airlineCode, record.airportCode, record.terminal, record.sourceHash, record.physicalFlightId, record.sourceHash))
      .filter((statement): statement is D1PreparedStatement => Boolean(statement));
    const matched = env.DB && statements.length ? await runBatches(env.DB, statements) : NO_D1_WRITES;
    const detail = `A1_PRIMARY_A2_ENRICHMENT; compared ${normalized.length}; ${describeWrites(matched)}`;
    await writeCollectorStatus(env.DB, sourceId, "SUCCESS", detail, normalized.length, matched.changedRows);
    await writeSourceHealth(env.DB, sourceId, "LIVE", detail, { retrievedAt, schemaVersion: "airport-a2-enrichment-v1" });
    return { status: "SUCCESS", records: matched.changedRows, detail };
  } catch (error) {
    const detail = safeSourceFailureDetail(error);
    await writeCollectorStatus(env.DB, sourceId, "ERROR", detail);
    await writeSourceHealth(env.DB, sourceId, "ERROR", detail);
    return { status: "ERROR", records: 0, detail };
  }
}

/** A3 is future schedule data and has its own table/model. */
export async function collectScheduledAirportFlights(env: CollectorEnv): Promise<CollectorResult> {
  const sourceId = "INCHEON_SCHEDULED_DUTY_FREE";
  if (!env.DATA_GO_KR_SERVICE_KEY) {
    await writeCollectorStatus(env.DB, sourceId, "NEEDS_KEY", "DATA_GO_KR_SERVICE_KEY is not configured");
    await writeSourceHealth(env.DB, sourceId, "MISSING", "DATA_GO_KR_SERVICE_KEY is not configured");
    return { status: "NEEDS_KEY", records: 0 };
  }
  const url = buildDataGoKrUrl(
    "https://apis.data.go.kr/B551177/statusOfSPaxFlt4DutyFree/getSPaxFlt4DutyFreeDepartures",
    env.DATA_GO_KR_SERVICE_KEY,
    { type: "json", numOfRows: "100", pageNo: "1" },
  );
  try {
    const payload = await fetchOfficialJson(url, DATA_GO_KR_LOW_CALL_POLICY);
    const root = payload as { response?: { header?: { resultCode?: string }; body?: { items?: unknown[] | { item?: unknown[] | unknown } } } };
    if (root?.response?.header?.resultCode !== "00") throw new Error(`airport_a3_result_${String(root?.response?.header?.resultCode ?? "missing")}`);
    const items = dataGoKrItems(root?.response?.body);
    if (!items.length) throw new Error("airport_a3_no_data");
    const retrievedAt = nowIso();
    const normalized: CanonicalScheduledAirportFlight[] = await Promise.all(items.map((item) => normalizeScheduledAirportFlight(item, retrievedAt)));
    const statements = normalized.map((record) => env.DB?.prepare(`INSERT INTO airport_scheduled_flights (
        physical_schedule_id, source_id, upstream_fid, season, valid_from, valid_to, weekdays,
        flight_number, master_flight_number, codeshare, airline, airline_code, airport, airport_code,
        terminal, scheduled_time, retrieved_at, schema_version, quality_status, source_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(physical_schedule_id) DO UPDATE SET
        valid_from = excluded.valid_from, valid_to = excluded.valid_to, weekdays = excluded.weekdays,
        airline = excluded.airline, airline_code = excluded.airline_code, airport = excluded.airport,
        airport_code = excluded.airport_code, terminal = excluded.terminal, retrieved_at = excluded.retrieved_at,
        quality_status = excluded.quality_status, source_hash = excluded.source_hash
      WHERE airport_scheduled_flights.source_hash <> excluded.source_hash`)
      .bind(record.physicalScheduleId, sourceId, record.upstreamFid, record.season, record.validFrom, record.validTo,
        JSON.stringify(record.weekdays), record.flightNumber, record.masterFlightNumber, record.codeshare,
        record.airline, record.airlineCode, record.airport, record.airportCode, record.terminal,
        record.scheduledTime, record.retrievedAt, record.schemaVersion, record.qualityStatus, record.sourceHash))
      .filter((statement): statement is D1PreparedStatement => Boolean(statement));
    const written = env.DB && statements.length ? await runBatches(env.DB, statements) : NO_D1_WRITES;
    const detail = `future schedule ${normalized.length}; ${describeWrites(written)}`;
    await writeCollectorStatus(env.DB, sourceId, "SUCCESS", detail, normalized.length, written.changedRows);
    await writeSourceHealth(env.DB, sourceId, "LIVE", detail, { retrievedAt, schemaVersion: "airport-schedule-v1" });
    return { status: "SUCCESS", records: written.changedRows, detail };
  } catch (error) {
    const detail = safeSourceFailureDetail(error);
    await writeCollectorStatus(env.DB, sourceId, "ERROR", detail);
    await writeSourceHealth(env.DB, sourceId, "ERROR", detail);
    return { status: "ERROR", records: 0, detail };
  }
}

const runBatches = runD1Batches;

export interface CollectorResult {
  status: "SUCCESS" | "PARTIAL" | "ERROR" | "NEEDS_KEY" | "NO_DATA" | "SKIPPED_NO_NEW_PUBLICATION";
  records: number;
  /** Secret-free operational detail safe for collector_runs and Actions logs. */
  detail?: string;
  /** How many requests actually reached the provider. 0 proves a run was free. */
  providerRequests?: number;
  /** What source_health was set to, so a run's log states it without a re-read. */
  sourceHealth?: SourceHealthStatus;
  /** True when usable stored rows survived this run. Never guessed. */
  lastGoodPreserved?: boolean;
}

/**
 * Whether a targeted (recovery) collection ran, and what it may assume.
 *
 * `hasUsableLastGood` is supplied by a recovery runner that has already read
 * D1, so the collector does not repeat that read. When it is absent the
 * collector checks for itself, but only on the failure path.
 */
export interface TargetedCollectionOptions {
  mode?: "PRIMARY" | "RECOVERY";
  hasUsableLastGood?: boolean;
}

/**
 * Source health answers "is the data usable right now", which is a different
 * question from "did this run succeed" (that is collector_runs).
 *
 *  LIVE  — the required coverage was collected successfully.
 *  STALE — this attempt failed or was incomplete, but stored data is usable.
 *  ERROR — nothing usable is stored either, or the failure is permanent.
 *
 * Writing LIVE after a partial collection is what let a half-collected day
 * look healthy, so a known-incomplete run is never LIVE.
 */
export type SourceHealthStatus = "LIVE" | "STALE" | "MISSING" | "ERROR" | "OFFICIAL_HISTORICAL";

/** True when the table already holds at least one row. Failure path only. */
async function hasStoredRow(db: D1Database | undefined, sql: string): Promise<boolean> {
  if (!db) return false;
  try {
    const result = await db.prepare(sql).all<Record<string, unknown>>();
    return (result.results ?? []).length > 0;
  } catch {
    return false;
  }
}

function dataGoKrItems(body: { items?: unknown[] | { item?: unknown[] | unknown } } | undefined): unknown[] {
  const raw = Array.isArray(body?.items) ? body.items : body?.items?.item;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

function seoulEnvelopeRows(payload: unknown, serviceName: string): Record<string, unknown>[] {
  const root = payload as Record<string, unknown> | null;
  const service = root?.[serviceName] as Record<string, unknown> | undefined;
  const resultBlock = (service?.RESULT ?? root?.RESULT ?? {}) as Record<string, unknown>;
  const code = resultBlock.CODE ?? resultBlock["RESULT.CODE"];
  if (code !== "INFO-000") throw new Error(`seoul_result_${String(code ?? "missing")}`);
  const rows = service?.row ?? root?.[serviceName];
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

function seoulIntegratedCitydata(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("seoul_citydata_schema");
  const root = payload as Record<string, unknown>;
  const result = root.RESULT && typeof root.RESULT === "object" && !Array.isArray(root.RESULT)
    ? root.RESULT as Record<string, unknown>
    : {};
  const code = result["RESULT.CODE"] ?? result.CODE;
  if (code !== "INFO-000") throw new Error(`seoul_result_${String(code ?? "missing")}`);
  if (!root.CITYDATA || typeof root.CITYDATA !== "object" || Array.isArray(root.CITYDATA)) {
    throw new Error("seoul_citydata_schema");
  }
  return root.CITYDATA as Record<string, unknown>;
}

function integratedPopulationRecord(citydata: Record<string, unknown>): Record<string, unknown> {
  const rows = citydata.LIVE_PPLTN_STTS;
  if (!Array.isArray(rows) || !rows[0] || typeof rows[0] !== "object" || Array.isArray(rows[0])) {
    throw new Error("seoul_population_empty");
  }
  return {
    ...(rows[0] as Record<string, unknown>),
    AREA_CD: citydata.AREA_CD,
    AREA_NM: citydata.AREA_NM,
  };
}

// OA-21285 integrated city data: one bounded call per target area fans out to
// independently healthy population and domestic-card commercial records.
export async function collectSeoulRealtime(env: CollectorEnv): Promise<CollectorResult> {
  const populationSourceId = "SEOUL_CITYDATA_PPLTN";
  const commercialSourceId = "SEOUL_CITYDATA_CMRCL";
  if (!env.SEOUL_OPEN_DATA_KEY) {
    for (const sourceId of [populationSourceId, commercialSourceId]) {
      await writeCollectorStatus(env.DB, sourceId, "NEEDS_KEY", "SEOUL_OPEN_DATA_KEY is not configured");
      await writeSourceHealth(env.DB, sourceId, "MISSING", "SEOUL_OPEN_DATA_KEY is not configured");
    }
    return { status: "NEEDS_KEY", records: 0 };
  }

  const populationStatements: D1PreparedStatement[] = [];
  const commercialStatements: D1PreparedStatement[] = [];
  const populationFailures: string[] = [];
  const commercialFailures: string[] = [];
  let lastPopulation: CanonicalSeoulRealtime | undefined;
  let lastCommercial: CanonicalSeoulRealtimeCommercial | undefined;

  const failureDetail = (areaId: AreaId, error: unknown) => `${areaId}: ${safeSourceFailureDetail(error)}`;
  for (const areaId of allAreaIds) {
    const mapping = areaMappings[areaId];
    const url = new URL(`http://openapi.seoul.go.kr:8088/${env.SEOUL_OPEN_DATA_KEY}/json/citydata/1/5/${mapping.seoulPoiCode}`);
    let citydata: Record<string, unknown>;
    try {
      const payload = await fetchOfficialJson(url, { timeoutMs: 8_000, retries: 1 });
      citydata = seoulIntegratedCitydata(payload);
    } catch (error) {
      const detail = failureDetail(areaId, error);
      populationFailures.push(detail);
      commercialFailures.push(detail);
      continue;
    }

    const retrievedAt = nowIso();
    try {
      const { observed, forecasts } = await normalizeSeoulRealtime(integratedPopulationRecord(citydata), areaId, retrievedAt);
      lastPopulation = observed;
      if (env.DB) {
        populationStatements.push(env.DB.prepare(`INSERT INTO seoul_realtime_area (
            id, source_id, record_origin, area, area_code, area_name,
            congestion_level, congestion_label, population_min, population_max,
            observed_at, retrieved_at, freshness, schema_version, quality_status, source_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_id, area, observed_at) DO UPDATE SET
            congestion_level = excluded.congestion_level,
            congestion_label = excluded.congestion_label,
            population_min = excluded.population_min,
            population_max = excluded.population_max,
            retrieved_at = excluded.retrieved_at,
            quality_status = excluded.quality_status,
            source_hash = excluded.source_hash
          WHERE seoul_realtime_area.source_hash <> excluded.source_hash`)
          .bind(
            await sha256({ sourceId: populationSourceId, area: areaId, observedAt: observed.observedAt }),
            populationSourceId, observed.recordOrigin, areaId, observed.areaCode, observed.areaName,
            observed.congestionLevel, observed.congestionLabel, observed.populationMin, observed.populationMax,
            observed.observedAt, observed.retrievedAt, observed.freshness, observed.schemaVersion,
            observed.qualityStatus, observed.sourceHash,
          ));
        for (const forecast of forecasts) {
          populationStatements.push(env.DB.prepare(`INSERT INTO seoul_realtime_forecast (
              id, source_id, area, issued_at, target_at, congestion_level, congestion_label,
              population_min, population_max, retrieved_at, schema_version, quality_status, source_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_id, area, issued_at, target_at) DO NOTHING`)
            .bind(
              await sha256({ sourceId: populationSourceId, area: areaId, issuedAt: forecast.issuedAt, targetAt: forecast.targetAt }),
              populationSourceId, areaId, forecast.issuedAt, forecast.targetAt, forecast.congestionLevel, forecast.congestionLabel,
              forecast.populationMin, forecast.populationMax, forecast.retrievedAt, forecast.schemaVersion,
              forecast.qualityStatus, forecast.sourceHash,
            ));
        }
      }
    } catch (error) {
      populationFailures.push(failureDetail(areaId, error));
    }

    try {
      const commercial = await normalizeSeoulRealtimeCommercial(citydata, areaId, retrievedAt);
      lastCommercial = commercial;
      if (env.DB) {
        commercialStatements.push(env.DB.prepare(`INSERT INTO seoul_realtime_commercial (
            id, source_id, record_origin, area, area_code, area_name,
            commercial_level, payment_count, payment_amount_min, payment_amount_max,
            observed_at, retrieved_at, freshness, schema_version, quality_status, source_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_id, area, observed_at) DO UPDATE SET
            commercial_level = excluded.commercial_level,
            payment_count = excluded.payment_count,
            payment_amount_min = excluded.payment_amount_min,
            payment_amount_max = excluded.payment_amount_max,
            retrieved_at = excluded.retrieved_at,
            quality_status = excluded.quality_status,
            source_hash = excluded.source_hash
          WHERE seoul_realtime_commercial.source_hash <> excluded.source_hash`)
          .bind(
            await sha256({ sourceId: commercialSourceId, area: areaId, observedAt: commercial.observedAt }),
            commercialSourceId, commercial.recordOrigin, areaId, commercial.areaCode, commercial.areaName,
            commercial.commercialLevel, commercial.paymentCount, commercial.paymentAmountMin, commercial.paymentAmountMax,
            commercial.observedAt, commercial.retrievedAt, commercial.freshness, commercial.schemaVersion,
            commercial.qualityStatus, commercial.sourceHash,
          ));
      }
    } catch (error) {
      commercialFailures.push(failureDetail(areaId, error));
    }
  }

  const populationWritten = env.DB && populationStatements.length ? await runBatches(env.DB, populationStatements) : NO_D1_WRITES;
  const commercialWritten = env.DB && commercialStatements.length ? await runBatches(env.DB, commercialStatements) : NO_D1_WRITES;

  const finalize = async (
    sourceId: string,
    table: string,
    failures: string[],
    written: D1WriteCounts,
    lastRecord: HealthSnapshot | undefined,
  ): Promise<"SUCCESS" | "PARTIAL" | "ERROR"> => {
    const okCount = allAreaIds.length - failures.length;
    const detail = `areas ok ${okCount}/${allAreaIds.length}; ${describeWrites(written)}${failures.length ? `; failed ${failures.join(" | ")}` : ""}`;
    const collectorStatus = okCount === allAreaIds.length ? "SUCCESS" : okCount > 0 ? "PARTIAL" : "ERROR";
    const hasUsable = okCount > 0 || await hasStoredRow(env.DB, `SELECT 1 FROM ${table} LIMIT 1`);
    const health: SourceHealthStatus = okCount === allAreaIds.length ? "LIVE" : hasUsable ? "STALE" : "ERROR";
    await writeCollectorStatus(env.DB, sourceId, collectorStatus, detail, okCount, written.changedRows);
    await writeSourceHealth(env.DB, sourceId, health, detail, lastRecord);
    return collectorStatus;
  };

  const populationStatus = await finalize(populationSourceId, "seoul_realtime_area", populationFailures, populationWritten, lastPopulation);
  const commercialStatus = await finalize(commercialSourceId, "seoul_realtime_commercial", commercialFailures, commercialWritten, lastCommercial);
  const status = populationStatus === "SUCCESS" && commercialStatus === "SUCCESS"
    ? "SUCCESS"
    : populationStatus === "ERROR" && commercialStatus === "ERROR" ? "ERROR" : "PARTIAL";
  return { status, records: populationWritten.changedRows + commercialWritten.changedRows };
}

const SEOUL_FOREIGN_PERIOD_LOOKBACK_DAYS = 62;

export interface SeoulForeignPeriod {
  ymd: string;
  tt: "23";
}

// OA-23018 is published daily but does not guarantee response ordering or an
// exact availability lag. Probe the last completed hour newest-first across
// the documented recent-two-month OpenAPI window, bounded to 62 KST days.
export function seoulForeignPeriodCandidates(now: Date = new Date()): SeoulForeignPeriod[] {
  if (!Number.isFinite(now.getTime())) throw new Error("invalid_seoul_foreign_candidate_time");
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const kstDay = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  return Array.from({ length: SEOUL_FOREIGN_PERIOD_LOOKBACK_DAYS }, (_, index) => {
    const candidate = new Date(kstDay - (index + 1) * 86_400_000);
    return { ymd: candidate.toISOString().slice(0, 10).replaceAll("-", ""), tt: "23" as const };
  });
}

async function persistSeoulForeignPresence(
  db: D1Database | undefined,
  dongRows: readonly CanonicalSeoulForeignDong[],
  areaRows: readonly CanonicalSeoulForeignArea[],
): Promise<D1WriteCounts> {
  if (!db) return NO_D1_WRITES;
  const statements: D1PreparedStatement[] = [];
  for (const record of dongRows) {
    statements.push(db.prepare(`INSERT INTO seoul_foreign_presence_dong (
        id, source_id, product_version, record_origin, administrative_dong_code,
        reference_at, available_at, retrieved_at, value, unit, nationality_json,
        schema_version, quality_status, source_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id, product_version, administrative_dong_code, reference_at) DO UPDATE SET
        retrieved_at = excluded.retrieved_at,
        value = excluded.value,
        nationality_json = excluded.nationality_json,
        schema_version = excluded.schema_version,
        quality_status = excluded.quality_status,
        source_hash = excluded.source_hash
      WHERE seoul_foreign_presence_dong.source_hash <> excluded.source_hash`)
      .bind(
        await sha256({ sourceId: record.sourceId, productVersion: record.productVersion, dong: record.administrativeDongCode, referenceAt: record.referenceAt }),
        record.sourceId, record.productVersion, "OFFICIAL_HISTORICAL", record.administrativeDongCode,
        record.referenceAt, null, record.retrievedAt, record.value, record.unit,
        JSON.stringify(record.nationalityValues), record.schemaVersion, "VALID", record.sourceHash,
      ));
  }
  for (const record of areaRows) {
    statements.push(db.prepare(`INSERT INTO seoul_foreign_presence_area (
        id, source_id, product_version, record_origin, area, reference_at,
        available_at, retrieved_at, value, unit, administrative_dong_codes_json,
        mapping_version, schema_version, quality_status, source_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id, product_version, mapping_version, area, reference_at) DO UPDATE SET
        retrieved_at = excluded.retrieved_at,
        value = excluded.value,
        administrative_dong_codes_json = excluded.administrative_dong_codes_json,
        schema_version = excluded.schema_version,
        quality_status = excluded.quality_status,
        source_hash = excluded.source_hash
      WHERE seoul_foreign_presence_area.source_hash <> excluded.source_hash`)
      .bind(
        await sha256({ sourceId: record.sourceId, productVersion: record.productVersion, mappingVersion: record.mappingVersion, area: record.area, referenceAt: record.referenceAt }),
        record.sourceId, record.productVersion, "OFFICIAL_HISTORICAL", record.area, record.referenceAt,
        null, record.retrievedAt, record.value, record.unit, JSON.stringify(record.administrativeDongCodes),
        record.mappingVersion, record.schemaVersion, "VALID", record.sourceHash,
      ));
  }
  return statements.length ? runBatches(db, statements) : NO_D1_WRITES;
}

// S2 — probe a maximum of 62 completed-day candidates and require every
// configured representative dong for one period. This is bounded to 62 * N
// targeted calls and never sweeps or trusts the ordering of the full dataset.
export async function collectSeoulForeignPresence(env: CollectorEnv, now: Date = new Date()): Promise<CollectorResult> {
  const sourceId = SEOUL_FOREIGN_SOURCE_ID;
  if (!env.SEOUL_OPEN_DATA_KEY) {
    await writeCollectorStatus(env.DB, sourceId, "NEEDS_KEY", "SEOUL_OPEN_DATA_KEY is not configured");
    await writeSourceHealth(env.DB, sourceId, "MISSING", "SEOUL_OPEN_DATA_KEY is not configured");
    return { status: "NEEDS_KEY", records: 0 };
  }
  try {
    const base = `http://openapi.seoul.go.kr:8088/${env.SEOUL_OPEN_DATA_KEY}/json/Spop250mFornTempDong`;
    const configuredCodes = [...new Set(allAreaIds.flatMap((area) => areaMappings[area].seoulAdministrativeDongCodes))];
    let selectedPeriod: SeoulForeignPeriod | undefined;
    let rawRows: Record<string, unknown>[] = [];
    for (const candidate of seoulForeignPeriodCandidates(now)) {
      const candidateRows: Record<string, unknown>[] = [];
      let complete = true;
      for (const code of configuredCodes) {
        const payload = await fetchOfficialJson(new URL(`${base}/1/1000/${candidate.ymd}/${candidate.tt}/${code}`), { timeoutMs: 8_000, retries: 1 });
        let rows: Record<string, unknown>[];
        try {
          rows = seoulEnvelopeRows(payload, "Spop250mFornTempDong")
            .filter((row) => String(row.YMD) === candidate.ymd && String(row.TT) === candidate.tt && String(row.H_DNG_CD) === code);
        } catch (error) {
          if (error instanceof Error && error.message.includes("INFO-200")) {
            complete = false;
            break;
          }
          throw error;
        }
        if (rows.length > 1) throw new Error(`seoul_foreign_duplicate_dong_${code}`);
        if (rows.length === 0) {
          complete = false;
          break;
        }
        candidateRows.push(rows[0]);
      }
      if (complete && candidateRows.length === configuredCodes.length) {
        selectedPeriod = candidate;
        rawRows = candidateRows;
        break;
      }
    }
    if (!selectedPeriod) throw new Error("seoul_foreign_no_complete_period");
    const { ymd, tt } = selectedPeriod;

    const retrievedAt = nowIso();
    const dongRows = await normalizeSeoulForeignRows(rawRows, retrievedAt);
    const mapping = Object.fromEntries(allAreaIds.map((area) => [area, areaMappings[area].seoulAdministrativeDongCodes])) as Record<(typeof allAreaIds)[number], readonly string[]>;
    const areaRows = await aggregateSeoulForeignByArea(dongRows, mapping);
    const written = await persistSeoulForeignPresence(env.DB, dongRows, areaRows);
    const lastRecord = areaRows.at(-1);
    const detail = `period ${ymd}/${tt}; dongs ${dongRows.length}/${configuredCodes.length}; areas ${areaRows.length}/${allAreaIds.length}; ${describeWrites(written)}`;
    await writeCollectorStatus(env.DB, sourceId, "SUCCESS", detail, rawRows.length, written.changedRows);
    await writeSourceHealth(env.DB, sourceId, "OFFICIAL_HISTORICAL", detail, lastRecord ? {
      eventAt: lastRecord.referenceAt,
      publishedAt: null,
      retrievedAt: lastRecord.retrievedAt,
      schemaVersion: lastRecord.schemaVersion,
    } : undefined);
    return { status: "SUCCESS", records: written.changedRows };
  } catch (error) {
    const detail = error instanceof Error ? redactSeoulUrl(error.message) : "collector_error";
    await writeCollectorStatus(env.DB, sourceId, "ERROR", detail);
    await writeSourceHealth(env.DB, sourceId, "ERROR", detail);
    return { status: "ERROR", records: 0 };
  }
}

export const SKIPPED_NO_NEW_PUBLICATION = "SKIPPED_NO_NEW_PUBLICATION" as const;

/**
 * S4 — monthly official destination mobility by foreigner movement purpose.
 *
 * Metadata discovery is the only call on a normal daily run. The large ZIP is
 * downloaded only when its publication id is not already present in D1; all
 * archive work is supplied by the Node-only Actions adapter, never a Worker.
 */
export async function collectForeignPurposeMobility(
  env: CollectorEnv,
  now: Date = new Date(),
): Promise<CollectorResult> {
  const sourceId = FOREIGN_PURPOSE_SOURCE_ID;
  if (!env.FOREIGN_PURPOSE_SOURCE) {
    const detail = "foreign_purpose_source_adapter_not_configured";
    await writeCollectorStatus(env.DB, sourceId, "ERROR", detail);
    await writeSourceHealth(env.DB, sourceId, "ERROR", detail);
    return { status: "ERROR", records: 0, detail, providerRequests: 0 };
  }
  let providerRequests = 0;
  try {
    const publication = await env.FOREIGN_PURPOSE_SOURCE.discoverLatest();
    providerRequests += 1;
    if (publication.datasetId !== FOREIGN_PURPOSE_DATASET_ID) {
      throw new Error(`unexpected_dataset:${publication.datasetId}`);
    }
    if (env.DB) {
      const existing = await env.DB.prepare(`SELECT publication_id AS publicationId, aggregate_rows AS aggregateRows
        FROM seoul_foreign_purpose_publications
        WHERE source_id = ? AND dataset_id = ? AND publication_id = ? LIMIT 1`)
        .bind(sourceId, FOREIGN_PURPOSE_DATASET_ID, publication.publicationId)
        .all<{ publicationId: string; aggregateRows: number }>();
      if ((existing.results ?? []).length > 0) {
        const detail = `publication ${publication.publicationId}; metadata only; archive download 0`;
        await writeCollectorStatus(env.DB, sourceId, SKIPPED_NO_NEW_PUBLICATION, detail);
        const lastGoodPreserved = Number(existing.results?.[0]?.aggregateRows ?? 0) > 0
          || await hasStoredRow(env.DB, `SELECT 1 FROM seoul_foreign_purpose_mobility LIMIT 1`);
        return {
          status: SKIPPED_NO_NEW_PUBLICATION,
          records: 0,
          detail,
          providerRequests,
          sourceHealth: "OFFICIAL_HISTORICAL",
          lastGoodPreserved,
        };
      }
    }

    const csv = await env.FOREIGN_PURPOSE_SOURCE.loadLatestCsv(publication);
    providerRequests += 1;
    const aggregated = aggregateForeignPurposeMobility(csv);
    const retrievedAt = now.toISOString();
    const statements: D1PreparedStatement[] = [];
    for (const row of aggregated.rows) {
      const identity = {
        sourceId,
        mappingVersion: FOREIGN_PURPOSE_MAPPING_VERSION,
        area: row.area,
        referenceDate: aggregated.referenceDate,
        purpose: row.purpose,
      };
      const semantic = {
        ...identity,
        datasetId: FOREIGN_PURPOSE_DATASET_ID,
        publicationId: publication.publicationId,
        movementValue: row.movementValue,
        unit: row.unit,
        destinationCodes: row.destinationCodes,
      };
      if (env.DB) statements.push(env.DB.prepare(`INSERT INTO seoul_foreign_purpose_mobility (
          id, source_id, dataset_id, publication_id, record_origin, area,
          reference_date, purpose, movement_value, unit, destination_codes_json,
          mapping_version, retrieved_at, schema_version, quality_status, source_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id, mapping_version, area, reference_date, purpose) DO UPDATE SET
          dataset_id = excluded.dataset_id,
          publication_id = excluded.publication_id,
          movement_value = excluded.movement_value,
          unit = excluded.unit,
          destination_codes_json = excluded.destination_codes_json,
          retrieved_at = excluded.retrieved_at,
          schema_version = excluded.schema_version,
          quality_status = excluded.quality_status,
          source_hash = excluded.source_hash
        WHERE seoul_foreign_purpose_mobility.source_hash <> excluded.source_hash`)
        .bind(
          await sha256(identity), sourceId, FOREIGN_PURPOSE_DATASET_ID, publication.publicationId,
          "OFFICIAL_HISTORICAL", row.area, aggregated.referenceDate, row.purpose,
          row.movementValue, row.unit, JSON.stringify(row.destinationCodes),
          FOREIGN_PURPOSE_MAPPING_VERSION, retrievedAt, FOREIGN_PURPOSE_SCHEMA_VERSION,
          "VALID", await sha256(semantic),
        ));
    }
    if (env.DB) {
      const publicationIdentity = {
        sourceId,
        datasetId: FOREIGN_PURPOSE_DATASET_ID,
        publicationId: publication.publicationId,
      };
      statements.push(env.DB.prepare(`INSERT INTO seoul_foreign_purpose_publications (
          id, source_id, dataset_id, publication_id, file_name, reference_date,
          aggregate_rows, source_rows_read, retrieved_at, schema_version, source_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id, dataset_id, publication_id) DO UPDATE SET
          file_name = excluded.file_name,
          reference_date = excluded.reference_date,
          aggregate_rows = excluded.aggregate_rows,
          source_rows_read = excluded.source_rows_read,
          retrieved_at = excluded.retrieved_at,
          schema_version = excluded.schema_version,
          source_hash = excluded.source_hash
        WHERE seoul_foreign_purpose_publications.source_hash <> excluded.source_hash`)
        .bind(
          await sha256(publicationIdentity), sourceId, FOREIGN_PURPOSE_DATASET_ID,
          publication.publicationId, publication.fileName, aggregated.referenceDate,
          aggregated.rows.length, aggregated.sourceRowsRead, retrievedAt,
          FOREIGN_PURPOSE_SCHEMA_VERSION,
          await sha256({
            ...publicationIdentity,
            fileName: publication.fileName,
            referenceDate: aggregated.referenceDate,
            aggregateRows: aggregated.rows.length,
            sourceRowsRead: aggregated.sourceRowsRead,
          }),
        ));
    }
    const written = env.DB && statements.length ? await runBatches(env.DB, statements) : NO_D1_WRITES;
    const representedAreas = new Set(aggregated.rows.map((row) => row.area));
    const detail = `publication ${publication.publicationId}; reference ${aggregated.referenceDate}; source rows ${aggregated.sourceRowsRead}; aggregate pairs ${aggregated.rows.length}/6; areas ${representedAreas.size}/3; unavailable pairs ${6 - aggregated.rows.length}; invalid or suppressed ${aggregated.suppressedOrInvalidRows}; ${describeWrites(written)}`;
    await writeCollectorStatus(env.DB, sourceId, "SUCCESS", detail, aggregated.sourceRowsRead, written.changedRows);
    await writeSourceHealth(env.DB, sourceId, "OFFICIAL_HISTORICAL", detail, {
      eventAt: `${aggregated.referenceDate}T00:00:00+09:00`,
      publishedAt: null,
      retrievedAt,
      schemaVersion: FOREIGN_PURPOSE_SCHEMA_VERSION,
    });
    const lastGoodPreserved = aggregated.rows.length > 0
      || await hasStoredRow(env.DB, `SELECT 1 FROM seoul_foreign_purpose_mobility LIMIT 1`);
    return {
      status: "SUCCESS",
      records: written.changedRows,
      detail,
      providerRequests,
      sourceHealth: "OFFICIAL_HISTORICAL",
      lastGoodPreserved,
    };
  } catch (error) {
    const detail = safeSourceFailureDetail(error);
    const lastGoodPreserved = await hasStoredRow(env.DB, `SELECT 1 FROM seoul_foreign_purpose_mobility LIMIT 1`);
    const health: SourceHealthStatus = lastGoodPreserved ? "STALE" : "ERROR";
    await writeCollectorStatus(env.DB, sourceId, "ERROR", detail);
    await writeSourceHealth(env.DB, sourceId, health, detail);
    return { status: "ERROR", records: 0, detail, providerRequests, sourceHealth: health, lastGoodPreserved };
  }
}

/**
 * S5 — official daily station entries/exits from OA-22723.
 *
 * The first successful run backfills only the provider's seven completed KST
 * days. Later runs skip stored days and a same-KST-day checkpoint prevents a
 * manual rerun from spending provider calls. Only compact station/day totals
 * enter D1; the card/user/hour rows are discarded after aggregation.
 */
export async function collectSeoulSubwayRidership(
  env: CollectorEnv,
  now: Date = new Date(),
): Promise<CollectorResult> {
  const sourceId = SEOUL_SUBWAY_SOURCE_ID;
  const source = env.SUBWAY_RIDERSHIP_SOURCE
    ?? (env.SEOUL_OPEN_DATA_KEY ? createSeoulSubwayRidershipSource(env.SEOUL_OPEN_DATA_KEY) : null);
  if (!source) {
    const detail = "SEOUL_OPEN_DATA_KEY is not configured";
    await writeCollectorStatus(env.DB, sourceId, "NEEDS_KEY", detail);
    await writeSourceHealth(env.DB, sourceId, "MISSING", detail);
    return { status: "NEEDS_KEY", records: 0, detail, providerRequests: 0, sourceHealth: "MISSING", lastGoodPreserved: false };
  }

  const retrievedAt = now.toISOString();
  const checkedKstDate = kstDayOf(retrievedAt);
  const candidateDates = subwayBackfillDates(now);
  let providerRequests = 0;
  try {
    if (env.DB) {
      const checkpoint = await env.DB.prepare(`SELECT last_checked_kst_date AS checkedDate,
          latest_reference_date AS latestReferenceDate
        FROM seoul_subway_collection_checkpoint WHERE source_id = ? LIMIT 1`)
        .bind(sourceId).all<{ checkedDate: string; latestReferenceDate: string | null }>();
      const row = checkpoint.results?.[0];
      if (row?.checkedDate === checkedKstDate) {
        const lastGoodPreserved = await hasStoredRow(env.DB, `SELECT 1 FROM seoul_subway_ridership LIMIT 1`);
        const health: SourceHealthStatus = row.latestReferenceDate
          ? (row.latestReferenceDate >= shiftKstDay(checkedKstDate, -2) ? "LIVE" : "STALE")
          : (lastGoodPreserved ? "STALE" : "MISSING");
        const detail = `checked ${checkedKstDate}; provider requests 0; same-day idempotent skip; latest ${row.latestReferenceDate ?? "none"}`;
        await writeCollectorStatus(env.DB, sourceId, "SUCCESS", detail);
        return { status: "SUCCESS", records: 0, detail, providerRequests: 0, sourceHealth: health, lastGoodPreserved };
      }
    }

    const storedDates = new Set<string>();
    if (env.DB) {
      const placeholders = candidateDates.map(() => "?").join(",");
      const stored = await env.DB.prepare(`SELECT DISTINCT reference_date AS referenceDate
        FROM seoul_subway_ridership
        WHERE source_id = ? AND mapping_version = ? AND reference_date IN (${placeholders})
        GROUP BY reference_date HAVING COUNT(*) = ?`)
        .bind(sourceId, SEOUL_SUBWAY_MAPPING_VERSION, ...candidateDates, SUBWAY_STATION_REQUESTS.length)
        .all<{ referenceDate: string }>();
      for (const row of stored.results ?? []) storedDates.add(row.referenceDate);
    }

    const collected: Array<{ area: AreaId; result: ReturnType<typeof normalizeSubwayRidershipPayload> }> = [];
    let sourceRowsRead = 0;
    let unavailableDates = 0;
    for (const referenceDate of candidateDates.filter((day) => !storedDates.has(day))) {
      const dateRows: typeof collected = [];
      let unavailable = false;
      for (const request of SUBWAY_STATION_REQUESTS) {
        providerRequests += 1;
        const payload = await source.fetchStationDay(referenceDate, request.station);
        try {
          const result = normalizeSubwayRidershipPayload(payload, referenceDate, request.station);
          sourceRowsRead += result.sourceRowsRead;
          dateRows.push({ area: request.area, result });
        } catch (error) {
          const message = error instanceof Error ? error.message : "subway_schema_error";
          if (message === "subway_no_data" || /^subway_provider_03_/.test(message)) {
            unavailable = true;
            break;
          }
          throw error;
        }
      }
      if (unavailable) {
        unavailableDates += 1;
        continue;
      }
      if (dateRows.length !== SUBWAY_STATION_REQUESTS.length) throw new Error("subway_incomplete_station_set");
      collected.push(...dateRows);
      storedDates.add(referenceDate);
    }

    const statements: D1PreparedStatement[] = [];
    for (const { area, result } of collected) {
      const identity = {
        sourceId,
        mappingVersion: SEOUL_SUBWAY_MAPPING_VERSION,
        area,
        referenceDate: result.referenceDate,
        stationCode: result.station.stationCode,
      };
      const semantic = {
        ...identity,
        datasetId: SEOUL_SUBWAY_DATASET_ID,
        stationNumber: result.station.stationNumber,
        stationName: result.station.stationName,
        lineName: result.station.lineName,
        boardingCount: result.boardingCount,
        alightingCount: result.alightingCount,
      };
      if (env.DB) statements.push(env.DB.prepare(`INSERT INTO seoul_subway_ridership (
          id, source_id, dataset_id, record_origin, area, reference_date,
          station_code, station_number, station_name, line_name,
          boarding_count, alighting_count, mapping_version, retrieved_at,
          schema_version, quality_status, source_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id, mapping_version, area, reference_date, station_code) DO UPDATE SET
          dataset_id = excluded.dataset_id,
          station_number = excluded.station_number,
          station_name = excluded.station_name,
          line_name = excluded.line_name,
          boarding_count = excluded.boarding_count,
          alighting_count = excluded.alighting_count,
          retrieved_at = excluded.retrieved_at,
          schema_version = excluded.schema_version,
          quality_status = excluded.quality_status,
          source_hash = excluded.source_hash
        WHERE seoul_subway_ridership.source_hash <> excluded.source_hash`)
        .bind(
          await sha256(identity), sourceId, SEOUL_SUBWAY_DATASET_ID, "OFFICIAL_DAILY",
          area, result.referenceDate, result.station.stationCode, result.station.stationNumber,
          result.station.stationName, result.station.lineName, result.boardingCount,
          result.alightingCount, SEOUL_SUBWAY_MAPPING_VERSION, retrievedAt,
          SEOUL_SUBWAY_SCHEMA_VERSION, "VALID", await sha256(semantic),
        ));
    }
    const written = env.DB && statements.length ? await runBatches(env.DB, statements) : NO_D1_WRITES;
    const latestReferenceDate = [...storedDates].sort().at(-1) ?? null;
    if (env.DB && latestReferenceDate) {
      await env.DB.prepare(`INSERT INTO seoul_subway_collection_checkpoint (
          source_id, last_checked_kst_date, latest_reference_date, retrieved_at, schema_version
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source_id) DO UPDATE SET
          last_checked_kst_date = excluded.last_checked_kst_date,
          latest_reference_date = excluded.latest_reference_date,
          retrieved_at = excluded.retrieved_at,
          schema_version = excluded.schema_version`)
        .bind(sourceId, checkedKstDate, latestReferenceDate, retrievedAt, SEOUL_SUBWAY_SCHEMA_VERSION).run();
    }

    const lastGoodPreserved = Boolean(latestReferenceDate)
      || await hasStoredRow(env.DB, `SELECT 1 FROM seoul_subway_ridership LIMIT 1`);
    const freshThrough = shiftKstDay(checkedKstDate, -2);
    const health: SourceHealthStatus = latestReferenceDate
      ? (latestReferenceDate >= freshThrough ? "LIVE" : "STALE")
      : (lastGoodPreserved ? "STALE" : "MISSING");
    const status: CollectorResult["status"] = latestReferenceDate ? "SUCCESS" : "NO_DATA";
    const detail = `window ${candidateDates.at(-1)}..${candidateDates[0]}; complete dates ${storedDates.size}/7; new station-days ${collected.length}; unavailable dates ${unavailableDates}; source rows ${sourceRowsRead}; provider requests ${providerRequests}; latest ${latestReferenceDate ?? "none"}; ${describeWrites(written)}`;
    await writeCollectorStatus(env.DB, sourceId, status, detail, sourceRowsRead, written.changedRows);
    await writeSourceHealth(env.DB, sourceId, health, detail, latestReferenceDate ? {
      eventAt: `${latestReferenceDate}T00:00:00+09:00`,
      publishedAt: null,
      retrievedAt,
      schemaVersion: SEOUL_SUBWAY_SCHEMA_VERSION,
    } : undefined);
    return { status, records: written.changedRows, detail, providerRequests, sourceHealth: health, lastGoodPreserved };
  } catch (error) {
    const detail = safeSourceFailureDetail(error);
    const lastGoodPreserved = await hasStoredRow(env.DB, `SELECT 1 FROM seoul_subway_ridership LIMIT 1`);
    const health: SourceHealthStatus = lastGoodPreserved ? "STALE" : "ERROR";
    await writeCollectorStatus(env.DB, sourceId, "ERROR", detail);
    await writeSourceHealth(env.DB, sourceId, health, detail);
    return { status: "ERROR", records: 0, detail, providerRequests, sourceHealth: health, lastGoodPreserved };
  }
}

function recentQuarterCandidates(now: Date): string[] {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  let year = kst.getUTCFullYear();
  let quarter = Math.floor(kst.getUTCMonth() / 3) + 1;
  const candidates: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    candidates.push(`${year}${quarter}`);
    quarter -= 1;
    if (quarter === 0) { quarter = 4; year -= 1; }
  }
  return candidates;
}

// S3 — quarterly estimated sales. Live verification (2026-08-27) showed the
// OpenAPI applies only the quarter positional filter and silently ignores the
// trade-area segments, so one bounded page sweep per quarter collects all
// target trade areas and filters client-side. Quarterly cadence keeps the
// page budget (~22 requests of 1000 rows) trivial against the daily quota.
const SALES_PAGE_SIZE = 1_000;
const SALES_MAX_PAGES = 25;

export async function collectEstimatedSales(env: CollectorEnv, now = new Date()): Promise<CollectorResult> {
  const sourceId = "SEOUL_ESTIMATED_SALES";
  if (!env.SEOUL_OPEN_DATA_KEY) {
    await writeCollectorStatus(env.DB, sourceId, "NEEDS_KEY", "SEOUL_OPEN_DATA_KEY is not configured");
    await writeSourceHealth(env.DB, sourceId, "MISSING", "SEOUL_OPEN_DATA_KEY is not configured");
    return { status: "NEEDS_KEY", records: 0 };
  }
  const codeToArea = new Map(allAreaIds.map((areaId) => [areaMappings[areaId].salesTradeArea.code, areaId]));
  const statements: D1PreparedStatement[] = [];
  let lastRecord: CanonicalEstimatedSales | undefined;
  const matchedAreas = new Set<string>();
  let written: D1WriteCounts = NO_D1_WRITES;
  try {
    const fetchQuarterPage = async (quarterCode: string, start: number, end: number): Promise<Record<string, unknown>[]> => {
      const url = new URL(`http://openapi.seoul.go.kr:8088/${env.SEOUL_OPEN_DATA_KEY}/json/VwsmTrdarSelngQq/${start}/${end}/${quarterCode}`);
      const payload = await fetchOfficialJson(url, { timeoutMs: 30_000, retries: 0 });
      try {
        return seoulEnvelopeRows(payload, "VwsmTrdarSelngQq");
      } catch (error) {
        // INFO-200 (no data) marks an unpublished quarter or the end of the
        // result set; other result codes are real failures.
        if (error instanceof Error && error.message.includes("INFO-200")) return [];
        throw error;
      }
    };

    // Find the latest published quarter with a single-row probe per candidate.
    let quarterCode = "";
    for (const candidate of recentQuarterCandidates(now)) {
      const probe = await fetchQuarterPage(candidate, 1, 1);
      if (probe.some((row) => row.STDR_YYQU_CD === candidate)) {
        quarterCode = candidate;
        break;
      }
    }
    if (!quarterCode) throw new Error("estimated_sales_no_published_quarter");

    const retrievedAt = nowIso();
    let pagesRead = 0;
    for (let page = 0; page < SALES_MAX_PAGES; page += 1) {
      const start = page * SALES_PAGE_SIZE + 1;
      const rows = await fetchQuarterPage(quarterCode, start, start + SALES_PAGE_SIZE - 1);
      pagesRead += 1;
      for (const row of rows) {
        if (row.STDR_YYQU_CD !== quarterCode) continue;
        const areaId = codeToArea.get(String(row.TRDAR_CD));
        if (!areaId) continue;
        const record = await normalizeEstimatedSales(row, areaId, retrievedAt);
        lastRecord = record;
        matchedAreas.add(areaId);
        if (!env.DB) continue;
        statements.push(env.DB.prepare(`INSERT INTO seoul_estimated_sales (
            id, source_id, record_origin, area, quarter_code, trade_area_code, trade_area_name,
            industry_code, industry_name, sales_amount, sales_count, retrieved_at,
            freshness, schema_version, quality_status, source_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_id, quarter_code, trade_area_code, industry_code) DO UPDATE SET
            industry_name = excluded.industry_name,
            sales_amount = excluded.sales_amount,
            sales_count = excluded.sales_count,
            retrieved_at = excluded.retrieved_at,
            quality_status = excluded.quality_status,
            source_hash = excluded.source_hash
          WHERE seoul_estimated_sales.source_hash <> excluded.source_hash`)
          .bind(
            await sha256({ sourceId, quarterCode: record.quarterCode, tradeAreaCode: record.tradeAreaCode, industryCode: record.industryCode }),
            sourceId, record.recordOrigin, areaId, record.quarterCode, record.tradeAreaCode, record.tradeAreaName,
            record.industryCode, record.industryName, record.salesAmount, record.salesCount, record.retrievedAt,
            record.freshness, record.schemaVersion, record.qualityStatus, record.sourceHash,
          ));
      }
      if (rows.length < SALES_PAGE_SIZE) break;
    }
    if (!matchedAreas.size) throw new Error("estimated_sales_no_matching_rows");

    if (env.DB && statements.length) written = await runBatches(env.DB, statements);
    const detail = `quarter ${quarterCode}; pages ${pagesRead}; areas ok ${matchedAreas.size}/${allAreaIds.length}; ${describeWrites(written)}`;
    const partial = matchedAreas.size < allAreaIds.length;
    await writeCollectorStatus(env.DB, sourceId, partial ? "PARTIAL" : "SUCCESS", detail, matchedAreas.size, written.changedRows);
    await writeSourceHealth(env.DB, sourceId, "OFFICIAL_HISTORICAL", detail, lastRecord ? { retrievedAt: lastRecord.retrievedAt, schemaVersion: lastRecord.schemaVersion } : undefined);
    return { status: partial ? "PARTIAL" : "SUCCESS", records: written.changedRows };
  } catch (error) {
    const detail = error instanceof Error ? redactSeoulUrl(error.message) : "collector_error";
    await writeCollectorStatus(env.DB, sourceId, "ERROR", detail);
    await writeSourceHealth(env.DB, sourceId, "ERROR", detail);
    return { status: "ERROR", records: 0 };
  }
}

const STORE_DYNAMICS_PAGE_SIZE = 1_000;
const STORE_DYNAMICS_MAX_PAGES = 3;

async function hasCompleteStoreDynamicsLastGood(db: D1Database | undefined): Promise<boolean> {
  if (!db) return false;
  const latestForArea = `SELECT source_id AS sourceId, dataset_id AS datasetId,
      record_origin AS recordOrigin, area, quarter_code AS quarterCode,
      trade_area_code AS tradeAreaCode, trade_area_name AS tradeAreaName,
      trade_area_type_code AS tradeAreaTypeCode, trade_area_type_name AS tradeAreaTypeName,
      overall_store_count AS totalStoreCount, ordinary_store_count AS ordinaryStoreCount,
      franchise_store_count AS franchiseStoreCount, opening_store_count AS openingCount,
      opening_rate_tenths_percent AS openingRateTenthsPercent,
      closure_store_count AS closureCount, closure_rate_tenths_percent AS closureRateTenthsPercent,
      industry_count AS industryCount,
      mapping_version AS mappingVersion, retrieved_at AS retrievedAt,
      schema_version AS schemaVersion, quality_status AS qualityStatus
    FROM seoul_store_dynamics
    WHERE source_id = ? AND mapping_version = ? AND record_origin = 'OFFICIAL_HISTORICAL'
      AND quality_status = 'VALID' AND area = ?
    ORDER BY quarter_code DESC LIMIT 1`;
  try {
    const result = await db.prepare(`SELECT * FROM (${latestForArea})
      UNION ALL SELECT * FROM (${latestForArea})
      UNION ALL SELECT * FROM (${latestForArea})`)
      .bind(
        STORE_DYNAMICS_SOURCE_ID, STORE_DYNAMICS_MAPPING_VERSION, "myeongdong",
        STORE_DYNAMICS_SOURCE_ID, STORE_DYNAMICS_MAPPING_VERSION, "hongdae",
        STORE_DYNAMICS_SOURCE_ID, STORE_DYNAMICS_MAPPING_VERSION, "seongsu",
      )
      .all<Record<string, unknown>>();
    const rows = result.results ?? [];
    const areas = new Set(rows.map((row) => row.area));
    const quarters = new Set(rows.map((row) => row.quarterCode));
    return rows.length === 3
      && areas.size === 3
      && Object.keys(storeDynamicsMappings).every((area) => areas.has(area))
      && quarters.size === 1
      && Object.keys(storeDynamicsMappings).every((area) =>
        isValidStoredStoreDynamicsRow(area as AreaId, rows.find((row) => row.area === area)));
  } catch {
    return false;
  }
}

/**
 * OA-15577 is a slow official quarterly source. One probe area finds the
 * newest published quarter, then each exact representative area is read in
 * at most three pages. All areas validate before any fact row is written.
 */
export async function collectStoreDynamics(
  env: CollectorEnv,
  now: Date = new Date(),
): Promise<CollectorResult> {
  const sourceId = STORE_DYNAMICS_SOURCE_ID;
  if (!env.SEOUL_OPEN_DATA_KEY) {
    const detail = "SEOUL_OPEN_DATA_KEY is not configured";
    const lastGoodPreserved = await hasCompleteStoreDynamicsLastGood(env.DB);
    const health: SourceHealthStatus = lastGoodPreserved ? "STALE" : "ERROR";
    await writeCollectorStatus(env.DB, sourceId, "NEEDS_KEY", detail);
    await writeSourceHealth(env.DB, sourceId, health, detail);
    return {
      status: "NEEDS_KEY",
      records: 0,
      detail,
      providerRequests: 0,
      sourceHealth: health,
      lastGoodPreserved,
    };
  }

  const retrievedAt = now.toISOString();
  const mappings = Object.values(storeDynamicsMappings);
  const probeMapping = storeDynamicsMappings.myeongdong;
  let providerRequests = 0;
  const fetchPage = async (quarterCode: string, tradeAreaCode: string, start: number, end: number) => {
    providerRequests += 1;
    const url = new URL(`http://openapi.seoul.go.kr:8088/${env.SEOUL_OPEN_DATA_KEY}/json/VwsmTrdarStorQq/${start}/${end}/${quarterCode}/${tradeAreaCode}`);
    const payload = await fetchOfficialJson(url, { timeoutMs: 30_000, retries: 0 });
    return parseStoreDynamicsResponse(payload);
  };

  try {
    let quarterCode: string | null = null;
    for (const candidate of storeDynamicsQuarterCandidates(now)) {
      const probe = await fetchPage(candidate, probeMapping.tradeAreaCode, 1, 1);
      if (probe.noData || probe.rows.length === 0) continue;
      normalizeStoreDynamicsRow(probe.rows[0], { ...probeMapping, quarterCode: candidate }, retrievedAt);
      quarterCode = candidate;
      break;
    }
    if (!quarterCode) throw new Error("store_dynamics_no_published_quarter");

    const aggregates: CanonicalStoreDynamicsAggregate[] = [];
    let sourceRowsRead = 0;
    let pagesRead = 0;
    for (const mapping of mappings) {
      const expected = { ...mapping, quarterCode };
      const normalizedRows = [];
      let expectedTotal: number | null = null;
      for (let page = 0; page < STORE_DYNAMICS_MAX_PAGES; page += 1) {
        const start = page * STORE_DYNAMICS_PAGE_SIZE + 1;
        const end = start + STORE_DYNAMICS_PAGE_SIZE - 1;
        const response = await fetchPage(quarterCode, mapping.tradeAreaCode, start, end);
        pagesRead += 1;
        if (response.noData || response.totalCount === 0 || response.rows.length === 0) {
          throw new Error("store_dynamics_empty_area");
        }
        if (response.totalCount > STORE_DYNAMICS_PAGE_SIZE * STORE_DYNAMICS_MAX_PAGES) {
          throw new Error("store_dynamics_page_limit");
        }
        if (expectedTotal === null) expectedTotal = response.totalCount;
        if (expectedTotal !== response.totalCount) throw new Error("store_dynamics_total_count_drift");
        for (const row of response.rows) {
          normalizedRows.push(normalizeStoreDynamicsRow(row, expected, retrievedAt));
        }
        sourceRowsRead += response.rows.length;
        if (normalizedRows.length >= expectedTotal) break;
        if (response.rows.length < STORE_DYNAMICS_PAGE_SIZE) {
          throw new Error("store_dynamics_incomplete_area");
        }
      }
      if (expectedTotal === null || normalizedRows.length !== expectedTotal) {
        throw new Error("store_dynamics_incomplete_area");
      }
      aggregates.push(await aggregateStoreDynamicsRows(normalizedRows, expected, retrievedAt));
    }
    if (aggregates.length !== mappings.length) throw new Error("store_dynamics_incomplete_area_set");

    const statements: D1PreparedStatement[] = [];
    if (env.DB) {
      for (const aggregate of aggregates) {
        const identity = {
          sourceId: aggregate.sourceId,
          mappingVersion: aggregate.mappingVersion,
          area: aggregate.area,
          quarterCode: aggregate.quarterCode,
        };
        statements.push(env.DB.prepare(`INSERT INTO seoul_store_dynamics (
            id, source_id, dataset_id, record_origin, area, quarter_code,
            trade_area_code, trade_area_name, trade_area_type_code, trade_area_type_name,
            overall_store_count, ordinary_store_count, franchise_store_count,
            opening_store_count, opening_rate_tenths_percent,
            closure_store_count, closure_rate_tenths_percent, industry_count,
            mapping_version, source_updated_at, retrieved_at, schema_version,
            quality_status, source_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_id, mapping_version, area, quarter_code) DO UPDATE SET
            dataset_id = excluded.dataset_id,
            record_origin = excluded.record_origin,
            trade_area_code = excluded.trade_area_code,
            trade_area_name = excluded.trade_area_name,
            trade_area_type_code = excluded.trade_area_type_code,
            trade_area_type_name = excluded.trade_area_type_name,
            overall_store_count = excluded.overall_store_count,
            ordinary_store_count = excluded.ordinary_store_count,
            franchise_store_count = excluded.franchise_store_count,
            opening_store_count = excluded.opening_store_count,
            opening_rate_tenths_percent = excluded.opening_rate_tenths_percent,
            closure_store_count = excluded.closure_store_count,
            closure_rate_tenths_percent = excluded.closure_rate_tenths_percent,
            industry_count = excluded.industry_count,
            source_updated_at = excluded.source_updated_at,
            retrieved_at = excluded.retrieved_at,
            schema_version = excluded.schema_version,
            quality_status = excluded.quality_status,
            source_hash = excluded.source_hash
          WHERE seoul_store_dynamics.source_hash <> excluded.source_hash`)
          .bind(
            await sha256(identity), aggregate.sourceId, STORE_DYNAMICS_DATASET_ID,
            aggregate.recordOrigin, aggregate.area, aggregate.quarterCode,
            aggregate.tradeAreaCode, aggregate.tradeAreaName,
            aggregate.tradeAreaTypeCode, aggregate.tradeAreaTypeName,
            aggregate.totalStoreCount, aggregate.ordinaryStoreCount,
            aggregate.franchiseStoreCount, aggregate.openingCount,
            aggregate.openingRateTenthsPercent, aggregate.closureCount,
            aggregate.closureRateTenthsPercent, aggregate.industryCount,
            STORE_DYNAMICS_MAPPING_VERSION, null, aggregate.retrievedAt,
            STORE_DYNAMICS_SCHEMA_VERSION, aggregate.qualityStatus, aggregate.sourceHash,
          ));
      }
    }
    const written = env.DB && statements.length ? await runBatches(env.DB, statements) : NO_D1_WRITES;
    const detail = `quarter ${quarterCode}; areas ${aggregates.length}/${mappings.length}; pages ${pagesRead}; source rows ${sourceRowsRead}; provider requests ${providerRequests}; ${describeWrites(written)}`;
    await writeCollectorStatus(env.DB, sourceId, "SUCCESS", detail, sourceRowsRead, written.changedRows);
    await writeSourceHealth(env.DB, sourceId, "OFFICIAL_HISTORICAL", detail, {
      publishedAt: null,
      retrievedAt,
      schemaVersion: STORE_DYNAMICS_SCHEMA_VERSION,
    });
    return {
      status: "SUCCESS",
      records: written.changedRows,
      detail,
      providerRequests,
      sourceHealth: "OFFICIAL_HISTORICAL",
      lastGoodPreserved: Boolean(env.DB && aggregates.length > 0),
    };
  } catch (error) {
    const detail = safeSourceFailureDetail(error);
    const lastGoodPreserved = await hasCompleteStoreDynamicsLastGood(env.DB);
    const health: SourceHealthStatus = lastGoodPreserved ? "STALE" : "ERROR";
    await writeCollectorStatus(env.DB, sourceId, "ERROR", detail);
    await writeSourceHealth(env.DB, sourceId, health, detail);
    return { status: "ERROR", records: 0, detail, providerRequests, sourceHealth: health, lastGoodPreserved };
  }
}

/** Latest KMA 단기예보 issuance available at `now` (KST slots + 30min buffer). */
export function latestKmaIssuance(now = new Date()): { baseDate: string; baseTime: string } {
  const slots = [2, 5, 8, 11, 14, 17, 20, 23];
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  let chosen: number | null = null;
  for (const slot of slots) {
    if (slot * 60 + 30 <= minutes) chosen = slot;
  }
  let date = kst;
  if (chosen === null) {
    chosen = 23;
    date = new Date(kst.getTime() - 86_400_000);
  }
  return { baseDate: date.toISOString().slice(0, 10).replaceAll("-", ""), baseTime: `${String(chosen).padStart(2, "0")}00` };
}

// W1 — KMA short-term forecast per unique grid cell, bounded to 48h targets.
export interface WeatherCollectionOptions extends TargetedCollectionOptions {
  /** Restricts the run to these grid cells. Defaults to all three. */
  grids?: ReadonlyArray<{ nx: number; ny: number; areas: readonly string[] }>;
}

export async function collectWeatherForecasts(
  env: CollectorEnv,
  now = new Date(),
  options: WeatherCollectionOptions = {},
): Promise<CollectorResult> {
  const sourceId = "KMA_VILAGE_FCST";
  const grids = options.grids ?? uniqueKmaGrids();
  const mode = options.mode ?? "PRIMARY";
  const serviceKey = env.KMA_SERVICE_KEY ?? env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey) {
    await writeCollectorStatus(env.DB, sourceId, "NEEDS_KEY", "DATA_GO_KR_SERVICE_KEY is not configured");
    await writeSourceHealth(env.DB, sourceId, "MISSING", "DATA_GO_KR_SERVICE_KEY is not configured");
    return { status: "NEEDS_KEY", records: 0 };
  }
  const { baseDate, baseTime } = latestKmaIssuance(now);
  const horizon = new Date(now.getTime() + 48 * 3_600_000).toISOString();
  const statements: D1PreparedStatement[] = [];
  const failures: string[] = [];
  let lastForecast: CanonicalWeatherForecast | undefined;
  let written: D1WriteCounts = NO_D1_WRITES;
  let requestCount = 0;
  for (const grid of grids) {
    const url = buildDataGoKrUrl(
      "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst",
      serviceKey,
      { pageNo: "1", numOfRows: "1000", dataType: "JSON", base_date: baseDate, base_time: baseTime, nx: String(grid.nx), ny: String(grid.ny) },
    );
    try {
      requestCount += 1;
      const payload = await fetchOfficialJson(url, KMA_GRID_RETRY_POLICY);
      const root = payload as { response?: { header?: { resultCode?: string }; body?: { items?: { item?: unknown[] } } } };
      const resultCode = root?.response?.header?.resultCode;
      if (resultCode !== "00") throw new Error(`kma_result_${String(resultCode ?? "missing")}`);
      const items = Array.isArray(root?.response?.body?.items?.item) ? root.response.body.items.item : [];
      const retrievedAt = nowIso();
      for (const areaId of grid.areas as readonly AreaId[]) {
        const rows = (await normalizeWeatherForecast(items, areaId, retrievedAt)).filter((row) => row.targetAt <= horizon);
        for (const row of rows) {
          lastForecast = row;
          if (!env.DB) continue;
          statements.push(env.DB.prepare(`INSERT INTO weather_forecast (
              id, source_id, area, issued_at, target_at, retrieved_at,
              precipitation_probability, temperature_tenth_c, condition_code,
              humidity_percent, wind_speed_tenth_mps,
              daily_min_temperature_tenth_c, daily_max_temperature_tenth_c,
              precipitation_amount_raw, precipitation_amount_kind, precipitation_amount_tenth_mm,
              snow_amount_raw, snow_amount_kind, snow_amount_tenth_cm,
              sky_code, precipitation_type_code,
              schema_version, quality_status, source_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_id, area, issued_at, target_at) DO NOTHING`)
            .bind(
              await sha256({ sourceId, area: areaId, issuedAt: row.issuedAt, targetAt: row.targetAt }),
              sourceId, areaId, row.issuedAt, row.targetAt, row.retrievedAt,
              row.precipitationProbability, row.temperatureTenthC, row.conditionCode,
              row.humidityPercent, row.windSpeedTenthMps,
              row.dailyMinTemperatureTenthC, row.dailyMaxTemperatureTenthC,
              row.precipitationAmountRaw, row.precipitationAmountKind, row.precipitationAmountTenthMm,
              row.snowAmountRaw, row.snowAmountKind, row.snowAmountTenthCm,
              row.skyCode, row.precipitationTypeCode,
              row.schemaVersion, row.qualityStatus, row.sourceHash,
            ));
        }
      }
    } catch (error) {
      failures.push(`grid ${grid.nx},${grid.ny}: ${safeSourceFailureDetail(error)}`);
    }
  }
  if (env.DB && statements.length) written = await runBatches(env.DB, statements);
  const gridCount = grids.length;
  const okCount = gridCount - failures.length;
  const detail = `mode=${mode}; grids ok ${okCount}/${gridCount}; requests ${requestCount}; base ${baseDate}${baseTime}; ${describeWrites(written)}${failures.length ? `; failed ${failures.join(" | ")}` : ""}`;
  if (okCount === 0) {
    // Every requested grid failed. Stored forecasts are untouched, so the
    // source is STALE rather than ERROR whenever they exist.
    const lastGood = options.hasUsableLastGood
      ?? await hasStoredRow(env.DB, `SELECT 1 AS present FROM weather_forecast LIMIT 1`);
    const health: SourceHealthStatus = lastGood ? "STALE" : "ERROR";
    await writeCollectorStatus(env.DB, sourceId, "ERROR", detail);
    await writeSourceHealth(env.DB, sourceId, health, detail);
    return { status: "ERROR", records: 0, detail, providerRequests: requestCount, sourceHealth: health };
  }
  // A grid that was requested and failed leaves one product area without this
  // issuance, so the source is not LIVE even though other grids succeeded.
  const health: SourceHealthStatus = failures.length ? "STALE" : "LIVE";
  await writeCollectorStatus(env.DB, sourceId, failures.length ? "PARTIAL" : "SUCCESS", detail, okCount, written.changedRows);
  await writeSourceHealth(env.DB, sourceId, health, detail, lastForecast ? { retrievedAt: lastForecast.retrievedAt, schemaVersion: lastForecast.schemaVersion } : undefined);
  return { status: failures.length ? "PARTIAL" : "SUCCESS", records: written.changedRows, detail, providerRequests: requestCount, sourceHealth: health };
}

/** Per-run caps on the two official follow-up operations, on top of the one list call. */
export const TOURAPI_DETAIL_POLICY = Object.freeze({
  /** categoryCode2 lookups per run — one per unresolved cat2 group. */
  maxCategoryLookups: 3,
  /** detailCommon2 fetches per run — one per contentId that has never been fetched. */
  maxDetailFetches: 12,
});

interface EventEnrichmentCounts {
  providerRequests: number;
  changedRows: number;
  categoryLookups: number;
  categoriesNamed: number;
  detailPending: number;
  detailFetched: number;
  detailFailed: number;
  failure: string | null;
}

const NO_EVENT_ENRICHMENT: EventEnrichmentCounts = Object.freeze({
  providerRequests: 0, changedRows: 0, categoryLookups: 0, categoriesNamed: 0,
  detailPending: 0, detailFetched: 0, detailFailed: 0, failure: null,
});

function describeEventEnrichment(counts: EventEnrichmentCounts): string {
  const parts = [
    `category lookups ${counts.categoryLookups}`,
    `categories named ${counts.categoriesNamed}`,
    `detail fetched ${counts.detailFetched}/${counts.detailPending}`,
  ];
  if (counts.detailFailed) parts.push(`detail failed ${counts.detailFailed}`);
  if (counts.failure) parts.push(`enrichment error ${counts.failure}`);
  return parts.join("; ");
}

function tourapiResultItems(payload: unknown): unknown[] {
  const root = payload as { response?: { header?: { resultCode?: string }; body?: { items?: { item?: unknown[] | unknown } | string } } };
  const resultCode = root?.response?.header?.resultCode;
  if (resultCode !== "0000") throw new Error(`tourapi_result_${String(resultCode ?? "missing")}`);
  const body = root?.response?.body;
  // An empty result arrives as `items: ""` rather than an empty array.
  const rawItems = body && typeof body.items === "object" && body.items ? body.items.item : undefined;
  return Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
}

/**
 * The page shows only what the official provider says about an event: its
 * category name (categoryCode2) and its own overview/homepage (detailCommon2).
 *
 * Both are fetched by this daily collector, never by the browser and never
 * per page view. A category code is resolved once and cached in
 * `tourapi_category_codes`; a contentId's detail is fetched once, marked by
 * `detail_retrieved_at`, and re-read from D1 after that. A description the
 * provider does not have is simply absent — nothing is generated or guessed.
 */
async function enrichTourismEventsFromOfficialDetail(
  db: D1Database,
  serviceKey: string,
  categoryGroups: Map<string, string>,
  kstToday: string,
): Promise<EventEnrichmentCounts> {
  const counts: EventEnrichmentCounts = { ...NO_EVENT_ENRICHMENT };
  try {
    // 1. Category names: only groups with no cached code at all are looked up.
    for (const [groupCode, topCode] of categoryGroups) {
      if (counts.categoryLookups >= TOURAPI_DETAIL_POLICY.maxCategoryLookups) break;
      const cached = (await db.prepare(`SELECT code FROM tourapi_category_codes WHERE parent_code = ? LIMIT 1`)
        .bind(groupCode).all<{ code: string }>()).results ?? [];
      if (cached.length) continue;
      const url = buildDataGoKrUrl(
        "https://apis.data.go.kr/B551011/KorService2/categoryCode2",
        serviceKey,
        { MobileOS: "ETC", MobileApp: "KORETAIL", _type: "json", numOfRows: "100", pageNo: "1", contentTypeId: "15", cat1: topCode, cat2: groupCode },
      );
      counts.categoryLookups += 1;
      counts.providerRequests += 1;
      const codes = tourapiResultItems(await fetchOfficialJson(url, DATA_GO_KR_LOW_CALL_POLICY));
      const retrievedAt = nowIso();
      const statements: D1PreparedStatement[] = [];
      for (const item of codes) {
        const record = item as Record<string, unknown>;
        const code = typeof record?.code === "string" ? record.code.trim() : "";
        const name = typeof record?.name === "string" ? record.name.trim() : "";
        if (!code || !name) continue;
        statements.push(db.prepare(`INSERT INTO tourapi_category_codes (code, parent_code, name, retrieved_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(code) DO UPDATE SET name = excluded.name, retrieved_at = excluded.retrieved_at
          WHERE tourapi_category_codes.name <> excluded.name`).bind(code, groupCode, name, retrievedAt));
      }
      if (statements.length) counts.changedRows += (await runBatches(db, statements)).changedRows;
    }
    // One bounded statement names every event whose code is now known.
    const named = await db.prepare(`UPDATE tourism_events
      SET category_name = (SELECT c.name FROM tourapi_category_codes c WHERE c.code = tourism_events.category_code)
      WHERE category_name IS NULL AND category_code IS NOT NULL
        AND category_code IN (SELECT code FROM tourapi_category_codes)`).run();
    counts.categoriesNamed = Number(named.meta?.changes ?? 0);
    counts.changedRows += counts.categoriesNamed;

    // 2. Official detail, once per contentId, for events that have not ended.
    const pending = (await db.prepare(`SELECT DISTINCT content_id AS contentId FROM tourism_events
      WHERE detail_retrieved_at IS NULL AND COALESCE(event_end, event_start) >= ?
      ORDER BY event_start, content_id LIMIT ?`)
      .bind(kstToday, TOURAPI_DETAIL_POLICY.maxDetailFetches).all<{ contentId: string }>()).results ?? [];
    counts.detailPending = pending.length;
    for (const { contentId } of pending) {
      const url = buildDataGoKrUrl(
        "https://apis.data.go.kr/B551011/KorService2/detailCommon2",
        serviceKey,
        { MobileOS: "ETC", MobileApp: "KORETAIL", _type: "json", numOfRows: "1", pageNo: "1", contentId },
      );
      counts.providerRequests += 1;
      let detail: TourismEventDetail | null = null;
      try {
        detail = normalizeTourismEventDetail(tourapiResultItems(await fetchOfficialJson(url, DATA_GO_KR_LOW_CALL_POLICY))[0]);
      } catch {
        // Left unmarked so the next daily run retries it, within the same cap.
        counts.detailFailed += 1;
        // Two failures in one run mean the provider is unwell right now;
        // stop spending the retry policy's time budget on it today.
        if (counts.detailFailed >= 2) break;
        continue;
      }
      // A successful answer with nothing in it is still an answer: mark it so
      // the same contentId is not asked about every day.
      const result = await db.prepare(`UPDATE tourism_events SET
          overview = ?, homepage = ?,
          address_detail = COALESCE(address_detail, ?), tel = COALESCE(tel, ?),
          category_code = COALESCE(category_code, ?),
          detail_retrieved_at = ?
        WHERE content_id = ? AND detail_retrieved_at IS NULL`)
        .bind(detail?.overview ?? null, detail?.homepage ?? null, detail?.addressDetail ?? null, detail?.tel ?? null,
          detail?.categoryCode ?? null, nowIso(), contentId).run();
      counts.detailFetched += 1;
      counts.changedRows += Number(result.meta?.changes ?? 0);
    }
  } catch (error) {
    counts.failure = safeSourceFailureDetail(error);
  }
  return counts;
}

// T1 — one bounded Seoul festival query, mapped to areas by verified distance.
export async function collectTourismEvents(env: CollectorEnv, now = new Date()): Promise<CollectorResult> {
  const sourceId = "KTO_TOURAPI_EVENT";
  if (!env.DATA_GO_KR_SERVICE_KEY) {
    await writeCollectorStatus(env.DB, sourceId, "NEEDS_KEY", "DATA_GO_KR_SERVICE_KEY is not configured");
    await writeSourceHealth(env.DB, sourceId, "MISSING", "DATA_GO_KR_SERVICE_KEY is not configured");
    return { status: "NEEDS_KEY", records: 0 };
  }
  const kstToday = new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
  const windowStart = new Date(now.getTime() + 9 * 3_600_000 - 60 * 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");
  const windowEnd = new Date(now.getTime() + 9 * 3_600_000 + 30 * 86_400_000).toISOString().slice(0, 10);
  const url = buildDataGoKrUrl(
    "https://apis.data.go.kr/B551011/KorService2/searchFestival2",
    env.DATA_GO_KR_SERVICE_KEY,
    { MobileOS: "ETC", MobileApp: "KORETAIL", _type: "json", numOfRows: "100", pageNo: "1", eventStartDate: windowStart, lDongRegnCd: "11" },
  );
  try {
    const payload = await fetchOfficialJson(url, DATA_GO_KR_LOW_CALL_POLICY);
    const root = payload as { response?: { header?: { resultCode?: string }; body?: { items?: { item?: unknown[] | unknown } } } };
    const resultCode = root?.response?.header?.resultCode;
    if (resultCode !== "0000") throw new Error(`tourapi_result_${String(resultCode ?? "missing")}`);
    const rawItems = root?.response?.body?.items?.item;
    const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
    const retrievedAt = nowIso();
    const statements: D1PreparedStatement[] = [];
    let lastEvent: CanonicalTourismEvent | undefined;
    let mappedCount = 0;
    /** cat2 → cat1 for every mapped event; each group is one categoryCode2 lookup at most, once ever. */
    const categoryGroups = new Map<string, string>();
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const lat = Number(record.mapy);
      const lng = Number(record.mapx);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      for (const areaId of allAreaIds) {
        const mapping = areaMappings[areaId];
        const distance = distanceMeters(mapping.center, { lat, lng });
        if (distance > mapping.eventRadiusM) continue;
        const canonical = await normalizeTourismEvent({ ...record, dist: String(distance) }, areaId, retrievedAt);
        // Keep only events overlapping today .. +30d; existence ≠ attendance.
        if ((canonical.eventEnd ?? canonical.eventStart) < kstToday || canonical.eventStart > windowEnd) continue;
        lastEvent = canonical;
        mappedCount += 1;
        if (!env.DB) continue;
        // The list fields cat1/cat2/cat3, addr2 and tel were already in this
        // response and used to be discarded; storing them costs no request.
        statements.push(env.DB.prepare(`INSERT INTO tourism_events (
            id, source_id, record_origin, area, content_id, title, address, lat, lng, distance_m,
            event_start, event_end, published_at, retrieved_at, freshness, schema_version, quality_status, source_hash,
            category_code, category_group_code, address_detail, tel
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_id, area, content_id) DO UPDATE SET
            title = excluded.title,
            address = excluded.address,
            lat = excluded.lat,
            lng = excluded.lng,
            distance_m = excluded.distance_m,
            event_start = excluded.event_start,
            event_end = excluded.event_end,
            published_at = excluded.published_at,
            retrieved_at = excluded.retrieved_at,
            quality_status = excluded.quality_status,
            source_hash = excluded.source_hash,
            category_code = excluded.category_code,
            category_group_code = excluded.category_group_code,
            address_detail = COALESCE(excluded.address_detail, tourism_events.address_detail),
            tel = COALESCE(excluded.tel, tourism_events.tel)
          WHERE tourism_events.source_hash <> excluded.source_hash`)
          .bind(
            await sha256({ sourceId, area: areaId, contentId: canonical.contentId }),
            sourceId, canonical.recordOrigin, areaId, canonical.contentId, canonical.title, canonical.address,
            canonical.lat, canonical.lng, canonical.distanceM, canonical.eventStart, canonical.eventEnd,
            canonical.publishedAt, canonical.retrievedAt, canonical.freshness, canonical.schemaVersion,
            canonical.qualityStatus, canonical.sourceHash,
            canonical.categoryCode, canonical.categoryGroupCode, canonical.addressDetail, canonical.tel,
          ));
        if (canonical.categoryTopCode && canonical.categoryGroupCode) {
          categoryGroups.set(canonical.categoryGroupCode, canonical.categoryTopCode);
        }
      }
    }
    let written: D1WriteCounts = NO_D1_WRITES;
    if (env.DB && statements.length) written = await runBatches(env.DB, statements);
    // Official names and descriptions, each looked up once and then read from
    // D1 forever after. A failure here leaves the list collection intact.
    const enrichment = env.DB
      ? await enrichTourismEventsFromOfficialDetail(env.DB, env.DATA_GO_KR_SERVICE_KEY, categoryGroups, kstToday)
      : NO_EVENT_ENRICHMENT;
    const detail = `seoul events ${items.length}; mapped ${mappedCount}; ${describeWrites(written)}; ${describeEventEnrichment(enrichment)}`;
    const changedRows = written.changedRows + enrichment.changedRows;
    await writeCollectorStatus(env.DB, sourceId, "SUCCESS", detail, items.length, changedRows);
    await writeSourceHealth(env.DB, sourceId, "LIVE", detail, lastEvent ? { publishedAt: lastEvent.publishedAt, retrievedAt: lastEvent.retrievedAt, schemaVersion: lastEvent.schemaVersion } : undefined);
    return { status: "SUCCESS", records: changedRows, detail, providerRequests: 1 + enrichment.providerRequests };
  } catch (error) {
    const detail = safeSourceFailureDetail(error);
    await writeCollectorStatus(env.DB, sourceId, "ERROR", detail);
    await writeSourceHealth(env.DB, sourceId, "ERROR", detail);
    return { status: "ERROR", records: 0, detail };
  }
}

// A4 — departure-hall congestion; T2 stays N/A unless officially returned.
export async function collectAirportCongestion(env: CollectorEnv): Promise<CollectorResult> {
  const sourceId = "INCHEON_DEPARTURE_CONGESTION";
  if (!env.DATA_GO_KR_SERVICE_KEY) {
    await writeCollectorStatus(env.DB, sourceId, "NEEDS_KEY", "DATA_GO_KR_SERVICE_KEY is not configured");
    await writeSourceHealth(env.DB, sourceId, "MISSING", "DATA_GO_KR_SERVICE_KEY is not configured");
    return { status: "NEEDS_KEY", records: 0 };
  }
  const statements: D1PreparedStatement[] = [];
  const failures: string[] = [];
  const terminalCounts: string[] = [];
  let lastRow: CanonicalAirportCongestion | undefined;
  let written: D1WriteCounts = NO_D1_WRITES;
  for (const terminalId of ["P01"]) {
    const url = buildDataGoKrUrl(
      "https://apis.data.go.kr/B551177/statusOfDepartureCongestion/getDepartureCongestion",
      env.DATA_GO_KR_SERVICE_KEY,
      { pageNo: "1", numOfRows: "50", type: "json", terminalId },
    );
    try {
      const payload = await fetchOfficialJson(url, DATA_GO_KR_LOW_CALL_POLICY);
      const root = payload as { response?: { header?: { resultCode?: string }; body?: { items?: unknown[] | { item?: unknown[] | unknown } } } };
      const resultCode = root?.response?.header?.resultCode;
      if (resultCode !== "00") throw new Error(`congestion_result_${String(resultCode ?? "missing")}`);
      const bodyItems = root?.response?.body?.items;
      const rawItems = Array.isArray(bodyItems) ? bodyItems : bodyItems?.item;
      const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
      terminalCounts.push(`${terminalId}:${items.length}`);
      const retrievedAt = nowIso();
      for (const item of items) {
        const canonical = await normalizeAirportCongestion(item, retrievedAt);
        lastRow = canonical;
        if (!env.DB) continue;
        statements.push(env.DB.prepare(`INSERT INTO airport_congestion (
            id, source_id, record_origin, terminal, zone, wait_time_minutes, wait_time_raw, waiting_count,
            observed_at, retrieved_at, freshness, schema_version, quality_status, source_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_id, terminal, zone, observed_at) DO NOTHING`)
          .bind(
            await sha256({ sourceId, terminal: canonical.terminal, zone: canonical.zone, observedAt: canonical.observedAt }),
            sourceId, canonical.recordOrigin, canonical.terminal, canonical.zone, canonical.waitTimeMinutes, canonical.waitTimeRaw,
            canonical.waitingCount, canonical.observedAt, canonical.retrievedAt, canonical.freshness,
            canonical.schemaVersion, canonical.qualityStatus, canonical.sourceHash,
          ));
      }
    } catch (error) {
      failures.push(`${terminalId}: ${safeSourceFailureDetail(error)}`);
    }
  }
  if (env.DB && statements.length) written = await runBatches(env.DB, statements);
  const detail = `terminals ${terminalCounts.join(", ") || "none"}; ${describeWrites(written)}${failures.length ? `; failed ${failures.join(" | ")}` : ""}`;
  if (failures.length === 1) {
    await writeCollectorStatus(env.DB, sourceId, "ERROR", detail);
    await writeSourceHealth(env.DB, sourceId, "ERROR", detail);
    return { status: "ERROR", records: 0, detail };
  }
  await writeCollectorStatus(env.DB, sourceId, failures.length ? "PARTIAL" : "SUCCESS", detail, terminalCounts.length, written.changedRows);
  await writeSourceHealth(env.DB, sourceId, "LIVE", detail, lastRow ? { eventAt: lastRow.observedAt, retrievedAt: lastRow.retrievedAt, schemaVersion: lastRow.schemaVersion } : undefined);
  return { status: failures.length ? "PARTIAL" : "SUCCESS", records: written.changedRows, detail };
}

const A4_T2_PAGE_SIZE = 20;
const A4_T2_MAX_PAGES = 3;

/**
 * A4-T2 — 출국장 혼잡도 제2여객터미널 (dataset 15161098). One all-gates
 * request per collection (gateId intentionally omitted — the official
 * guide's own "gateId=P03" sample is wrong; P03 is the response's
 * terminalId meaning T2, not a valid gateId). Bounded pagination only
 * triggers if totalCount ever exceeds one page. A row that fails to
 * normalize (malformed gate/time/count) is skipped rather than aborting the
 * whole run or being fabricated. Shares the airport_congestion table with
 * A4-T1 via a distinct sourceId + terminal='T2'; they can never overwrite
 * each other because both are part of the table's unique key.
 */
export async function collectAirportCongestionT2(env: CollectorEnv): Promise<CollectorResult> {
  const sourceId = "INCHEON_DEPARTURE_CONGESTION_T2";
  if (!env.DATA_GO_KR_SERVICE_KEY) {
    await writeCollectorStatus(env.DB, sourceId, "NEEDS_KEY", "DATA_GO_KR_SERVICE_KEY is not configured");
    await writeSourceHealth(env.DB, sourceId, "MISSING", "DATA_GO_KR_SERVICE_KEY is not configured");
    return { status: "NEEDS_KEY", records: 0 };
  }
  const statements: D1PreparedStatement[] = [];
  const rowFailures: string[] = [];
  let lastRow: CanonicalAirportCongestion | undefined;
  let written: D1WriteCounts = NO_D1_WRITES;
  let pagesFetched = 0;
  let normalizedCount = 0;
  let totalCount: number | null = null;
  const retrievedAt = nowIso();
  try {
    for (let pageNo = 1; pageNo <= A4_T2_MAX_PAGES; pageNo += 1) {
      const url = buildDataGoKrUrl(
        "https://apis.data.go.kr/B551177/statusOfDepartureCongestionT2/getDepartureCongestionT2",
        env.DATA_GO_KR_SERVICE_KEY,
        { pageNo: String(pageNo), numOfRows: String(A4_T2_PAGE_SIZE), type: "json" },
      );
      const payload = await fetchOfficialJson(url, DATA_GO_KR_PAGED_POLICY);
      const root = payload as { response?: { header?: { resultCode?: string }; body?: { items?: unknown[] | { item?: unknown[] | unknown }; totalCount?: number } } };
      const resultCode = root?.response?.header?.resultCode;
      if (resultCode !== "00") throw new Error(`congestion_t2_result_${String(resultCode ?? "missing")}`);
      const bodyItems = root?.response?.body?.items;
      const rawItems = Array.isArray(bodyItems) ? bodyItems : bodyItems?.item;
      const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
      pagesFetched += 1;
      totalCount = typeof root?.response?.body?.totalCount === "number" ? root.response.body.totalCount : totalCount;
      for (const item of items) {
        try {
          const canonical = await normalizeAirportCongestionT2(item, retrievedAt);
          normalizedCount += 1;
          lastRow = canonical;
          if (!env.DB) continue;
          statements.push(env.DB.prepare(`INSERT INTO airport_congestion (
              id, source_id, record_origin, terminal, zone, wait_time_minutes, wait_time_raw, waiting_count,
              observed_at, retrieved_at, freshness, schema_version, quality_status, source_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_id, terminal, zone, observed_at) DO NOTHING`)
            .bind(
              await sha256({ sourceId, terminal: canonical.terminal, zone: canonical.zone, observedAt: canonical.observedAt }),
              sourceId, canonical.recordOrigin, canonical.terminal, canonical.zone, canonical.waitTimeMinutes, canonical.waitTimeRaw,
              canonical.waitingCount, canonical.observedAt, canonical.retrievedAt, canonical.freshness,
              canonical.schemaVersion, canonical.qualityStatus, canonical.sourceHash,
            ));
        } catch (error) {
          rowFailures.push(safeSourceFailureDetail(error));
        }
      }
      if (totalCount === null || pageNo * A4_T2_PAGE_SIZE >= totalCount || items.length < A4_T2_PAGE_SIZE) break;
    }
  } catch (error) {
    const detail = safeSourceFailureDetail(error);
    // A provider ERROR here must never touch existing T1/T2 rows already in
    // D1 — only source_health/collector_runs are written, so the last-good
    // congestion rows remain exactly as they were.
    await writeCollectorStatus(env.DB, sourceId, "ERROR", detail);
    await writeSourceHealth(env.DB, sourceId, "ERROR", detail);
    return { status: "ERROR", records: 0, detail };
  }
  if (env.DB && statements.length) written = await runBatches(env.DB, statements);
  const detail = `pages ${pagesFetched}; totalCount ${totalCount ?? "unknown"}; normalized ${normalizedCount}; ${describeWrites(written)}${rowFailures.length ? `; row failures ${rowFailures.length}` : ""}`;
  if (normalizedCount === 0) {
    await writeCollectorStatus(env.DB, sourceId, "ERROR", "congestion_t2_no_data");
    await writeSourceHealth(env.DB, sourceId, "ERROR", "congestion_t2_no_data");
    return { status: "ERROR", records: 0, detail: "congestion_t2_no_data" };
  }
  await writeCollectorStatus(env.DB, sourceId, rowFailures.length ? "PARTIAL" : "SUCCESS", detail, normalizedCount, written.changedRows);
  await writeSourceHealth(env.DB, sourceId, "LIVE", detail, lastRow ? { eventAt: lastRow.observedAt, retrievedAt: lastRow.retrievedAt, schemaVersion: lastRow.schemaVersion } : undefined);
  return { status: rowFailures.length ? "PARTIAL" : "SUCCESS", records: written.changedRows, detail };
}

const A5_PAGE_SIZE = 50;
const A5_MAX_PAGES = 3;

/**
 * How recently A5 must have been fetched to count as the current cycle's.
 *
 * The primary runs hourly, so anything retrieved inside the last hour came
 * from this cycle. Declared here because the collector needs it to decide
 * whether "complete" is also "current"; lib/collection-recovery.ts re-exports
 * it as FORECAST_FRESH_WITHIN_MS so both sides use one number.
 */
export const A5_FRESH_WITHIN_MS = 60 * 60_000;

/** The two KST days A5 must always cover: today and tomorrow. */
function a5RequiredDays(now: Date): [string, string] {
  const kstDay = (offsetDays: number) =>
    new Date(now.getTime() + 9 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
  return [kstDay(0), kstDay(1)];
}

export interface RequiredForecastCoverage {
  days: Array<{ targetDate: string; coverage: string; retrievedAt: string | null; completeAndCurrent: boolean }>;
  /** When A5 was last collected successfully, from source_health. */
  lastCollectedAt: string | null;
  /** Both required days COMPLETE across T1+T2 and collected within the hour. */
  completeAndCurrent: boolean;
  /**
   * Any stored A5 row at all, table-wide.
   *
   * Deliberately NOT "rows for the two required days": the question this
   * answers is whether a failed refresh destroyed anything, and the honest
   * answer is no as long as the dataset still holds rows. Completeness of the
   * required days is tracked separately in `days`.
   */
  anyStoredRow: boolean;
  /** A D1 read threw, so the answer is unverified rather than known. */
  readFailed: boolean;
}

/**
 * Reads back what A5 coverage actually EXISTS after a collection.
 *
 * Source health used to be derived from whether a whole day's request threw,
 * which is not the same question. Production run 33478751045 collected 48 row
 * groups, reported PARTIAL, and still wrote LIVE — "some rows parsed" is not
 * evidence that today and tomorrow are covered. The only honest answer comes
 * from the stored rows, judged by the same completeness contract the product
 * uses (summarizeTodayPassengerForecast: COMPLETE requires both terminals on
 * a matching full-day band grid).
 */
export async function readRequiredForecastCoverage(
  db: D1Database | undefined,
  now: Date,
  confirmedAt?: string,
): Promise<RequiredForecastCoverage> {
  const freshFrom = now.getTime() - A5_FRESH_WITHIN_MS;
  const days: RequiredForecastCoverage["days"] = [];
  let readFailed = false;
  let anyStoredRow = false;
  try {
    anyStoredRow = await hasStoredRow(db, `SELECT 1 AS present FROM airport_passenger_forecast LIMIT 1`);
  } catch {
    readFailed = true;
  }

  // WHEN A5 was last collected cannot be read from the rows. Writes are
  // changed-only by design, so an unchanged forecast leaves every row's
  // retrieved_at at the moment the VALUE last moved, not the moment we last
  // confirmed it. Judging freshness from rows therefore made a successful
  // re-collection look stale forever, which is why the :53 window re-requested
  // both days every hour. source_health.last_retrieved_at advances on every
  // successful collection, so that is the honest source for "current".
  let lastCollectedAt: string | null = confirmedAt ?? null;
  if (!lastCollectedAt) {
    try {
      const stored = db
        ? (await db.prepare(
            `SELECT last_retrieved_at AS lastRetrievedAt FROM source_health WHERE source_id = ?`,
          ).bind("INCHEON_PASSENGER_FORECAST").all<{ lastRetrievedAt?: string | null }>()).results ?? []
        : [];
      const value = stored[0]?.lastRetrievedAt;
      lastCollectedAt = typeof value === "string" && value ? value : null;
    } catch {
      readFailed = true;
    }
  }
  const collectionIsCurrent = Boolean(lastCollectedAt) && Date.parse(lastCollectedAt!) >= freshFrom;

  for (const targetDate of a5RequiredDays(now)) {
    let rows: Array<Record<string, unknown>> = [];
    try {
      if (db) {
        const result = await db.prepare(
          `SELECT terminal, direction, is_aggregate AS isAggregate, target_date AS targetDate,
             time_band_raw AS timeBandRaw, target_start_at AS targetStartAt,
             target_end_at AS targetEndAt, expected_passengers AS expectedPassengers,
             retrieved_at AS retrievedAt
           FROM airport_passenger_forecast
           WHERE direction = 'departure' AND is_aggregate = 1 AND target_date = ?
           ORDER BY target_start_at, terminal LIMIT 96`,
        ).bind(targetDate).all<Record<string, unknown>>();
        rows = result.results ?? [];
      }
    } catch {
      readFailed = true;
    }
    const summary = summarizeTodayPassengerForecast(rows as unknown as AirportForecastAggregateRow[], targetDate);
    days.push({
      targetDate,
      coverage: summary.coverage.all,
      retrievedAt: summary.retrievedAt,
      completeAndCurrent: summary.coverage.all === "COMPLETE" && collectionIsCurrent,
    });
  }

  return {
    days,
    lastCollectedAt,
    completeAndCurrent: days.every((day) => day.completeAndCurrent),
    anyStoredRow,
    readFailed,
  };
}

/**
 * A bounded, content-free description of a rejected provider field.
 *
 * The brief allows a redacted representation of the offending field so the
 * next natural run can confirm what is being dropped without anyone printing
 * a payload. This emits only a type, a coarse length bucket and a character
 * class from a fixed vocabulary, so it can never carry a value, a key or a
 * URL no matter what the provider sends.
 */
export function describeA5FieldShape(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "number") return "number";
  if (typeof value !== "string") return typeof value;
  const trimmed = value.trim();
  if (!trimmed) return "string:empty";
  const length = trimmed.length <= 4 ? "len1_4" : trimmed.length <= 8 ? "len5_8" : trimmed.length <= 16 ? "len9_16" : "len17plus";
  const cls = /^[0-9]+$/.test(trimmed) ? "digits"
    : /^[A-Za-z]+$/.test(trimmed) ? "alpha"
    : /^[\uAC00-\uD7A3]+$/.test(trimmed) ? "hangul"
    : /[\uAC00-\uD7A3]/.test(trimmed) ? "hangul_mixed"
    : /^[0-9A-Za-z]+$/.test(trimmed) ? "alnum"
    : "other";
  return `string:${cls}:${length}`;
}

/**
 * A5 — 승객예고-출·입국장별 (dataset 15095066, V5.0, passgrAnncmt). Queries
 * BOTH selectdate=0 (today) and selectdate=1 (tomorrow) every cycle — the
 * normal cost is ~2 provider requests/cycle, with bounded pagination only if
 * a day's totalCount ever exceeds one page. This is FORECAST data and never
 * writes to airport_congestion or any A4 table; A4 source health is never
 * touched by this collector, so an A5 failure cannot alter A4 status.
 */
export interface ForecastCollectionOptions extends TargetedCollectionOptions {
  /** Restricts the run to these days. Defaults to both, as the primary does. */
  selectdates?: readonly ("0" | "1")[];
  /**
   * The moment this collection represents. The runner threads one `now`
   * through every source; A5 used wall-clock time instead, so its stored
   * retrievedAt and its freshness judgement could disagree with the rest of
   * the cycle and could not be pinned in a test.
   */
  now?: Date;
}

export async function collectAirportPassengerForecast(
  env: CollectorEnv,
  options: ForecastCollectionOptions = {},
): Promise<CollectorResult> {
  const sourceId = "INCHEON_PASSENGER_FORECAST";
  const selectdates = options.selectdates ?? (["0", "1"] as const);
  const mode = options.mode ?? "PRIMARY";
  if (!env.DATA_GO_KR_SERVICE_KEY) {
    await writeCollectorStatus(env.DB, sourceId, "NEEDS_KEY", "DATA_GO_KR_SERVICE_KEY is not configured");
    await writeSourceHealth(env.DB, sourceId, "MISSING", "DATA_GO_KR_SERVICE_KEY is not configured");
    return { status: "NEEDS_KEY", records: 0 };
  }
  const statements: D1PreparedStatement[] = [];
  // A failed DAY means a requested day was not collected at all; a failed ROW
  // is one malformed record inside an otherwise collected day. Only the first
  // means the required coverage is incomplete.
  const dayFailures: string[] = [];
  const rowFailures: string[] = [];
  let lastRow: CanonicalAirportPassengerForecastRow | undefined;
  let written: D1WriteCounts = NO_D1_WRITES;
  let normalizedRowGroups = 0;
  let requestCount = 0;
  const collectedAt = options.now ?? new Date();
  const retrievedAt = collectedAt.toISOString();
  for (const selectdate of selectdates) {
    try {
      let totalCount: number | null = null;
      for (let pageNo = 1; pageNo <= A5_MAX_PAGES; pageNo += 1) {
        const url = buildDataGoKrUrl(
          "https://apis.data.go.kr/B551177/passgrAnncmt/getPassgrAnncmt",
          env.DATA_GO_KR_SERVICE_KEY,
          { pageNo: String(pageNo), numOfRows: String(A5_PAGE_SIZE), type: "json", selectdate },
        );
        const payload = await fetchOfficialJson(url, { timeoutMs: 30_000, retries: 0 });
        requestCount += 1;
        const root = payload as { response?: { header?: { resultCode?: string }; body?: { items?: unknown[] | { item?: unknown[] | unknown }; totalCount?: number } } };
        const resultCode = root?.response?.header?.resultCode;
        if (resultCode !== "00") throw new Error(`forecast_result_${String(resultCode ?? "missing")}`);
        const bodyItems = root?.response?.body?.items;
        const rawItems = Array.isArray(bodyItems) ? bodyItems : bodyItems?.item;
        const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
        totalCount = typeof root?.response?.body?.totalCount === "number" ? root.response.body.totalCount : totalCount;
        for (const item of items) {
          let rows: CanonicalAirportPassengerForecastRow[];
          try {
            rows = await normalizeAirportPassengerForecastRow(item, retrievedAt);
          } catch (error) {
            const reason = error instanceof Error ? error.message : "row_error";
            // Content-free: type + length bucket + character class only.
            const shape = describeA5FieldShape((item as { adate?: unknown })?.adate);
            rowFailures.push(`row: ${reason} (adate ${shape})`);
            continue;
          }
          normalizedRowGroups += 1;
          for (const rowRecord of rows) {
            lastRow = rowRecord;
            if (!env.DB) continue;
            statements.push(env.DB.prepare(`INSERT INTO airport_passenger_forecast (
                id, source_id, record_origin, terminal, direction, zone, is_aggregate,
                target_date, time_band_raw, target_start_at, target_end_at, expected_passengers,
                retrieved_at, schema_version, quality_status, source_hash
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(source_id, terminal, direction, zone, target_date, time_band_raw) DO UPDATE SET
                target_start_at = excluded.target_start_at,
                target_end_at = excluded.target_end_at,
                expected_passengers = excluded.expected_passengers,
                retrieved_at = excluded.retrieved_at,
                quality_status = excluded.quality_status,
                source_hash = excluded.source_hash
              WHERE airport_passenger_forecast.source_hash <> excluded.source_hash`)
              .bind(
                await sha256({ sourceId, terminal: rowRecord.terminal, direction: rowRecord.direction, zone: rowRecord.zone, targetDate: rowRecord.targetDate, timeBandRaw: rowRecord.timeBandRaw }),
                sourceId, rowRecord.recordOrigin, rowRecord.terminal, rowRecord.direction, rowRecord.zone, rowRecord.isAggregate ? 1 : 0,
                rowRecord.targetDate, rowRecord.timeBandRaw, rowRecord.targetStartAt, rowRecord.targetEndAt, rowRecord.expectedPassengers,
                rowRecord.retrievedAt, rowRecord.schemaVersion, rowRecord.qualityStatus, rowRecord.sourceHash,
              ));
          }
        }
        if (totalCount === null || pageNo * A5_PAGE_SIZE >= totalCount || items.length < A5_PAGE_SIZE) break;
      }
    } catch (error) {
      dayFailures.push(`selectdate=${selectdate}: ${error instanceof Error ? redactServiceKey(error.message) : "collector_error"}`);
    }
  }
  if (env.DB && statements.length) written = await runBatches(env.DB, statements);

  // The provider returns exactly one NON-BAND row per request whose `adate` is
  // not a date (docs/DATA_TRUTH_AUDIT_2026-08-31.md). Rejecting it is correct
  // and must stay — validation is not weakened here. What was wrong is
  // counting that expected structural drop as a collection failure, which made
  // every single run PARTIAL forever. Anything BEYOND one per request is not
  // structural, so it still counts.
  const expectedNonBandDrops = requestCount;
  const unexpectedRowFailures = Math.max(0, rowFailures.length - expectedNonBandDrops);

  // Health answers "is the required coverage there", so it is read back from
  // the stored rows rather than inferred from how the requests went.
  const confirmedNow = normalizedRowGroups > 0 && dayFailures.length === 0 ? retrievedAt : undefined;
  const coverage = await readRequiredForecastCoverage(env.DB, collectedAt, confirmedNow);
  const coverageNote = coverage.days.map((day) => `${day.targetDate}=${day.coverage}${day.completeAndCurrent ? "/current" : "/stale"}`).join(" ")
    + `; lastCollectedAt=${coverage.lastCollectedAt ?? "none"}`;
  const lastGoodPreserved = options.hasUsableLastGood ?? coverage.anyStoredRow;

  const failures = [...dayFailures, ...rowFailures];
  const detail = `mode=${mode}; selectdates ${selectdates.join(",")}; requests ${requestCount}; normalized rows ${normalizedRowGroups}; ${describeWrites(written)}; coverage ${coverageNote}${coverage.readFailed ? " d1ReadFailed=true" : ""}${failures.length ? `; failed ${failures.join(" | ")}` : ""}`;

  // Required coverage present and collected this cycle: the only state that
  // may be called LIVE. A PARTIAL collection never reaches this branch.
  if (coverage.completeAndCurrent && dayFailures.length === 0 && unexpectedRowFailures === 0) {
    await writeCollectorStatus(env.DB, sourceId, "SUCCESS", detail, normalizedRowGroups, written.changedRows);
    await writeSourceHealth(env.DB, sourceId, "LIVE", detail, lastRow ? { eventAt: lastRow.targetStartAt, retrievedAt: lastRow.retrievedAt, schemaVersion: lastRow.schemaVersion } : undefined);
    return { status: "SUCCESS", records: written.changedRows, detail, providerRequests: requestCount, sourceHealth: "LIVE", lastGoodPreserved };
  }

  // Coverage is not proven. Usable stored rows make this STALE; nothing usable
  // makes it ERROR. Either way nothing stored was deleted, zeroed or faked.
  const health: SourceHealthStatus = lastGoodPreserved ? "STALE" : "ERROR";
  const status = normalizedRowGroups === 0 ? "ERROR" : "PARTIAL";
  await writeCollectorStatus(env.DB, sourceId, status, detail || "forecast_no_data");
  await writeSourceHealth(env.DB, sourceId, health, detail || "forecast_no_data");
  return { status, records: written.changedRows, detail, providerRequests: requestCount, sourceHealth: health, lastGoodPreserved };
}

export async function runScheduledCollectors(env: CollectorEnv): Promise<void> {
  await collectAirportFlights(env);
  if (!env.SEOUL_OPEN_DATA_KEY) await writeCollectorStatus(env.DB, "SEOUL_OPEN_DATA", "NEEDS_KEY", "SEOUL_OPEN_DATA_KEY is not configured");
  if (!env.KMA_SERVICE_KEY) await writeCollectorStatus(env.DB, "KMA_WEATHER", "NEEDS_KEY", "KMA_SERVICE_KEY is not configured");
}

export async function pruneOperationalHistory(db: D1Database | undefined, now = new Date()): Promise<number> {
  if (!db) return 0;
  const flightCutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const runCutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const results = await db.batch([
    db.prepare(`DELETE FROM airport_flight_changes WHERE id IN (
      SELECT id FROM airport_flight_changes WHERE observed_at < ? ORDER BY observed_at LIMIT 1500
    )`).bind(flightCutoff),
    db.prepare(`DELETE FROM collector_runs WHERE run_id IN (
      SELECT run_id FROM collector_runs WHERE started_at < ? ORDER BY started_at LIMIT 100
    )`).bind(runCutoff),
  ]);
  return results.reduce((sum, result) => sum + Number(result.meta?.rows_written ?? 0), 0);
}
