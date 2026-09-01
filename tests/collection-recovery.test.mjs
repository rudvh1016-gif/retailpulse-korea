/**
 * Temporal self-healing contract for the scheduled collectors.
 *
 * Production evidence behind these tests: the airport page served an A5
 * forecast collected at 08:42 while the clock read 14:33. The provider had
 * timed out at :42 and A5 only runs once an hour, so a failure that lasted a
 * few minutes cost the whole hour. A4 realtime never showed this because its
 * next 15-minute cycle repairs it on its own.
 *
 * The rules a recovery window must obey, and what each test here proves:
 *   · healthy coverage  -> ZERO provider requests (never a blind repeat)
 *   · partial coverage  -> only the missing day/grid is requested
 *   · failed repair     -> stored rows survive untouched, health is STALE
 *   · nothing stored    -> health is ERROR, never softened to STALE
 *   · repaired later    -> health returns to LIVE on its own
 */
import assert from "node:assert/strict";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { uniqueKmaGrids } from "../lib/areas.ts";
import {
  describeForecastPlan,
  describeWeatherPlan,
  expectedWeatherIssuedAt,
  planForecastRecovery,
  planWeatherRecovery,
  SKIPPED_ALREADY_HEALTHY,
} from "../lib/collection-recovery.ts";
import { CloudflareD1RestDatabase } from "../lib/d1-rest.ts";
import { runSelectedProductionSources } from "../lib/production-runner.ts";

class LocalD1Statement {
  values = [];
  constructor(statement) { this.statement = statement; }
  bind(...values) { this.values = values; return this; }
  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), rows_written: Number(result.changes) } };
  }
  async all() {
    return { results: this.statement.all(...this.values), success: true };
  }
}

class LocalD1Database {
  constructor(database) { this.database = database; }
  prepare(query) { return new LocalD1Statement(this.database.prepare(query)); }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}

const MIGRATIONS = [
  "drizzle/0000_daffy_tempest.sql",
  "drizzle/0001_crazy_nekra.sql",
  "drizzle/0002_reflective_martin_li.sql",
  "drizzle/0003_minor_network.sql",
  "drizzle/0004_s2_foreign_presence.sql",
  "drizzle/0005_airport_official_contracts.sql",
  "drizzle/0006_airport_t2_and_passenger_forecast.sql",
];

function freshDatabase(name) {
  const databasePath = join(tmpdir(), `rpk-${name}-${process.pid}-${Math.random().toString(36).slice(2)}.db`);
  const database = new DatabaseSync(databasePath);
  for (const file of MIGRATIONS) database.exec(readFileSync(file, "utf8").replaceAll("--> statement-breakpoint", ""));
  return { database, databasePath };
}

/** 2026-09-01 14:53 KST — the minute the A5 recovery window fires. */
const NOW = new Date("2026-09-01T05:53:00.000Z");
const TODAY = "2026-09-01";
const TOMORROW = "2026-09-02";

/** The calendar day after `day`, compared as plain dates (never via UTC shift). */
const kstDayAfter = (day) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * One whole-day aggregate band per terminal. Coverage is COMPLETE only when
 * the bands run contiguously from 00:00 to the next day's 00:00 on BOTH
 * terminals with a matching grid, which a single full-day band satisfies.
 */
function seedCompleteForecastDay(database, targetDate, retrievedAt) {
  const dayStart = `${targetDate}T00:00:00+09:00`;
  const dayEnd = `${kstDayAfter(targetDate)}T00:00:00+09:00`;
  for (const terminal of ["T1", "T2"]) {
    database.prepare(`INSERT INTO airport_passenger_forecast (
      id, source_id, record_origin, terminal, direction, zone, is_aggregate,
      target_date, time_band_raw, target_start_at, target_end_at, expected_passengers,
      retrieved_at, schema_version, quality_status, source_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      `${terminal}-${targetDate}`, "INCHEON_PASSENGER_FORECAST", "OFFICIAL", terminal, "departure", "ALL", 1,
      targetDate, "00_24", dayStart, dayEnd, 20000,
      retrievedAt, "A5-v5.0", "VALID", `hash-${terminal}-${targetDate}`,
    );
  }
}

function seedWeatherIssuance(database, areas, issuedAt, retrievedAt) {
  for (const area of areas) {
    database.prepare(`INSERT INTO weather_forecast (
      id, source_id, area, issued_at, target_at, retrieved_at,
      precipitation_probability, temperature_tenth_c, condition_code,
      schema_version, quality_status, source_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      `${area}-${issuedAt}`, "KMA_VILAGE_FCST", area, issuedAt, `${TODAY}T18:00:00+09:00`, retrievedAt,
      20, 250, "clear", "W1-v1", "VALID", `hash-${area}`,
    );
  }
}

const a5Page = (items, totalCount) => ({
  response: { header: { resultCode: "00", resultMsg: "NORMAL SERVICE" }, body: { items, totalCount } },
});

const a5Row = (adate) => ({
  adate, atime: "00_24",
  t1dg1: "100.0", t1dg2: "50.0", t1dg3: "0.0", t1dg4: "10", t1dg5: "5", t1dg6: "3", t1dgsum1: "168.0",
  t1eg1: "40", t1eg2: "20", t1eg3: "10", t1eg4: "5", t1egsum1: "75",
  t2dg1: "30", t2dg2: "20", t2dgsum2: "50",
  t2eg1: "12", t2eg2: "8", t2egsum1: "20",
});

/**
 * A provider-side failure code, which the collector rejects immediately.
 *
 * A thrown connect timeout would be classified transient and wait 5s then 30s
 * per grid (KMA_GRID_RETRY_POLICY), turning each failure case here into a
 * ~35s test. That retry ladder is already bounded and covered in the source
 * fetch tests; what these tests need to prove is what happens to STORED data
 * and health once a grid has failed, which this reaches instantly.
 */
const kmaFailure = () => Response.json({ response: { header: { resultCode: "03", resultMsg: "NODATA_ERROR" } } });

const kmaPage = () => ({
  response: {
    header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
    body: { items: { item: [
      { baseDate: "20260901", baseTime: "1400", fcstDate: "20260901", fcstTime: "1800", category: "POP", fcstValue: "30", nx: 60, ny: 127 },
      { baseDate: "20260901", baseTime: "1400", fcstDate: "20260901", fcstTime: "1800", category: "TMP", fcstValue: "26", nx: 60, ny: 127 },
    ] } },
  },
});

const health = (database) => database.prepare("SELECT status, detail FROM source_health WHERE source_id = ?");
const forecastRowCount = (database) => database.prepare("SELECT COUNT(*) AS count FROM airport_passenger_forecast").get().count;
const weatherRowCount = (database) => database.prepare("SELECT COUNT(*) AS count FROM weather_forecast").get().count;

const runRecovery = (database, source, now = NOW) => runSelectedProductionSources(
  { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture-key" },
  [source],
  now,
);

// ---------------------------------------------------------------------------
// The adapter the recovery planner actually runs against
// ---------------------------------------------------------------------------

/**
 * The planner's D1 surface must exist on the REAL adapter, not just on the
 * fakes in this file.
 *
 * The first production recovery run (33479570166) requested a full cycle
 * while reporting every day UNAVAILABLE, on a database that held the data.
 * `CloudflareD1RestDatabase` — the adapter GitHub Actions uses — had no
 * `all()`; the planner's call threw, the throw was swallowed as "nothing
 * stored", and the window spent 2 provider requests instead of 0. Every unit
 * test passed, because LocalD1Database here implements `all()`.
 *
 * So this asserts against the production class directly. A test double may
 * never be more capable than the thing it stands in for.
 */
test("the production D1 adapter implements every method the recovery planner calls", async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    calls.push(JSON.parse(String(init.body)));
    return Response.json({
      success: true,
      result: [{ success: true, meta: { rows_read: 2 }, results: [{ area: "myeongdong", rowCount: 3 }] }],
    });
  };
  const database = new CloudflareD1RestDatabase("account", "db", "token", fetchImpl);
  const statement = database.prepare("SELECT area, COUNT(*) AS rowCount FROM weather_forecast WHERE issued_at = ?");

  for (const method of ["bind", "run", "all"]) {
    assert.equal(typeof statement[method], "function", `RestPreparedStatement must implement ${method}()`);
  }
  assert.equal(typeof database.batch, "function");

  const result = await statement.bind("2026-09-01T14:00:00+09:00").all();
  assert.deepEqual(result.results, [{ area: "myeongdong", rowCount: 3 }]);
  assert.equal(result.success, true);
  assert.deepEqual(calls, [{ batch: [{
    sql: "SELECT area, COUNT(*) AS rowCount FROM weather_forecast WHERE issued_at = ?",
    params: ["2026-09-01T14:00:00+09:00"],
  }] }]);
});

test("a healthy plan reads correctly through the production adapter, costing zero provider requests", async () => {
  // The exact shape the planner asks for, answered the way D1 answers it.
  const dayStart = `${TODAY}T00:00:00+09:00`;
  const dayEnd = `${TOMORROW}T00:00:00+09:00`;
  const band = (terminal, targetDate) => ({
    terminal, direction: "departure", isAggregate: 1, targetDate,
    timeBandRaw: "00_24", targetStartAt: `${targetDate}T00:00:00+09:00`,
    targetEndAt: targetDate === TODAY ? dayEnd : `${kstDayAfter(targetDate)}T00:00:00+09:00`,
    expectedPassengers: 20000, retrievedAt: `${TODAY}T14:42:00+09:00`,
  });
  assert.equal(dayStart, `${TODAY}T00:00:00+09:00`);

  const fetchImpl = async (_url, init) => {
    const { batch } = JSON.parse(String(init.body));
    const targetDate = batch[0].params?.[0];
    return Response.json({
      success: true,
      result: [{ success: true, results: [band("T1", targetDate), band("T2", targetDate)] }],
    });
  };
  const database = new CloudflareD1RestDatabase("account", "db", "token", fetchImpl);
  const plan = await planForecastRecovery(database, NOW);

  assert.equal(plan.d1ReadFailed, false);
  assert.deepEqual(plan.missingSelectdates, [], "a readable, complete, fresh day needs no provider request");
  assert.equal(plan.hasUsableLastGood, true);
});

test("a failed D1 read is reported as unverified, never as proof the data is gone", async () => {
  const database = new CloudflareD1RestDatabase("account", "db", "token", async () => new Response("nope", { status: 500 }));
  const plan = await planForecastRecovery(database, NOW);

  assert.equal(plan.d1ReadFailed, true, "the run must say the read failed");
  assert.equal(plan.hasUsableLastGood, false);
  // The repair still proceeds, bounded to one primary cycle — but the log
  // names the read failure instead of claiming the forecast is missing.
  assert.deepEqual(plan.missingSelectdates, ["0", "1"]);
  assert.match(describeForecastPlan(plan), /d1ReadFailed=true/);

  const weather = await planWeatherRecovery(database, NOW);
  assert.equal(weather.d1ReadFailed, true);
  assert.match(describeWeatherPlan(weather), /d1ReadFailed=true/);
});

// ---------------------------------------------------------------------------
// A5 — the hourly forecast
// ---------------------------------------------------------------------------

test("A5 recovery makes ZERO provider requests when both days are already complete and fresh", async (context) => {
  const { database, databasePath } = freshDatabase("a5-healthy");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  // Collected at 14:42 — this hour's primary run succeeded.
  seedCompleteForecastDay(database, TODAY, `${TODAY}T14:42:00+09:00`);
  seedCompleteForecastDay(database, TOMORROW, `${TODAY}T14:42:00+09:00`);

  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return Response.json(a5Page([], 0)); };

  const [result] = await runRecovery(database, "airport_passenger_forecast_recovery");
  assert.equal(result.status, SKIPPED_ALREADY_HEALTHY);
  assert.equal(requests, 0, "a healthy recovery window must not touch the provider at all");
  assert.equal(result.providerRequests, 0);
  assert.equal(result.mode, "RECOVERY");
});

test("A5 recovery requests ONLY the missing day when today is healthy and tomorrow is not", async (context) => {
  const { database, databasePath } = freshDatabase("a5-partial");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  seedCompleteForecastDay(database, TODAY, `${TODAY}T14:42:00+09:00`);

  const seen = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    seen.push(url.searchParams.get("selectdate"));
    return Response.json(a5Page([a5Row("20260902")], 1));
  };

  const [result] = await runRecovery(database, "airport_passenger_forecast_recovery");
  assert.deepEqual(seen, ["1"], "only tomorrow was missing, so only selectdate=1 may be requested");
  assert.equal(result.providerRequests, 1);
  assert.equal(result.status, "SUCCESS");
  assert.equal(health(database).get("INCHEON_PASSENGER_FORECAST").status, "LIVE");
});

test("A5 recovery treats a complete but hours-old day as missing, because the hourly refresh did not happen", async (context) => {
  const { database, databasePath } = freshDatabase("a5-stale");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  // The production symptom exactly: complete data, collected at 08:42.
  seedCompleteForecastDay(database, TODAY, `${TODAY}T08:42:00+09:00`);
  seedCompleteForecastDay(database, TOMORROW, `${TODAY}T08:42:00+09:00`);

  const plan = await planForecastRecovery(new LocalD1Database(database), NOW);
  assert.deepEqual(plan.missingSelectdates, ["0", "1"]);
  assert.deepEqual(plan.days.map((day) => day.coverage), ["COMPLETE", "COMPLETE"]);
  assert.equal(plan.hasUsableLastGood, true);

  const seen = [];
  globalThis.fetch = async (input) => {
    seen.push(new URL(String(input)).searchParams.get("selectdate"));
    return Response.json(a5Page([a5Row("20260901")], 1));
  };
  const [result] = await runRecovery(database, "airport_passenger_forecast_recovery");
  assert.deepEqual(seen.sort(), ["0", "1"]);
  assert.equal(result.providerRequests, 2, "a full repair costs exactly one primary cycle, never more");
});

test("A failed A5 repair preserves last-good rows and reports STALE, not ERROR and not LIVE", async (context) => {
  const { database, databasePath } = freshDatabase("a5-preserve");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  seedCompleteForecastDay(database, TODAY, `${TODAY}T08:42:00+09:00`);
  seedCompleteForecastDay(database, TOMORROW, `${TODAY}T08:42:00+09:00`);
  const before = database.prepare("SELECT id, expected_passengers AS expected, retrieved_at AS retrievedAt FROM airport_passenger_forecast ORDER BY id").all();

  globalThis.fetch = async () => { throw new Error("UND_ERR_CONNECT_TIMEOUT"); };
  const [result] = await runRecovery(database, "airport_passenger_forecast_recovery");

  assert.equal(result.status, "ERROR", "a failed attempt stays visible as a failed run");
  assert.equal(result.sourceHealth, "STALE");
  assert.equal(result.lastGoodPreserved, true);
  assert.equal(health(database).get("INCHEON_PASSENGER_FORECAST").status, "STALE",
    "usable stored data means STALE; ERROR would claim there is nothing to serve");
  const after = database.prepare("SELECT id, expected_passengers AS expected, retrieved_at AS retrievedAt FROM airport_passenger_forecast ORDER BY id").all();
  assert.deepEqual(after, before, "a provider timeout must never delete or zero a stored forecast");
});

test("A5 reports ERROR, never STALE, when nothing usable is stored either", async (context) => {
  const { database, databasePath } = freshDatabase("a5-empty");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  globalThis.fetch = async () => { throw new Error("UND_ERR_CONNECT_TIMEOUT"); };
  const [result] = await runRecovery(database, "airport_passenger_forecast_recovery");
  assert.equal(result.status, "ERROR");
  assert.equal(result.sourceHealth, "ERROR", "with no last-good rows there is nothing to call STALE");
  assert.equal(forecastRowCount(database), 0);
});

test("A5 health walks LIVE -> STALE -> LIVE as the provider fails and recovers", async (context) => {
  const { database, databasePath } = freshDatabase("a5-transition");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  // 1. A healthy primary cycle.
  globalThis.fetch = async (input) => Response.json(
    a5Page([a5Row(new URL(String(input)).searchParams.get("selectdate") === "1" ? "20260902" : "20260901")], 1),
  );
  await runSelectedProductionSources({ DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture-key" }, ["airport_passenger_forecast"], NOW);
  assert.equal(health(database).get("INCHEON_PASSENGER_FORECAST").status, "LIVE");
  const storedAfterLive = forecastRowCount(database);
  assert.ok(storedAfterLive > 0);

  // 2. An hour passes without a successful primary run, then the provider is
  //    down when the recovery window fires. Ageing the stored rows is what
  //    makes the repair necessary — a recovery with nothing to repair would
  //    correctly skip and leave health untouched.
  database.prepare("UPDATE airport_passenger_forecast SET retrieved_at = ?").run(`${TODAY}T08:42:00+09:00`);
  globalThis.fetch = async () => { throw new Error("UND_ERR_CONNECT_TIMEOUT"); };
  await runRecovery(database, "airport_passenger_forecast_recovery");
  assert.equal(health(database).get("INCHEON_PASSENGER_FORECAST").status, "STALE");
  assert.equal(forecastRowCount(database), storedAfterLive, "the outage must not change what is stored");

  // 3. It comes back, and health repairs itself with no human step.
  globalThis.fetch = async (input) => Response.json(
    a5Page([a5Row(new URL(String(input)).searchParams.get("selectdate") === "1" ? "20260902" : "20260901")], 1),
  );
  await runRecovery(database, "airport_passenger_forecast_recovery");
  assert.equal(health(database).get("INCHEON_PASSENGER_FORECAST").status, "LIVE");
});

test("A5 partial coverage is never written as LIVE, even when some rows were collected", async (context) => {
  const { database, databasePath } = freshDatabase("a5-partial-health");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  globalThis.fetch = async (input) => {
    if (new URL(String(input)).searchParams.get("selectdate") === "1") throw new Error("UND_ERR_CONNECT_TIMEOUT");
    return Response.json(a5Page([a5Row("20260901")], 1));
  };
  const [result] = await runSelectedProductionSources({ DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture-key" }, ["airport_passenger_forecast"], NOW);
  assert.equal(result.status, "PARTIAL");
  assert.equal(health(database).get("INCHEON_PASSENGER_FORECAST").status, "STALE",
    "a day that was requested and not collected leaves coverage incomplete");
});

test("A permanent A5 auth failure stays visible instead of being softened", async (context) => {
  const { database, databasePath } = freshDatabase("a5-auth");
  context.after(() => { database.close(); unlinkSync(databasePath); });

  const [result] = await runSelectedProductionSources({ DB: new LocalD1Database(database) }, ["airport_passenger_forecast_recovery"], NOW);
  assert.equal(result.status, "NEEDS_KEY", "a missing key is a permanent failure, not a transient one");
  assert.equal(health(database).get("INCHEON_PASSENGER_FORECAST").status, "MISSING");
});

// ---------------------------------------------------------------------------
// W1 — the eight-times-a-day forecast
// ---------------------------------------------------------------------------

test("weather recovery makes ZERO provider requests when every grid already holds this issuance", async (context) => {
  const { database, databasePath } = freshDatabase("w1-healthy");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  const { issuedAt } = expectedWeatherIssuedAt(NOW);
  seedWeatherIssuance(database, uniqueKmaGrids().flatMap((grid) => grid.areas), issuedAt, `${TODAY}T14:11:00+09:00`);

  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return Response.json(kmaPage()); };
  const [result] = await runRecovery(database, "weather_recovery");
  assert.equal(result.status, SKIPPED_ALREADY_HEALTHY);
  assert.equal(requests, 0, "a healthy recovery window must not touch KMA at all");
  assert.equal(result.providerRequests, 0);
});

test("weather recovery requests ONLY the grid that is missing", async (context) => {
  const { database, databasePath } = freshDatabase("w1-one-grid");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  const grids = uniqueKmaGrids();
  assert.ok(grids.length >= 2, "this test needs more than one grid to prove targeting");
  const { issuedAt } = expectedWeatherIssuedAt(NOW);
  const stored = grids.slice(1).flatMap((grid) => grid.areas);
  seedWeatherIssuance(database, stored, issuedAt, `${TODAY}T14:11:00+09:00`);

  const plan = await planWeatherRecovery(new LocalD1Database(database), NOW);
  assert.equal(plan.missingGrids.length, 1);
  assert.deepEqual(plan.missingGrids[0].areas, grids[0].areas);

  const seen = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    seen.push(`${url.searchParams.get("nx")},${url.searchParams.get("ny")}`);
    return Response.json(kmaPage());
  };
  const [result] = await runRecovery(database, "weather_recovery");
  assert.deepEqual(seen, [`${grids[0].nx},${grids[0].ny}`]);
  assert.equal(result.providerRequests, 1);
});

test("weather recovery with every grid missing stays bounded to one grid per cell", async (context) => {
  const { database, databasePath } = freshDatabase("w1-all-grids");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return Response.json(kmaPage()); };
  const [result] = await runRecovery(database, "weather_recovery");
  assert.equal(requests, uniqueKmaGrids().length, "a full repair costs one primary cycle, never more");
  assert.equal(result.providerRequests, uniqueKmaGrids().length);
});

test("A failed weather repair preserves stored rows and reports STALE", async (context) => {
  const { database, databasePath } = freshDatabase("w1-preserve");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  // Rows exist, but from the PREVIOUS issuance, so a repair is attempted.
  seedWeatherIssuance(database, uniqueKmaGrids().flatMap((grid) => grid.areas), `${TODAY}T11:00:00+09:00`, `${TODAY}T11:11:00+09:00`);
  const before = database.prepare("SELECT id, precipitation_probability AS pop, temperature_tenth_c AS temp FROM weather_forecast ORDER BY id").all();

  globalThis.fetch = async () => kmaFailure();
  const [result] = await runRecovery(database, "weather_recovery");

  assert.equal(result.status, "ERROR");
  assert.equal(result.sourceHealth, "STALE");
  assert.equal(health(database).get("KMA_VILAGE_FCST").status, "STALE");
  const after = database.prepare("SELECT id, precipitation_probability AS pop, temperature_tenth_c AS temp FROM weather_forecast ORDER BY id").all();
  assert.deepEqual(after, before, "a KMA timeout must never null or zero a stored forecast");
  assert.equal(weatherRowCount(database), before.length);
});

test("weather reports ERROR when every grid fails and nothing is stored", async (context) => {
  const { database, databasePath } = freshDatabase("w1-empty");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  globalThis.fetch = async () => kmaFailure();
  const [result] = await runRecovery(database, "weather_recovery");
  assert.equal(result.sourceHealth, "ERROR");
  assert.equal(health(database).get("KMA_VILAGE_FCST").status, "ERROR");
});

test("a recovery failure detail never carries the service key", async (context) => {
  const { database, databasePath } = freshDatabase("recovery-secret");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  const secret = "SUPER-SECRET-SERVICE-KEY";
  // A5 throws with the full URL in the message (the worst case for a leak);
  // weather takes the instant provider-error path for the reason above.
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("VilageFcstInfoService")) return kmaFailure();
    throw new Error(`connect timeout for ${url}`);
  };
  const results = await runSelectedProductionSources(
    { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: secret },
    ["airport_passenger_forecast_recovery", "weather_recovery"],
    NOW,
  );
  for (const result of results) {
    assert.equal(String(result.detail ?? "").includes(secret), false, `${result.source} leaked the service key`);
  }
  for (const sourceId of ["INCHEON_PASSENGER_FORECAST", "KMA_VILAGE_FCST"]) {
    const row = health(database).get(sourceId);
    assert.equal(String(row?.detail ?? "").includes(secret), false, `${sourceId} health detail leaked the service key`);
  }
});
