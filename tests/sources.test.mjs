import assert from "node:assert/strict";
import { readdirSync, readFileSync, unlinkSync } from "node:fs";
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
  normalizeSeoulRealtimeCommercial,
  normalizeTourismEvent,
  normalizeWeatherForecast,
} from "../lib/source-adapters.ts";
import {
  collectEstimatedSales,
  collectSeoulRealtime,
  collectStoreDynamics,
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
    // SQLite changes() is the logical row count, which is what D1 reports as
    // meta.changes. D1's meta.rows_written additionally counts index writes;
    // node:sqlite cannot report that, so the double mirrors changes here and
    // storageWrites assertions are left to Production evidence.
    return { success: true, meta: { changes: Number(result.changes), rows_written: Number(result.changes) } };
  }
  async all() {
    return { success: true, results: this.statement.all(...this.values), meta: {} };
  }
}

class LocalD1Database {
  constructor(database) { this.database = database; }
  prepare(query) { return new LocalD1Statement(this.database.prepare(query)); }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}

// Read the directory rather than a hardcoded list: a list drifts silently
// the moment a migration is added, and the tables under test then lack the
// newest columns while the collector inserts them.
const migrations = readdirSync("drizzle")
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => `drizzle/${file}`);

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

// Sanitized integrated OA-21285 CITYDATA structure verified by the bounded
// 2026-09-02 Production-secret contract probe (INFO-000 for all three POIs).
const seoulIntegratedFixture = (commercialOverrides = {}) => ({
  RESULT: { "RESULT.CODE": "INFO-000", "RESULT.MESSAGE": "정상 처리되었습니다." },
  CITYDATA: {
    AREA_NM: "명동 관광특구",
    AREA_CD: "POI003",
    LIVE_PPLTN_STTS: [seoulRealtimeFixture()["SeoulRtd.citydata_ppltn"][0]],
    LIVE_CMRCL_STTS: {
      AREA_CMRCL_LVL: "활발",
      AREA_SH_PAYMENT_CNT: "12,345",
      AREA_SH_PAYMENT_AMT_MIN: 123456,
      AREA_SH_PAYMENT_AMT_MAX: 234567,
      CMRCL_RSB: [{ CMRCL_NM: "패션", CMRCL_SH_PAYMENT_CNT: "123" }],
      CMRCL_MALE_RATE: 43.2,
      CMRCL_FEMALE_RATE: 56.8,
      CMRCL_10_RATE: 5.1,
      CMRCL_PERSONAL_RATE: 96.4,
      CMRCL_CORPORATION_RATE: 3.6,
      CMRCL_TIME: "2026-09-02 12:05",
      ...commercialOverrides,
    },
  },
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

const storeDynamicsAreas = {
  "3001492": { name: "명동 남대문 북창동 다동 무교동 관광특구", type: "U", typeName: "관광특구" },
  "3120103": { name: "홍대입구역(홍대)", type: "D", typeName: "발달상권" },
  "3110131": { name: "성수동카페거리", type: "A", typeName: "골목상권" },
};

const storeDynamicsRow = (tradeAreaCode, overrides = {}) => {
  const area = storeDynamicsAreas[tradeAreaCode];
  if (!area) throw new Error("unknown_store_dynamics_fixture_area");
  return {
    STDR_YYQU_CD: "20262",
    TRDAR_SE_CD: area.type,
    TRDAR_SE_CD_NM: area.typeName,
    TRDAR_CD: tradeAreaCode,
    TRDAR_CD_NM: area.name,
    SVC_INDUTY_CD: "CS100001",
    SVC_INDUTY_CD_NM: "한식음식점",
    SIMILR_INDUTY_STOR_CO: 10,
    STOR_CO: 8,
    FRC_STOR_CO: 2,
    // Both rates divide by the store base before the event they measure:
    // opening by 10 - 1 = 9 (1/9 = 11.1% -> 11%), closure by 10 + 1 = 11
    // (1/11 = 9.09% -> 9%) — never by this quarter's ending total of 10.
    OPBIZ_RT: 11,
    OPBIZ_STOR_CO: 1,
    CLSBIZ_RT: 9,
    CLSBIZ_STOR_CO: 1,
    ...overrides,
  };
};

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

test("Seoul realtime commercial adapter preserves official values and semantic time", async () => {
  const citydata = seoulIntegratedFixture().CITYDATA;
  const first = await normalizeSeoulRealtimeCommercial(citydata, "myeongdong", "2026-09-02T03:06:00Z");
  const second = await normalizeSeoulRealtimeCommercial(citydata, "myeongdong", "2026-09-02T03:36:00Z");

  assert.equal(first.sourceId, "SEOUL_CITYDATA_CMRCL");
  assert.equal(first.recordOrigin, "LIVE");
  assert.equal(first.areaCode, "POI003");
  assert.equal(first.areaName, "명동 관광특구");
  assert.equal(first.commercialLevel, "활발");
  assert.equal(first.paymentCount, 12345);
  assert.equal(first.paymentAmountMin, 123456);
  assert.equal(first.paymentAmountMax, 234567);
  assert.equal(first.observedAt, "2026-09-02T12:05:00+09:00");
  assert.equal(first.qualityStatus, "VALID");
  assert.equal(first.sourceHash, second.sourceHash, "retrieval time must not create a semantic change");

  const changed = await normalizeSeoulRealtimeCommercial(
    seoulIntegratedFixture({ AREA_CMRCL_LVL: "한산" }).CITYDATA,
    "myeongdong",
    "2026-09-02T03:06:00Z",
  );
  assert.notEqual(changed.sourceHash, first.sourceHash);
});

test("Seoul realtime commercial adapter parses the authenticated YYYYMMDD HHmm KST timestamp", async () => {
  const record = await normalizeSeoulRealtimeCommercial(
    seoulIntegratedFixture({ CMRCL_TIME: "20260902 1205" }).CITYDATA,
    "myeongdong",
    "2026-09-02T03:06:00Z",
  );

  assert.equal(record.observedAt, "2026-09-02T12:05:00+09:00");
});

test("Seoul realtime commercial adapter preserves suppressed optional payments as null", async () => {
  const record = await normalizeSeoulRealtimeCommercial(
    seoulIntegratedFixture({
      AREA_SH_PAYMENT_CNT: "*",
      AREA_SH_PAYMENT_AMT_MIN: null,
      AREA_SH_PAYMENT_AMT_MAX: "",
    }).CITYDATA,
    "myeongdong",
    "2026-09-02T03:06:00Z",
  );

  assert.equal(record.paymentCount, null);
  assert.equal(record.paymentAmountMin, null);
  assert.equal(record.paymentAmountMax, null);
  assert.equal(record.qualityStatus, "PARTIAL");
});

test("Seoul realtime commercial adapter rejects missing required level or time", async () => {
  await assert.rejects(
    normalizeSeoulRealtimeCommercial(
      seoulIntegratedFixture({ AREA_CMRCL_LVL: "" }).CITYDATA,
      "myeongdong",
      "2026-09-02T03:06:00Z",
    ),
    /SCHEMA/,
  );
  await assert.rejects(
    normalizeSeoulRealtimeCommercial(
      seoulIntegratedFixture({ CMRCL_TIME: null }).CITYDATA,
      "myeongdong",
      "2026-09-02T03:06:00Z",
    ),
    /SCHEMA/,
  );
});

test("Seoul realtime collector uses one integrated request per area and isolates commercial failure", async (context) => {
  const { database, databasePath } = openDatabase("seoul-realtime");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  const requests = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    const poi = url.includes("POI003") ? "POI003" : url.includes("POI007") ? "POI007" : "POI068";
    const fixture = seoulIntegratedFixture();
    fixture.CITYDATA.AREA_CD = poi;
    fixture.CITYDATA.AREA_NM = poi === "POI003" ? "명동 관광특구" : poi === "POI007" ? "홍대 관광특구" : "성수카페거리";
    fixture.CITYDATA.LIVE_PPLTN_STTS[0] = {
      ...fixture.CITYDATA.LIVE_PPLTN_STTS[0],
      AREA_CD: poi,
      AREA_NM: fixture.CITYDATA.AREA_NM,
    };
    if (poi === "POI007") fixture.CITYDATA.LIVE_CMRCL_STTS = null;
    return Response.json(fixture);
  };

  const env = { DB: new LocalD1Database(database), SEOUL_OPEN_DATA_KEY: "fixture" };
  const first = await collectSeoulRealtime(env);
  assert.equal(first.status, "PARTIAL");
  assert.ok(first.records > 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_realtime_area").get().count, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_realtime_forecast").get().count, 6);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_realtime_commercial").get().count, 2);
  assert.equal(requests.length, 3);
  assert.equal(requests.every((url) => url.includes("/json/citydata/1/5/") && !url.includes("citydata_ppltn")), true);

  const second = await collectSeoulRealtime(env);
  assert.equal(second.records, 0);
  assert.equal(requests.length, 6, "each run remains one integrated request per area");

  const populationHealth = database.prepare("SELECT status, detail FROM source_health WHERE source_id = ?").get("SEOUL_CITYDATA_PPLTN");
  assert.equal(populationHealth.status, "LIVE");
  assert.match(populationHealth.detail, /areas ok 3\/3/);

  const commercialHealth = database.prepare("SELECT status, detail FROM source_health WHERE source_id = ?").get("SEOUL_CITYDATA_CMRCL");
  assert.equal(commercialHealth.status, "STALE");
  assert.match(commercialHealth.detail, /hongdae/);
  assert.doesNotMatch(commercialHealth.detail, /fixture/);
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

test("store dynamics collector finds the newest quarter, writes all exact areas once, and preserves Last-good", async (context) => {
  const { database, databasePath } = openDatabase("store-dynamics");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  const requests = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    const match = url.match(/VwsmTrdarStorQq\/(\d+)\/(\d+)\/(\d{5})\/(\d+)/);
    assert.ok(match, "collector uses the exact OA-15577 path");
    requests.push({ start: Number(match[1]), end: Number(match[2]), quarter: match[3], area: match[4] });
    if (match[3] !== "20262") {
      return Response.json({ RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." } });
    }
    const row = storeDynamicsRow(match[4]);
    return Response.json({
      VwsmTrdarStorQq: {
        list_total_count: 1,
        RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다" },
        row: [row],
      },
    });
  };

  const env = { DB: new LocalD1Database(database), SEOUL_OPEN_DATA_KEY: "fixture-secret" };
  const first = await collectStoreDynamics(env, new Date("2026-09-03T01:00:00.000Z"));
  assert.deepEqual(
    { status: first.status, records: first.records, providerRequests: first.providerRequests, sourceHealth: first.sourceHealth, lastGoodPreserved: first.lastGoodPreserved },
    { status: "SUCCESS", records: 3, providerRequests: 5, sourceHealth: "OFFICIAL_HISTORICAL", lastGoodPreserved: true },
  );
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_store_dynamics").get().count, 3);
  assert.equal(database.prepare("SELECT COUNT(DISTINCT area) AS count FROM seoul_store_dynamics WHERE quarter_code = '20262'").get().count, 3);
  assert.equal(requests.filter((request) => request.quarter === "20263").length, 1);
  assert.equal(requests.filter((request) => request.quarter === "20262").length, 4);
  assert.equal(requests.filter((request) => request.quarter === "20262" && request.start === 1 && request.end === 1).length, 1);
  const firstRetrievedAt = database.prepare("SELECT retrieved_at AS retrievedAt FROM seoul_store_dynamics WHERE area = 'myeongdong'").get().retrievedAt;

  const second = await collectStoreDynamics(env, new Date("2026-09-03T02:00:00.000Z"));
  assert.equal(second.status, "SUCCESS");
  assert.equal(second.records, 0, "same semantic provider data changes no rows");
  assert.equal(database.prepare("SELECT retrieved_at AS retrievedAt FROM seoul_store_dynamics WHERE area = 'myeongdong'").get().retrievedAt, firstRetrievedAt);

  const missingKey = await collectStoreDynamics({ DB: env.DB }, new Date("2026-09-03T02:30:00.000Z"));
  assert.deepEqual(
    { status: missingKey.status, sourceHealth: missingKey.sourceHealth, lastGoodPreserved: missingKey.lastGoodPreserved, providerRequests: missingKey.providerRequests },
    { status: "NEEDS_KEY", sourceHealth: "STALE", lastGoodPreserved: true, providerRequests: 0 },
    "a missing key stays visible while accurately reporting complete stored Last-good",
  );

  globalThis.fetch = async () => { throw new TypeError("network failed at provider URL with fixture-secret"); };
  const failed = await collectStoreDynamics(env, new Date("2026-09-03T03:00:00.000Z"));
  assert.equal(failed.status, "ERROR");
  assert.equal(failed.records, 0);
  assert.equal(failed.sourceHealth, "STALE");
  assert.equal(failed.lastGoodPreserved, true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_store_dynamics").get().count, 3);
  const health = database.prepare("SELECT status, detail, schema_version AS schemaVersion FROM source_health WHERE source_id = 'SEOUL_STORE_DYNAMICS'").get();
  assert.equal(health.status, "STALE");
  assert.equal(health.detail.includes("fixture-secret"), false);
  assert.equal(health.schemaVersion, "store-dynamics-v1", "a failure preserves Last-good schema provenance");

  database.exec("UPDATE seoul_store_dynamics SET ordinary_store_count = ordinary_store_count + 1 WHERE area = 'hongdae'");
  const corruptLastGood = await collectStoreDynamics({ DB: env.DB }, new Date("2026-09-03T03:30:00.000Z"));
  assert.equal(corruptLastGood.sourceHealth, "ERROR");
  assert.equal(corruptLastGood.lastGoodPreserved, false,
    "three labelled rows are not Last-good unless every stored identity and arithmetic field is valid");
  database.exec("UPDATE seoul_store_dynamics SET ordinary_store_count = ordinary_store_count - 1 WHERE area = 'hongdae'");

  database.exec("DELETE FROM seoul_store_dynamics WHERE area <> 'myeongdong'");
  const incompleteLastGood = await collectStoreDynamics({ DB: env.DB }, new Date("2026-09-03T04:00:00.000Z"));
  assert.equal(incompleteLastGood.status, "NEEDS_KEY");
  assert.equal(incompleteLastGood.sourceHealth, "ERROR");
  assert.equal(incompleteLastGood.lastGoodPreserved, false, "one orphan row is not complete three-area Last-good");
});

test("store dynamics collector rejects identity drift or a missing area before any fact write", async (context) => {
  const { database, databasePath } = openDatabase("store-dynamics-atomic-validation");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  let mode = "wrong-type";
  globalThis.fetch = async (input) => {
    const match = String(input).match(/VwsmTrdarStorQq\/(\d+)\/(\d+)\/(\d{5})\/(\d+)/);
    if (match[3] !== "20262") return Response.json({ RESULT: { CODE: "INFO-200" } });
    if (mode === "missing-area" && match[4] === "3120103" && match[2] !== "1") {
      return Response.json({ RESULT: { CODE: "INFO-200" } });
    }
    const overrides = mode === "wrong-type" && match[2] === "1" ? { TRDAR_SE_CD: "D" } : {};
    return Response.json({
      VwsmTrdarStorQq: {
        list_total_count: 1,
        RESULT: { CODE: "INFO-000" },
        row: [storeDynamicsRow(match[4], overrides)],
      },
    });
  };

  const env = { DB: new LocalD1Database(database), SEOUL_OPEN_DATA_KEY: "fixture" };
  const wrongType = await collectStoreDynamics(env, new Date("2026-09-03T01:00:00.000Z"));
  assert.equal(wrongType.status, "ERROR");
  assert.match(wrongType.detail, /STORE_DYNAMICS_IDENTITY/);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_store_dynamics").get().count, 0);

  mode = "missing-area";
  const missingArea = await collectStoreDynamics(env, new Date("2026-09-03T01:00:00.000Z"));
  assert.equal(missingArea.status, "ERROR");
  assert.equal(missingArea.lastGoodPreserved, false);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_store_dynamics").get().count, 0,
    "all three areas validate before any fact row is written");
});

test("store dynamics collector completes bounded multi-page areas without duplicate industries", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = async (input) => {
    const match = String(input).match(/VwsmTrdarStorQq\/(\d+)\/(\d+)\/(\d{5})\/(\d+)/);
    const start = Number(match[1]);
    const end = Number(match[2]);
    const quarter = match[3];
    const area = match[4];
    requests.push({ start, end, quarter, area });
    if (quarter !== "20262") return Response.json({ RESULT: { CODE: "INFO-200" } });
    if (end === 1) {
      return Response.json({
        VwsmTrdarStorQq: { list_total_count: 1, RESULT: { CODE: "INFO-000" }, row: [storeDynamicsRow(area)] },
      });
    }
    const total = area === "3001492" ? 1001 : 1;
    const pageLength = area === "3001492" ? Math.min(1000, total - start + 1) : 1;
    const rows = Array.from({ length: pageLength }, (_, index) => storeDynamicsRow(area, {
      SVC_INDUTY_CD: `CS${String(start + index).padStart(6, "0")}`,
      SVC_INDUTY_CD_NM: `업종 ${start + index}`,
    }));
    return Response.json({
      VwsmTrdarStorQq: { list_total_count: total, RESULT: { CODE: "INFO-000" }, row: rows },
    });
  };

  const result = await collectStoreDynamics({ SEOUL_OPEN_DATA_KEY: "fixture" }, new Date("2026-09-03T01:00:00.000Z"));
  assert.equal(result.status, "SUCCESS");
  assert.equal(result.providerRequests, 6);
  assert.equal(requests.filter((request) => request.area === "3001492" && request.end > 1).length, 2);
  assert.equal(requests.every((request) => request.end <= 3000), true);
});

test("store dynamics collector probes no more than five quarters and never saves empty data as zero", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return Response.json({ RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." } });
  };

  const result = await collectStoreDynamics({ SEOUL_OPEN_DATA_KEY: "fixture" }, new Date("2026-09-03T01:00:00.000Z"));
  assert.equal(requests, 5);
  assert.equal(result.providerRequests, 5);
  assert.equal(result.status, "ERROR");
  assert.equal(result.records, 0);
  assert.equal(result.sourceHealth, "ERROR");
  assert.equal(result.lastGoodPreserved, false);
});

test("store dynamics collector refuses a response that would require more than three pages", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = async (input) => {
    const match = String(input).match(/VwsmTrdarStorQq\/(\d+)\/(\d+)\/(\d{5})\/(\d+)/);
    requests.push({ start: Number(match[1]), end: Number(match[2]), quarter: match[3], area: match[4] });
    if (match[3] !== "20262") return Response.json({ RESULT: { CODE: "INFO-200" } });
    const row = storeDynamicsRow(match[4]);
    return Response.json({
      VwsmTrdarStorQq: {
        list_total_count: match[1] === "1" && match[2] === "1" ? 1 : 3001,
        RESULT: { CODE: "INFO-000" },
        row: [row],
      },
    });
  };

  const result = await collectStoreDynamics({ SEOUL_OPEN_DATA_KEY: "fixture" }, new Date("2026-09-03T01:00:00.000Z"));
  assert.equal(result.status, "ERROR");
  assert.equal(result.records, 0);
  assert.equal(requests.filter((request) => request.area === "3001492" && request.end > 1).length <= 3, true);
  assert.equal(requests.every((request) => request.end <= 3000), true);
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

test("weather partial-grid failure preserves last-good area data and never inserts fake zero", async (context) => {
  const { database, databasePath } = openDatabase("weather-partial-last-good");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });

  const payload = (temperature) => Response.json({ response: { header: { resultCode: "00" }, body: { items: { item: [
    { category: "TMP", fcstDate: "20260828", fcstTime: "0900", fcstValue: String(temperature), baseDate: "20260827", baseTime: "2300" },
    { category: "POP", fcstDate: "20260828", fcstTime: "0900", fcstValue: "30", baseDate: "20260827", baseTime: "2300" },
  ] } } } });
  globalThis.fetch = async () => payload(27);

  const env = { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" };
  assert.equal((await collectWeatherForecasts(env, new Date("2026-08-27T15:00:00Z"))).status, "SUCCESS");
  const before = database.prepare("SELECT temperature_tenth_c FROM weather_forecast WHERE area = 'myeongdong'").get();
  assert.equal(before.temperature_tenth_c, 270);

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.searchParams.get("nx") === "60" && url.searchParams.get("ny") === "127") {
      return new Response("permanent fixture failure", { status: 403 });
    }
    return payload(28);
  };
  const partial = await collectWeatherForecasts(env, new Date("2026-08-27T15:00:00Z"));
  assert.equal(partial.status, "PARTIAL");
  assert.match(partial.detail, /grids ok 2\/3/);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM weather_forecast").get().count, 3);
  assert.equal(
    database.prepare("SELECT temperature_tenth_c FROM weather_forecast WHERE area = 'myeongdong'").get().temperature_tenth_c,
    270,
    "the failed grid must keep its last official value and must not become zero",
  );
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
