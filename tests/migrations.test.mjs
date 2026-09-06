import assert from "node:assert/strict";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migrations = [
  "drizzle/0000_daffy_tempest.sql",
  "drizzle/0001_crazy_nekra.sql",
  "drizzle/0002_reflective_martin_li.sql",
  "drizzle/0003_minor_network.sql",
  "drizzle/0004_s2_foreign_presence.sql",
  "drizzle/0005_airport_official_contracts.sql",
  "drizzle/0006_airport_t2_and_passenger_forecast.sql",
  "drizzle/0007_d1_read_budget_indexes.sql",
  "drizzle/0008_weather_enrichment.sql",
  "drizzle/0009_event_official_detail.sql",
  "drizzle/0010_seoul_realtime_commercial.sql",
  "drizzle/0011_seoul_foreign_purpose_mobility.sql",
  "drizzle/0012_seoul_subway_ridership.sql",
  "drizzle/0013_seoul_store_dynamics.sql",
  "drizzle/0014_tourism_events_window_idx.sql",
  "drizzle/0015_airport_facility.sql",
  // 0016 was missing from this list, and that is why the forecast archive
  // triggers it creates were never exercised by any test. They shipped with a
  // conflict clause SQLite does not honour inside a trigger and took A5 writes
  // down with them; 0017 repairs that. An unlisted migration is an untested
  // one, so both are here now.
  "drizzle/0016_operational_context_forecast.sql",
  "drizzle/0017_forecast_archive_trigger_conflict.sql",
];

function applyMigrations(database) {
  for (const migration of migrations) {
    const sql = readFileSync(migration, "utf8").replaceAll(
      "--> statement-breakpoint",
      "",
    );
    database.exec(sql);
  }
}

test("D1 migrations apply and prediction rows remain immutable", () => {
  const databasePath = join(tmpdir(), `rpk-migration-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);

  try {
    applyMigrations(database);
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map(({ name }) => name);

    for (const table of [
      "airport_flights",
      "airport_flight_changes",
      "airport_scheduled_flights",
      "airport_flow",
      "foreign_presence",
      "seoul_foreign_presence_dong",
      "seoul_foreign_presence_area",
      "seoul_realtime_commercial",
      "seoul_foreign_purpose_mobility",
      "seoul_foreign_purpose_publications",
      "seoul_subway_ridership",
      "seoul_subway_collection_checkpoint",
      "seoul_store_dynamics",
      "airport_congestion",
      "airport_passenger_forecast",
      "predictions",
      "outcomes",
      "baseline_predictions",
      "source_health",
      "collector_runs",
    ]) {
      assert.ok(tables.includes(table), `missing table: ${table}`);
    }

    const columns = (table) => database.prepare(`PRAGMA table_info(${table})`).all().map(({ name }) => name);
    assert.deepEqual(columns("seoul_foreign_presence_dong"), [
      "id", "source_id", "product_version", "record_origin", "administrative_dong_code",
      "reference_at", "available_at", "retrieved_at", "value", "unit", "nationality_json",
      "schema_version", "quality_status", "source_hash",
    ]);
    assert.deepEqual(columns("seoul_foreign_presence_area"), [
      "id", "source_id", "product_version", "record_origin", "area", "reference_at",
      "available_at", "retrieved_at", "value", "unit", "administrative_dong_codes_json",
      "mapping_version", "schema_version", "quality_status", "source_hash",
    ]);
    assert.deepEqual(
      database.prepare("PRAGMA index_info(seoul_foreign_presence_area_unique)").all().map(({ name }) => name),
      ["source_id", "product_version", "mapping_version", "area", "reference_at"],
    );

    assert.deepEqual(columns("seoul_realtime_commercial"), [
      "id", "source_id", "record_origin", "area", "area_code", "area_name",
      "commercial_level", "payment_count", "payment_amount_min", "payment_amount_max",
      "observed_at", "retrieved_at", "freshness", "schema_version", "quality_status", "source_hash",
    ]);
    assert.deepEqual(
      database.prepare("PRAGMA index_info(seoul_realtime_commercial_unique)").all().map(({ name }) => name),
      ["source_id", "area", "observed_at"],
    );
    assert.deepEqual(
      database.prepare("PRAGMA index_info(seoul_realtime_commercial_area_observed_idx)").all().map(({ name }) => name),
      ["area", "observed_at"],
    );

    assert.deepEqual(columns("seoul_foreign_purpose_mobility"), [
      "id", "source_id", "dataset_id", "publication_id", "record_origin", "area",
      "reference_date", "purpose", "movement_value", "unit", "destination_codes_json",
      "mapping_version", "retrieved_at", "schema_version", "quality_status", "source_hash",
    ]);
    assert.deepEqual(
      database.prepare("PRAGMA index_info(seoul_foreign_purpose_mobility_unique)").all().map(({ name }) => name),
      ["source_id", "mapping_version", "area", "reference_date", "purpose"],
    );
    assert.deepEqual(
      database.prepare("PRAGMA index_info(seoul_foreign_purpose_mobility_area_reference_idx)").all().map(({ name }) => name),
      ["area", "reference_date", "purpose"],
    );
    assert.deepEqual(columns("seoul_foreign_purpose_publications"), [
      "id", "source_id", "dataset_id", "publication_id", "file_name", "reference_date",
      "aggregate_rows", "source_rows_read", "retrieved_at", "schema_version", "source_hash",
    ]);
    assert.deepEqual(
      database.prepare("PRAGMA index_info(seoul_foreign_purpose_publications_unique)").all().map(({ name }) => name),
      ["source_id", "dataset_id", "publication_id"],
    );

    assert.deepEqual(columns("seoul_subway_ridership"), [
      "id", "source_id", "dataset_id", "record_origin", "area", "reference_date",
      "station_code", "station_number", "station_name", "line_name", "boarding_count",
      "alighting_count", "mapping_version", "retrieved_at", "schema_version",
      "quality_status", "source_hash",
    ]);
    assert.deepEqual(
      database.prepare("PRAGMA index_info(seoul_subway_ridership_unique)").all().map(({ name }) => name),
      ["source_id", "mapping_version", "area", "reference_date", "station_code"],
    );
    assert.deepEqual(
      database.prepare("PRAGMA index_info(seoul_subway_ridership_area_reference_idx)").all().map(({ name }) => name),
      ["area", "mapping_version", "reference_date", "station_code"],
    );
    assert.deepEqual(columns("seoul_subway_collection_checkpoint"), [
      "source_id", "last_checked_kst_date", "latest_reference_date", "retrieved_at", "schema_version",
    ]);

    assert.deepEqual(columns("seoul_store_dynamics"), [
      "id", "source_id", "dataset_id", "record_origin", "area", "quarter_code",
      "trade_area_code", "trade_area_name", "trade_area_type_code", "trade_area_type_name",
      "overall_store_count", "ordinary_store_count", "franchise_store_count",
      "opening_store_count", "opening_rate_tenths_percent", "closure_store_count",
      "closure_rate_tenths_percent", "industry_count", "mapping_version", "source_updated_at",
      "retrieved_at", "schema_version", "quality_status", "source_hash",
    ]);
    assert.deepEqual(
      database.prepare("PRAGMA index_info(seoul_store_dynamics_unique)").all().map(({ name }) => name),
      ["source_id", "mapping_version", "area", "quarter_code"],
    );
    assert.deepEqual(
      database.prepare("PRAGMA index_info(seoul_store_dynamics_area_quarter_idx)").all().map(({ name }) => name),
      ["area", "quarter_code"],
    );

    const insertStoreDynamics = database.prepare(`INSERT INTO seoul_store_dynamics (
      id, source_id, dataset_id, record_origin, area, quarter_code, trade_area_code,
      trade_area_name, trade_area_type_code, trade_area_type_name, overall_store_count,
      ordinary_store_count, franchise_store_count, opening_store_count,
      opening_rate_tenths_percent, closure_store_count, closure_rate_tenths_percent,
      industry_count, mapping_version, retrieved_at, schema_version, quality_status, source_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const mappingVersion of ["mapping-v1", "mapping-v2"]) {
      insertStoreDynamics.run(
        `store-${mappingVersion}`, "SEOUL_STORE_DYNAMICS", "OA-15577", "OFFICIAL_HISTORICAL",
        "myeongdong", "20261", "3001492", "명동 남대문 북창동 다동 무교동 관광특구",
        "U", "관광특구", 174, 160, 14, 10, 57, 5, 29, 2, mappingVersion,
        "2026-09-03T01:00:00.000Z", "store-dynamics-v1", "VALID", `hash-${mappingVersion}`,
      );
    }
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_store_dynamics").get().count, 2);
    assert.throws(() => insertStoreDynamics.run(
      "store-duplicate", "SEOUL_STORE_DYNAMICS", "OA-15577", "OFFICIAL_HISTORICAL",
      "myeongdong", "20261", "3001492", "명동 남대문 북창동 다동 무교동 관광특구",
      "U", "관광특구", 174, 160, 14, 10, 57, 5, 29, 2, "mapping-v1",
      "2026-09-03T02:00:00.000Z", "store-dynamics-v1", "VALID", "hash-duplicate",
    ), /UNIQUE constraint failed/);

    // A4-T2 additive column: existing airport_congestion rows/queries must
    // keep working unchanged, with wait_time_raw only appended at the end.
    assert.ok(columns("airport_congestion").includes("wait_time_raw"));

    assert.deepEqual(columns("airport_passenger_forecast"), [
      "id", "source_id", "record_origin", "terminal", "direction", "zone", "is_aggregate",
      "target_date", "time_band_raw", "target_start_at", "target_end_at", "expected_passengers",
      "retrieved_at", "schema_version", "quality_status", "source_hash",
    ]);
    assert.deepEqual(
      database.prepare("PRAGMA index_info(airport_passenger_forecast_unique)").all().map(({ name }) => name),
      ["source_id", "terminal", "direction", "zone", "target_date", "time_band_raw"],
    );

    const insertMappedArea = database.prepare(`INSERT INTO seoul_foreign_presence_area (
      id, source_id, product_version, record_origin, area, reference_at,
      available_at, retrieved_at, value, unit, administrative_dong_codes_json,
      mapping_version, schema_version, quality_status, source_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const mappingVersion of ["mapping-v1", "mapping-v2"]) {
      insertMappedArea.run(
        `mapped-${mappingVersion}`, "S", "P", "OFFICIAL_HISTORICAL", "myeongdong",
        "2026-08-26T23:00:00+09:00", null, "2026-08-30T00:00:00Z", 100,
        "people", '["11140550"]', mappingVersion, "schema-v1", "VALID", `hash-${mappingVersion}`,
      );
    }
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM seoul_foreign_presence_area").get().count,
      2,
    );

    const currentPlan = database.prepare(`EXPLAIN QUERY PLAN
      SELECT source_hash FROM airport_flights
      WHERE source_id = ? AND flight_number = ? AND direction = ? AND scheduled_at = ?`).all("S", "F", "departure", "2026-08-25T00:00:00Z");
    assert.match(currentPlan.map((row) => String(row.detail)).join("\n"), /airport_flights_source_event_unique/);

    const changePlan = database.prepare(`EXPLAIN QUERY PLAN
      SELECT 1 FROM airport_flight_changes
      WHERE source_id = ? AND flight_number = ? AND direction = ? AND scheduled_at = ? AND semantic_hash = ?`).all("S", "F", "departure", "2026-08-25T00:00:00Z", "H");
    assert.match(changePlan.map((row) => String(row.detail)).join("\n"), /airport_flight_changes_semantic_unique/);

    database
      .prepare(
        `INSERT INTO predictions (
          prediction_id, created_at, target_at, data_cutoff, target_id,
          area, value, value_scale, forecast_class, confidence,
          model_version, proxy_version, feature_version, source_versions,
          input_hash, prediction_hash, record_origin
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "prediction-test-1",
        "2026-08-25T00:00:00Z",
        "2026-08-26T00:00:00Z",
        "2026-08-25T00:00:00Z",
        "AREA_ACTIVITY",
        "myeongdong",
        80,
        1,
        "HIGH",
        "COLLECTING",
        "baseline-v1",
        "frp-v1",
        "features-v1",
        "{}",
        "input-hash",
        "prediction-hash",
        "PROSPECTIVE",
      );

    assert.throws(
      () =>
        database
          .prepare("UPDATE predictions SET value = 81 WHERE prediction_id = ?")
          .run("prediction-test-1"),
      /predictions are immutable/,
    );
    assert.throws(
      () =>
        database
          .prepare("DELETE FROM predictions WHERE prediction_id = ?")
          .run("prediction-test-1"),
      /predictions are immutable/,
    );
  } finally {
    database.close();
    unlinkSync(databasePath);
  }
});

/**
 * The write that could abort the write it was recording.
 *
 * Both forecast archive triggers said `INSERT OR IGNORE INTO
 * airport_forecast_versions` — "archive this version, say nothing if it is
 * already there". SQLite does not honour that here: when the statement firing
 * a trigger carries its own ON CONFLICT clause, the OUTER statement's conflict
 * policy replaces the one written inside the trigger body. Every canonical A5
 * write is an upsert, which is how changed-only writing works, so IGNORE
 * silently became ABORT.
 *
 * The result was exact. The AFTER UPDATE trigger re-archives the OLD version,
 * which AFTER INSERT had already archived under the same id, so the FIRST time
 * Incheon revised an aggregate band the archive insert conflicted and took the
 * whole batch with it:
 *
 *   d1_http_400_7500 UNIQUE constraint failed: airport_forecast_versions.id
 *
 * A months-long provider outage hid it. While no runner could open a connection
 * to apis.data.go.kr nothing was ever normalized, so this write never ran — and
 * the day a fresh runner got through again, this is what kept 2026-09-07 from
 * being stored. The statements below are the real ones, so a return to a
 * conflict-clause-dependent trigger fails here rather than in production.
 */
const A5_UPSERT = `INSERT INTO airport_passenger_forecast (
  id, source_id, record_origin, terminal, direction, zone, is_aggregate, target_date, time_band_raw,
  target_start_at, target_end_at, expected_passengers, retrieved_at, schema_version, quality_status, source_hash)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
 ON CONFLICT(source_id, terminal, direction, zone, target_date, time_band_raw) DO UPDATE SET
  target_start_at = excluded.target_start_at,
  target_end_at = excluded.target_end_at,
  expected_passengers = excluded.expected_passengers,
  retrieved_at = excluded.retrieved_at,
  quality_status = excluded.quality_status,
  source_hash = excluded.source_hash
 WHERE airport_passenger_forecast.source_hash <> excluded.source_hash`;

test("a revised aggregate forecast is archived, not rejected", () => {
  const databasePath = join(tmpdir(), `rpk-archive-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);
  try {
    applyMigrations(database);

    const publish = (sourceHash, passengers) => database.prepare(A5_UPSERT).run(
      "row-1", "INCHEON_PASSENGER_FORECAST", "PROVIDER", "T1", "departure", "SUM", 1,
      "2026-09-07", "0000_0100", "2026-09-07T00:00:00+09:00", "2026-09-07T01:00:00+09:00",
      passengers, `2026-09-06T${sourceHash}:00:00Z`, "a5-v1", "VALID", sourceHash,
    );
    const archived = () => database
      .prepare("SELECT count(*) AS total FROM airport_forecast_versions").get().total;

    publish("11", 100);
    assert.equal(archived(), 1, "the first publication is archived once");

    // The revision that used to abort the entire batch.
    publish("12", 200);
    assert.equal(archived(), 2, "a revision archives the new version beside the old one");

    publish("13", 300);
    assert.equal(archived(), 3, "and every later revision keeps accumulating");

    // Changed-only writing: republishing identical content changes nothing, so
    // the archive must not grow a duplicate either.
    publish("13", 300);
    assert.equal(archived(), 3, "an unchanged republication archives nothing new");

    assert.equal(
      database.prepare("SELECT expected_passengers FROM airport_passenger_forecast WHERE id = ?").get("row-1").expected_passengers,
      300,
      "the canonical row carries the newest official number",
    );
    assert.deepEqual(
      database.prepare("SELECT expected_passengers FROM airport_forecast_versions ORDER BY source_hash").all()
        .map((row) => row.expected_passengers),
      [100, 200, 300],
      "and every superseded number is still recoverable from the archive",
    );

    // The archive stays append-only. Repairing the insert path must not have
    // loosened the immutability guarantee the prospective record depends on.
    assert.throws(
      () => database.prepare("UPDATE airport_forecast_versions SET expected_passengers = 0").run(),
      /archive is immutable/,
    );
    assert.throws(
      () => database.prepare("DELETE FROM airport_forecast_versions").run(),
      /archive is immutable/,
    );
  } finally {
    database.close();
    unlinkSync(databasePath);
  }
});

test("a non-aggregate band is not archived at all", () => {
  // The archive exists for the published totals. Archiving every zone row would
  // multiply an immutable table by the number of bands for no added truth.
  const databasePath = join(tmpdir(), `rpk-archive-zone-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);
  try {
    applyMigrations(database);
    database.prepare(A5_UPSERT).run(
      "row-zone", "INCHEON_PASSENGER_FORECAST", "PROVIDER", "T1", "departure", "t1dg1", 0,
      "2026-09-07", "0000_0100", "2026-09-07T00:00:00+09:00", "2026-09-07T01:00:00+09:00",
      50, "2026-09-06T00:00:00Z", "a5-v1", "VALID", "zone-hash-1",
    );
    assert.equal(database.prepare("SELECT count(*) AS total FROM airport_forecast_versions").get().total, 0);
  } finally {
    database.close();
    unlinkSync(databasePath);
  }
});
