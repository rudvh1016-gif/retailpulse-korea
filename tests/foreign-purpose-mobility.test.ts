import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { collectForeignPurposeMobility } from "../lib/collector";
import {
  aggregateForeignPurposeMobility,
  assertPurposeMobilityHeader,
  parseLatestPurposeMobilityPublication,
  SHOPPING_PURPOSE_CODE,
  TOURISM_PURPOSE_CODE,
} from "../lib/foreign-purpose-mobility";

test("OA-22379 shape is rejected because it cannot prove shopping or tourism purpose", () => {
  const header = "o_admdong_cd,d_admdong_cd,st_time_cd,fns_time_cd,move_dist,move_time,forn_citiz_nm,short_forn_cnt,total_cnt,etl_ymd";
  assert.throws(() => assertPurposeMobilityHeader(header), /missing_required_column:move_purpose/);
});

test("official purpose codes are pinned to shopping=4 and tourism=5", () => {
  assert.equal(SHOPPING_PURPOSE_CODE, "4");
  assert.equal(TOURISM_PURPOSE_CODE, "5");
});

test("official page parser selects the newest OA-22378 publication regardless of DOM order", () => {
  const html = `
    <input name="infId" value="OA-22378"><input name="infSeq" value="1">
    <a onclick="fnFileDown('OA-22378','1','202605')">seoul_purpose_admdong1_forn_202605.zip</a>
    <a onclick="fnFileDown('OA-22378','1','202607')">seoul_purpose_admdong1_forn_202607.zip</a>
    <a onclick="fnFileDown('OA-22378','1','202606')">seoul_purpose_admdong1_forn_202606.zip</a>`;
  assert.deepEqual(parseLatestPurposeMobilityPublication(html), {
    datasetId: "OA-22378",
    infSeq: "1",
    sequence: "202607",
    publicationId: "202607",
    fileName: "seoul_purpose_admdong1_forn_202607.zip",
  });
});

test("latest-day aggregation filters destinations and official purpose codes without fabricating missing zeros", () => {
  const csv = [
    "d_admdong_cd,time_cd,move_purpose,forn_citiz_nm,short_forn_cnt,male_00_cnt,total_cnt,etl_ymd",
    "11140550,00,4,USA,1,2,10.5,20260731",
    "11140550,01,4,JPN,1,2,2.5,20260731",
    "11140550,01,5,JPN,1,2,3,20260731",
    "11440660,01,5,USA,1,2,7,20260731",
    "11200670,01,1,USA,1,2,999,20260731",
    "99999999,01,4,USA,1,2,999,20260731",
    "11140550,01,4,USA,1,2,100,20260730",
  ].join("\n");

  const result = aggregateForeignPurposeMobility(csv);
  assert.equal(result.referenceDate, "2026-07-31");
  assert.deepEqual(result.rows.map(({ area, purpose, movementValue }) => ({ area, purpose, movementValue })), [
    { area: "hongdae", purpose: "tourism", movementValue: 7 },
    { area: "myeongdong", purpose: "shopping", movementValue: 13 },
    { area: "myeongdong", purpose: "tourism", movementValue: 3 },
  ]);
  assert.equal(result.rows.some((row) => row.area === "seongsu"), false);
  assert.equal(result.rows.length <= 6, true);
  assert.equal("rawRows" in result, false);
});

test("suppressed and invalid totals are unavailable instead of zero", () => {
  const csv = [
    "d_admdong_cd,time_cd,move_purpose,forn_citiz_nm,total_cnt,etl_ymd",
    "11140550,00,4,USA,*,20260731",
    "11140550,01,5,USA,not-a-number,20260731",
  ].join("\n");
  const result = aggregateForeignPurposeMobility(csv);
  assert.deepEqual(result.rows, []);
  assert.equal(result.suppressedOrInvalidRows, 2);
});

test("overlapping administrative-dong mappings fail closed before aggregation", () => {
  const csv = [
    "d_admdong_cd,time_cd,move_purpose,forn_citiz_nm,total_cnt,etl_ymd",
    "11140550,00,4,USA,1,20260731",
  ].join("\n");
  assert.throws(() => aggregateForeignPurposeMobility(csv, {
    myeongdong: ["11140550"],
    hongdae: ["11140550"],
    seongsu: ["11200670"],
  }), /duplicate_destination_mapping:11140550/);
});

class LocalD1Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), rows_written: Number(result.changes) } };
  }
  async all<T>() { return { success: true, results: this.statement.all(...this.values) as T[] }; }
}

class LocalD1Database {
  constructor(private readonly database: DatabaseSync) {}
  prepare(query: string) { return new LocalD1Statement(this.database.prepare(query)); }
  async batch(statements: LocalD1Statement[]) { return Promise.all(statements.map((statement) => statement.run())); }
}

function migratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort()) {
    database.exec(readFileSync(`drizzle/${file}`, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  return database;
}

test("collector downloads once, stores only aggregates, then metadata-skips the same publication", async () => {
  const database = migratedDatabase();
  const publication = {
    datasetId: "OA-22378" as const, infSeq: "1", sequence: "202607",
    publicationId: "202607", fileName: "seoul_purpose_admdong1_forn_202607.zip",
  };
  let discoveries = 0;
  let downloads = 0;
  const source = {
    async discoverLatest() { discoveries += 1; return publication; },
    async loadLatestCsv() {
      downloads += 1;
      return [
        "d_admdong_cd,time_cd,move_purpose,forn_citiz_nm,total_cnt,etl_ymd",
        "11140550,00,4,USA,10,20260731",
        "11140550,00,5,USA,2,20260731",
        "11440660,00,5,USA,7,20260731",
      ].join("\n");
    },
  };
  const env = { DB: new LocalD1Database(database) as unknown as D1Database, FOREIGN_PURPOSE_SOURCE: source };
  const first = await collectForeignPurposeMobility(env, new Date("2026-09-02T00:00:00Z"));
  // Reproduce the Production state that exposed this bug: the last data
  // publication is still good, but one or more metadata checks have failed
  // since then. A later successful no-new-publication check must recover the
  // health row without erasing the publication timestamps it did not fetch.
  database.prepare(`UPDATE source_health SET
      status = ?, last_published_at = ?, last_retrieved_at = ?,
      consecutive_failures = ?, detail = ?
    WHERE source_id = ?`).run(
    "STALE", "2026-08-05T00:00:00.000Z", "2026-09-02T00:00:00.000Z",
    2, "previous metadata failure", "SEOUL_FOREIGN_PURPOSE_MOBILITY",
  );
  const second = await collectForeignPurposeMobility(env, new Date("2026-09-03T00:00:00Z"));

  assert.equal(first.status, "SUCCESS");
  assert.equal(first.records, 4);
  assert.equal(second.status, "SKIPPED_NO_NEW_PUBLICATION");
  assert.equal(second.providerRequests, 1);
  assert.equal(discoveries, 2);
  assert.equal(downloads, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_foreign_purpose_mobility").get()!.count, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_foreign_purpose_publications").get()!.count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name LIKE '%raw%'").get()!.count, 0);
  assert.deepEqual({ ...database.prepare(`SELECT status, last_event_at AS eventAt,
      last_published_at AS publishedAt, last_retrieved_at AS retrievedAt,
      detail, consecutive_failures AS consecutiveFailures
    FROM source_health WHERE source_id = ?`).get("SEOUL_FOREIGN_PURPOSE_MOBILITY") }, {
    status: "OFFICIAL_HISTORICAL",
    eventAt: "2026-07-31T00:00:00+09:00",
    publishedAt: "2026-08-05T00:00:00.000Z",
    retrievedAt: "2026-09-03T00:00:00.000Z",
    detail: "publication 202607; metadata only; archive download 0",
    consecutiveFailures: 0,
  });
  database.close();
});

test("collector failure preserves last-good aggregates and marks health stale", async () => {
  const database = migratedDatabase();
  database.prepare(`INSERT INTO seoul_foreign_purpose_mobility
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "id", "SEOUL_FOREIGN_PURPOSE_MOBILITY", "OA-22378", "202607", "OFFICIAL_HISTORICAL",
    "myeongdong", "2026-07-31", "shopping", 10, "estimated_movements", '["11140550"]',
    "official-admin-dong-2025-06-02-v1", "2026-09-02T00:00:00Z", "v1", "VALID", "hash",
  );
  database.prepare(`INSERT INTO source_health (
      source_id, status, last_event_at, last_published_at, last_retrieved_at,
      consecutive_failures, schema_version, detail, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      "SEOUL_FOREIGN_PURPOSE_MOBILITY", "OFFICIAL_HISTORICAL",
      "2026-07-31T00:00:00+09:00", null, "2026-09-02T00:00:00.000Z",
      0, "seoul-foreign-purpose-mobility-v1", "previous success", "2026-09-02T00:00:00.000Z",
    );
  const result = await collectForeignPurposeMobility({
    DB: new LocalD1Database(database) as unknown as D1Database,
    FOREIGN_PURPOSE_SOURCE: {
      async discoverLatest() { throw new Error("provider_timeout"); },
      async loadLatestCsv() { throw new Error("unreachable"); },
    },
  });
  assert.equal(result.status, "ERROR");
  assert.equal(result.lastGoodPreserved, true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_foreign_purpose_mobility").get()!.count, 1);
  const health = { ...database.prepare(`SELECT status, last_event_at AS eventAt,
      last_retrieved_at AS retrievedAt, detail, consecutive_failures AS consecutiveFailures
    FROM source_health WHERE source_id = ?`).get("SEOUL_FOREIGN_PURPOSE_MOBILITY") };
  assert.deepEqual({ ...health, detail: undefined }, {
    status: "STALE",
    eventAt: "2026-07-31T00:00:00+09:00",
    retrievedAt: "2026-09-02T00:00:00.000Z",
    detail: undefined,
    consecutiveFailures: 1,
  });
  assert.match(String(health.detail),
    /^failureClass=PROVIDER causeCode=PROVIDER_TIMEOUT attempts=1 elapsedMs=\d+ retryExhausted=false$/);
  database.close();
});

test("a publication with no target pairs is recorded once and never redownloaded as fake zero data", async () => {
  const database = migratedDatabase();
  let downloads = 0;
  const publication = {
    datasetId: "OA-22378" as const, infSeq: "1", sequence: "202608",
    publicationId: "202608", fileName: "seoul_purpose_admdong1_forn_202608.zip",
  };
  const env = {
    DB: new LocalD1Database(database) as unknown as D1Database,
    FOREIGN_PURPOSE_SOURCE: {
      async discoverLatest() { return publication; },
      async loadLatestCsv() {
        downloads += 1;
        return [
          "d_admdong_cd,time_cd,move_purpose,forn_citiz_nm,total_cnt,etl_ymd",
          "99999999,00,4,USA,10,20260831",
        ].join("\n");
      },
    },
  };
  const first = await collectForeignPurposeMobility(env);
  const second = await collectForeignPurposeMobility(env);
  assert.equal(first.status, "SUCCESS");
  assert.equal(first.records, 1, "only the tiny publication receipt is written");
  assert.equal(first.lastGoodPreserved, false);
  assert.equal(second.status, "SKIPPED_NO_NEW_PUBLICATION");
  assert.equal(second.lastGoodPreserved, false);
  assert.equal(downloads, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_foreign_purpose_mobility").get()!.count, 0);
  database.close();
});
