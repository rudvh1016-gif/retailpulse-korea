import assert from "node:assert/strict";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  normalizeAirportCongestion,
  normalizeAirportCongestionT2,
  normalizeAirportPassengerForecastRow,
} from "../lib/source-adapters.ts";
import {
  collectAirportCongestionT2,
  collectAirportPassengerForecast,
} from "../lib/collector.ts";

class LocalD1Statement {
  values = [];
  constructor(statement) { this.statement = statement; }
  bind(...values) { this.values = values; return this; }
  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { rows_written: Number(result.changes) } };
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

function t2Item(overrides = {}) {
  return {
    terminalId: "P03",
    gateId: "DG1_A",
    waitTime: "12",
    waitLength: "45",
    occurtime: "202608301200",
    operatingTime: "05:00~22:00",
    ...overrides,
  };
}

function t2Page(items, totalCount) {
  return { response: { header: { resultCode: "00", resultMsg: "NORMAL SERVICE" }, body: { items, totalCount } } };
}

function a5Row(overrides = {}) {
  const base = {
    adate: "20260830", atime: "09_10",
    t1dg1: "100.0", t1dg2: "50.0", t1dg3: "0.0", t1dg4: "10", t1dg5: "5", t1dg6: "3",
    t1dgsum1: "168.0",
    t1eg1: "40", t1eg2: "20", t1eg3: "10", t1eg4: "5", t1egsum1: "75",
    t2dg1: "30", t2dg2: "20", t2dgsum2: "50",
    t2eg1: "12", t2eg2: "8", t2egsum1: "20",
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete base[key];
    else base[key] = value;
  }
  return base;
}

function a5Page(items, totalCount) {
  return { response: { header: { resultCode: "00", resultMsg: "NORMAL SERVICE" }, body: { items, totalCount } } };
}

// ---------------------------------------------------------------------------
// A4-T2 normalizer-level tests
// ---------------------------------------------------------------------------

test("A4-T2: DG gate IDs parse correctly and P03 means terminal T2, not gateId", async () => {
  const canonical = await normalizeAirportCongestionT2(t2Item({ gateId: "DG2_C" }), "2026-08-30T03:00:00Z");
  assert.equal(canonical.terminal, "T2");
  assert.equal(canonical.zone, "DG2_C");
  assert.equal(canonical.qualityStatus, "VALID");
});

test("A4-T2: rejects a row whose terminalId is not P03 (P03 is a terminalId value, never a gateId)", async () => {
  await assert.rejects(normalizeAirportCongestionT2(t2Item({ terminalId: "DG1_A" }), "2026-08-30T03:00:00Z"));
  // The official guide's own inconsistent sample uses gateId=P03; that must
  // never be accepted as a valid gate either — it is simply an unknown gate
  // string, stored honestly but flagged PARTIAL rather than P03 becoming a
  // terminal string.
  const partial = await normalizeAirportCongestionT2(t2Item({ gateId: "P03" }), "2026-08-30T03:00:00Z");
  assert.equal(partial.qualityStatus, "PARTIAL");
  assert.equal(partial.terminal, "T2");
});

test("A4-T2: waitLength becomes an exact waiting count", async () => {
  const canonical = await normalizeAirportCongestionT2(t2Item({ waitLength: "245" }), "2026-08-30T03:00:00Z");
  assert.equal(canonical.waitingCount, 245);
});

test("A4-T2: a plain integer waitTime becomes an exact numeric minute value", async () => {
  const canonical = await normalizeAirportCongestionT2(t2Item({ waitTime: "37" }), "2026-08-30T03:00:00Z");
  assert.equal(canonical.waitTimeMinutes, 37);
  assert.equal(canonical.waitTimeRaw, "37");
});

test('A4-T2: "60+" is preserved honestly and never coerced into a false-exact 60', async () => {
  const canonical = await normalizeAirportCongestionT2(t2Item({ waitTime: "60+" }), "2026-08-30T03:00:00Z");
  assert.equal(canonical.waitTimeMinutes, null);
  assert.equal(canonical.waitTimeRaw, "60+");
});

test("A4-T2: occurtime parses both YYYYMMDDHHmm and YYYYMMDDHHmmss as KST, never UTC", async () => {
  const minutePrecision = await normalizeAirportCongestionT2(t2Item({ occurtime: "202608301205" }), "2026-08-30T03:00:00Z");
  assert.equal(minutePrecision.observedAt, "2026-08-30T12:05:00+09:00");
  const secondPrecision = await normalizeAirportCongestionT2(t2Item({ occurtime: "20260830120533" }), "2026-08-30T03:00:00Z");
  assert.equal(secondPrecision.observedAt, "2026-08-30T12:05:33+09:00");
});

test("A4-T2: malformed occurtime fails the row closed instead of fabricating a current time", async () => {
  await assert.rejects(normalizeAirportCongestionT2(t2Item({ occurtime: "not-a-time" }), "2026-08-30T03:00:00Z"));
});

test("A4-T1 and A4-T2 use distinct source IDs and can never collide", async () => {
  const t1 = await normalizeAirportCongestion({ terminalId: "P01", gateId: "A", waitTime: "5", waitLength: "10", occurtime: "202608301200" }, "2026-08-30T03:00:00Z");
  const t2 = await normalizeAirportCongestionT2(t2Item({ gateId: "A" }), "2026-08-30T03:00:00Z");
  assert.equal(t1.terminal, "T1");
  assert.equal(t2.terminal, "T2");
  assert.notEqual(t1.sourceHash, t2.sourceHash);
});

// ---------------------------------------------------------------------------
// A4-T2 collector-level (D1) tests
// ---------------------------------------------------------------------------

test("A4-T2 collector: one all-gates request omits gateId, no per-gate explosion", async (context) => {
  const { database, databasePath } = freshDatabase("t2-allgates");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  const requests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    return Response.json(t2Page([
      t2Item({ gateId: "DG1_A" }), t2Item({ gateId: "DG1_B" }), t2Item({ gateId: "DG2_A" }),
    ], 3));
  };

  const result = await collectAirportCongestionT2({ DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" });
  assert.equal(result.status, "SUCCESS");
  assert.equal(requests.length, 1, "a normal collection must cost exactly one provider request");
  assert.equal(requests[0].searchParams.has("gateId"), false);
  assert.equal(requests[0].pathname.includes("statusOfDepartureCongestionT2"), true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM airport_congestion WHERE source_id = 'INCHEON_DEPARTURE_CONGESTION_T2'").get().count, 3);
});

test("A4-T2 collector: bounded pagination respects totalCount beyond one page", async (context) => {
  const { database, databasePath } = freshDatabase("t2-paginate");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  const requests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    const pageNo = url.searchParams.get("pageNo");
    if (pageNo === "1") {
      return Response.json(t2Page(Array.from({ length: 20 }, (_, i) => t2Item({ gateId: "DG1_A", occurtime: `2026083010${String(i).padStart(2, "0")}` })), 25));
    }
    return Response.json(t2Page(Array.from({ length: 5 }, (_, i) => t2Item({ gateId: "DG2_A", occurtime: `2026083011${String(i).padStart(2, "0")}` })), 25));
  };

  const result = await collectAirportCongestionT2({ DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" });
  assert.equal(result.status, "SUCCESS");
  assert.equal(requests.length, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM airport_congestion WHERE source_id = 'INCHEON_DEPARTURE_CONGESTION_T2'").get().count, 25);
});

test("A4-T2 collector: closed/missing gates are never fabricated as a zero row", async (context) => {
  const { database, databasePath } = freshDatabase("t2-missing-gate");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  // The provider simply omits closed gates from the items array; there is no
  // "waitingCount: 0" row to fabricate for DG2_D et al.
  globalThis.fetch = async () => Response.json(t2Page([t2Item({ gateId: "DG1_A" }), t2Item({ gateId: "DG1_B" })], 2));

  await collectAirportCongestionT2({ DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" });
  const rows = database.prepare("SELECT zone FROM airport_congestion WHERE source_id = 'INCHEON_DEPARTURE_CONGESTION_T2'").all();
  assert.equal(rows.length, 2);
  assert.equal(rows.some((row) => row.zone === "DG2_D"), false);
});

test("A4-T2 collector: identical observation is idempotent and retrievedAt alone never duplicates", async (context) => {
  const { database, databasePath } = freshDatabase("t2-idempotent");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  globalThis.fetch = async () => Response.json(t2Page([t2Item()], 1));
  const env = { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" };
  const first = await collectAirportCongestionT2(env);
  const second = await collectAirportCongestionT2(env);

  assert.equal(first.records, 1);
  assert.equal(second.records, 0, "a rerun with the same occurtime observation must write zero new rows");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM airport_congestion WHERE source_id = 'INCHEON_DEPARTURE_CONGESTION_T2'").get().count, 1);
  assert.equal(database.prepare("SELECT observed_at FROM airport_congestion WHERE source_id = 'INCHEON_DEPARTURE_CONGESTION_T2'").get().observed_at, "2026-08-30T12:00:00+09:00");
});

test("A4-T2 collector: a provider ERROR preserves the last-good rows already in D1", async (context) => {
  const { database, databasePath } = freshDatabase("t2-error-preserves");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  const env = { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" };
  globalThis.fetch = async () => Response.json(t2Page([t2Item()], 1));
  await collectAirportCongestionT2(env);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM airport_congestion WHERE source_id = 'INCHEON_DEPARTURE_CONGESTION_T2'").get().count, 1);

  globalThis.fetch = async () => Response.json({ response: { header: { resultCode: "99" }, body: {} } });
  const result = await collectAirportCongestionT2(env);
  assert.equal(result.status, "ERROR");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM airport_congestion WHERE source_id = 'INCHEON_DEPARTURE_CONGESTION_T2'").get().count, 1, "the earlier successful row must remain exactly as it was");
  assert.equal(database.prepare("SELECT status FROM source_health WHERE source_id = 'INCHEON_DEPARTURE_CONGESTION_T2'").get().status, "ERROR");
});

test("A4-T2 collector: no secret or full request URL ever reaches collector_runs/source_health detail", async (context) => {
  const { database, databasePath } = freshDatabase("t2-redaction");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  globalThis.fetch = async () => { throw new Error("network fail for ?serviceKey=SUPER-SECRET-VALUE&pageNo=1"); };
  await collectAirportCongestionT2({ DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "SUPER-SECRET-VALUE" });
  const detail = database.prepare("SELECT detail FROM collector_runs WHERE source_id = 'INCHEON_DEPARTURE_CONGESTION_T2' ORDER BY started_at DESC LIMIT 1").get().detail;
  assert.doesNotMatch(detail, /SUPER-SECRET-VALUE/);
});

// ---------------------------------------------------------------------------
// A5 normalizer-level tests
// ---------------------------------------------------------------------------

test("A5: adate + hourly atime band parse into KST target start/end", async () => {
  const rows = await normalizeAirportPassengerForecastRow(a5Row({ atime: "09_10" }), "2026-08-30T00:00:00Z");
  const row = rows.find((r) => r.zone === "t1dg1");
  assert.equal(row.targetDate, "2026-08-30");
  assert.equal(row.targetStartAt, "2026-08-30T09:00:00+09:00");
  assert.equal(row.targetEndAt, "2026-08-30T10:00:00+09:00");
});

test('A5: the "23_24" band rolls over to next-day 00:00, never an invalid same-day 24:00', async () => {
  const rows = await normalizeAirportPassengerForecastRow(a5Row({ atime: "23_24" }), "2026-08-30T00:00:00Z");
  const row = rows.find((r) => r.zone === "t1dg1");
  assert.equal(row.targetStartAt, "2026-08-30T23:00:00+09:00");
  assert.equal(row.targetEndAt, "2026-08-31T00:00:00+09:00");
  assert.doesNotMatch(row.targetEndAt, /24:00/);
});

test("A5: malformed adate/atime fails the whole time band closed", async () => {
  await assert.rejects(normalizeAirportPassengerForecastRow(a5Row({ adate: "not-a-date" }), "2026-08-30T00:00:00Z"));
  await assert.rejects(normalizeAirportPassengerForecastRow(a5Row({ atime: "garbage" }), "2026-08-30T00:00:00Z"));
});

test("A5: T1/T2 departure/arrival fields are distinguishable, including the exact t2dgsum2 spelling", async () => {
  const rows = await normalizeAirportPassengerForecastRow(a5Row(), "2026-08-30T00:00:00Z");
  const byZone = Object.fromEntries(rows.map((row) => [row.zone, row]));
  assert.equal(byZone.t1dg1.terminal, "T1");
  assert.equal(byZone.t1dg1.direction, "departure");
  assert.equal(byZone.t1dg1.isAggregate, false);
  assert.equal(byZone.t2dg1.terminal, "T2");
  assert.equal(byZone.t2dg1.direction, "departure");
  assert.equal(byZone.t1eg1.terminal, "T1");
  assert.equal(byZone.t1eg1.direction, "arrival");
  assert.equal(byZone.t2eg1.terminal, "T2");
  assert.equal(byZone.t2eg1.direction, "arrival");
  assert.ok(byZone.t2dgsum2, "the official t2dgsum2 total field must be recognized exactly as spelled");
  assert.equal(byZone.t2dgsum2.isAggregate, true);
  assert.equal(byZone.t2dgsum2.terminal, "T2");
  assert.equal(byZone.t2dgsum2.direction, "departure");
  assert.equal(byZone.t2dgsum1, undefined, "t2dgsum1 does not exist officially and must never be invented");
});

test("A5: official aggregate rows are distinguished from component rows", async () => {
  const rows = await normalizeAirportPassengerForecastRow(a5Row(), "2026-08-30T00:00:00Z");
  const t1DepartureAggregates = rows.filter((row) => row.terminal === "T1" && row.direction === "departure" && row.isAggregate);
  const t1DepartureComponents = rows.filter((row) => row.terminal === "T1" && row.direction === "departure" && !row.isAggregate);
  assert.equal(t1DepartureAggregates.length, 1);
  assert.equal(t1DepartureAggregates[0].zone, "t1dgsum1");
  assert.equal(t1DepartureComponents.length, 6);
});

test("A5: explicit 0.0 is preserved as a valid zero, but a missing field is never converted to zero", async () => {
  const rows = await normalizeAirportPassengerForecastRow(a5Row({ t1dg3: "0.0", t1dg4: undefined }), "2026-08-30T00:00:00Z");
  const byZone = Object.fromEntries(rows.map((row) => [row.zone, row]));
  assert.equal(byZone.t1dg3.expectedPassengers, 0);
  assert.equal(byZone.t1dg4, undefined, "a missing field must not produce a zero-valued row");
});

test("A5: malformed or negative individual fields are dropped instead of fabricated", async () => {
  const rows = await normalizeAirportPassengerForecastRow(a5Row({ t1dg1: "-5", t1dg2: "not-a-number" }), "2026-08-30T00:00:00Z");
  const byZone = Object.fromEntries(rows.map((row) => [row.zone, row]));
  assert.equal(byZone.t1dg1, undefined);
  assert.equal(byZone.t1dg2, undefined);
  // The rest of the row is still processed — one bad field does not fail the
  // whole time band closed (only a malformed adate/atime does that).
  assert.ok(byZone.t1dg3);
});

test("A5: non-integral provider counts such as 706.0 are preserved without silent rounding", async () => {
  const rows = await normalizeAirportPassengerForecastRow(a5Row({ t1dg1: "706.5" }), "2026-08-30T00:00:00Z");
  const row = rows.find((r) => r.zone === "t1dg1");
  assert.equal(row.expectedPassengers, 706.5);
});

test("A5: only V5.0 field names are recognized, never pre-V5.0 aliases", async () => {
  const rows = await normalizeAirportPassengerForecastRow(a5Row({ t1dep1: "999", t1DepGate1: "999" }), "2026-08-30T00:00:00Z");
  assert.equal(rows.some((row) => row.expectedPassengers === 999), false);
});

// ---------------------------------------------------------------------------
// A5 collector-level (D1) tests
// ---------------------------------------------------------------------------

test("A5 collector: queries both selectdate=0 (today) and selectdate=1 (tomorrow), ~2 requests/cycle", async (context) => {
  const { database, databasePath } = freshDatabase("a5-both-days");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  const seenSelectdates = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    seenSelectdates.push(url.searchParams.get("selectdate"));
    return Response.json(a5Page([a5Row({ adate: url.searchParams.get("selectdate") === "1" ? "20260831" : "20260830" })], 1));
  };

  const result = await collectAirportPassengerForecast({ DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" });
  assert.equal(result.status, "SUCCESS");
  assert.deepEqual(seenSelectdates.sort(), ["0", "1"]);
  assert.equal(seenSelectdates.length, 2, "a normal cycle must cost exactly two provider requests");
});

test("A5 collector: bounded pagination respects totalCount beyond one page", async (context) => {
  const { database, databasePath } = freshDatabase("a5-paginate");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  const requests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.searchParams.get("selectdate") === "1") return Response.json(a5Page([a5Row({ adate: "20260831" })], 1));
    const pageNo = url.searchParams.get("pageNo");
    if (pageNo === "1") return Response.json(a5Page(Array.from({ length: 50 }, (_, i) => a5Row({ atime: `${String(i % 23).padStart(2, "0")}_${String((i % 23) + 1).padStart(2, "0")}` })), 55));
    return Response.json(a5Page([a5Row({ atime: "05_06" })], 55));
  };

  const result = await collectAirportPassengerForecast({ DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" });
  assert.equal(result.status, "SUCCESS");
  const todayRequests = requests.filter((url) => url.searchParams.get("selectdate") === "0");
  assert.equal(todayRequests.length, 2, "totalCount above one page must trigger bounded pagination");
});

test("A5 collector: unchanged rerun is idempotent; a changed official value updates safely", async (context) => {
  const { database, databasePath } = freshDatabase("a5-idempotent");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  const env = { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" };
  globalThis.fetch = async () => Response.json(a5Page([a5Row()], 1));
  const first = await collectAirportPassengerForecast(env);
  assert.equal(first.status, "SUCCESS");
  assert.ok(first.records > 0);

  const second = await collectAirportPassengerForecast(env);
  assert.equal(second.records, 0, "an unchanged rerun must write zero rows");

  globalThis.fetch = async () => Response.json(a5Page([a5Row({ t1dg1: "500.0" })], 1));
  const third = await collectAirportPassengerForecast(env);
  assert.ok(third.records > 0, "a genuinely changed official value must update safely");
  assert.equal(database.prepare("SELECT expected_passengers FROM airport_passenger_forecast WHERE zone = 't1dg1'").get().expected_passengers, 500);
});

test("A5 collector: an expired/past target date remains in history and is never deleted", async (context) => {
  const { database, databasePath } = freshDatabase("a5-history");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  // Simulate a forecast row collected on a previous day, for a target date
  // that has now left the D+0/D+1 window.
  database.prepare(`INSERT INTO airport_passenger_forecast (
    id, source_id, record_origin, terminal, direction, zone, is_aggregate,
    target_date, time_band_raw, target_start_at, target_end_at, expected_passengers,
    retrieved_at, schema_version, quality_status, source_hash
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "old-row", "INCHEON_PASSENGER_FORECAST", "FORECAST", "T1", "departure", "t1dg1", 0,
    "2026-09-01", "09_10", "2026-09-01T09:00:00+09:00", "2026-09-01T10:00:00+09:00", 100,
    "2026-08-31T00:00:00Z", "airport-passenger-forecast-v1", "VALID", "old-hash",
  );

  globalThis.fetch = async () => Response.json(a5Page([a5Row({ adate: "20260903" })], 1));
  await collectAirportPassengerForecast({ DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" });

  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM airport_passenger_forecast WHERE target_date = '2026-09-01'").get().count, 1, "history for an expired target date must not be deleted by a later collection run");
});

test("A5 never writes into airport_congestion, and A5 failures never alter A4 source health", async (context) => {
  const { database, databasePath } = freshDatabase("a5-isolation");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  database.prepare(`INSERT INTO source_health (source_id, status, last_event_at, last_published_at, last_retrieved_at, consecutive_failures, schema_version, detail, updated_at)
    VALUES ('INCHEON_DEPARTURE_CONGESTION', 'LIVE', NULL, NULL, NULL, 0, 'airport-congestion-v1', 'pre-existing', '2026-08-30T00:00:00Z')`).run();
  database.prepare(`INSERT INTO source_health (source_id, status, last_event_at, last_published_at, last_retrieved_at, consecutive_failures, schema_version, detail, updated_at)
    VALUES ('INCHEON_DEPARTURE_CONGESTION_T2', 'LIVE', NULL, NULL, NULL, 0, 'airport-congestion-t2-v1', 'pre-existing', '2026-08-30T00:00:00Z')`).run();

  globalThis.fetch = async () => Response.json({ response: { header: { resultCode: "99" }, body: {} } });
  const result = await collectAirportPassengerForecast({ DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" });
  assert.equal(result.status, "ERROR");

  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM airport_congestion").get().count, 0);
  assert.equal(database.prepare("SELECT status, detail FROM source_health WHERE source_id = 'INCHEON_DEPARTURE_CONGESTION'").get().detail, "pre-existing");
  assert.equal(database.prepare("SELECT status, detail FROM source_health WHERE source_id = 'INCHEON_DEPARTURE_CONGESTION_T2'").get().detail, "pre-existing");
});

test("A5 collector: no secret ever reaches collector_runs/source_health detail", async (context) => {
  const { database, databasePath } = freshDatabase("a5-redaction");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  globalThis.fetch = async () => { throw new Error("network fail for ?serviceKey=SUPER-SECRET-VALUE&selectdate=0"); };
  await collectAirportPassengerForecast({ DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "SUPER-SECRET-VALUE" });
  const detail = database.prepare("SELECT detail FROM collector_runs WHERE source_id = 'INCHEON_PASSENGER_FORECAST' ORDER BY started_at DESC LIMIT 1").get().detail;
  assert.doesNotMatch(detail, /SUPER-SECRET-VALUE/);
});
