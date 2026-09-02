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
