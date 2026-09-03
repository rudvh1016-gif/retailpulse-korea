import assert from "node:assert/strict";
import test from "node:test";

import { classifyDemoDemand, demoDemandThresholds } from "../lib/demand-index";
import { buildAirportPressure } from "../lib/airport-pressure";
import { isValidStoredStoreDynamics, safeAll } from "../app/api/live/summary/route";
import { buildCommercialSignalRow, buildStoreDynamicsPresentation } from "../app/live-signals";
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

test("live summary isolates invalid Store Dynamics identity or arithmetic per area", () => {
  const row = {
    sourceId: "SEOUL_STORE_DYNAMICS",
    datasetId: "OA-15577",
    recordOrigin: "OFFICIAL_HISTORICAL",
    area: "myeongdong",
    mappingVersion: "oa-15577-standard-area-2026-09-03-v1",
    schemaVersion: "store-dynamics-v1",
    qualityStatus: "VALID",
    tradeAreaCode: "3001492",
    tradeAreaName: "명동 남대문 북창동 다동 무교동 관광특구",
    tradeAreaTypeCode: "U",
    tradeAreaTypeName: "관광특구",
    quarterCode: "20262",
    totalStoreCount: 174,
    ordinaryStoreCount: 160,
    franchiseStoreCount: 14,
    openingCount: 10,
    openingRateTenthsPercent: 57,
    closureCount: 5,
    closureRateTenthsPercent: 29,
    industryCount: 88,
    retrievedAt: "2026-09-03T01:00:00.000Z",
  };
  assert.equal(isValidStoredStoreDynamics("myeongdong", row), true);
  assert.equal(isValidStoredStoreDynamics("myeongdong", { ...row, schemaVersion: "legacy" }), false);
  assert.equal(isValidStoredStoreDynamics("myeongdong", { ...row, recordOrigin: "LIVE" }), false);
  assert.equal(isValidStoredStoreDynamics("myeongdong", { ...row, tradeAreaCode: "3120103" }), false);
  assert.equal(isValidStoredStoreDynamics("myeongdong", { ...row, ordinaryStoreCount: 161 }), false,
    "total = ordinary + franchise is the provider's own breakdown and still fails closed");
  assert.equal(isValidStoredStoreDynamics("myeongdong", { ...row, openingCount: -1 }), false);
  assert.equal(isValidStoredStoreDynamics("myeongdong", { ...row, openingRateTenthsPercent: -1 }), false);
  assert.equal(isValidStoredStoreDynamics("myeongdong", { ...row, closureRateTenthsPercent: 2.5 }), false);
  assert.equal(isValidStoredStoreDynamics("myeongdong", { ...row, industryCount: 0 }), false);
  assert.equal(isValidStoredStoreDynamics("myeongdong", { ...row, totalStoreCount: 0, ordinaryStoreCount: 0, franchiseStoreCount: 0 }), false);

  // Disproven by real OA-15577 rows and therefore deliberately NOT enforced:
  // a rate ceiling (a real row published CLSBIZ_RT = 200), a count bounded by
  // the ending total (an industry's last stores closing leaves closures above
  // what remains), and any equality with a guessed provider formula. The
  // stored tenths columns are a KORETAIL-derived ratio nothing public shows,
  // so a good row of counts is not invalidated by them.
  assert.equal(isValidStoredStoreDynamics("myeongdong", { ...row, openingRateTenthsPercent: 58 }), true,
    "a derived ratio that does not match a recomputation must not hide valid official counts");
  assert.equal(isValidStoredStoreDynamics("myeongdong", { ...row, closureRateTenthsPercent: 2_000 }), true,
    "no rate ceiling: 200.0% is real published data");
  assert.equal(isValidStoredStoreDynamics("myeongdong", {
    ...row,
    totalStoreCount: 10_000,
    ordinaryStoreCount: 9_000,
    franchiseStoreCount: 1_000,
    closureCount: 10_001,
    closureRateTenthsPercent: 1_000,
  }), true, "a closure count above the ending total is legitimate");
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
            CMRCL_TIME: "20260902 1200",
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
  assert.equal(result.every((entry) => entry.commercialTimeShape === "compact-kst-minute"), true);
  assert.equal(result.every((entry) => entry.commercialTimeMask === "DDDDDDDD DDDD"), true);
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

test("realtime commercial signal separates status, amount, reference and retrieval in all four locales", () => {
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
    ko: {
      label: "최근 10분 내국인 카드 소비", reference: "12:05 기준 최근 10분", retrieval: "12:06 수집",
      attribution: "신한카드 내국인 결제 기반 · 전수 매출 아님 · 외국인 소비 아님",
    },
    en: {
      label: "Recent 10-minute domestic-card activity", reference: "Recent 10 minutes as of 12:05 KST", retrieval: "Collected 12:06 KST",
      attribution: "Based on Shinhan Card domestic-consumer payments · not total sales · not foreign-consumer spending",
    },
    zh: {
      label: "最近10分钟境内消费者银行卡支付", reference: "截至12:05 KST的最近10分钟", retrieval: "12:06 KST采集",
      attribution: "基于新韩卡韩国境内消费者支付 · 非全量销售额 · 非外国消费者支出",
    },
    ja: {
      label: "直近10分の国内消費者カード決済", reference: "12:05 KST時点の直近10分", retrieval: "12:06 KST取得",
      attribution: "新韓カードの国内消費者決済に基づく · 売上全数ではありません · 外国人消費ではありません",
    },
  } as const;

  for (const lang of ["ko", "en", "zh", "ja"] as const) {
    const row = buildCommercialSignalRow(lang, commercial, "2026-09-02T03:10:00Z");
    assert.ok(row);
    assert.equal(row.key, "commercial");
    assert.equal(row.label, expected[lang].label);
    assert.equal(row.statusValue, "활발");
    assert.match(row.amountValue ?? "", /₩123,456.*₩234,567/);
    assert.match(row.countValue ?? "", /12,345/);
    assert.equal(row.referenceValue, expected[lang].reference);
    assert.equal(row.retrievalValue, expected[lang].retrieval);
    assert.equal(row.attribution, expected[lang].attribution);
    assert.equal(row.privacyMessage, null);
    assert.equal(row.staleAge, null);
    assert.equal(row.state, "LIVE");
    assert.doesNotMatch(JSON.stringify(row), /11:55.*12:05|12:05.*11:55/,
      "the provider did not publish a calculated interval start");
  }
});

test("suppressed commercial payment values show privacy protection and never render as zero", () => {
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
  assert.equal(row.statusValue, "보통", "the explicit provider status remains available");
  assert.equal(row.amountValue, null);
  assert.equal(row.countValue, null);
  assert.equal(row.privacyMessage, "표본 보호로 금액 비공개");
  assert.equal(row.staleAge, "55분 전");
  assert.doesNotMatch(JSON.stringify(row), /₩0|0원|0건|payment count 0/i);
  assert.equal(buildCommercialSignalRow("ko", null, "2026-09-02T04:00:00Z"), null);
});

test("an explicitly valid zero commercial value is preserved rather than treated as suppression", () => {
  const row = buildCommercialSignalRow("ko", {
    commercialLevel: "한산",
    paymentCount: 0,
    paymentAmountMin: 0,
    paymentAmountMax: 0,
    observedAt: "2026-09-02T12:05:00+09:00",
    retrievedAt: "2026-09-02T03:06:00Z",
    qualityStatus: "VALID",
    freshness: "LIVE",
  }, "2026-09-02T03:10:00Z");

  assert.ok(row);
  assert.equal(row.statusValue, "한산");
  assert.match(row.amountValue ?? "", /₩0/);
  assert.match(row.countValue ?? "", /0건/);
  assert.equal(row.privacyMessage, null);
});

test("Store Dynamics presents stored official counts only, never an area-wide rate, in all four languages", () => {
  const row = {
    datasetId: "OA-15577" as const,
    quarterCode: "20261",
    tradeAreaCode: "3001492",
    tradeAreaName: "명동 남대문 북창동 다동 무교동 관광특구",
    tradeAreaTypeCode: "U",
    tradeAreaTypeName: "관광특구",
    totalStoreCount: 174,
    ordinaryStoreCount: 160,
    franchiseStoreCount: 14,
    openingCount: 10,
    closureCount: 5,
    mappingVersion: "oa-15577-standard-area-2026-09-03-v1",
    retrievedAt: "2026-09-03T01:00:00.000Z",
  };
  const expected = {
    ko: ["점포 현황", "2026년 1분기", "총 점포", "174개", "일반 점포", "160개", "프랜차이즈", "14개", "이번 기준분기 개업", "10개", "이번 기준분기 폐업", "5개", "공식 기준", "공식 상권", "분기 기준 공식 과거 자료이며, 현재 영업 중인 점포의 실시간 수가 아닙니다."],
    en: ["Store openings and closures", "Q1 2026", "Total stores", "174 stores", "Openings this reference quarter", "10 stores", "Closures this reference quarter", "5 stores", "Official quarterly historical data, not a real-time count of stores currently operating."],
    zh: ["店铺开业与歇业", "2026年第1季度", "店铺总数", "174家", "本基准季度开业", "10家", "本基准季度歇业", "5家", "官方季度历史资料，并非当前营业店铺的实时数量。"],
    ja: ["店舗の開業・廃業", "2026年第1四半期", "総店舗数", "174店", "基準四半期の開業", "10店", "基準四半期の廃業", "5店", "四半期基準の公式過去資料であり、現在営業中の店舗のリアルタイム件数ではありません。"],
  } as const;

  for (const lang of ["ko", "en", "zh", "ja"] as const) {
    const presentation = buildStoreDynamicsPresentation(lang, row);
    assert.ok(presentation);
    const rendered = JSON.stringify(presentation);
    for (const fragment of expected[lang]) assert.ok(rendered.includes(fragment), `${lang}: ${fragment}`);
    assert.match(rendered, /명동 남대문 북창동 다동 무교동 관광특구/);
    assert.match(rendered, /OA-15577/);
    assert.match(rendered, /2026-09-03 10:00 KST/);
    // The provider's per-industry rates cannot be reconstructed from the row
    // fields for every real row, so no area-wide 개업률/폐업률 is invented.
    assert.doesNotMatch(rendered, /%/, `${lang}: no percentage may be presented as an area-wide official rate`);
    assert.doesNotMatch(rendered, /개업률|폐업률|opening rate|closure rate|开业率|歇业率|開業率|廃業率/i, lang);
    assert.equal(presentation.timeState, { ko: "과거 자료", en: "Historical", zh: "历史资料", ja: "過去資料" }[lang]);
    assert.equal(presentation.areaValue, "명동 남대문 북창동 다동 무교동 관광특구",
      "do not repeat an official type already present in the official name");
  }

  assert.equal(buildStoreDynamicsPresentation("ko", { ...row, totalStoreCount: -1 }), null);
  assert.equal(buildStoreDynamicsPresentation("ko", { ...row, ordinaryStoreCount: 161 }), null);
  assert.equal(buildStoreDynamicsPresentation("ko", { ...row, quarterCode: "2026-Q1" }), null);
  const lastStoresClosed = buildStoreDynamicsPresentation("ko", { ...row, closureCount: 200 });
  assert.ok(lastStoresClosed, "a closure count above the ending total is real data, not an error");
  assert.ok(JSON.stringify(lastStoresClosed).includes("200개"));
});
