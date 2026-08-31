import assert from "node:assert/strict";
import test from "node:test";
import { collectAirportFlightsToday, hasCompleteA1RecentHistoryToday } from "../lib/airport-today.ts";
import {
  hasProductionSourceFailure,
  PRODUCTION_SOURCE_NAMES,
  SKIPPED_ALREADY_COMPLETE_TODAY,
  runSelectedProductionSources,
} from "../lib/production-runner.ts";
import {
  DIAGNOSTIC_SOURCE_IDS,
  resolveDiagnosticSourceIds,
  sanitizeProductionDetail,
} from "../lib/production-diagnostics.ts";
import { readFileSync } from "node:fs";

test("job failure classification surfaces any ERROR or NEEDS_KEY after isolated execution", () => {
  assert.equal(hasProductionSourceFailure([
    { source: "airport_recent", status: SKIPPED_ALREADY_COMPLETE_TODAY, records: 0 },
    { source: "seoul_foreign", status: "SUCCESS", records: 18 },
  ]), false);
  assert.equal(hasProductionSourceFailure([
    { source: "airport_recent", status: SKIPPED_ALREADY_COMPLETE_TODAY, records: 0 },
    { source: "airport_enrichment", status: "ERROR", records: 0 },
    { source: "seoul_foreign", status: "SUCCESS", records: 18 },
  ]), true);
  assert.equal(hasProductionSourceFailure([
    { source: "seoul_realtime", status: "PARTIAL", records: 2 },
    { source: "events", status: "NEEDS_KEY", records: 0 },
  ]), true);
});

test("production diagnostics redact authenticated URLs and bearer tokens", () => {
  const detail = "failed https://apis.data.go.kr/path?serviceKey=secret-value&pageNo=1 Bearer token-value";
  const sanitized = sanitizeProductionDetail(detail);
  assert.equal(sanitized.includes("secret-value"), false);
  assert.equal(sanitized.includes("token-value"), false);
  assert.equal(sanitized.includes("https://"), false);
  assert.match(sanitized, /\[REDACTED_URL\]/);
  assert.match(sanitized, /Bearer \[REDACTED\]/);
});

/**
 * Minimal fake D1 that actually understands collector_runs (unlike the
 * write-only mocks in other test files), so the same-day guard can be
 * tested against real inserted/selected rows instead of a hand-seeded array.
 * Every other statement (airport_flights, source_health) is a harmless no-op.
 */
class FakeProductionD1 {
  collectorRuns = [];

  prepare(sql) {
    return {
      bind: (...params) => ({
        run: async () => {
          if (/^SELECT detail FROM collector_runs/.test(sql)) {
            const sourceId = params[0];
            const rows = this.collectorRuns.filter((row) => row.sourceId === sourceId && row.status === "SUCCESS");
            return { results: rows.slice(0, 10).map((row) => ({ detail: row.detail })) };
          }
          if (/^INSERT INTO collector_runs/.test(sql)) {
            // recordSuccess() binds (run_id, source_id, started_at, finished_at, records_read, records_written, detail);
            // status is a literal 'SUCCESS' baked into that statement's SQL, not a bound param.
            const [, sourceId, , , , , detail] = params;
            this.collectorRuns.unshift({ sourceId, status: "SUCCESS", detail });
            return { meta: { rows_written: 1 } };
          }
          return { meta: { rows_written: 1 } };
        },
      }),
    };
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

function flight({ flightId, masterFlightId = flightId, scheduleDatetime, codeshare = "N", terminalId = "P01" }) {
  return {
    fid: `${flightId}-${scheduleDatetime}`,
    flightId,
    masterFlightId,
    codeshare,
    scheduleDatetime,
    estimatedDatetime: scheduleDatetime,
    terminalId,
    gateNumber: "29",
    chkinRange: "A01-A10",
    remark: "정상",
    airline: "KE",
    airport: "NRT",
  };
}

function pagePayload(items, totalCount) {
  return { response: { header: { resultCode: "00", resultMsg: "NORMAL SERVICE" }, body: { items, totalCount } } };
}

test("A1 same-day guard ignores a legacy first-page success and requires a matching recent-history target date", async () => {
  const db = new FakeProductionD1();
  assert.equal(await hasCompleteA1RecentHistoryToday(db, "2026-08-30"), false);

  db.collectorRuns.push({ sourceId: "INCHEON_FLIGHT_DETAIL", status: "SUCCESS", detail: "normalized 100; changed writes 5" });
  assert.equal(await hasCompleteA1RecentHistoryToday(db, "2026-08-30"), false, "legacy first-page success must never satisfy the guard");

  db.collectorRuns.unshift({ sourceId: "INCHEON_FLIGHT_DETAIL", status: "SUCCESS", detail: "recent 2026-08-26..2026-08-29; pages 3; population 205" });
  assert.equal(await hasCompleteA1RecentHistoryToday(db, "2026-08-30"), false, "yesterday's completed scan must not satisfy today's guard");

  db.collectorRuns.unshift({ sourceId: "INCHEON_FLIGHT_DETAIL", status: "SUCCESS", detail: "recent 2026-08-27..2026-08-30; pages 3; population 205" });
  assert.equal(await hasCompleteA1RecentHistoryToday(db, "2026-08-30"), true);
});

test("guard has no db: fails open toward doing real work, never toward a false skip", async () => {
  assert.equal(await hasCompleteA1RecentHistoryToday(undefined, "2026-08-30"), false);
});

test("a completed A1 recent-history run satisfies the guard for a later same-day check", async () => {
  const db = new FakeProductionD1();
  const result = await collectAirportFlightsToday(
    { DB: db, DATA_GO_KR_SERVICE_KEY: "fixture-key" },
    new Date("2026-08-30T03:00:00.000Z"),
    async () => pagePayload([flight({ flightId: "KE027", scheduleDatetime: "202608300900" })], 1),
  );
  assert.equal(result.status, "SUCCESS");
  assert.equal(await hasCompleteA1RecentHistoryToday(db, "2026-08-30"), true);
  assert.equal(await hasCompleteA1RecentHistoryToday(db, "2026-08-31"), false, "a different KST date must still require its own scan");
});

test("the A1 same-day guard makes zero provider calls once satisfied", async () => {
  const db = new FakeProductionD1();
  db.collectorRuns.push({ sourceId: "INCHEON_FLIGHT_DETAIL", status: "SUCCESS", detail: "recent 2026-08-27..2026-08-30; pages 3; population 205" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("must_not_call_provider"); };
  try {
    const [result] = await runSelectedProductionSources(
      { DB: db, DATA_GO_KR_SERVICE_KEY: "fixture-key" },
      ["airport_recent"],
      new Date("2026-08-30T03:00:00.000Z"),
    );
    assert.equal(result.status, SKIPPED_ALREADY_COMPLETE_TODAY);
    assert.equal(result.records, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("selectable runner isolates a throwing source and reports unknown sources without blocking others", async () => {
  const calls = [];
  const results = await runSelectedProductionSources(
    { DB: undefined },
    ["airport_congestion", "not_a_real_source", "seoul_realtime"],
    new Date("2026-08-30T03:00:00.000Z"),
    {
      airport_congestion: async () => { calls.push("airport_congestion"); throw new Error("boom"); },
      seoul_realtime: async () => { calls.push("seoul_realtime"); return { status: "SUCCESS", records: 3 }; },
    },
  );
  assert.deepEqual(calls, ["airport_congestion", "seoul_realtime"]);
  assert.deepEqual(results.map((result) => result.source), ["airport_congestion", "not_a_real_source", "seoul_realtime"]);
  assert.deepEqual(results.map((result) => result.status), ["ERROR", "ERROR", "SUCCESS"]);
  assert.equal(results[0].detail, "boom");
  assert.equal(results[1].detail, "unknown_source");
  assert.equal(results[2].records, 3);
});

test("all eleven production sources are named exactly as the runner selects them", () => {
  assert.deepEqual([...PRODUCTION_SOURCE_NAMES].sort(), [
    "airport_congestion",
    "airport_congestion_t2",
    "airport_enrichment",
    "airport_passenger_forecast",
    "airport_recent",
    "airport_scheduled",
    "events",
    "seoul_foreign",
    "seoul_realtime",
    "seoul_sales",
    "weather",
  ]);
});

test("runner keeps sources sequential, never concurrent, so provider calls stay staggered", async () => {
  const order = [];
  await runSelectedProductionSources(
    { DB: undefined },
    ["weather", "events"],
    new Date("2026-08-30T03:00:00.000Z"),
    {
      weather: async () => {
        order.push("weather:start");
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push("weather:end");
        return { status: "SUCCESS", records: 1 };
      },
      events: async () => {
        order.push("events:start");
        order.push("events:end");
        return { status: "SUCCESS", records: 1 };
      },
    },
  );
  assert.deepEqual(order, ["weather:start", "weather:end", "events:start", "events:end"]);
});

/**
 * The diagnostic source table must stay a mirror of the ids the collectors
 * actually write, never a hand-guessed list. Asserting each id is a literal
 * in collector code makes a silent drift fail here instead of quietly
 * returning "no rows" for a live source.
 */
test("diagnostic source ids are the literal ids collector code writes", () => {
  const collectorSource = [
    "lib/collector.ts",
    "lib/airport-today.ts",
    "lib/seoul-foreign.ts",
  ].map((file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8")).join("\n");

  const names = Object.keys(DIAGNOSTIC_SOURCE_IDS);
  assert.equal(names.length, 11, "every KORETAIL source needs a diagnostic id");
  for (const name of names) {
    assert.ok(
      collectorSource.includes(`"${DIAGNOSTIC_SOURCE_IDS[name]}"`),
      `${name} -> ${DIAGNOSTIC_SOURCE_IDS[name]} is not a literal source id in collector code`,
    );
  }
  assert.equal(new Set(Object.values(DIAGNOSTIC_SOURCE_IDS)).size, names.length);
});

test("realtime and forecast sources are selectable for diagnostics", () => {
  assert.deepEqual(
    resolveDiagnosticSourceIds("airport_congestion,airport_congestion_t2,airport_passenger_forecast,seoul_realtime"),
    [
      "INCHEON_DEPARTURE_CONGESTION",
      "INCHEON_DEPARTURE_CONGESTION_T2",
      "INCHEON_PASSENGER_FORECAST",
      "SEOUL_CITYDATA_PPLTN",
    ],
  );
  // A4-T1 and A4-T2 must never collapse into one id.
  assert.notEqual(DIAGNOSTIC_SOURCE_IDS.airport_congestion, DIAGNOSTIC_SOURCE_IDS.airport_congestion_t2);
});

test("previously supported A2/A3/T1 selection still resolves", () => {
  assert.deepEqual(
    resolveDiagnosticSourceIds("airport_enrichment,airport_scheduled,events"),
    ["INCHEON_DUTY_FREE_ACTUAL", "INCHEON_SCHEDULED_DUTY_FREE", "KTO_TOURAPI_EVENT"],
  );
  // Raw canonical ids stay accepted so an operator can paste an id verbatim.
  assert.deepEqual(
    resolveDiagnosticSourceIds("INCHEON_DUTY_FREE_ACTUAL, INCHEON_SCHEDULED_DUTY_FREE , KTO_TOURAPI_EVENT"),
    ["INCHEON_DUTY_FREE_ACTUAL", "INCHEON_SCHEDULED_DUTY_FREE", "KTO_TOURAPI_EVENT"],
  );
});

test("diagnostic selection defaults to every source and rejects typos", () => {
  assert.equal(resolveDiagnosticSourceIds(undefined).length, 11);
  assert.equal(resolveDiagnosticSourceIds("   ").length, 11);
  // Deduplicates rather than binding the same id twice.
  assert.deepEqual(resolveDiagnosticSourceIds("seoul_realtime,SEOUL_CITYDATA_PPLTN"), ["SEOUL_CITYDATA_PPLTN"]);
  // A typo must fail loudly, never look like "this source has no rows".
  assert.throws(() => resolveDiagnosticSourceIds("airport_congestion_T2"), /unknown_diagnostic_sources_airport_congestion_T2/);
});

test("production operations diagnostic stays read-only and calls no provider", () => {
  const script = readFileSync(new URL("../scripts/inspect-production-operations.ts", import.meta.url), "utf8");
  const sql = script.match(/`SELECT[\s\S]*?`/g) ?? [];
  assert.equal(sql.length, 2, "diagnostic should issue exactly the collector_runs and source_health SELECTs");

  for (const verb of ["INSERT", "UPDATE", "DELETE", "UPSERT", "REPLACE", "DROP", "CREATE", "ALTER"]) {
    assert.equal(new RegExp(`\\b${verb}\\b`).test(script), false, `diagnostic must not contain a ${verb} statement`);
  }
  // No provider adapter or collector is imported, and the script never fetches.
  assert.equal(/from "\.\.\/lib\/collector"/.test(script), false);
  assert.equal(/\bcollect[A-Z]\w*\(/.test(script), false);
  assert.equal(/\bfetch\s*\(/.test(script), false);
  // Source ids are bound as parameters, never interpolated into SQL text.
  assert.match(script, /sourceIds\.map\(\(\) => "\?"\)/);
  assert.equal(/\$\{sourceIds\}/.test(script), false);
});
