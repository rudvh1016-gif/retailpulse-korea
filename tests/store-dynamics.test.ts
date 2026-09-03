import assert from "node:assert/strict";
import test from "node:test";
import {
  STORE_DYNAMICS_DATASET_ID,
  STORE_DYNAMICS_MAPPING_VERSION,
  STORE_DYNAMICS_SOURCE_ID,
  aggregateStoreDynamicsRows,
  normalizeStoreDynamicsRow,
  parseStoreDynamicsResponse,
  storeDynamicsMappings,
  storeDynamicsQuarterCandidates,
} from "../lib/store-dynamics";
import { safeSourceFailureDetail } from "../lib/source-adapters";

const retrievedAt = "2026-09-03T01:00:00.000Z";

function officialRow(overrides: Record<string, unknown> = {}) {
  return {
    STDR_YYQU_CD: "20261",
    TRDAR_SE_CD: "U",
    TRDAR_SE_CD_NM: "관광특구",
    TRDAR_CD: "3001492",
    TRDAR_CD_NM: "명동 남대문 북창동 다동 무교동 관광특구",
    SVC_INDUTY_CD: "CS100001",
    SVC_INDUTY_CD_NM: "한식음식점",
    SIMILR_INDUTY_STOR_CO: 671,
    STOR_CO: 586,
    FRC_STOR_CO: 85,
    OPBIZ_RT: 3,
    OPBIZ_STOR_CO: 20,
    CLSBIZ_RT: 3,
    CLSBIZ_STOR_CO: 22,
    ...overrides,
  };
}

test("OA-15577 mapping uses one unique current official area per KORETAIL area", () => {
  assert.deepEqual(storeDynamicsMappings, {
    myeongdong: {
      area: "myeongdong",
      tradeAreaCode: "3001492",
      tradeAreaName: "명동 남대문 북창동 다동 무교동 관광특구",
      tradeAreaTypeCode: "U",
      tradeAreaTypeName: "관광특구",
    },
    hongdae: {
      area: "hongdae",
      tradeAreaCode: "3120103",
      tradeAreaName: "홍대입구역(홍대)",
      tradeAreaTypeCode: "D",
      tradeAreaTypeName: "발달상권",
    },
    seongsu: {
      area: "seongsu",
      tradeAreaCode: "3110131",
      tradeAreaName: "성수동카페거리",
      tradeAreaTypeCode: "A",
      tradeAreaTypeName: "골목상권",
    },
  });
  assert.equal(new Set(Object.values(storeDynamicsMappings).map((mapping) => mapping.tradeAreaCode)).size, 3);
  assert.equal(STORE_DYNAMICS_MAPPING_VERSION, "oa-15577-standard-area-2026-09-03-v1");
});

test("quarter candidates are newest-first, KST-safe, and bounded to five", () => {
  assert.deepEqual(storeDynamicsQuarterCandidates(new Date("2026-01-01T00:30:00Z")), [
    "20261", "20254", "20253", "20252", "20251",
  ]);
  assert.equal(storeDynamicsQuarterCandidates(new Date("2026-09-03T01:00:00Z")).length, 5);
  assert.throws(() => storeDynamicsQuarterCandidates(new Date("invalid")), /invalid_store_dynamics_candidate_time/);
});

test("normalizer accepts a secret-free official sample row and preserves every published measure", () => {
  const row = normalizeStoreDynamicsRow(officialRow(), {
    ...storeDynamicsMappings.myeongdong,
    quarterCode: "20261",
  }, retrievedAt);

  assert.deepEqual(row, {
    area: "myeongdong",
    quarterCode: "20261",
    tradeAreaCode: "3001492",
    tradeAreaName: "명동 남대문 북창동 다동 무교동 관광특구",
    tradeAreaTypeCode: "U",
    tradeAreaTypeName: "관광특구",
    industryCode: "CS100001",
    industryName: "한식음식점",
    totalStoreCount: 671,
    ordinaryStoreCount: 586,
    franchiseStoreCount: 85,
    openingCount: 20,
    openingRatePercent: 3,
    closureCount: 22,
    closureRatePercent: 3,
    retrievedAt,
  });
});

test("normalizer fails closed on identity drift, missing fields, or impossible counts", () => {
  const expected = { ...storeDynamicsMappings.myeongdong, quarterCode: "20261" };
  assert.throws(() => normalizeStoreDynamicsRow(officialRow({ TRDAR_CD: "3120028" }), expected, retrievedAt), /store_dynamics_identity/);
  assert.throws(() => normalizeStoreDynamicsRow(officialRow({ TRDAR_CD_NM: "명동(명동거리)" }), expected, retrievedAt), /store_dynamics_identity/);
  assert.throws(() => normalizeStoreDynamicsRow(officialRow({ TRDAR_SE_CD: "D" }), expected, retrievedAt), /store_dynamics_identity/);
  assert.throws(() => normalizeStoreDynamicsRow(officialRow({ TRDAR_SE_CD_NM: "발달상권" }), expected, retrievedAt), /store_dynamics_identity/);
  assert.throws(() => normalizeStoreDynamicsRow(officialRow({ STDR_YYQU_CD: "20254" }), expected, retrievedAt), /store_dynamics_identity/);
  assert.throws(() => normalizeStoreDynamicsRow(officialRow({ OPBIZ_RT: undefined }), expected, retrievedAt), /store_dynamics_number/);
  assert.throws(() => normalizeStoreDynamicsRow(officialRow({ SIMILR_INDUTY_STOR_CO: 155 }), expected, retrievedAt), /store_dynamics_total_breakdown/);
  assert.throws(() => normalizeStoreDynamicsRow(officialRow({ STOR_CO: -1, SIMILR_INDUTY_STOR_CO: 12 }), expected, retrievedAt), /store_dynamics_count/);
  assert.throws(() => normalizeStoreDynamicsRow(officialRow({ FRC_STOR_CO: 13.5, SIMILR_INDUTY_STOR_CO: 156.5 }), expected, retrievedAt), /store_dynamics_count/);
  assert.throws(() => normalizeStoreDynamicsRow(officialRow({ CLSBIZ_RT: -1 }), expected, retrievedAt), /store_dynamics_rate/);
  assert.throws(() => normalizeStoreDynamicsRow(officialRow({ OPBIZ_RT: "3.0000000" }), expected, retrievedAt), /store_dynamics_number/);
});

/**
 * The official 서울시 상권분석서비스 methodology (golmok.seoul.go.kr) defines
 * 개/폐업률 as 당기 개·폐업신고점포수 / 전체점포수 × 100 and never restricts
 * it to 0–100. A percentage exceeds 100 whenever the event count exceeds its
 * denominator, and Production proved it: seongsu / CS200015 / total=1 /
 * closureCount=2 published CLSBIZ_RT = 200. An earlier `<= 100` validator
 * rejected that valid official row and blocked the whole collection.
 */
test("a published rate above 100 is valid official data: the real 200% Production row", () => {
  const expected = { ...storeDynamicsMappings.seongsu, quarterCode: "20262" };
  const row = normalizeStoreDynamicsRow({
    STDR_YYQU_CD: "20262",
    TRDAR_SE_CD: "A",
    TRDAR_SE_CD_NM: "골목상권",
    TRDAR_CD: "3110131",
    TRDAR_CD_NM: "성수동카페거리",
    SVC_INDUTY_CD: "CS200015",
    // The Production diagnostic logged the code only; the official name was
    // not captured and is not guessed here.
    SVC_INDUTY_CD_NM: "업종명 확인 못 함",
    SIMILR_INDUTY_STOR_CO: 1,
    STOR_CO: 1,
    FRC_STOR_CO: 0,
    OPBIZ_RT: 0,
    OPBIZ_STOR_CO: 0,
    CLSBIZ_RT: 200,
    CLSBIZ_STOR_CO: 2,
  }, expected, retrievedAt);
  assert.equal(row.closureRatePercent, 200, "the provider's value is preserved, not clamped or rejected");
  assert.equal(row.closureCount, 2);
  assert.equal(row.totalStoreCount, 1);
});

test("rate validation requires only a finite, non-negative, sanely represented number — no invented ceiling", () => {
  const expected = { ...storeDynamicsMappings.myeongdong, quarterCode: "20261" };
  const accepted: unknown[] = [0, 2, 14, 25, 100, 200, 1_000, 12.5, "0", "2", "100", "200", "0.5", "33.333333"];
  for (const value of accepted) {
    for (const field of ["OPBIZ_RT", "CLSBIZ_RT"]) {
      const row = normalizeStoreDynamicsRow(officialRow({ [field]: value }), expected, retrievedAt);
      const stored = field === "OPBIZ_RT" ? row.openingRatePercent : row.closureRatePercent;
      assert.equal(stored, Number(value), `${field}=${JSON.stringify(value)} must be accepted and preserved`);
    }
  }
  const rejected: Array<[unknown, RegExp]> = [
    [-1, /store_dynamics_rate/],
    [-0.5, /store_dynamics_rate/],
    [Number.NaN, /store_dynamics_number/],
    [Number.POSITIVE_INFINITY, /store_dynamics_number/],
    [Number.NEGATIVE_INFINITY, /store_dynamics_number/],
    ["-1", /store_dynamics_number/],
    ["1e3", /store_dynamics_number/],
    ["12%", /store_dynamics_number/],
    ["abc", /store_dynamics_number/],
    ["", /store_dynamics_number/],
    [" 3", /store_dynamics_number/],
    ["3.", /store_dynamics_number/],
    [".5", /store_dynamics_number/],
    ["03", /store_dynamics_number/],
    ["3.0000000", /store_dynamics_number/],
    [null, /store_dynamics_number/],
    [undefined, /store_dynamics_number/],
    [true, /store_dynamics_number/],
    [{}, /store_dynamics_number/],
  ];
  for (const [value, code] of rejected) {
    for (const field of ["OPBIZ_RT", "CLSBIZ_RT"]) {
      assert.throws(() => normalizeStoreDynamicsRow(officialRow({ [field]: value }), expected, retrievedAt), code,
        `${field}=${String(value)} must be rejected with ${code}`);
    }
  }
});

/**
 * OPBIZ_RT/CLSBIZ_RT are trusted as the provider published them, not
 * recomputed from this row's own counts. Two reconstruction attempts (base
 * = this quarter's ending total; base = the total with the event backed
 * out/added back) each matched some real Production rows and contradicted
 * others: eight real (area, industry) rows were captured this way, and no
 * single arithmetic relationship using only this row's counts explains all
 * eight. The provider evidently derives the rate from something this table
 * does not carry. These are the real values that disproved both formulas —
 * kept as a regression so a future "fix" is not applied on a hunch again.
 */
test("published rates are trusted as the provider sent them, never recomputed from this row's own counts", () => {
  const expected = { ...storeDynamicsMappings.myeongdong, quarterCode: "20261" };
  const real = [
    // [total, stor, frc, openingCount, openingRate, closureCount, closureRate]
    [7, 7, 0, 1, 14, 0, 0],
    [226, 206, 20, 10, 4, 5, 2],
    [28, 28, 0, 1, 4, 1, 4],
    [90, 88, 2, 4, 4, 2, 2],
    [8, 8, 0, 0, 0, 2, 25],
    [21, 21, 0, 0, 0, 2, 10],
    [67, 67, 0, 1, 2, 0, 0],
    [6, 6, 0, 0, 0, 1, 14],
    // total=0: this industry's very last store in the trade area closed
    // this quarter, so the closure count (1) legitimately exceeds what
    // remains (0). closureCount is not bounded by totalStoreCount.
    [0, 0, 0, 0, 0, 1, 0],
  ] as const;
  for (const [total, stor, frc, openingCount, openingRate, closureCount, closureRate] of real) {
    assert.doesNotThrow(() => normalizeStoreDynamicsRow(officialRow({
      SIMILR_INDUTY_STOR_CO: total, STOR_CO: stor, FRC_STOR_CO: frc,
      OPBIZ_STOR_CO: openingCount, OPBIZ_RT: openingRate,
      CLSBIZ_STOR_CO: closureCount, CLSBIZ_RT: closureRate,
    }), expected, retrievedAt), `real row (total=${total}, opening=${openingCount}/${openingRate}%, closure=${closureCount}/${closureRate}%) must validate`);
  }
});

test("an opening or closure count is not bounded by the row's own total, and an arbitrary rate is trusted", () => {
  const expected = { ...storeDynamicsMappings.myeongdong, quarterCode: "20261" };
  // A first validator attempt rejected this as "impossible" before a real
  // Production row (total=0, closureCount=1: the industry's last store)
  // proved a count can legitimately exceed the row's own total.
  assert.doesNotThrow(() => normalizeStoreDynamicsRow(officialRow({
    SIMILR_INDUTY_STOR_CO: 1_000,
    STOR_CO: 1_000,
    FRC_STOR_CO: 0,
    OPBIZ_STOR_CO: 1_004,
    OPBIZ_RT: 100,
  }), expected, retrievedAt));
  assert.doesNotThrow(() => normalizeStoreDynamicsRow(officialRow({
    SIMILR_INDUTY_STOR_CO: 1_000,
    STOR_CO: 1_000,
    FRC_STOR_CO: 0,
    CLSBIZ_STOR_CO: 1_004,
    CLSBIZ_RT: 100,
  }), expected, retrievedAt));
  assert.doesNotThrow(() => normalizeStoreDynamicsRow(officialRow({ OPBIZ_RT: 20 }), expected, retrievedAt),
    "an arbitrary but validly-shaped published rate is trusted, not recomputed");
});

test("official response validation distinguishes valid rows from an official no-data result", () => {
  assert.deepEqual(parseStoreDynamicsResponse({
    VwsmTrdarStorQq: {
      list_total_count: 1,
      RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다" },
      row: [officialRow()],
    },
  }), { noData: false, totalCount: 1, rows: [officialRow()] });
  assert.deepEqual(parseStoreDynamicsResponse({
    RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." },
  }), { noData: true, totalCount: 0, rows: [] });
  let authFailure: unknown;
  try {
    parseStoreDynamicsResponse({ RESULT: { CODE: "INFO-100", MESSAGE: "not retained" } });
  } catch (error) {
    authFailure = error;
  }
  assert.match(safeSourceFailureDetail(authFailure), /failureClass=AUTH causeCode=STORE_DYNAMICS_SERVICE_KEY/);
  let providerFailure: unknown;
  try {
    parseStoreDynamicsResponse({ RESULT: { CODE: "ERROR-500", MESSAGE: "not retained" } });
  } catch (error) {
    providerFailure = error;
  }
  assert.match(safeSourceFailureDetail(providerFailure), /failureClass=PROVIDER causeCode=STORE_DYNAMICS_PROVIDER_ERROR_500/);
  assert.throws(() => parseStoreDynamicsResponse({ RESULT: { CODE: "ERROR-310" } }), /store_dynamics_schema_error-310/);
  let schemaFailure: unknown;
  try {
    parseStoreDynamicsResponse({
      VwsmTrdarStorQq: { list_total_count: "bad", RESULT: { CODE: "INFO-000" }, row: [] },
    });
  } catch (error) {
    schemaFailure = error;
  }
  assert.match(safeSourceFailureDetail(schemaFailure), /failureClass=SCHEMA causeCode=STORE_DYNAMICS_SCHEMA_RESPONSE/);
  assert.throws(() => parseStoreDynamicsResponse({
    VwsmTrdarStorQq: { list_total_count: 1, RESULT: { CODE: "INFO-000" }, row: {} },
  }), /store_dynamics_schema_response/);
});

test("aggregator creates one compact area fact without duplicate-industry inflation", async () => {
  const expected = { ...storeDynamicsMappings.myeongdong, quarterCode: "20261" };
  const rows = [
    normalizeStoreDynamicsRow(officialRow(), expected, retrievedAt),
    normalizeStoreDynamicsRow(officialRow({
      SVC_INDUTY_CD: "CS100002",
      SVC_INDUTY_CD_NM: "중식음식점",
      SIMILR_INDUTY_STOR_CO: 18,
      STOR_CO: 17,
      FRC_STOR_CO: 1,
      OPBIZ_RT: 0,
      OPBIZ_STOR_CO: 0,
      CLSBIZ_RT: 5, // trusted as published, not recomputed from the counts.
      CLSBIZ_STOR_CO: 1,
    }), expected, retrievedAt),
  ];

  const aggregate = await aggregateStoreDynamicsRows(rows, expected, retrievedAt);
  assert.equal(aggregate.sourceId, STORE_DYNAMICS_SOURCE_ID);
  assert.equal(aggregate.datasetId, STORE_DYNAMICS_DATASET_ID);
  assert.equal(aggregate.recordOrigin, "OFFICIAL_HISTORICAL");
  assert.equal(aggregate.mappingVersion, STORE_DYNAMICS_MAPPING_VERSION);
  assert.equal(aggregate.totalStoreCount, 689);
  assert.equal(aggregate.ordinaryStoreCount, 603);
  assert.equal(aggregate.franchiseStoreCount, 86);
  assert.equal(aggregate.openingCount, 20);
  assert.equal(aggregate.closureCount, 23);
  assert.equal(aggregate.industryCount, 2);
  // The two tenths columns are a KORETAIL-derived ratio over the summed
  // counts, kept only to populate the existing NOT NULL columns. They are not
  // the official area-wide 개/폐업률 and nothing public surfaces them.
  assert.equal(aggregate.openingRateTenthsPercent, 29);
  assert.equal(aggregate.closureRateTenthsPercent, 33);
  assert.equal(aggregate.qualityStatus, "VALID");
  assert.match(aggregate.sourceHash, /^[a-f0-9]{64}$/);

  const collectedLater = await aggregateStoreDynamicsRows(rows, expected, "2026-09-03T02:00:00.000Z");
  assert.equal(collectedLater.sourceHash, aggregate.sourceHash, "retrieval time alone is not a semantic change");
  await assert.rejects(() => aggregateStoreDynamicsRows([rows[0], rows[0]], expected, retrievedAt), /store_dynamics_duplicate_industry/);
  await assert.rejects(() => aggregateStoreDynamicsRows([], expected, retrievedAt), /store_dynamics_no_rows/);
  const zero = normalizeStoreDynamicsRow(officialRow({
    SIMILR_INDUTY_STOR_CO: 0,
    STOR_CO: 0,
    FRC_STOR_CO: 0,
    OPBIZ_RT: 0,
    OPBIZ_STOR_CO: 0,
    CLSBIZ_RT: 0,
    CLSBIZ_STOR_CO: 0,
  }), expected, retrievedAt);
  await assert.rejects(() => aggregateStoreDynamicsRows([zero], expected, retrievedAt), /store_dynamics_zero_total/);
});
