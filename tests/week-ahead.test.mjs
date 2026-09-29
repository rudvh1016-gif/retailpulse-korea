import assert from "node:assert/strict";
import test from "node:test";
import { buildWeekAhead } from "../lib/week-ahead.ts";
import { weekHeadline, weekItemLine } from "../lib/week-copy.ts";
import { buildBusinessPrep } from "../lib/business-prep.ts";
import { actionText } from "../lib/business-prep-copy.ts";
import { holidaysOn } from "../lib/holiday-calendar.ts";

const area = (overrides = {}) => ({ realtimeForecast: [], weather: [], events: [], eventCount: 0, ...overrides });
const summary = (overrides = {}) => ({ todayKst: "2026-09-28", serviceDateKst: "2026-09-28", dayRelation: "TODAY", holidays: [], areas: { myeongdong: area() }, airport: {}, ...overrides });
const place = { kind: "area", area: "myeongdong" };

test("the week names China's National Day once per day it covers, with its official period", () => {
  const week = buildWeekAhead(summary(), place, "2026-09-28");
  assert.deepEqual(week.days.map((day) => day.date), ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  const october = week.days.find((day) => day.date === "2026-10-01");
  const holiday = october.items.find((item) => item.kind === "HOLIDAY");
  assert.deepEqual([holiday.label, holiday.country, holiday.name, holiday.start, holiday.end], ["CONFIRMED", "CN", "国庆节", "2026-10-01", "2026-10-07"]);
  assert.equal(weekItemLine(holiday, "ko"), "중국 공휴일 · 국경절 (国庆节) 10/01–10/07");
  assert.equal(weekItemLine(holiday, "zh"), "中国假日 · 国庆节 10/01–10/07");
  assert.equal(week.days.filter((day) => day.weekend).map((day) => day.date).join(), "2026-10-03,2026-10-04");
});

test("Korean holidays are either checked or said to be unavailable", () => {
  assert.equal(buildWeekAhead(summary(), place, "2026-09-28").koreanHolidays, "UNAVAILABLE");
  const withKasi = buildWeekAhead(summary({ holidays: [
    { month: "2026-09", days: [], retrievedAt: "x" },
    { month: "2026-10", days: [{ date: "2026-10-03", name: "개천절" }], retrievedAt: "x" },
  ] }), place, "2026-09-28");
  assert.equal(withKasi.koreanHolidays, "CHECKED");
  assert.deepEqual(withKasi.days[5].items.filter((item) => item.country === "KR").map((item) => item.name), ["개천절"]);
});

test("weather appears only for days KMA has published; the rest say so", () => {
  const week = buildWeekAhead(summary({ areas: { myeongdong: area({ weather: [
    { targetAt: "2026-09-28T15:00:00+09:00", precipitationProbability: 20, issuedAt: "2026-09-28T14:00:00+09:00" },
    { targetAt: "2026-09-29T09:00:00+09:00", precipitationProbability: 70, issuedAt: "2026-09-28T14:00:00+09:00" },
  ] }) } }), place, "2026-09-28");
  assert.deepEqual(week.days.map((day) => day.items.find((item) => item.label !== "CONFIRMED")?.kind), ["RAIN", "RAIN", "FORECAST_NOT_PUBLISHED", "FORECAST_NOT_PUBLISHED", "FORECAST_NOT_PUBLISHED", "FORECAST_NOT_PUBLISHED", "FORECAST_NOT_PUBLISHED"]);
  assert.equal(week.days[1].items.find((item) => item.kind === "RAIN").percent, 70);
});

test("an event is listed once for the week, and none is said plainly", () => {
  const events = [
    { title: "가을 축제", eventStart: "2026-09-25", eventEnd: "2026-10-02", address: "서울 중구", retrievedAt: "2026-09-28T06:00:00Z", distanceM: 100 },
    { title: "먼 행사", eventStart: "2026-10-20", eventEnd: "2026-10-21", address: null, distanceM: 100 },
  ];
  const week = buildWeekAhead(summary({ areas: { myeongdong: area({ events }) } }), place, "2026-09-28");
  assert.equal(week.events.length, 1);
  assert.deepEqual(week.events[0].daysInWeek, ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  assert.deepEqual(buildWeekAhead(summary(), place, "2026-09-28").events, []);
});

test("the airport week has holidays but no area weather or events, and year-end says what is unpublished", () => {
  const airport = buildWeekAhead(summary(), { kind: "airport", terminal: "T1" }, "2026-09-28");
  assert.equal(airport.events, null);
  assert.equal(airport.weather, false);
  assert.ok(airport.days[3].items.some((item) => item.kind === "HOLIDAY" && item.country === "CN"));
  const yearEnd = buildWeekAhead(summary({ todayKst: "2026-12-28" }), place, "2026-12-28");
  assert.deepEqual(yearEnd.unpublished, ["CN"], "China's 2027 arrangement is not published; Japan's is");
});

test("a Chinese holiday on the service date becomes a prep action, a working day never does", () => {
  const holidayFor = (date) => holidaysOn(date).map((day) => ({ country: day.country, date, name: day.name, source: "test" }));
  const prep = buildBusinessPrep({ serviceDate: "2026-10-02", dayRelation: "FUTURE", nowIso: "2026-09-28T09:00:00+09:00", place, hours: null, holidays: holidayFor("2026-10-02") });
  const action = prep.actions.find((row) => row.rule === "HOLIDAY");
  assert.equal(actionText(action, "2026-10-02", null, "ko").body, "중국 공식 연휴 기간입니다: 국경절 (国庆节). 중국어 안내와 결제 수단을 확인해 보세요.");
  const working = buildBusinessPrep({ serviceDate: "2026-10-10", dayRelation: "FUTURE", nowIso: "2026-09-28T09:00:00+09:00", place, hours: null, holidays: holidayFor("2026-10-10") });
  assert.equal(working.actions.some((row) => row.rule === "HOLIDAY"), false);
});

test("the headline counts holidays per country and never turns missing Korean data into zero", () => {
  const unknown = buildWeekAhead(summary(), place, "2026-09-28");
  assert.equal(weekHeadline(unknown, "ko"), "이번 주 준비 (09/28–10/04) · 한국 공휴일 미확인 · 중국 공휴일 4일 · 행사 0건");
  assert.equal(weekHeadline(unknown, "en"), "The week ahead (09/28–10/04) · Korean holidays not yet known · China: 4 holiday day(s) · 0 event(s)");
  const checked = buildWeekAhead(summary({ holidays: [
    { month: "2026-09", days: [], retrievedAt: "x" },
    { month: "2026-10", days: [{ date: "2026-10-03", name: "개천절" }], retrievedAt: "x" },
  ] }), place, "2026-09-28");
  assert.equal(weekHeadline(checked, "ko"), "이번 주 준비 (09/28–10/04) · 한국 공휴일 1일 · 중국 공휴일 4일 · 행사 0건");
  const quiet = buildWeekAhead(summary({ todayKst: "2026-11-09", holidays: [{ month: "2026-11", days: [], retrievedAt: "x" }] }), place, "2026-11-09");
  assert.equal(weekHeadline(quiet, "ko"), "이번 주 준비 (11/09–11/15) · 확인된 공휴일 없음 · 행사 0건");
  assert.equal(weekHeadline(buildWeekAhead(summary(), { kind: "airport", terminal: "T1" }, "2026-09-28"), "zh"), "本周准备（09/28–10/04）· 韩国假日未确认 · 中国假日 4 天");
});
