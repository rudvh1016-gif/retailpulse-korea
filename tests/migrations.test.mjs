import assert from "node:assert/strict";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migrations = [
  "drizzle/0000_daffy_tempest.sql",
  "drizzle/0001_crazy_nekra.sql",
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
      "airport_flow",
      "foreign_presence",
      "predictions",
      "outcomes",
      "baseline_predictions",
      "source_health",
      "collector_runs",
    ]) {
      assert.ok(tables.includes(table), `missing table: ${table}`);
    }

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
