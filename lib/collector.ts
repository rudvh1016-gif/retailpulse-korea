import { normalizeAirportFlight, fetchOfficialJson, redactServiceKey, type CanonicalAirportFlight } from "./source-adapters";
import { sha256 } from "./hash";

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
    .bind(crypto.randomUUID(), sourceId, nowIso(), nowIso(), status, recordsRead, recordsWritten, detail.slice(0, 500))
    .run();
}

async function writeSourceHealth(
  db: D1Database | undefined,
  sourceId: string,
  status: "LIVE" | "MISSING" | "ERROR",
  detail: string,
  record?: CanonicalAirportFlight,
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

async function persistAirportFlights(db: D1Database | undefined, records: CanonicalAirportFlight[], retainChangeHistory: boolean): Promise<number> {
  if (!db || !records.length) return 0;
  const statements: D1PreparedStatement[] = [];
  for (const record of records) {
    const id = await sha256({
      sourceId: record.sourceId,
      flightNumber: record.flightNumber,
      direction: record.direction,
      scheduledAt: record.scheduledAt,
    });
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
        schema_version, quality_status, source_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id, flight_number, direction, scheduled_at) DO UPDATE SET
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
        source_hash = excluded.source_hash
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
      ));
  }

  let rowsWritten = 0;
  for (let offset = 0; offset < statements.length; offset += 40) {
    const results = await db.batch(statements.slice(offset, offset + 40));
    rowsWritten += results.reduce((sum, result) => sum + Number(result.meta?.rows_written ?? 0), 0);
  }
  return rowsWritten;
}

export async function collectAirportFlights(env: CollectorEnv): Promise<{ status: string; records: number }> {
  if (!env.DATA_GO_KR_SERVICE_KEY) {
    await writeCollectorStatus(env.DB, "INCHEON_FLIGHT_DETAIL", "NEEDS_KEY", "DATA_GO_KR_SERVICE_KEY is not configured");
    await writeSourceHealth(env.DB, "INCHEON_FLIGHT_DETAIL", "MISSING", "DATA_GO_KR_SERVICE_KEY is not configured");
    return { status: "NEEDS_KEY", records: 0 };
  }

  // Endpoint and operation are official. Query semantics must be rechecked
  // against the approved account guide before this collector is enabled LIVE.
  const url = new URL("https://apis.data.go.kr/B551177/statusOfAllFltDeOdp/getFltDeparturesDeOdp");
  url.searchParams.set("serviceKey", env.DATA_GO_KR_SERVICE_KEY);
  url.searchParams.set("type", "json");
  url.searchParams.set("numOfRows", "1000");
  url.searchParams.set("pageNo", "1");

  try {
    const payload = await fetchOfficialJson(url, { timeoutMs: 8_000, retries: 1 });
    const root = payload as { response?: { body?: { items?: { item?: unknown[] | unknown } } } };
    const rawItems = root?.response?.body?.items?.item;
    const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
    const retrievedAt = nowIso();
    const normalized = await Promise.all(items.map((item) => normalizeAirportFlight(item, "departure", retrievedAt)));
    const written = await persistAirportFlights(env.DB, normalized, env.retainChangeHistory === true);
    await writeSourceHealth(env.DB, "INCHEON_FLIGHT_DETAIL", "LIVE", `normalized ${normalized.length}; changed writes ${written}`, normalized.at(-1));
    await writeCollectorStatus(env.DB, "INCHEON_FLIGHT_DETAIL", "SUCCESS", `normalized ${normalized.length}; changed writes ${written}`, items.length, written);
    return { status: "SUCCESS", records: written };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "collector_error";
    console.error("airport_collector_failed", { endpoint: redactServiceKey(url.toString()), error: detail });
    await writeCollectorStatus(env.DB, "INCHEON_FLIGHT_DETAIL", "ERROR", detail);
    await writeSourceHealth(env.DB, "INCHEON_FLIGHT_DETAIL", "ERROR", detail);
    return { status: "ERROR", records: 0 };
  }
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
