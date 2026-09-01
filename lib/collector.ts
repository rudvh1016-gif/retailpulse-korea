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
  normalizeTourismEvent,
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
  type CanonicalTourismEvent,
  type CanonicalWeatherForecast,
} from "./source-adapters";
import { buildDataGoKrUrl } from "./data-go-kr.mjs";
import { describeWrites, NO_D1_WRITES, runD1Batches, type D1WriteCounts } from "./d1-write-counts";
import { allAreaIds, areaMappings, distanceMeters, uniqueKmaGrids } from "./areas";
import { sha256 } from "./hash";
import {
  aggregateSeoulForeignByArea,
  normalizeSeoulForeignRows,
  SEOUL_FOREIGN_SOURCE_ID,
  type CanonicalSeoulForeignArea,
  type CanonicalSeoulForeignDong,
} from "./seoul-foreign";

export interface CollectorEnv {
  DB?: D1Database;
  DATA_GO_KR_SERVICE_KEY?: string;
  SEOUL_OPEN_DATA_KEY?: string;
  KMA_SERVICE_KEY?: string;
  retainChangeHistory?: boolean;
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

async function writeCollectorStatus(
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

async function writeSourceHealth(
  db: D1Database | undefined,
  sourceId: string,
  status: "LIVE" | "MISSING" | "ERROR" | "OFFICIAL_HISTORICAL",
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
      consecutive_failures = CASE WHEN excluded.status = 'ERROR' THEN source_health.consecutive_failures + 1 ELSE 0 END,
      schema_version = excluded.schema_version,
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
    const detail = `A1_PRIMARY_A2_ENRICHMENT; compared ${normalized.length}; matched writes ${matched}`;
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
  status: "SUCCESS" | "PARTIAL" | "ERROR" | "NEEDS_KEY" | "NO_DATA";
  records: number;
  /** Secret-free operational detail safe for collector_runs and Actions logs. */
  detail?: string;
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

// S1 — Seoul real-time city data, one bounded call per target area.
export async function collectSeoulRealtime(env: CollectorEnv): Promise<CollectorResult> {
  const sourceId = "SEOUL_CITYDATA_PPLTN";
  if (!env.SEOUL_OPEN_DATA_KEY) {
    await writeCollectorStatus(env.DB, sourceId, "NEEDS_KEY", "SEOUL_OPEN_DATA_KEY is not configured");
    await writeSourceHealth(env.DB, sourceId, "MISSING", "SEOUL_OPEN_DATA_KEY is not configured");
    return { status: "NEEDS_KEY", records: 0 };
  }
  const statements: D1PreparedStatement[] = [];
  let lastObserved: CanonicalSeoulRealtime | undefined;
  const failures: string[] = [];
  let written: D1WriteCounts = NO_D1_WRITES;
  for (const areaId of allAreaIds) {
    const mapping = areaMappings[areaId];
    const url = new URL(`http://openapi.seoul.go.kr:8088/${env.SEOUL_OPEN_DATA_KEY}/json/citydata_ppltn/1/5/${mapping.seoulPoiCode}`);
    try {
      const payload = await fetchOfficialJson(url, { timeoutMs: 8_000, retries: 1 });
      const record = seoulEnvelopeRows(payload, "SeoulRtd.citydata_ppltn")[0];
      if (!record) throw new Error("seoul_realtime_empty");
      const retrievedAt = nowIso();
      const { observed, forecasts } = await normalizeSeoulRealtime(record, areaId, retrievedAt);
      lastObserved = observed;
      if (env.DB) {
        statements.push(env.DB.prepare(`INSERT INTO seoul_realtime_area (
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
            await sha256({ sourceId, area: areaId, observedAt: observed.observedAt }),
            sourceId, observed.recordOrigin, areaId, observed.areaCode, observed.areaName,
            observed.congestionLevel, observed.congestionLabel, observed.populationMin, observed.populationMax,
            observed.observedAt, observed.retrievedAt, observed.freshness, observed.schemaVersion,
            observed.qualityStatus, observed.sourceHash,
          ));
        for (const forecast of forecasts) {
          statements.push(env.DB.prepare(`INSERT INTO seoul_realtime_forecast (
              id, source_id, area, issued_at, target_at, congestion_level, congestion_label,
              population_min, population_max, retrieved_at, schema_version, quality_status, source_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_id, area, issued_at, target_at) DO NOTHING`)
            .bind(
              await sha256({ sourceId, area: areaId, issuedAt: forecast.issuedAt, targetAt: forecast.targetAt }),
              sourceId, areaId, forecast.issuedAt, forecast.targetAt, forecast.congestionLevel, forecast.congestionLabel,
              forecast.populationMin, forecast.populationMax, forecast.retrievedAt, forecast.schemaVersion,
              forecast.qualityStatus, forecast.sourceHash,
            ));
        }
      }
    } catch (error) {
      failures.push(`${areaId}: ${error instanceof Error ? redactSeoulUrl(error.message) : "collector_error"}`);
    }
  }
  if (env.DB && statements.length) written = await runBatches(env.DB, statements);
  const okCount = allAreaIds.length - failures.length;
  const detail = `areas ok ${okCount}/${allAreaIds.length}; ${describeWrites(written)}${failures.length ? `; failed ${failures.join(" | ")}` : ""}`;
  if (okCount === 0) {
    await writeCollectorStatus(env.DB, sourceId, "ERROR", detail);
    await writeSourceHealth(env.DB, sourceId, "ERROR", detail);
    return { status: "ERROR", records: 0 };
  }
  await writeCollectorStatus(env.DB, sourceId, failures.length ? "PARTIAL" : "SUCCESS", detail, okCount, written.changedRows);
  await writeSourceHealth(env.DB, sourceId, "LIVE", detail, lastObserved);
  return { status: failures.length ? "PARTIAL" : "SUCCESS", records: written.changedRows };
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
export async function collectWeatherForecasts(env: CollectorEnv, now = new Date()): Promise<CollectorResult> {
  const sourceId = "KMA_VILAGE_FCST";
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
  for (const grid of uniqueKmaGrids()) {
    const url = buildDataGoKrUrl(
      "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst",
      serviceKey,
      { pageNo: "1", numOfRows: "1000", dataType: "JSON", base_date: baseDate, base_time: baseTime, nx: String(grid.nx), ny: String(grid.ny) },
    );
    try {
      const payload = await fetchOfficialJson(url, KMA_GRID_RETRY_POLICY);
      const root = payload as { response?: { header?: { resultCode?: string }; body?: { items?: { item?: unknown[] } } } };
      const resultCode = root?.response?.header?.resultCode;
      if (resultCode !== "00") throw new Error(`kma_result_${String(resultCode ?? "missing")}`);
      const items = Array.isArray(root?.response?.body?.items?.item) ? root.response.body.items.item : [];
      const retrievedAt = nowIso();
      for (const areaId of grid.areas) {
        const rows = (await normalizeWeatherForecast(items, areaId, retrievedAt)).filter((row) => row.targetAt <= horizon);
        for (const row of rows) {
          lastForecast = row;
          if (!env.DB) continue;
          statements.push(env.DB.prepare(`INSERT INTO weather_forecast (
              id, source_id, area, issued_at, target_at, retrieved_at,
              precipitation_probability, temperature_tenth_c, condition_code,
              schema_version, quality_status, source_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_id, area, issued_at, target_at) DO NOTHING`)
            .bind(
              await sha256({ sourceId, area: areaId, issuedAt: row.issuedAt, targetAt: row.targetAt }),
              sourceId, areaId, row.issuedAt, row.targetAt, row.retrievedAt,
              row.precipitationProbability, row.temperatureTenthC, row.conditionCode,
              row.schemaVersion, row.qualityStatus, row.sourceHash,
            ));
        }
      }
    } catch (error) {
      failures.push(`grid ${grid.nx},${grid.ny}: ${safeSourceFailureDetail(error)}`);
    }
  }
  if (env.DB && statements.length) written = await runBatches(env.DB, statements);
  const gridCount = uniqueKmaGrids().length;
  const okCount = gridCount - failures.length;
  const detail = `grids ok ${okCount}/${gridCount}; base ${baseDate}${baseTime}; ${describeWrites(written)}${failures.length ? `; failed ${failures.join(" | ")}` : ""}`;
  if (okCount === 0) {
    await writeCollectorStatus(env.DB, sourceId, "ERROR", detail);
    await writeSourceHealth(env.DB, sourceId, "ERROR", detail);
    return { status: "ERROR", records: 0, detail };
  }
  await writeCollectorStatus(env.DB, sourceId, failures.length ? "PARTIAL" : "SUCCESS", detail, okCount, written.changedRows);
  await writeSourceHealth(env.DB, sourceId, "LIVE", detail, lastForecast ? { retrievedAt: lastForecast.retrievedAt, schemaVersion: lastForecast.schemaVersion } : undefined);
  return { status: failures.length ? "PARTIAL" : "SUCCESS", records: written.changedRows, detail };
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
        statements.push(env.DB.prepare(`INSERT INTO tourism_events (
            id, source_id, record_origin, area, content_id, title, address, lat, lng, distance_m,
            event_start, event_end, published_at, retrieved_at, freshness, schema_version, quality_status, source_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            source_hash = excluded.source_hash
          WHERE tourism_events.source_hash <> excluded.source_hash`)
          .bind(
            await sha256({ sourceId, area: areaId, contentId: canonical.contentId }),
            sourceId, canonical.recordOrigin, areaId, canonical.contentId, canonical.title, canonical.address,
            canonical.lat, canonical.lng, canonical.distanceM, canonical.eventStart, canonical.eventEnd,
            canonical.publishedAt, canonical.retrievedAt, canonical.freshness, canonical.schemaVersion,
            canonical.qualityStatus, canonical.sourceHash,
          ));
      }
    }
    let written: D1WriteCounts = NO_D1_WRITES;
    if (env.DB && statements.length) written = await runBatches(env.DB, statements);
    const detail = `seoul events ${items.length}; mapped ${mappedCount}; ${describeWrites(written)}`;
    await writeCollectorStatus(env.DB, sourceId, "SUCCESS", detail, items.length, written.changedRows);
    await writeSourceHealth(env.DB, sourceId, "LIVE", detail, lastEvent ? { publishedAt: lastEvent.publishedAt, retrievedAt: lastEvent.retrievedAt, schemaVersion: lastEvent.schemaVersion } : undefined);
    return { status: "SUCCESS", records: written.changedRows, detail };
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
 * A5 — 승객예고-출·입국장별 (dataset 15095066, V5.0, passgrAnncmt). Queries
 * BOTH selectdate=0 (today) and selectdate=1 (tomorrow) every cycle — the
 * normal cost is ~2 provider requests/cycle, with bounded pagination only if
 * a day's totalCount ever exceeds one page. This is FORECAST data and never
 * writes to airport_congestion or any A4 table; A4 source health is never
 * touched by this collector, so an A5 failure cannot alter A4 status.
 */
export async function collectAirportPassengerForecast(env: CollectorEnv): Promise<CollectorResult> {
  const sourceId = "INCHEON_PASSENGER_FORECAST";
  if (!env.DATA_GO_KR_SERVICE_KEY) {
    await writeCollectorStatus(env.DB, sourceId, "NEEDS_KEY", "DATA_GO_KR_SERVICE_KEY is not configured");
    await writeSourceHealth(env.DB, sourceId, "MISSING", "DATA_GO_KR_SERVICE_KEY is not configured");
    return { status: "NEEDS_KEY", records: 0 };
  }
  const statements: D1PreparedStatement[] = [];
  const dayFailures: string[] = [];
  let lastRow: CanonicalAirportPassengerForecastRow | undefined;
  let written: D1WriteCounts = NO_D1_WRITES;
  let normalizedRowGroups = 0;
  let requestCount = 0;
  const retrievedAt = nowIso();
  for (const selectdate of ["0", "1"] as const) {
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
            dayFailures.push(`row: ${error instanceof Error ? error.message : "row_error"}`);
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
  const detail = `requests ${requestCount}; normalized rows ${normalizedRowGroups}; ${describeWrites(written)}${dayFailures.length ? `; failed ${dayFailures.join(" | ")}` : ""}`;
  if (normalizedRowGroups === 0) {
    await writeCollectorStatus(env.DB, sourceId, "ERROR", detail || "forecast_no_data");
    await writeSourceHealth(env.DB, sourceId, "ERROR", detail || "forecast_no_data");
    return { status: "ERROR", records: 0 };
  }
  await writeCollectorStatus(env.DB, sourceId, dayFailures.length ? "PARTIAL" : "SUCCESS", detail, normalizedRowGroups, written.changedRows);
  await writeSourceHealth(env.DB, sourceId, "LIVE", detail, lastRow ? { eventAt: lastRow.targetStartAt, retrievedAt: lastRow.retrievedAt, schemaVersion: lastRow.schemaVersion } : undefined);
  return { status: dayFailures.length ? "PARTIAL" : "SUCCESS", records: written.changedRows };
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
