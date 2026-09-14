import assert from "node:assert/strict";
import test from "node:test";
import { buildMonthToDate, datesBetween, monthStartOf, previousMonthSameDay, summarizeRange } from "../lib/airport-mtd";
import { comparisonValue } from "../lib/period-comparison";
import type { AirportForecastAggregateRow } from "../lib/airport-today-summary";

/** One COMPLETE day for one terminal: 24 contiguous hourly bands covering the KST day. */
function completeDay(date: string, terminal: string, perBand: number): AirportForecastAggregateRow[] {
  const next = datesBetween(date, date).length ? new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : date;
  return Array.from({ length: 24 }, (_, hour) => ({
    terminal,
    direction: "departure",
    isAggregate: 1,
    targetDate: date,
    timeBandRaw: `${hour}`,
    targetStartAt: `${date}T${String(hour).padStart(2, "0")}:00:00+09:00`,
    targetEndAt: hour === 23 ? `${next}T00:00:00+09:00` : `${date}T${String(hour + 1).padStart(2, "0")}:00:00+09:00`,
    expectedPassengers: perBand,
    retrievedAt: `${date}T09:00:00+09:00`,
  })) as unknown as AirportForecastAggregateRow[];
}

function bothTerminals(date: string, t1: number, t2: number) {
  return [...completeDay(date, "T1", t1), ...completeDay(date, "T2", t2)];
}

function index(days: Record<string, AirportForecastAggregateRow[]>) {
  return new Map(Object.entries(days));
}

/** 9/1–9/13 all complete: T1 100/band, T2 50/band → 2,400 + 1,200 per day. */
function september(through = 13) {
  const rows: Record<string, AirportForecastAggregateRow[]> = {};
  for (const date of datesBetween("2026-09-01", `2026-09-${String(through).padStart(2, "0")}`)) {
    rows[date] = bothTerminals(date, 100, 50);
  }
  return rows;
}

function august(through = 13, t1 = 90, t2 = 45) {
  const rows: Record<string, AirportForecastAggregateRow[]> = {};
  for (const date of datesBetween("2026-08-01", `2026-08-${String(through).padStart(2, "0")}`)) {
    rows[date] = bothTerminals(date, t1, t2);
  }
  return rows;
}

test("MTD spans month start to the selected day, and nothing else", () => {
  const rows = index({ ...august(31), ...september(30) });
  const mtd = buildMonthToDate(rows, "2026-09-13", "all");
  assert.equal(mtd.current.start, "2026-09-01");
  assert.equal(mtd.current.end, "2026-09-13");
  assert.equal(mtd.current.expectedDays, 13);
  // 13 days x (24x100 + 24x50) = 13 x 3,600
  assert.equal(mtd.current.total, 13 * 3600);
  // August rows exist in the same index and must not leak into September.
  assert.equal(mtd.current.days.length, 13);
  assert.ok(mtd.current.days.every((day) => day.date.startsWith("2026-09-")));
  // Future days of the month are not part of "to date".
  assert.ok(!mtd.current.days.some((day) => day.date > "2026-09-13"));
});

test("changing the selected day moves both ranges together", () => {
  const rows = index({ ...august(31), ...september(30) });
  const eighth = buildMonthToDate(rows, "2026-09-08", "all");
  assert.equal(eighth.current.start, "2026-09-01");
  assert.equal(eighth.current.end, "2026-09-08");
  assert.equal(eighth.current.expectedDays, 8);
  assert.equal(eighth.previous?.start, "2026-08-01");
  assert.equal(eighth.previous?.end, "2026-08-08");
  assert.equal(eighth.previous?.expectedDays, 8);
});

test("the previous range is the same span of the previous month", () => {
  const mtd = buildMonthToDate(index({ ...august(13), ...september(13) }), "2026-09-13", "all");
  assert.equal(mtd.previous?.start, "2026-08-01");
  assert.equal(mtd.previous?.end, "2026-08-13");
  assert.equal(mtd.previous?.total, 13 * (24 * 90 + 24 * 45));
  assert.equal(mtd.current.expectedDays, mtd.previous?.expectedDays);
});

test("growth is computed from the two totals and rounds the way every other comparison does", () => {
  const mtd = buildMonthToDate(index({ ...august(13), ...september(13) }), "2026-09-13", "all");
  // current 46,800 vs previous 42,120 → +11.1%
  assert.equal(mtd.current.total, 46800);
  assert.equal(mtd.previous?.total, 42120);
  assert.ok(mtd.change);
  assert.equal(comparisonValue(mtd.change!), "+11.1%");
});

test("a real but sub-resolution change keeps its direction instead of reading as flat", () => {
  // previous 42,120; current one passenger higher over the whole month.
  const rows = index({ ...august(13), ...september(13) });
  const mtd = buildMonthToDate(rows, "2026-09-13", "all");
  const tiny = { ...mtd.change!, minPercent: 0.002, maxPercent: 0.002 };
  assert.equal(comparisonValue(tiny), "<+0.1%");
});

test("scopes are isolated: T1 and T2 each sum only their own rows", () => {
  const rows = index(september(13));
  assert.equal(buildMonthToDate(rows, "2026-09-13", "T1").current.total, 13 * 24 * 100);
  assert.equal(buildMonthToDate(rows, "2026-09-13", "T2").current.total, 13 * 24 * 50);
  assert.equal(buildMonthToDate(rows, "2026-09-13", "all").current.total, 13 * 24 * 150);
});

test("one missing day never becomes a complete month, and is never counted as zero", () => {
  const days = september(13);
  delete days["2026-09-06"];
  const mtd = buildMonthToDate(index(days), "2026-09-13", "all");
  assert.equal(mtd.current.status, "PARTIAL");
  assert.equal(mtd.current.total, null, "a partial span publishes no total");
  assert.equal(mtd.current.completeDays, 12);
  assert.equal(mtd.current.expectedDays, 13);
  assert.deepEqual(mtd.current.missingDates, ["2026-09-06"]);
  assert.equal(mtd.current.days.find((day) => day.date === "2026-09-06")?.total, null);
  assert.equal(mtd.change, null, "an incomplete span is never compared");
});

test("an incomplete DAY (a missing hour) is incomplete, not a smaller day", () => {
  const days = september(13);
  days["2026-09-06"] = [...completeDay("2026-09-06", "T1", 100).slice(0, 23), ...completeDay("2026-09-06", "T2", 50)];
  const mtd = buildMonthToDate(index(days), "2026-09-13", "all");
  assert.equal(mtd.current.status, "PARTIAL");
  assert.equal(mtd.current.days.find((day) => day.date === "2026-09-06")?.total, null);
});

test("one terminal complete does not make the all-airport day complete", () => {
  const days = september(13);
  days["2026-09-06"] = completeDay("2026-09-06", "T1", 100);
  const all = buildMonthToDate(index(days), "2026-09-13", "all");
  const t1 = buildMonthToDate(index(days), "2026-09-13", "T1");
  assert.equal(all.current.status, "PARTIAL");
  assert.equal(t1.current.status, "COMPLETE", "T1 itself is complete on every day");
});

test("comparison is withheld when only the previous span is incomplete", () => {
  const augustDays = august(13);
  delete augustDays["2026-08-05"];
  const mtd = buildMonthToDate(index({ ...augustDays, ...september(13) }), "2026-09-13", "all");
  assert.equal(mtd.current.status, "COMPLETE");
  assert.equal(mtd.previous?.status, "PARTIAL");
  assert.equal(mtd.previous?.total, null);
  assert.equal(mtd.change, null, "a complete month is not compared against a partial one");
});

test("a zero previous total yields no percentage rather than Infinity or NaN", () => {
  const augustDays: Record<string, AirportForecastAggregateRow[]> = {};
  for (const date of datesBetween("2026-08-01", "2026-08-13")) augustDays[date] = bothTerminals(date, 0, 0);
  const mtd = buildMonthToDate(index({ ...augustDays, ...september(13) }), "2026-09-13", "all");
  assert.equal(mtd.previous?.total, 0);
  assert.equal(mtd.previous?.status, "COMPLETE");
  assert.equal(mtd.change, null);
});

test("31 March has no 31 February: the comparison is withheld and says why", () => {
  assert.equal(previousMonthSameDay("2026-03-31"), null);
  assert.equal(previousMonthSameDay("2026-03-28"), "2026-02-28");
  assert.equal(previousMonthSameDay("2026-01-15"), "2025-12-15");
  const mtd = buildMonthToDate(new Map(), "2026-03-31", "all");
  assert.equal(mtd.previous, null);
  assert.equal(mtd.previousAbsentReason, "NO_SUCH_DAY");
  assert.equal(mtd.change, null);
});

test("no rows at all is UNAVAILABLE, not a zero month", () => {
  const mtd = buildMonthToDate(new Map(), "2026-09-13", "all");
  assert.equal(mtd.current.status, "UNAVAILABLE");
  assert.equal(mtd.current.total, null);
  assert.equal(mtd.current.completeDays, 0);
});

test("month arithmetic is calendar-correct across year and leap boundaries", () => {
  assert.equal(monthStartOf("2026-09-13"), "2026-09-01");
  assert.equal(datesBetween("2026-09-01", "2026-09-13").length, 13);
  assert.equal(previousMonthSameDay("2024-03-29"), "2024-02-29", "2024 is a leap year");
  assert.equal(previousMonthSameDay("2026-03-29"), null, "2026 February has 28 days");
  assert.deepEqual(summarizeRange(new Map(), "2026-09-13", "2026-09-01", "all").days, [], "a reversed span is empty");
});
