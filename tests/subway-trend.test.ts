import assert from "node:assert/strict";
import test from "node:test";
import { shiftKstDay } from "../lib/kst";
import {
  SEOUL_SUBWAY_DATASET_ID,
  SEOUL_SUBWAY_MAPPING_VERSION,
  SEOUL_SUBWAY_SOURCE_ID,
  SUBWAY_AREA_STATIONS,
} from "../lib/subway-ridership";
import { SUBWAY_TREND_WINDOW_DAYS, summarizeSubwayTrend } from "../lib/subway-trend";

const latestDate = "2026-09-03";
const station = SUBWAY_AREA_STATIONS.myeongdong[0];

function storedRow(
  referenceDate: string,
  alightingCount: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    sourceId: SEOUL_SUBWAY_SOURCE_ID,
    datasetId: SEOUL_SUBWAY_DATASET_ID,
    recordOrigin: "OFFICIAL_DAILY",
    area: "myeongdong",
    referenceDate,
    stationCode: station.stationCode,
    stationNumber: station.stationNumber,
    stationName: station.stationName,
    lineName: station.lineName,
    boardingCount: Math.max(0, alightingCount - 100),
    alightingCount,
    retrievedAt: "2026-09-04T00:00:00.000Z",
    mappingVersion: SEOUL_SUBWAY_MAPPING_VERSION,
    qualityStatus: "VALID",
    ...overrides,
  };
}

function completeHistory(current = 1_124, baseline = 1_000): Record<string, unknown>[] {
  return Array.from({ length: SUBWAY_TREND_WINDOW_DAYS }, (_, delta) =>
    storedRow(shiftKstDay(latestDate, -delta), delta === 0 ? current : baseline));
}

test("exact stored D-1, D-7, seven-day and four-week baselines produce deterministic tenths-percent context", () => {
  const result = summarizeSubwayTrend("myeongdong", completeHistory());
  assert.ok(result);
  assert.deepEqual(result.latest, {
    referenceDate: latestDate,
    boardingCount: 1_024,
    alightingCount: 1_124,
    selectedStationCount: 1,
    selectedStations: "명동|4호선",
    retrievedAt: "2026-09-04T00:00:00.000Z",
    datasetId: "OA-22723",
    mappingVersion: SEOUL_SUBWAY_MAPPING_VERSION,
  });
  assert.equal(result.trend.observedDayCount, 29);
  assert.equal(result.trend.earliestReferenceDate, "2026-08-06");
  assert.deepEqual(result.trend.previousDay, {
    baselineDates: ["2026-09-02"], baselineAlightingCount: 1_000, changeTenthsPercent: 124,
  });
  assert.deepEqual(result.trend.sameWeekdayLastWeek, {
    baselineDates: ["2026-08-27"], baselineAlightingCount: 1_000, changeTenthsPercent: 124,
  });
  assert.equal(result.trend.recentSevenDayAverage?.baselineDates.length, 7);
  assert.equal(result.trend.recentSevenDayAverage?.baselineAlightingCount, 1_000);
  assert.equal(result.trend.recentSevenDayAverage?.changeTenthsPercent, 124);
  assert.deepEqual(result.trend.fourWeekSameWeekdayAverage?.baselineDates, [
    "2026-08-27", "2026-08-20", "2026-08-13", "2026-08-06",
  ]);
  assert.equal(result.trend.fourWeekSameWeekdayAverage?.changeTenthsPercent, 124);
  assert.equal("month" in result.trend, false, "a calendar comparison must not be fabricated");
  assert.equal("yearOverYear" in result.trend, false, "YoY stays absent without year-old stored data");
});

test("the arithmetic-mean comparison uses the exact sum rather than a rounded average", () => {
  const rows = completeHistory(10, 10);
  // D-1..D-7 sum to 58, mean 8.2857 (displayed as 8). The exact comparison
  // is +20.7%, not the +25.0% a prematurely rounded baseline would yield.
  [7, 8, 8, 8, 9, 9, 9].forEach((count, index) => {
    rows[index + 1] = storedRow(shiftKstDay(latestDate, -(index + 1)), count);
  });
  const result = summarizeSubwayTrend("myeongdong", rows);
  assert.ok(result);
  assert.equal(result.trend.recentSevenDayAverage?.baselineAlightingCount, 8);
  assert.equal(result.trend.recentSevenDayAverage?.changeTenthsPercent, 207);
});

test("positive, negative and equal comparisons use one safe formula", () => {
  const positive = summarizeSubwayTrend("myeongdong", [
    storedRow(latestDate, 1_100), storedRow("2026-09-02", 1_000),
  ]);
  const negative = summarizeSubwayTrend("myeongdong", [
    storedRow(latestDate, 900), storedRow("2026-09-02", 1_000),
  ]);
  const equal = summarizeSubwayTrend("myeongdong", [
    storedRow(latestDate, 1_000), storedRow("2026-09-02", 1_000),
  ]);
  const zeroCurrent = summarizeSubwayTrend("myeongdong", [
    storedRow(latestDate, 0, { boardingCount: 0 }), storedRow("2026-09-02", 1_000),
  ]);
  assert.equal(positive?.trend.previousDay?.changeTenthsPercent, 100);
  assert.equal(negative?.trend.previousDay?.changeTenthsPercent, -100);
  assert.equal(equal?.trend.previousDay?.changeTenthsPercent, 0);
  assert.equal(zeroCurrent?.trend.previousDay?.changeTenthsPercent, -1_000, "zero current against a positive baseline is a real −100.0%");
  assert.equal(Object.is(equal?.trend.previousDay?.changeTenthsPercent, -0), false);
});

test("zero, missing and malformed baselines are unavailable rather than infinity or zero percent", () => {
  const zero = summarizeSubwayTrend("myeongdong", [
    storedRow(latestDate, 500), storedRow("2026-09-02", 0, { boardingCount: 0 }),
  ]);
  const missing = summarizeSubwayTrend("myeongdong", [storedRow(latestDate, 500)]);
  const missingCount = summarizeSubwayTrend("myeongdong", [
    storedRow(latestDate, 500), storedRow("2026-09-02", 400, { alightingCount: null }),
  ]);
  assert.equal(zero?.trend.previousDay, null);
  assert.equal(missing?.trend.previousDay, null);
  assert.equal(missingCount?.trend.previousDay, null);
});

test("every exact recent day is required and partial four-week history stays unavailable", () => {
  const rows = completeHistory().filter((row) => row.referenceDate !== "2026-08-31" && row.referenceDate !== "2026-08-13");
  const result = summarizeSubwayTrend("myeongdong", rows);
  assert.ok(result);
  assert.ok(result.trend.sameWeekdayLastWeek);
  assert.equal(result.trend.recentSevenDayAverage, null, "missing D-3 invalidates the recent average");
  assert.equal(result.trend.fourWeekSameWeekdayAverage, null, "missing D-21 invalidates the four-week average");
});

test("wrong station, line, area, source, mapping, origin, quality, dataset and dates cannot leak into the trend", () => {
  const wrongRows = [
    storedRow("2026-09-04", 99_999, { stationCode: "9999" }),
    storedRow("2026-09-04", 99_999, { stationNumber: "999" }),
    storedRow("2026-09-04", 99_999, { stationName: "홍대입구" }),
    storedRow("2026-09-04", 99_999, { lineName: "2호선" }),
    storedRow("2026-09-04", 99_999, { area: "hongdae" }),
    storedRow("2026-09-04", 99_999, { sourceId: "WRONG" }),
    storedRow("2026-09-04", 99_999, { mappingVersion: "old" }),
    storedRow("2026-09-04", 99_999, { recordOrigin: "MANUAL" }),
    storedRow("2026-09-04", 99_999, { qualityStatus: "INVALID" }),
    storedRow("2026-09-04", 99_999, { datasetId: "OA-WRONG" }),
    storedRow("2026-09-99", 99_999),
  ];
  const result = summarizeSubwayTrend("myeongdong", [
    ...wrongRows,
    storedRow(latestDate, 1_124),
    // D-6 must never be used as a nearest-date substitute for D-7.
    storedRow("2026-08-28", 1_000),
  ]);
  assert.ok(result);
  assert.equal(result.latest.referenceDate, latestDate);
  assert.equal(result.trend.sameWeekdayLastWeek, null);
  assert.equal(result.trend.observedDayCount, 2);
});

test("duplicate exact-date observations are discarded instead of choosing a conflicting value", () => {
  const result = summarizeSubwayTrend("myeongdong", [
    storedRow(latestDate, 9_999),
    storedRow(latestDate, 8_888),
    storedRow("2026-09-02", 1_000),
    storedRow("2026-09-01", 900),
  ]);
  assert.ok(result);
  assert.equal(result.latest.referenceDate, "2026-09-02");
  assert.equal(result.latest.alightingCount, 1_000);
  assert.equal(result.trend.previousDay?.baselineAlightingCount, 900);
});

test("an absent exact-scope latest row yields no ridership block", () => {
  assert.equal(summarizeSubwayTrend("myeongdong", []), null);
  assert.equal(summarizeSubwayTrend("myeongdong", [storedRow(latestDate, 100, { stationName: "홍대입구" })]), null);
});
