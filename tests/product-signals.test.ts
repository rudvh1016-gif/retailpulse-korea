import assert from "node:assert/strict";
import test from "node:test";

import { classifyDemoDemand, demoDemandThresholds } from "../lib/demand-index";
import { buildAirportPressure } from "../lib/airport-pressure";
import { safeAll } from "../app/api/live/summary/route";
import { buildCommercialSignalRow } from "../app/live-signals";
import { probeSeoulCitydataContracts } from "../scripts/probe-seoul-citydata-contract";

test("demo demand levels use cohort thirds instead of absolute magic numbers", () => {
  const cohort = [82, 77, 71, 86, 74, 69];
  assert.deepEqual(demoDemandThresholds(cohort), { lowMax: 73, highMin: 78.66666666666667 });
  assert.equal(classifyDemoDemand(71, cohort), "low");
  assert.equal(classifyDemoDemand(77, cohort), "normal");
  assert.equal(classifyDemoDemand(82, cohort), "high");
});

test("airport pressure counts one physical aircraft once across codeshares", () => {
  const rows = buildAirportPressure([
    { physicalFlightId: "KE123-2026-08-28", marketingFlightCode: "KE123", direction: "departure", basis: "actual", terminal: "T1", gate: "29", gateObservedAt: "2026-08-28T13:30:00+09:00", scheduledAt: "2026-08-28T14:10:00+09:00", status: "onTime" },
    { physicalFlightId: "KE123-2026-08-28", marketingFlightCode: "DL9001", direction: "departure", basis: "actual", terminal: "T1", gate: "29", gateObservedAt: "2026-08-28T13:31:00+09:00", scheduledAt: "2026-08-28T14:10:00+09:00", status: "onTime" },
  ], { now: "2026-08-28T13:45:00+09:00" });
  assert.equal(rows[0].uniqueFlightCount, 1);
  assert.equal(rows[0].where.kind, "exactGate");
  assert.equal(rows[0].where.label, "29");
});

test("cancelled flights are excluded and stale or missing gates fall back to terminal", () => {
  const rows = buildAirportPressure([
    { physicalFlightId: "A", direction: "departure", basis: "actual", terminal: "T1", gate: "29", gateObservedAt: "2026-08-28T08:00:00+09:00", scheduledAt: "2026-08-28T14:10:00+09:00", status: "onTime" },
    { physicalFlightId: "B", direction: "departure", basis: "actual", terminal: "T1", scheduledAt: "2026-08-28T14:20:00+09:00", status: "onTime" },
    { physicalFlightId: "C", direction: "departure", basis: "actual", terminal: "T1", gate: "30", gateObservedAt: "2026-08-28T13:30:00+09:00", scheduledAt: "2026-08-28T14:30:00+09:00", status: "cancelled" },
  ], { now: "2026-08-28T13:45:00+09:00", gateFreshnessMinutes: 180 });
  assert.equal(rows[0].uniqueFlightCount, 2);
  assert.equal(rows[0].where.kind, "terminal");
  assert.equal(rows[0].confidence, "low");
});

test("scheduled service never implies a future exact gate", () => {
  const rows = buildAirportPressure([
    { physicalFlightId: "A", direction: "departure", basis: "scheduled", terminal: "T2", gate: "250", gateObservedAt: "2026-08-28T13:30:00+09:00", scheduledAt: "2026-08-29T14:10:00+09:00", status: "scheduled" },
  ], { now: "2026-08-28T13:45:00+09:00" });
  assert.equal(rows[0].basis, "scheduled");
  assert.equal(rows[0].where.kind, "terminal");
  assert.equal(rows[0].confidence, "low");
});

test("a zone is used only when an authoritative mapping is supplied", () => {
  const rows = buildAirportPressure([
    { physicalFlightId: "A", direction: "departure", basis: "actual", terminal: "T1", gate: "29", gateObservedAt: "2026-08-28T13:30:00+09:00", scheduledAt: "2026-08-28T14:10:00+09:00", status: "onTime" },
    { physicalFlightId: "B", direction: "departure", basis: "actual", terminal: "T1", gate: "30", gateObservedAt: "2026-08-28T13:30:00+09:00", scheduledAt: "2026-08-28T14:20:00+09:00", status: "delayed" },
  ], { now: "2026-08-28T13:45:00+09:00", gateZones: [{ terminal: "T1", id: "verified-east", label: "27–32", gates: ["27", "28", "29", "30", "31", "32"], authority: "official-topology" }] });
  assert.equal(rows[0].where.kind, "gateZone");
  assert.equal(rows[0].where.label, "27–32");
  assert.equal(rows[0].delayedFlightCount, 1);
});

test("live summary isolates an unavailable official source", async () => {
  assert.deepEqual(await safeAll(async () => { throw new Error("missing table"); }), []);
  assert.deepEqual(await safeAll(async () => [{ area: "myeongdong" }]), [{ area: "myeongdong" }]);
});

test("Seoul integrated contract probe reports structure without leaking keys or commercial values", async () => {
  const secret = "SENTINEL-SEOUL-KEY-DO-NOT-PRINT";
  const sensitiveValues = ["987654321", "123456789", "명동 관광특구"];
  const output: string[] = [];
  const requested: string[] = [];

  const result = await probeSeoulCitydataContracts({
    apiKey: secret,
    poiCodes: ["POI003", "POI007", "POI068"],
    fetchImpl: async (input) => {
      requested.push(String(input));
      return Response.json({
        RESULT: { "RESULT.CODE": "INFO-000", "RESULT.MESSAGE": "정상 처리되었습니다." },
        CITYDATA: {
          AREA_NM: sensitiveValues[2],
          AREA_CD: "POI003",
          LIVE_PPLTN_STTS: [{ AREA_CONGEST_LVL: "보통", PPLTN_TIME: "2026-09-02 12:00" }],
          LIVE_CMRCL_STTS: {
            AREA_CMRCL_LVL: "활발",
            AREA_SH_PAYMENT_CNT: sensitiveValues[0],
            AREA_SH_PAYMENT_AMT_MIN: sensitiveValues[1],
            AREA_SH_PAYMENT_AMT_MAX: "999999999",
            CMRCL_RSB: [{ CMRCL_NM: "패션" }],
            CMRCL_TIME: "2026-09-02 12:00",
          },
        },
      });
    },
    write: (line) => output.push(line),
  });

  assert.equal(requested.length, 3, "one integrated request is allowed per configured POI");
  assert.deepEqual(result.map((entry) => entry.poiCode), ["POI003", "POI007", "POI068"]);
  assert.equal(result.every((entry) => entry.officialCode === "INFO-000" && entry.populationBlock && entry.commercialBlock), true);
  assert.equal(result.every((entry) => entry.commercialRequiredFields && entry.categoryArray), true);
  assert.equal(result.every((entry) => entry.areaIdentityFields && entry.commercialTimeFormat), true);
  assert.equal(result.every((entry) => entry.paymentCountShape === "numeric-string"), true);
  assert.equal(result.every((entry) => entry.paymentAmountMinShape === "numeric-string"), true);
  assert.equal(result.every((entry) => entry.paymentAmountMaxShape === "numeric-string"), true);
  assert.equal(result.every((entry) => entry.paymentRangeOrdered), true);

  const diagnostic = output.join("\n");
  assert.match(diagnostic, /POI003/);
  assert.match(diagnostic, /commercialRequiredFields/);
  assert.match(diagnostic, /paymentCountShape/);
  assert.doesNotMatch(diagnostic, new RegExp(secret));
  for (const sensitive of sensitiveValues) assert.doesNotMatch(diagnostic, new RegExp(sensitive));
  assert.doesNotMatch(diagnostic, /openapi\.seoul\.go\.kr|CITYDATA|AREA_CMRCL_LVL/);
});

test("Seoul integrated contract probe fails closed on an unauthorized official response", async () => {
  const output: string[] = [];
  await assert.rejects(
    probeSeoulCitydataContracts({
      apiKey: "fixture-key",
      poiCodes: ["POI003"],
      fetchImpl: async () => Response.json({ RESULT: { "RESULT.CODE": "INFO-300" } }),
      write: (line) => output.push(line),
    }),
    /seoul_contract_probe_failed_POI003_INFO-300/,
  );
  assert.equal(output.some((line) => line.includes("INFO-300")), true);
});

test("realtime commercial signal tells all four locales it is domestic-card activity, not total sales", () => {
  const commercial = {
    commercialLevel: "활발",
    paymentCount: 12345,
    paymentAmountMin: 123456,
    paymentAmountMax: 234567,
    observedAt: "2026-09-02T12:05:00+09:00",
    retrievedAt: "2026-09-02T03:06:00Z",
    qualityStatus: "VALID",
    freshness: "LIVE" as const,
  };
  const expected = {
    ko: "신한카드 내국인 소비 기준 · 전수 매출 아님",
    en: "Shinhan Card domestic-consumer activity · not total sales",
    zh: "基于新韩卡韩国境内消费者活动 · 非全量销售额",
    ja: "新韓カードの国内消費者活動基準 · 売上全数ではありません",
  } as const;

  for (const lang of ["ko", "en", "zh", "ja"] as const) {
    const row = buildCommercialSignalRow(lang, commercial, "2026-09-02T03:10:00Z");
    assert.ok(row);
    assert.equal(row.key, "commercial");
    assert.match(row.value, /활발/);
    assert.ok(row.note.includes(expected[lang]));
    assert.equal(row.state, "LIVE");
  }
});

test("suppressed commercial payment values stay absent and never render as zero", () => {
  const row = buildCommercialSignalRow("ko", {
    commercialLevel: "보통",
    paymentCount: null,
    paymentAmountMin: null,
    paymentAmountMax: null,
    observedAt: "2026-09-02T12:05:00+09:00",
    retrievedAt: "2026-09-02T03:06:00Z",
    qualityStatus: "PARTIAL",
    freshness: "STALE",
  }, "2026-09-02T04:00:00Z");

  assert.ok(row);
  assert.equal(row.value, "보통");
  assert.doesNotMatch(`${row.value} ${row.note}`, /₩0|0원|payment count 0/i);
  assert.equal(buildCommercialSignalRow("ko", null, "2026-09-02T04:00:00Z"), null);
});
