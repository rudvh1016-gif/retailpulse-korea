import assert from "node:assert/strict";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { collectAirportFlights, collectSeoulForeignPresence, pruneOperationalHistory } from "../lib/collector.ts";

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
  for (const file of ["drizzle/0000_daffy_tempest.sql", "drizzle/0001_crazy_nekra.sql", "drizzle/0002_reflective_martin_li.sql", "drizzle/0003_minor_network.sql", "drizzle/0004_s2_foreign_presence.sql"]) {
    database.exec(readFileSync(file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
}

const s2Row = (dongCode, value) => ({
  YMD: "20260828", TT: "14", H_DNG_CD: dongCode, SPOP: String(value),
  CAN: null, CHN: "1", ETC: "1", FRA: "0", IDN: "0", IND: "0", JPN: "0",
  KAZ: "0", KHM: "0", LKA: "0", MNG: "0", NPL: "0", PAK: "0", PHL: "0",
  RUS: "0", THA: "0", USA: "0", UZB: "0", VNM: "0",
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

  const byDong = {
    11140550: s2Row("11140550", 100),
    11440660: s2Row("11440660", 200),
    11200690: s2Row("11200690", 300),
  };
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url.replace("fixture", "[REDACTED]"));
    const code = Object.keys(byDong).find((dong) => url.endsWith(`/${dong}`));
    const row = code ? byDong[code] : byDong[11140550];
    return Response.json({
      Spop250mFornTempDong: {
        list_total_count: 1,
        RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다" },
        row: [row],
      },
    });
  };

  const env = { DB: new LocalD1Database(database), SEOUL_OPEN_DATA_KEY: "fixture" };
  const first = await collectSeoulForeignPresence(env);
  const second = await collectSeoulForeignPresence(env);

  assert.deepEqual(first, { status: "SUCCESS", records: 6 });
  assert.deepEqual(second, { status: "SUCCESS", records: 0 });
  assert.equal(requests.length, 8);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_foreign_presence_dong").get().count, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_foreign_presence_area").get().count, 3);
  assert.equal(database.prepare("SELECT value FROM seoul_foreign_presence_area WHERE area = 'seongsu'").get().value, 300);
  assert.equal(database.prepare("SELECT status FROM source_health WHERE source_id = ?").get("SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION").status, "OFFICIAL_HISTORICAL");
  assert.equal(JSON.stringify(requests).includes("fixture"), false);
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

  globalThis.fetch = async () => Response.json({
    response: {
      body: {
        items: {
          item: {
            flightId: "KE703",
            airline: "Korean Air",
            airport: "NRT",
            scheduleDateTime: "202608251430",
            estimatedDateTime: "202608251445",
            gatenumber: "231",
            chkinrange: "A01-A12",
            remark: "지연",
            terminalid: "2",
          },
        },
      },
    },
  });

  const env = { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture", retainChangeHistory: true };
  const first = await collectAirportFlights(env);
  const second = await collectAirportFlights(env);
  assert.equal(first.status, "SUCCESS");
  assert.ok(first.records > 0);
  assert.deepEqual(second, { status: "SUCCESS", records: 0 });

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
  globalThis.fetch = async () => Response.json({ response: { body: { items: { item: {
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
  globalThis.fetch = async () => Response.json({ response: { body: { items: { item: {
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
