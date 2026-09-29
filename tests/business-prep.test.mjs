import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_ACTIONS,
  buildBusinessPrep,
  kstIso,
  minutesOf,
  parseBusinessHours,
  prepWindow,
} from "../lib/business-prep.ts";

const at = (day, hour, minute = 0) => `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`;
const hours = (open, close) => ({ open, close });
const forecastRows = (day, from, to, level, issuedAt) => Array.from({ length: to - from }, (_, index) => ({
  targetAt: at(day, from + index), congestionLevel: typeof level === "function" ? level(from + index) : level, issuedAt,
}));
const weatherRows = (day, from, to, probability, temperature, issuedAt) => Array.from({ length: to - from }, (_, index) => ({
  targetAt: at(day, from + index),
  precipitationProbability: typeof probability === "function" ? probability(from + index) : probability,
  temperatureTenthC: temperature,
  issuedAt,
}));

test("hours are validated as KST HH:MM and nothing else", () => {
  assert.equal(minutesOf("00:00"), 0);
  assert.equal(minutesOf("23:30"), 1410);
  for (const bad of ["24:00", "9:00", "10:60", "", null, 900, "10:00:00"]) assert.equal(minutesOf(bad), null, String(bad));
  assert.deepEqual(parseBusinessHours({ open: "10:00", close: "22:00" }), { open: "10:00", close: "22:00" });
  for (const bad of [null, "10:00-22:00", {}, { open: "10:00" }, { open: "25:00", close: "22:00" }, { open: 10, close: 22 }]) {
    assert.equal(parseBusinessHours(bad), null, JSON.stringify(bad));
  }
});

test("the window follows the store's hours, including past midnight", () => {
  assert.deepEqual(prepWindow("2026-09-28", null), {
    startAt: at("2026-09-28", 0), endAt: at("2026-09-29", 0), wholeDay: true, crossesMidnight: false, startedYesterday: false,
  });
  assert.equal(prepWindow("2026-09-28", hours("09:00", "09:00")).wholeDay, true, "equal open and close is open all day");
  assert.deepEqual(prepWindow("2026-09-28", hours("10:30", "22:00")), {
    startAt: at("2026-09-28", 10, 30), endAt: at("2026-09-28", 22), wholeDay: false, crossesMidnight: false, startedYesterday: false,
  });
  assert.deepEqual(prepWindow("2026-09-28", hours("23:00", "02:00")), {
    startAt: at("2026-09-28", 23), endAt: at("2026-09-29", 2), wholeDay: false, crossesMidnight: true, startedYesterday: false,
  });
  // 01:00 on the 28th: the shift that opened at 23:00 on the 27th is the one running now.
  assert.deepEqual(prepWindow("2026-09-28", hours("23:00", "02:00"), at("2026-09-28", 1)), {
    startAt: at("2026-09-27", 23), endAt: at("2026-09-28", 2), wholeDay: false, crossesMidnight: true, startedYesterday: true,
  });
  assert.equal(prepWindow("2026-09-28", hours("23:00", "02:00"), at("2026-09-28", 3)).startedYesterday, false);
  assert.equal(kstIso(Date.parse("2026-09-28T15:00:00Z")), "2026-09-29T00:00:00+09:00");
});

test("a past date and a finished day never pretend to prepare", () => {
  const base = { serviceDate: "2026-09-27", nowIso: at("2026-09-28", 9), place: { kind: "area", area: "myeongdong" }, hours: null };
  assert.equal(buildBusinessPrep({ ...base, dayRelation: "PAST" }).status, "PAST");
  const ended = buildBusinessPrep({ ...base, serviceDate: "2026-09-28", dayRelation: "TODAY", nowIso: at("2026-09-28", 22, 30), hours: hours("10:00", "22:00") });
  assert.equal(ended.status, "ENDED");
  assert.deepEqual(ended.actions, []);
});

test("busy official bands and rain inside the hours become at most three ranked actions", () => {
  const day = "2026-09-28", issued = at(day, 8, 55);
  const prep = buildBusinessPrep({
    serviceDate: day, dayRelation: "TODAY", nowIso: at(day, 9, 10), place: { kind: "area", area: "myeongdong" }, hours: hours("10:00", "20:00"),
    forecast: forecastRows(day, 9, 21, (hour) => (hour >= 17 && hour < 19 ? 4 : 2), issued),
    weather: weatherRows(day, 9, 24, (hour) => (hour === 15 ? 60 : 20), 210, at(day, 8)),
    events: [{ title: "명동 거리 축제", eventStart: "2026-09-27", eventEnd: "2026-09-30" }],
    eventsRetrievedAt: at(day, 6),
    holidays: [{ country: "CN", date: day, name: "国庆节", source: "gov.cn" }],
  });
  assert.equal(prep.status, "ACTIONS");
  assert.equal(prep.hourlyStatus, "ACTIONS");
  assert.deepEqual(prep.actions.map((action) => action.rule), ["CROWD", "RAIN", "HOLIDAY"]);
  assert.equal(prep.actions.length, MAX_ACTIONS, "the event is a fact, but a fourth action is never shown");
  assert.deepEqual(prep.actions[0], {
    rule: "CROWD", source: "SEOUL_FORECAST", value: { kind: "LEVEL", level: 4 },
    startAt: at(day, 17), endAt: at(day, 19), issuedAt: issued,
  });
  assert.deepEqual([prep.actions[1].startAt, prep.actions[1].endAt], [at(day, 15), at(day, 16)]);
  assert.ok(prep.facts.some((fact) => fact.kind === "EVENTS" && fact.count === 1));
  assert.ok(prep.facts.some((fact) => fact.kind === "TEMPERATURE_RANGE" && fact.minC === 21 && fact.maxC === 21));
});

test("bands outside the hours never trigger an action", () => {
  const day = "2026-09-28";
  const prep = buildBusinessPrep({
    serviceDate: day, dayRelation: "TODAY", nowIso: at(day, 9), place: { kind: "area", area: "hongdae" }, hours: hours("10:00", "16:00"),
    forecast: forecastRows(day, 9, 21, (hour) => (hour >= 18 ? 4 : 2), at(day, 8, 55)),
    weather: weatherRows(day, 9, 24, (hour) => (hour >= 18 ? 90 : 10), 200, at(day, 8)),
  });
  assert.deepEqual(prep.actions, []);
  assert.equal(prep.status, "NO_CHANGE", "both sources cover 10–16 fully and nothing fired inside it");
});

test("a forecast that stops before closing is partial, never 'no change'", () => {
  const day = "2026-09-28";
  const prep = buildBusinessPrep({
    serviceDate: day, dayRelation: "TODAY", nowIso: at(day, 9), place: { kind: "area", area: "seongsu" }, hours: hours("10:00", "23:00"),
    forecast: forecastRows(day, 9, 21, 2, at(day, 8, 55)),
    weather: weatherRows(day, 9, 24, 10, 200, at(day, 8)),
  });
  assert.equal(prep.status, "PARTIAL");
  const seoul = prep.coverage.find((entry) => entry.source === "SEOUL_FORECAST");
  assert.deepEqual([seoul.status, seoul.coveredStartAt, seoul.coveredEndAt], ["PARTIAL", at(day, 10), at(day, 21)]);
});

test("stale rows are neither facts nor 'no change'", () => {
  const day = "2026-09-28";
  const prep = buildBusinessPrep({
    serviceDate: day, dayRelation: "TODAY", nowIso: at(day, 14), place: { kind: "area", area: "itaewon" }, hours: hours("14:00", "18:00"),
    forecast: forecastRows(day, 14, 18, 4, at(day, 9)),
    weather: weatherRows(day, 14, 24, 10, 200, at(day, 11)),
  });
  assert.equal(prep.coverage.find((entry) => entry.source === "SEOUL_FORECAST").status, "STALE");
  assert.equal(prep.facts.some((fact) => fact.kind === "CROWD_MAX"), false);
  assert.equal(prep.actions.some((action) => action.rule === "CROWD"), false, "a five-hour-old forecast does not raise a crowd action");
  assert.equal(prep.status, "PARTIAL");
});

test("nothing at all is 'insufficient', never 'no change'", () => {
  const prep = buildBusinessPrep({ serviceDate: "2026-09-28", dayRelation: "TODAY", nowIso: at("2026-09-28", 9), place: { kind: "area", area: "itaewon" }, hours: null });
  assert.equal(prep.status, "INSUFFICIENT");
  assert.deepEqual(prep.coverage.map((entry) => entry.status), ["NONE", "NONE"]);
});

test("tomorrow says the Seoul forecast is not out yet instead of calling it missing", () => {
  const day = "2026-09-29";
  const prep = buildBusinessPrep({
    serviceDate: day, dayRelation: "FUTURE", nowIso: at("2026-09-28", 20), place: { kind: "area", area: "myeongdong" }, hours: hours("10:00", "20:00"),
    weather: weatherRows(day, 0, 24, 10, 200, at("2026-09-28", 17)),
  });
  assert.equal(prep.coverage.find((entry) => entry.source === "SEOUL_FORECAST").status, "NOT_YET_PUBLISHED");
  assert.equal(prep.status, "NO_CHANGE");
});

test("a late shift reads tomorrow's early rows", () => {
  const day = "2026-09-28";
  const prep = buildBusinessPrep({
    serviceDate: day, dayRelation: "TODAY", nowIso: at(day, 20), place: { kind: "area", area: "hongdae" }, hours: hours("22:00", "03:00"),
    forecast: forecastRows(day, 20, 24, 2, at(day, 19, 55)).concat(forecastRows("2026-09-29", 0, 8, (hour) => (hour === 1 ? 4 : 2), at(day, 19, 55))),
    weather: weatherRows(day, 20, 24, 0, 150, at(day, 17)).concat(weatherRows("2026-09-29", 0, 12, 0, 150, at(day, 17))),
  });
  assert.equal(prep.window.crossesMidnight, true);
  assert.deepEqual(prep.actions.map((action) => [action.rule, action.startAt]), [["CROWD", at("2026-09-29", 1)]]);
});

test("the airport ranks its own peak band and totals only complete coverage", () => {
  const day = "2026-09-28";
  const band = (hour, count) => ({ targetStartAt: at(day, hour), targetEndAt: at(day, hour + 1), expectedPassengers: count });
  const bands = [band(6, 3000), band(7, 4200), band(8, 4667), band(9, 3900), band(10, 3100)];
  const complete = buildBusinessPrep({
    serviceDate: day, dayRelation: "TODAY", nowIso: at(day, 5, 30), place: { kind: "airport", terminal: "T1" }, hours: hours("06:00", "10:00"),
    airport: { bands, coverage: "COMPLETE", retrievedAt: at("2026-09-27", 18) },
  });
  assert.deepEqual(complete.actions.map((action) => [action.rule, action.startAt, action.value]), [["AIRPORT_PEAK", at(day, 8), { kind: "PASSENGERS", count: 4667 }]]);
  assert.deepEqual(complete.facts.find((fact) => fact.kind === "AIRPORT_TOTAL"), {
    kind: "AIRPORT_TOTAL", count: 3000 + 4200 + 4667 + 3900, bands: 4, startAt: at(day, 6), endAt: at(day, 10), issuedAt: at("2026-09-27", 18),
  });
  const partial = buildBusinessPrep({
    serviceDate: day, dayRelation: "TODAY", nowIso: at(day, 5, 30), place: { kind: "airport", terminal: "T1" }, hours: hours("06:00", "10:00"),
    airport: { bands, coverage: "PARTIAL", retrievedAt: at("2026-09-27", 18) },
  });
  assert.equal(partial.facts.some((fact) => fact.kind === "AIRPORT_TOTAL"), false, "a total over partial coverage could hide the real peak");
  assert.equal(partial.coverage[0].status, "PARTIAL");
});

test("no value this module emits can be read as visitors, sales, staff or nationality", () => {
  const source = readFileSync("lib/business-prep.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const word of ["visitor", "sales", "revenue", "staffCount", "headcount", "nationality", "customers"]) {
    assert.doesNotMatch(source, new RegExp(word, "i"), word);
  }
});

test("a date-wide action never hides that the hours could not be judged", () => {
  const day = "2026-09-28";
  const prep = buildBusinessPrep({
    serviceDate: day, dayRelation: "TODAY", nowIso: at(day, 9), place: { kind: "area", area: "myeongdong" }, hours: hours("10:00", "16:00"),
    events: [{ title: "행사", eventStart: day, eventEnd: day }],
  });
  assert.deepEqual(prep.actions.map((action) => action.rule), ["EVENT"]);
  assert.equal(prep.status, "ACTIONS");
  assert.equal(prep.hourlyStatus, "INSUFFICIENT");
});
