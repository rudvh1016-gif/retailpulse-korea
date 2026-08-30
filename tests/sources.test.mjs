import assert from "node:assert/strict";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { runSeoulS2Smoke } from "../scripts/smoke-public-apis-lib.mjs";
import {
  buildDataGoKrUrl,
  normalizeDataGoKrServiceKey,
  requestDataGoKrOnce,
  runDataGoKrSmoke,
  summarizeDataGoKrResponse,
} from "../lib/data-go-kr.mjs";
import { areaMappings } from "../lib/areas.ts";
import {
  aggregateSeoulForeignByArea,
  normalizeSeoulForeignRows,
} from "../lib/seoul-foreign.ts";
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
  "drizzle/0004_s2_foreign_presence.sql",
];

test("data.go.kr encoded and decoded service keys produce one identical transport encoding", () => {
  const decoded = "sample+/key==";
  const encoded = "sample%2B%2Fkey%3D%3D";
  const endpoint = "https://apis.data.go.kr/example";

  assert.equal(normalizeDataGoKrServiceKey(decoded), decoded);
  assert.equal(normalizeDataGoKrServiceKey(encoded), decoded);
  assert.equal(
    buildDataGoKrUrl(endpoint, decoded, { pageNo: "1" }).toString(),
    buildDataGoKrUrl(endpoint, encoded, { pageNo: "1" }).toString(),
  );
  assert.equal(
    buildDataGoKrUrl(endpoint, encoded, {}).searchParams.get("serviceKey"),
    decoded,
  );
});

test("data.go.kr service keys are decoded at most once", () => {
  assert.equal(normalizeDataGoKrServiceKey("value%252Bstill-encoded"), "value%2Bstill-encoded");
  assert.equal(normalizeDataGoKrServiceKey("value%2Gmalformed"), "value%2Gmalformed");
});

test("data.go.kr smoke classifies auth, request, schema, pass, and valid no-data separately", () => {
  const response = (resultCode, items = [], totalCount = items.length) => ({
    status: 200,
    payload: { response: { header: { resultCode, resultMsg: "NORMAL SERVICE" }, body: { items: { item: items }, totalCount } } },
    textSnippet: null,
  });

  assert.equal(summarizeDataGoKrResponse(response("00", [{ flightId: "KE1" }]), "00", "fixture").authStatus, "PASS");
  assert.equal(summarizeDataGoKrResponse(response("00", [], 0), "00", "fixture").authStatus, "VALID_NO_DATA");
  assert.equal(summarizeDataGoKrResponse(response("03", [], 0), "00", "fixture").authStatus, "VALID_NO_DATA");
  assert.equal(summarizeDataGoKrResponse({
    status: 200,
    payload: { OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: "30", returnAuthMsg: "SERVICE KEY ERROR" } } },
    textSnippet: null,
  }, "00", "fixture").authStatus, "AUTH_BLOCKED");
  assert.equal(summarizeDataGoKrResponse({ status: 503, payload: null, textSnippet: "unavailable" }, "00", "fixture").authStatus, "REQUEST_ERROR");
  assert.equal(summarizeDataGoKrResponse({ status: 200, payload: { response: {} }, textSnippet: null }, "00", "fixture").authStatus, "SCHEMA_ERROR");
});

test("data.go.kr 10s client timeout remains REQUEST_ERROR and never AUTH_BLOCKED", async () => {
  const result = await requestDataGoKrOnce({
    url: new URL("https://apis.data.go.kr/example?serviceKey=fixture"),
    expectedSuccessCode: "00",
    serviceKey: "fixture",
    timeoutMs: 10,
    fetcher: (_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }),
  });
  assert.equal(result.authStatus, "REQUEST_ERROR");
  assert.equal(result.reason, "client_timeout");
});

test("data.go.kr delayed response within the 30s policy becomes PASS", async () => {
  let calls = 0;
  const result = await requestDataGoKrOnce({
    url: new URL("https://apis.data.go.kr/example?serviceKey=fixture"),
    expectedSuccessCode: "00",
    serviceKey: "fixture",
    timeoutMs: 30_000,
    fetcher: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return Response.json({ response: { header: { resultCode: "00", resultMsg: "NORMAL SERVICE" }, body: { items: { item: [{ id: "1" }] }, totalCount: 1 } } });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.authStatus, "PASS");
});

test("data.go.kr network error is REQUEST_ERROR, secret-safe, and requested once", async () => {
  let calls = 0;
  const secret = "secret+/value==";
  const result = await requestDataGoKrOnce({
    url: buildDataGoKrUrl("https://apis.data.go.kr/example", secret, {}),
    expectedSuccessCode: "00",
    serviceKey: secret,
    fetcher: async () => {
      calls += 1;
      throw new TypeError(`fetch failed for https://apis.data.go.kr/example?serviceKey=${secret}`);
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.authStatus, "REQUEST_ERROR");
  assert.equal(result.reason, "network_connection_error");
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(result).includes("https://"), false);
});

test("data.go.kr request always clears its timeout", async () => {
  let cleared = false;
  const timer = { id: 1 };
  const result = await requestDataGoKrOnce({
    url: new URL("https://apis.data.go.kr/example?serviceKey=fixture"),
    expectedSuccessCode: "00",
    serviceKey: "fixture",
    setTimer: () => timer,
    clearTimer: (value) => { cleared = value === timer; },
    fetcher: async () => Response.json({ response: { header: { resultCode: "03", resultMsg: "NO DATA" }, body: { items: {}, totalCount: 0 } } }),
  });
  assert.equal(result.authStatus, "VALID_NO_DATA");
  assert.equal(cleared, true);
});

test("one data.go.kr source timeout does not fail the remaining sources", async () => {
  const results = await runDataGoKrSmoke([{ sourceId: "A1" }, { sourceId: "W1" }], async ({ sourceId }) => {
    if (sourceId === "A1") throw new Error("timeout");
    return { authStatus: "PASS", elapsedMs: 20 };
  });
  assert.deepEqual(results.map(({ sourceId, authStatus }) => ({ sourceId, authStatus })), [
    { sourceId: "A1", authStatus: "REQUEST_ERROR" },
    { sourceId: "W1", authStatus: "PASS" },
  ]);
});

function openDatabase(name) {
  const databasePath = join(tmpdir(), `rpk-${name}-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);
  for (const file of migrations) {
    database.exec(readFileSync(file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  return { database, databasePath };
}

test("S2 smoke reports the real response shape without exposing its key or request URL", async () => {
  const calls = [];
  const key = "fixture-key";
  const result = await runSeoulS2Smoke({
    key,
    fetcher: async (url) => {
      calls.push(String(url));
      return Response.json({
        Spop250mFornTempDong: {
          list_total_count: 1,
          RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다" },
          row: [{
            YMD: "20260828", TT: "14", H_DNG_CD: "11140550", SPOP: "15200",
            CAN: null, CHN: "6000", ETC: "3000", FRA: "0", IDN: "0", IND: "0",
            JPN: "2000", KAZ: "0", KHM: "0", LKA: "0", MNG: "0", NPL: "0",
            PAK: "0", PHL: "0", RUS: "0", THA: "0", USA: "1000", UZB: "0", VNM: "0",
          }],
        },
      });
    },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/json\/Spop250mFornTempDong\/1\/5\/$/);
  assert.deepEqual(result, {
    sourceId: "S2_SEOUL_FOREIGN_LIVING_POPULATION",
    authStatus: "PASS",
    format: "json",
    officialResultCode: "INFO-000",
    recordCount: 1,
    firstRecordFieldNames: [
      "CAN", "CHN", "ETC", "FRA", "H_DNG_CD", "IDN", "IND", "JPN", "KAZ", "KHM",
      "LKA", "MNG", "NPL", "PAK", "PHL", "RUS", "SPOP", "THA", "TT", "USA", "UZB", "VNM", "YMD",
    ],
  });
  assert.equal(JSON.stringify(result).includes(key), false);
  assert.equal(JSON.stringify(result).includes("openapi.seoul.go.kr"), false);
});

const seoulForeignRow = (overrides = {}) => ({
  YMD: "20260828",
  TT: "14",
  H_DNG_CD: "11140550",
  SPOP: "10000.5",
  CHN: "4000.2",
  JPN: "2000.1",
  USA: "500.0",
  ETC: "3500.2",
  CAN: null,
  FRA: "0",
  IDN: "0",
  IND: "0",
  KAZ: "0",
  KHM: "0",
  LKA: "0",
  MNG: "0",
  NPL: "0",
  PAK: "0",
  PHL: "0",
  RUS: "0",
  THA: "0",
  UZB: "0",
  VNM: "0",
  ...overrides,
});

test("S2 representative areas use the official administrative-dong codes", () => {
  assert.deepEqual(areaMappings.myeongdong.seoulAdministrativeDongCodes, ["11140550"]);
  assert.deepEqual(areaMappings.hongdae.seoulAdministrativeDongCodes, ["11440660"]);
  assert.deepEqual(areaMappings.seongsu.seoulAdministrativeDongCodes, ["11200670"]);
});

test("S2 normalizer uses SPOP as the total and preserves nationality dimensions without double counting", async () => {
  const maskedRow = seoulForeignRow({ KHM: "*" });
  const [first] = await normalizeSeoulForeignRows([maskedRow], "2026-08-29T07:00:00Z");
  const [retrievedLater] = await normalizeSeoulForeignRows([maskedRow], "2026-08-29T08:00:00Z");

  assert.equal(first.administrativeDongCode, "11140550");
  assert.equal(first.referenceAt, "2026-08-28T14:00:00+09:00");
  assert.equal(first.value, 10000.5);
  assert.equal(first.nationalityValues.CHN, 4000.2);
  assert.equal(first.nationalityValues.CAN, null);
  assert.equal(first.nationalityValues.KHM, null);
  assert.equal(first.sourceHash, retrievedLater.sourceHash);

  const aggregates = await aggregateSeoulForeignByArea([first], {
    myeongdong: ["11140550"],
    hongdae: [],
    seongsu: [],
  });
  assert.equal(aggregates[0].value, 10000.5);
});

test("S2 aggregation combines mapped dongs once and ignores an unmapped dong", async () => {
  const rows = await normalizeSeoulForeignRows([
    seoulForeignRow({ H_DNG_CD: "11140550", SPOP: "100" }),
    seoulForeignRow({ H_DNG_CD: "11140560", SPOP: "80" }),
    seoulForeignRow({ H_DNG_CD: "99999999", SPOP: "900" }),
  ], "2026-08-29T07:00:00Z");
  const aggregates = await aggregateSeoulForeignByArea(rows, {
    myeongdong: ["11140550", "11140560"],
    hongdae: [],
    seongsu: [],
  });

  assert.equal(aggregates.length, 1);
  assert.equal(aggregates[0].area, "myeongdong");
  assert.deepEqual(aggregates[0].administrativeDongCodes, ["11140550", "11140560"]);
  assert.equal(aggregates[0].value, 180);
});

test("S2 normalizer rejects a missing total instead of summing nationality columns", async () => {
  await assert.rejects(
    normalizeSeoulForeignRows([seoulForeignRow({ SPOP: null })], "2026-08-29T07:00:00Z"),
    /invalid_SPOP/,
  );
});

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

test("estimated sales collector probes quarters, sweeps pages and filters client-side", async (context) => {
  const { database, databasePath } = openDatabase("sales");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  const requests = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    const match = url.match(/VwsmTrdarSelngQq\/(\d+)\/(\d+)\/(\d{5})/);
    requests.push({ start: Number(match[1]), end: Number(match[2]), quarter: match[3] });
    if (match[3] !== "20261") {
      return Response.json({ RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." } });
    }
    // The live service applies only the quarter filter, so pages mix all
    // 1,650 trade areas; the collector must filter client-side.
    const rows = match[2] - match[1] === 0
      ? [estimatedSalesRow({ TRDAR_CD: "3110001" })]
      : [
        estimatedSalesRow({ TRDAR_CD: "3110001", SVC_INDUTY_CD: "CS100009" }),
        estimatedSalesRow({ TRDAR_CD: "3001492" }),
        estimatedSalesRow({ TRDAR_CD: "3001492", SVC_INDUTY_CD: "CS100002", SVC_INDUTY_CD_NM: "중식음식점", THSMON_SELNG_AMT: "1000000" }),
        estimatedSalesRow({ TRDAR_CD: "3120103", SVC_INDUTY_CD: "CS100003" }),
        estimatedSalesRow({ TRDAR_CD: "3110131", SVC_INDUTY_CD: "CS100004" }),
        estimatedSalesRow({ TRDAR_CD: "9999999", SVC_INDUTY_CD: "CS100005" }),
      ];
    return Response.json({
      VwsmTrdarSelngQq: {
        list_total_count: 21188,
        RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다" },
        row: rows,
      },
    });
  };

  const env = { DB: new LocalD1Database(database), SEOUL_OPEN_DATA_KEY: "fixture" };
  const now = new Date("2026-08-27T15:00:00Z");
  const first = await collectEstimatedSales(env, now);
  assert.equal(first.status, "SUCCESS");
  assert.ok(first.records > 0);
  // Probes 20263 → 20262 → 20261, then sweeps one short page and stops.
  assert.ok(requests.some((request) => request.quarter === "20263"));
  assert.equal(requests.filter((request) => request.quarter === "20261" && request.end - request.start > 0).length, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_estimated_sales").get().count, 4);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_estimated_sales WHERE trade_area_code IN ('9999999','3110001')").get().count, 0);
  assert.equal(database.prepare("SELECT area FROM seoul_estimated_sales WHERE trade_area_code = '3120103'").get().area, "hongdae");

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
