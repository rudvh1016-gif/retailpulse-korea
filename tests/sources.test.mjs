import assert from "node:assert/strict";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  normalizeAirportCongestion,
  normalizeEstimatedSales,
  normalizeSeoulRealtime,
  normalizeTourismEvent,
  normalizeWeatherForecast,
} from "../lib/source-adapters.ts";
import {
  collectEstimatedSales,
  collectSeoulRealtime,
  collectTourismEvents,
  collectWeatherForecasts,
  latestKmaIssuance,
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

const migrations = [
  "drizzle/0000_daffy_tempest.sql",
  "drizzle/0001_crazy_nekra.sql",
  "drizzle/0002_reflective_martin_li.sql",
  "drizzle/0003_minor_network.sql",
];

function openDatabase(name) {
  const databasePath = join(tmpdir(), `rpk-${name}-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);
  for (const file of migrations) {
    database.exec(readFileSync(file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  return { database, databasePath };
}

// Sanitized fixture using the exact field names returned by the authenticated
// 2026-08-27 smoke run against citydata_ppltn (INFO-000, POI003).
const seoulRealtimeFixture = (overrides = {}) => ({
  "SeoulRtd.citydata_ppltn": [{
    AREA_NM: "명동 관광특구",
    AREA_CD: "POI003",
    AREA_CONGEST_LVL: "약간 붐빔",
    AREA_CONGEST_MSG: "사람이 몰려있을 가능성이 크고 위치에 따라 붐빔이 느껴질 수 있어요.",
    AREA_PPLTN_MIN: "34000",
    AREA_PPLTN_MAX: "36000",
    MALE_PPLTN_RATE: "45.1",
    FEMALE_PPLTN_RATE: "54.9",
    RESNT_PPLTN_RATE: "20.5",
    NON_RESNT_PPLTN_RATE: "79.5",
    REPLACE_YN: "N",
    PPLTN_TIME: "2026-08-27 23:55",
    FCST_YN: "Y",
    FCST_PPLTN: [
      { FCST_TIME: "2026-08-28 00:00", FCST_CONGEST_LVL: "보통", FCST_PPLTN_MIN: "30000", FCST_PPLTN_MAX: "32000" },
      { FCST_TIME: "2026-08-28 01:00", FCST_CONGEST_LVL: "여유", FCST_PPLTN_MIN: "26000", FCST_PPLTN_MAX: "28000" },
    ],
    ...overrides,
  }],
  RESULT: { "RESULT.CODE": "INFO-000", "RESULT.MESSAGE": "정상 처리되었습니다." },
});

// Sanitized fixture using the exact field names returned by the authenticated
// 2026-08-27 smoke run against VwsmTrdarSelngQq (INFO-000).
const estimatedSalesRow = (overrides = {}) => ({
  STDR_YYQU_CD: "20261",
  TRDAR_CD: "3001492",
  TRDAR_CD_NM: "명동 남대문 북창동 다동 무교동 관광특구",
  SVC_INDUTY_CD: "CS100001",
  SVC_INDUTY_CD_NM: "한식음식점",
  THSMON_SELNG_AMT: "51234567890",
  THSMON_SELNG_CO: "1234567",
  MDWK_SELNG_AMT: "31234567890",
  WKEND_SELNG_AMT: "20000000000",
  ...overrides,
});

test("seoul realtime adapter separates observation from published forecast", async () => {
  const record = seoulRealtimeFixture()["SeoulRtd.citydata_ppltn"][0];
  const first = await normalizeSeoulRealtime(record, "myeongdong", "2026-08-27T15:00:00Z");
  const second = await normalizeSeoulRealtime(record, "myeongdong", "2026-08-27T15:30:00Z");

  assert.equal(first.observed.sourceId, "SEOUL_CITYDATA_PPLTN");
  assert.equal(first.observed.congestionLevel, 3);
  assert.equal(first.observed.populationMax, 36000);
  assert.equal(first.observed.observedAt, "2026-08-27T23:55:00+09:00");
  // Retrieval time alone must not change the semantic hash.
  assert.equal(first.observed.sourceHash, second.observed.sourceHash);

  assert.equal(first.forecasts.length, 2);
  assert.equal(first.forecasts[0].issuedAt, first.observed.observedAt);
  assert.equal(first.forecasts[0].targetAt, "2026-08-28T00:00:00+09:00");
  assert.equal(first.forecasts[1].congestionLevel, 1);

  const changed = await normalizeSeoulRealtime({ ...record, AREA_PPLTN_MAX: "40000" }, "myeongdong", "2026-08-27T15:00:00Z");
  assert.notEqual(changed.observed.sourceHash, first.observed.sourceHash);
});

test("seoul realtime collector is idempotent and isolates a failing area", async (context) => {
  const { database, databasePath } = openDatabase("seoul-realtime");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("POI007")) return new Response("gateway error", { status: 500 });
    const poi = url.includes("POI003") ? "POI003" : "POI068";
    return Response.json(seoulRealtimeFixture({ AREA_CD: poi, AREA_NM: poi === "POI003" ? "명동 관광특구" : "성수카페거리" }));
  };

  const env = { DB: new LocalD1Database(database), SEOUL_OPEN_DATA_KEY: "fixture" };
  const first = await collectSeoulRealtime(env);
  assert.equal(first.status, "PARTIAL");
  assert.ok(first.records > 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_realtime_area").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_realtime_forecast").get().count, 4);

  const second = await collectSeoulRealtime(env);
  assert.equal(second.records, 0);

  const health = database.prepare("SELECT status, detail FROM source_health WHERE source_id = ?").get("SEOUL_CITYDATA_PPLTN");
  assert.equal(health.status, "LIVE");
  assert.match(health.detail, /hongdae/);
  assert.doesNotMatch(health.detail, /fixture/);
});

test("estimated sales collector falls back across quarters and verifies the positional filter", async (context) => {
  const { database, databasePath } = openDatabase("sales");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  const requestedQuarters = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    const match = url.match(/VwsmTrdarSelngQq\/1\/200\/(\d{5})\/(\w+)/);
    requestedQuarters.push(match[1]);
    if (match[1] !== "20261") {
      return Response.json({ RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." } });
    }
    // Simulate the observed behavior where the trade-area positional filter is
    // not applied: rows for other areas come back too and must be dropped.
    return Response.json({
      VwsmTrdarSelngQq: {
        list_total_count: 3,
        RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다" },
        row: [
          estimatedSalesRow({ TRDAR_CD: match[2] }),
          estimatedSalesRow({ TRDAR_CD: match[2], SVC_INDUTY_CD: "CS100002", SVC_INDUTY_CD_NM: "중식음식점", THSMON_SELNG_AMT: "1000000" }),
          estimatedSalesRow({ TRDAR_CD: "9999999", SVC_INDUTY_CD: "CS100009" }),
        ],
      },
    });
  };

  const env = { DB: new LocalD1Database(database), SEOUL_OPEN_DATA_KEY: "fixture" };
  const now = new Date("2026-08-27T15:00:00Z");
  const first = await collectEstimatedSales(env, now);
  assert.equal(first.status, "SUCCESS");
  assert.ok(requestedQuarters.includes("20263"));
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_estimated_sales").get().count, 6);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_estimated_sales WHERE trade_area_code = '9999999'").get().count, 0);

  const second = await collectEstimatedSales(env, now);
  assert.equal(second.records, 0);
  assert.equal(database.prepare("SELECT record_origin FROM seoul_estimated_sales LIMIT 1").get().record_origin, "OFFICIAL_HISTORICAL");
});

test("weather adapter groups categories per target hour and keeps issue time", async () => {
  const items = [
    { category: "TMP", fcstDate: "20260828", fcstTime: "0900", fcstValue: "27.5", baseDate: "20260827", baseTime: "2300" },
    { category: "POP", fcstDate: "20260828", fcstTime: "0900", fcstValue: "60", baseDate: "20260827", baseTime: "2300" },
    { category: "SKY", fcstDate: "20260828", fcstTime: "0900", fcstValue: "4", baseDate: "20260827", baseTime: "2300" },
    { category: "PTY", fcstDate: "20260828", fcstTime: "0900", fcstValue: "1", baseDate: "20260827", baseTime: "2300" },
    { category: "PCP", fcstDate: "20260828", fcstTime: "0900", fcstValue: "1.0mm 미만", baseDate: "20260827", baseTime: "2300" },
    { category: "TMP", fcstDate: "20260828", fcstTime: "1000", fcstValue: "28", baseDate: "20260827", baseTime: "2300" },
    { category: "SKY", fcstDate: "20260828", fcstTime: "1000", fcstValue: "1", baseDate: "20260827", baseTime: "2300" },
  ];
  const rows = await normalizeWeatherForecast(items, "myeongdong", "2026-08-27T15:00:00Z");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].issuedAt, "2026-08-27T23:00:00+09:00");
  assert.equal(rows[0].targetAt, "2026-08-28T09:00:00+09:00");
  assert.equal(rows[0].precipitationProbability, 60);
  assert.equal(rows[0].temperatureTenthC, 275);
  assert.equal(rows[0].conditionCode, "rain");
  assert.equal(rows[1].conditionCode, "clear");
  assert.equal(rows[1].precipitationProbability, null);
});

test("weather collector writes forecast rows for every area sharing a grid", async (context) => {
  const { database, databasePath } = openDatabase("weather");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  const requestedGrids = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedGrids.push(`${url.searchParams.get("nx")},${url.searchParams.get("ny")}`);
    return Response.json({ response: { header: { resultCode: "00" }, body: { items: { item: [
      { category: "TMP", fcstDate: "20260828", fcstTime: "0900", fcstValue: "27", baseDate: "20260827", baseTime: "2300" },
      { category: "POP", fcstDate: "20260828", fcstTime: "0900", fcstValue: "30", baseDate: "20260827", baseTime: "2300" },
    ] } } } });
  };

  const env = { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" };
  const result = await collectWeatherForecasts(env, new Date("2026-08-27T15:00:00Z"));
  assert.equal(result.status, "SUCCESS");
  // 명동(60,127), 홍대(59,126), 성수(61,126) — three distinct grid cells.
  assert.equal(new Set(requestedGrids).size, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM weather_forecast").get().count, 3);

  const second = await collectWeatherForecasts(env, new Date("2026-08-27T15:00:00Z"));
  assert.equal(second.records, 0);
});

test("latest KMA issuance respects slots, buffer and midnight fallback", () => {
  assert.deepEqual(latestKmaIssuance(new Date("2026-08-27T15:00:00Z")), { baseDate: "20260827", baseTime: "2300" });
  assert.deepEqual(latestKmaIssuance(new Date("2026-08-27T14:10:00Z")), { baseDate: "20260827", baseTime: "2000" });
  assert.deepEqual(latestKmaIssuance(new Date("2026-08-26T16:20:00Z")), { baseDate: "20260826", baseTime: "2300" });
});

test("tourism events map to areas only within the verified radius", async (context) => {
  const { database, databasePath } = openDatabase("events");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  globalThis.fetch = async () => Response.json({ response: { header: { resultCode: "0000" }, body: { totalCount: 3, items: { item: [
    { contentid: "100", title: "명동 페스티벌", addr1: "서울특별시 중구", mapx: "126.9840", mapy: "37.5640", eventstartdate: "20260820", eventenddate: "20260910", modifiedtime: "20260825120000" },
    { contentid: "200", title: "성수 마켓", addr1: "서울특별시 성동구", mapx: "127.0550", mapy: "37.5450", eventstartdate: "20260901", eventenddate: "20260905", modifiedtime: "20260825120000" },
    { contentid: "300", title: "잠실 행사", addr1: "서울특별시 송파구", mapx: "127.1000", mapy: "37.5133", eventstartdate: "20260820", eventenddate: "20260910", modifiedtime: "20260825120000" },
  ] } } } });

  const env = { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" };
  const result = await collectTourismEvents(env, new Date("2026-08-27T15:00:00Z"));
  assert.equal(result.status, "SUCCESS");
  const rows = database.prepare("SELECT area, content_id FROM tourism_events ORDER BY content_id").all()
    .map((row) => ({ area: row.area, content_id: row.content_id }));
  assert.deepEqual(rows, [
    { area: "myeongdong", content_id: "100" },
    { area: "seongsu", content_id: "200" },
  ]);

  const second = await collectTourismEvents(env, new Date("2026-08-27T15:00:00Z"));
  assert.equal(second.records, 0);
});

test("tourism event outside the date window is excluded", async (context) => {
  const { database, databasePath } = openDatabase("events-window");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  globalThis.fetch = async () => Response.json({ response: { header: { resultCode: "0000" }, body: { items: { item: [
    { contentid: "101", title: "지난 행사", mapx: "126.9840", mapy: "37.5640", eventstartdate: "20260701", eventenddate: "20260710", modifiedtime: "20260701120000" },
  ] } } } });

  const env = { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" };
  await collectTourismEvents(env, new Date("2026-08-27T15:00:00Z"));
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM tourism_events").get().count, 0);
});

test("airport congestion adapter normalizes terminal, zone and time", async () => {
  const record = { terminalId: "P01", gateId: "DG3_E", waitTime: "12", waitLength: "245", occurtime: "202608272355", operatingTime: "05:00~22:00" };
  const first = await normalizeAirportCongestion(record, "2026-08-27T15:00:00Z");
  const second = await normalizeAirportCongestion(record, "2026-08-27T15:05:00Z");
  assert.equal(first.terminal, "T1");
  assert.equal(first.zone, "DG3_E");
  assert.equal(first.waitingCount, 245);
  assert.equal(first.observedAt, "2026-08-27T23:55:00+09:00");
  assert.equal(first.sourceHash, second.sourceHash);
});

test("estimated sales adapter rejects a row without a sales amount", async () => {
  await assert.rejects(normalizeEstimatedSales(estimatedSalesRow({ THSMON_SELNG_AMT: "" }), "myeongdong", "2026-08-27T15:00:00Z"));
});

test("tourism adapter requires an event start date", async () => {
  await assert.rejects(normalizeTourismEvent({ contentid: "1", title: "행사" }, "myeongdong", "2026-08-27T15:00:00Z"));
});
