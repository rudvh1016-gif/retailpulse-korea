import assert from "node:assert/strict";
import test from "node:test";
import { INDUSTRY_CATEGORIES, buildWeeklyReview } from "../lib/weekly-review.ts";
import { FEELING_KEEP_DAYS, FEELING_LIMIT, parseFeelings, recordFeeling, removeFeeling } from "../lib/feeling-log.ts";
import { PREP_STATUSES, safeAnalyticsParams } from "../lib/personal-analytics.ts";
import { readFileSync } from "node:fs";

const place = { kind: "area", area: "myeongdong" };
const summary = {
  todayKst: "2026-09-28", serviceDateKst: "2026-09-28", dayRelation: "TODAY",
  areas: { myeongdong: {
    context: { commercialAt: "2026-09-28T14:05:00+09:00", categories: [
      { group: "생활", category: "화장품", level: "분주한", payments: 311, amountMin: 1, amountMax: 2 },
      { group: "음식", category: "한식", level: "한산", payments: 15, amountMin: 1, amountMax: 2 },
    ], weather: null },
    subwayRidership: { referenceDate: "2026-09-27", selectedStations: "명동", trend: { sameWeekdayLastWeek: { changeTenthsPercent: 124 }, fourWeekSameWeekdayAverage: { changeTenthsPercent: -31 } } },
    sales: { quarterCode: "20252" }, storeDynamics: { quarterCode: "20252" },
  } },
  airport: { periodComparisons: { T1: { 7: { passengers: { baselineAt: "x", minPercent: 5, maxPercent: 5 }, flightRecords: null } } } },
};
const usual = {
  current: { observedAt: "2026-09-28T14:05:00+09:00", min: 30000, max: 32000, level: 3 },
  weeks: [
    { weekOffset: 1, date: "2026-09-21", status: "VALID", min: 20000, max: 24000 },
    { weekOffset: 2, date: "2026-09-14", status: "VALID", min: 29000, max: 33000 },
    { weekOffset: 3, date: "2026-09-07", status: "MISSING", min: null, max: null },
    { weekOffset: 4, date: "2026-08-31", status: "HOLIDAY", min: null, max: null },
  ],
};

test("the weekly review reads mapped categories and names what it cannot compare", () => {
  const review = buildWeeklyReview(summary, place, "beauty", usual);
  assert.deepEqual(review.population.map((row) => [row.weeks, row.verdict, row.status]), [[1, "HIGHER", "VALID"], [2, "OVERLAPS", "VALID"], [4, null, "HOLIDAY"]]);
  assert.deepEqual(review.categories.rows, [{ category: "화장품", level: "분주한" }], "only the beauty mapping is read");
  assert.deepEqual([review.subway.lastWeekTenths, review.subway.fourWeekTenths], [124, -31]);
  assert.deepEqual(review.quarterly, { salesQuarter: "20252", storeQuarter: "20252" });
  assert.deepEqual(buildWeeklyReview(summary, place, "popup", usual).categories.mapped, [], "pop-ups have no Seoul category and say so");
  assert.equal(buildWeeklyReview(summary, place, "beauty", null).population.every((row) => row.status === "UNAVAILABLE"), true);
});

test("the airport review uses its own 7- and 28-day comparisons only", () => {
  const review = buildWeeklyReview(summary, { kind: "airport", terminal: "T1" }, "beauty", null);
  assert.equal(review.population, null);
  assert.equal(review.categories, null);
  assert.deepEqual(review.airport.passengers[7], { baselineAt: "x", minPercent: 5, maxPercent: 5 });
  assert.equal(review.airport.flights[7], null);
});

test("the review copy never calls card activity sales and never trends a quarter", () => {
  const copy = readFileSync("lib/review-copy.ts", "utf8");
  assert.match(copy, /매출이나 외국인 매출이 아니며/);
  assert.match(copy, /분기 통계 \(주간 추세 아님\)/);
  for (const categories of Object.values(INDUSTRY_CATEGORIES)) for (const name of categories) assert.ok(name.length > 1);
});

test("feelings are strict, bounded, editable and never in the future", () => {
  const today = "2026-09-28";
  let entries = recordFeeling([], { date: today, place: "area:myeongdong", industry: "beauty", feeling: "BUSIER" }, today);
  entries = recordFeeling(entries, { date: today, place: "area:myeongdong", industry: "beauty", feeling: "USUAL" }, today);
  assert.deepEqual(entries, [{ date: today, place: "area:myeongdong", industry: "beauty", feeling: "USUAL" }], "the same day is edited, not duplicated");
  assert.throws(() => recordFeeling(entries, { date: "2026-09-29", place: "area:myeongdong", industry: "beauty", feeling: "USUAL" }, today), /invalid_feeling/);
  assert.throws(() => recordFeeling(entries, { date: today, place: "area:myeongdong", industry: "beauty", feeling: "USUAL", note: "free text" }, today), /invalid_feeling/);
  assert.deepEqual(removeFeeling(entries, today, "area:myeongdong", "beauty"), []);
  const old = { date: "2026-06-01", place: "area:hongdae", industry: "food", feeling: "QUIETER" };
  assert.deepEqual(parseFeelings(JSON.stringify([old, ...entries, { bad: true }]), today), entries, `older than ${FEELING_KEEP_DAYS} days is dropped`);
  const many = Array.from({ length: FEELING_LIMIT + 10 }, (_, index) => ({ date: new Date(Date.parse("2026-07-01T00:00:00Z") + index * 86_400_000).toISOString().slice(0, 10), place: "airport:T1", industry: "beauty", feeling: "USUAL" }));
  assert.equal(parseFeelings(JSON.stringify(many), today).length, FEELING_LIMIT);
  assert.deepEqual(parseFeelings("{", today), []);
});

test("business analytics carries enumerated values only", () => {
  assert.deepEqual(safeAnalyticsParams({ language: "ko", location: "airport", day: "today", prep_status: "INSUFFICIENT", hours: "10:00-22:00", store: "명동점", note: "x" }),
    { location: "airport", day: "today", language: "ko", prep_status: "INSUFFICIENT" });
  assert.deepEqual(safeAnalyticsParams({ prep_status: "SOMETHING" }), {});
  assert.deepEqual([...PREP_STATUSES], ["ACTIONS", "NO_CHANGE", "PARTIAL", "INSUFFICIENT", "ENDED", "PAST"]);
});
