import assert from "node:assert/strict";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { sha256 } from "../lib/hash.ts";
import {
  collectAirportFlights,
  collectSeoulForeignPresence,
  pruneOperationalHistory,
  seoulForeignPeriodCandidates,
} from "../lib/collector.ts";
import {
  SEOUL_FOREIGN_MAPPING_VERSION,
  SEOUL_FOREIGN_PRODUCT_VERSION,
  SEOUL_FOREIGN_SOURCE_ID,
} from "../lib/seoul-foreign.ts";

class LocalD1Statement {
  values = [];

  constructor(statement) {
    this.statement = statement;
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { rows_written: Number(result.changes) } };
  }
}

class LocalD1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(query) {
    return new LocalD1Statement(this.database.prepare(query));
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

function applyMigrations(database) {
  for (const file of ["drizzle/0000_daffy_tempest.sql", "drizzle/0001_crazy_nekra.sql", "drizzle/0002_reflective_martin_li.sql", "drizzle/0003_minor_network.sql", "drizzle/0004_s2_foreign_presence.sql", "drizzle/0005_airport_official_contracts.sql"]) {
    database.exec(readFileSync(file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
}

const s2Row = (dongCode, value, overrides = {}) => ({
  YMD: "20260828", TT: "14", H_DNG_CD: dongCode, SPOP: String(value),
  CAN: null, CHN: "1", ETC: "1", FRA: "0", IDN: "0", IND: "0", JPN: "0",
  KAZ: "0", KHM: "0", LKA: "0", MNG: "0", NPL: "0", PAK: "0", PHL: "0",
  RUS: "0", THA: "0", USA: "0", UZB: "0", VNM: "0",
  ...overrides,
});

test("S2 period candidates start at the most recent completed KST day and stay bounded", () => {
  const periods = seoulForeignPeriodCandidates(new Date("2026-08-30T03:00:00Z"));
  assert.equal(periods.length, 62);
  assert.deepEqual(periods[0], { ymd: "20260829", tt: "23" });
  assert.deepEqual(periods.at(-1), { ymd: "20260629", tt: "23" });
});

test("S2 collector persists one raw and area row per mapping idempotently", async (context) => {
  const databasePath = join(tmpdir(), `rpk-s2-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
    database.close();
    unlinkSync(databasePath);
  });
  applyMigrations(database);

  const testNow = new Date("2026-08-30T03:00:00Z");
  const [{ ymd, tt }] = seoulForeignPeriodCandidates(testNow);
  const byDong = {
    11140550: s2Row("11140550", 100, { YMD: ymd, TT: tt }),
    11440660: s2Row("11440660", 200, { YMD: ymd, TT: tt }),
    11200670: s2Row("11200670", 300, { YMD: ymd, TT: tt }),
  };
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url.replace("fixture", "[REDACTED]"));
    if (url.endsWith("/1/1/")) {
      return Response.json({
        Spop250mFornTempDong: {
          list_total_count: 1,
          RESULT: { CODE: "INFO-000", MESSAGE: "stale unordered fixture" },
          row: [s2Row("11140550", 999, { YMD: "20200101", TT: "00" })],
        },
      });
    }
    const code = Object.keys(byDong).find((dong) => url.endsWith(`/${dong}`));
    const row = code ? byDong[code] : null;
    return Response.json({
      Spop250mFornTempDong: {
        list_total_count: row ? 1 : 0,
        RESULT: { CODE: row ? "INFO-000" : "INFO-200", MESSAGE: row ? "정상 처리되었습니다" : "해당하는 데이터가 없습니다" },
        row: row ? [row] : [],
      },
    });
  };

  const env = { DB: new LocalD1Database(database), SEOUL_OPEN_DATA_KEY: "fixture" };
  const referenceAt = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${tt}:00:00+09:00`;
  const legacyMappingVersion = "legacy-mapping-v0";
  database.prepare(`INSERT INTO seoul_foreign_presence_area (
    id, source_id, product_version, record_origin, area, reference_at,
    available_at, retrieved_at, value, unit, administrative_dong_codes_json,
    mapping_version, schema_version, quality_status, source_hash
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    await sha256({ sourceId: SEOUL_FOREIGN_SOURCE_ID, productVersion: SEOUL_FOREIGN_PRODUCT_VERSION, area: "seongsu", referenceAt }),
    SEOUL_FOREIGN_SOURCE_ID, SEOUL_FOREIGN_PRODUCT_VERSION, "OFFICIAL_HISTORICAL", "seongsu", referenceAt,
    null, "2026-08-29T00:00:00Z", 999, "people", '["legacy"]', legacyMappingVersion,
    "legacy-schema", "VALID", "legacy-hash",
  );
  const first = await collectSeoulForeignPresence(env, testNow);
  const second = await collectSeoulForeignPresence(env, testNow);

  assert.deepEqual(first, { status: "SUCCESS", records: 6 });
  assert.deepEqual(second, { status: "SUCCESS", records: 0 });
  assert.equal(requests.length, 6);
  assert.equal(requests.some((url) => url.endsWith("/1/1/")), false);
  assert.equal(requests.every((url) => url.includes(`/${ymd}/${tt}/`)), true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_foreign_presence_dong").get().count, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_foreign_presence_area").get().count, 4);
  assert.equal(database.prepare("SELECT value FROM seoul_foreign_presence_area WHERE area = 'seongsu' AND mapping_version = ?").get(SEOUL_FOREIGN_MAPPING_VERSION).value, 300);
  assert.equal(database.prepare("SELECT value FROM seoul_foreign_presence_area WHERE area = 'seongsu' AND mapping_version = ?").get(legacyMappingVersion).value, 999);
  assert.equal(database.prepare("SELECT status FROM source_health WHERE source_id = ?").get("SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION").status, "OFFICIAL_HISTORICAL");
  assert.equal(JSON.stringify(requests).includes("fixture"), false);
});

test("S2 collector skips an incomplete newest period and imports the next complete period", async (context) => {
  const databasePath = join(tmpdir(), `rpk-s2-fallback-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
    database.close();
    unlinkSync(databasePath);
  });
  applyMigrations(database);

  const testNow = new Date("2026-08-30T03:00:00Z");
  const [newest, previous] = seoulForeignPeriodCandidates(testNow);
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url.replace("fixture", "[REDACTED]"));
    const code = ["11140550", "11440660", "11200670"].find((dong) => url.endsWith(`/${dong}`));
    const isNewest = url.includes(`/${newest.ymd}/${newest.tt}/`);
    const complete = !isNewest || code !== "11440660";
    return Response.json({
      Spop250mFornTempDong: {
        list_total_count: complete ? 1 : 0,
        RESULT: { CODE: complete ? "INFO-000" : "INFO-200", MESSAGE: complete ? "정상 처리되었습니다" : "해당하는 데이터가 없습니다" },
        row: complete && code ? [s2Row(code, code === "11140550" ? 100 : code === "11440660" ? 200 : 300, {
          YMD: isNewest ? newest.ymd : previous.ymd,
          TT: isNewest ? newest.tt : previous.tt,
        })] : [],
      },
    });
  };

  const result = await collectSeoulForeignPresence({ DB: new LocalD1Database(database), SEOUL_OPEN_DATA_KEY: "fixture" }, testNow);

  assert.deepEqual(result, { status: "SUCCESS", records: 6 });
  assert.equal(requests.length, 5);
  assert.equal(database.prepare("SELECT MIN(reference_at) AS referenceAt FROM seoul_foreign_presence_area").get().referenceAt.startsWith(`${previous.ymd.slice(0, 4)}-${previous.ymd.slice(4, 6)}-${previous.ymd.slice(6, 8)}`), true);
});

test("S2 collector rejects duplicate provider rows instead of double counting", async (context) => {
  const databasePath = join(tmpdir(), `rpk-s2-duplicate-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
    database.close();
    unlinkSync(databasePath);
  });
  applyMigrations(database);

  const testNow = new Date("2026-08-30T03:00:00Z");
  const [period] = seoulForeignPeriodCandidates(testNow);
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    const row = s2Row("11140550", 100, { YMD: period.ymd, TT: period.tt });
    return Response.json({
      Spop250mFornTempDong: {
        list_total_count: 2,
        RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다" },
        row: [row, row],
      },
    });
  };

  const result = await collectSeoulForeignPresence({ DB: new LocalD1Database(database), SEOUL_OPEN_DATA_KEY: "fixture" }, testNow);

  assert.deepEqual(result, { status: "ERROR", records: 0 });
  assert.equal(requests, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_foreign_presence_area").get().count, 0);
});

test("S2 collector stops at the official recent-two-month bound without writing", async (context) => {
  const databasePath = join(tmpdir(), `rpk-s2-empty-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
    database.close();
    unlinkSync(databasePath);
  });
  applyMigrations(database);

  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return Response.json({
      Spop250mFornTempDong: {
        list_total_count: 0,
        RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다" },
        row: [],
      },
    });
  };

  const result = await collectSeoulForeignPresence(
    { DB: new LocalD1Database(database), SEOUL_OPEN_DATA_KEY: "fixture" },
    new Date("2026-08-30T03:00:00Z"),
  );

  assert.deepEqual(result, { status: "ERROR", records: 0 });
  assert.equal(requests, 62);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_foreign_presence_dong").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_foreign_presence_area").get().count, 0);
});

test("airport collector stores idempotent canonical rows and source health", async (context) => {
  const databasePath = join(tmpdir(), `rpk-collector-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
    database.close();
    unlinkSync(databasePath);
  });
  applyMigrations(database);

  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = new URL(url);
    return Response.json({
    response: {
      header: { resultCode: "00" },
      body: {
        items: [{
            flightId: "KE703",
            airline: "Korean Air",
            airport: "NRT",
            scheduleDateTime: "202608251430",
            estimatedDateTime: "202608251445",
            gatenumber: "231",
            chkinrange: "A01-A12",
            remark: "지연",
            terminalid: "2",
          }],
      },
    },
    });
  };

  const env = { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture", retainChangeHistory: true };
  const first = await collectAirportFlights(env);
  const second = await collectAirportFlights(env);
  assert.equal(first.status, "SUCCESS");
  assert.ok(first.records > 0);
  assert.deepEqual(second, { status: "SUCCESS", records: 0 });
  assert.equal(requestedUrl.searchParams.get("numOfRows"), "100");

  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM airport_flights").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM airport_flight_changes").get().count, 1);
  assert.equal(database.prepare("SELECT status FROM source_health WHERE source_id = ?").get("INCHEON_FLIGHT_DETAIL").status, "LIVE");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM collector_runs").get().count, 2);
});

test("retrieval time alone does not create a write, while a semantic change does", async (context) => {
  const databasePath = join(tmpdir(), `rpk-collector-change-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
    database.close();
    unlinkSync(databasePath);
  });
  applyMigrations(database);

  let gate = "231";
  globalThis.fetch = async () => Response.json({ response: { header: { resultCode: "00" }, body: { items: { item: {
    flightId: "KE703", scheduleDateTime: "202608251430", gatenumber: gate,
    terminalid: "2", remark: "정상",
  } } } } });
  const env = { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture", retainChangeHistory: true };

  const first = await collectAirportFlights(env);
  const unchanged = await collectAirportFlights(env);
  gate = "232";
  const changed = await collectAirportFlights(env);

  assert.ok(first.records > 0);
  assert.equal(unchanged.records, 0);
  assert.ok(changed.records > 0);
  assert.equal(database.prepare("SELECT gate FROM airport_flights").get().gate, "232");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM airport_flight_changes").get().count, 2);
});

test("overlapping collector runs keep one current row and one semantic version", async (context) => {
  const databasePath = join(tmpdir(), `rpk-collector-concurrent-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
    database.close();
    unlinkSync(databasePath);
  });
  applyMigrations(database);
  globalThis.fetch = async () => Response.json({ response: { header: { resultCode: "00" }, body: { items: { item: {
    flightId: "OZ101", scheduleDateTime: "202608251500", gatenumber: "12",
    terminalid: "1", remark: "정상",
  } } } } });
  const env = { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture", retainChangeHistory: true };

  const results = await Promise.all([collectAirportFlights(env), collectAirportFlights(env)]);
  assert.equal(results.every((result) => result.status === "SUCCESS"), true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM airport_flights").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM airport_flight_changes").get().count, 1);
});

test("operational retention is bounded and never touches predictions or outcomes", async (context) => {
  const databasePath = join(tmpdir(), `rpk-retention-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);
  context.after(() => {
    database.close();
    unlinkSync(databasePath);
  });
  applyMigrations(database);
  database.prepare(`INSERT INTO collector_runs (run_id, source_id, started_at, status) VALUES (?, ?, ?, ?)`)
    .run("old-run", "TEST", "2025-01-01T00:00:00Z", "SUCCESS");
  const db = new LocalD1Database(database);
  assert.ok(await pruneOperationalHistory(db, new Date("2026-08-26T00:00:00Z")) > 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM collector_runs").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM predictions").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM outcomes").get().count, 0);
});
