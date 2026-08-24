import assert from "node:assert/strict";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { collectAirportFlights } from "../lib/collector.ts";

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
  for (const file of ["drizzle/0000_daffy_tempest.sql", "drizzle/0001_crazy_nekra.sql"]) {
    database.exec(readFileSync(file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
}

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

  const env = { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" };
  assert.deepEqual(await collectAirportFlights(env), { status: "SUCCESS", records: 1 });
  assert.deepEqual(await collectAirportFlights(env), { status: "SUCCESS", records: 1 });

  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM airport_flights").get().count, 1);
  assert.equal(database.prepare("SELECT status FROM source_health WHERE source_id = ?").get("INCHEON_FLIGHT_DETAIL").status, "LIVE");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM collector_runs").get().count, 2);
});
