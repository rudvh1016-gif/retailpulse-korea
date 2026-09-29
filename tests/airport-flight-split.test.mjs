import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { summarizeGateSides } from "../lib/airport-sides.ts";
import { airportSides } from "../lib/airport-sides-summary.ts";
import { flightSplitOf, sharePercents, splitByRatio, splitFromSummary } from "../lib/airport-flight-split.ts";
import { estimateBody, estimateSentence, flightSentence, flightsBody, hourBody, sharesBody, splitCopy } from "../lib/airport-flight-split-copy.ts";
import { buildBusinessPrep, prepInputFromSummary } from "../lib/business-prep.ts";
import { factLine } from "../lib/business-prep-copy.ts";
import { buildShareDocument, shareLink, shareText } from "../lib/prep-share.ts";

const DATE = "2026-09-29";
const NOW = "2026-09-29T10:00:00+09:00";
let seq = 0;
const flight = (terminal, gate, time, extra = {}) => ({ physicalFlightId: `F${++seq}`, terminal, gate, scheduledAt: `${DATE}T${time}:00+09:00`, status: "scheduled", retrievedAt: "2026-09-29T00:57:00Z", ...extra });
const many = (n, terminal, gate, time) => Array.from({ length: n }, () => flight(terminal, gate, time));
// T2 east gates 274, west gates 231 (both officially named), unverified 208 (between the bounds), a no-gate flight.
const T2_EXAMPLE = [...many(120, "T2", "274", "09:10"), ...many(80, "T2", "231", "09:40"), ...many(20, "T2", "208", "09:50")];
const day = (rows) => summarizeGateSides(rows, DATE);

test("the example: 120 east, 80 west, 20 unconfirmed → 60/40, 9.1% unconfirmed, 40,000 splits 24,000 / 16,000", () => {
  const split = flightSplitOf(day(T2_EXAMPLE), "T2", "COLLECTED_FLIGHT_RECORDS", 40_000);
  assert.deepEqual([split.total, split.east, split.west, split.center, split.unverified, split.verified], [220, 120, 80, 0, 20, 200]);
  assert.deepEqual([split.eastPct, split.westPct, split.unverifiedPct, split.larger], [60, 40, 9.1, "EAST"]);
  assert.deepEqual(split.expected, { total: 40_000, east: 24_000, west: 16_000 });
  assert.equal(flightsBody(split, "ko"), "동편 120편 60% · 서편 80편 40% · 중앙 0편 · 위치 미확인 20편(전체의 9.1%)");
  assert.equal(sharesBody(split, "ko"), "동·서 위치가 확인된 항공편 기준 (200편): 동편 60% · 서편 40% (동편이 더 많음)");
  assert.equal(estimateBody({ terminal: "T2", ...split.expected }, "ko"), "동편 약 24,000명 · 서편 약 16,000명");
});

test("west larger, and equal", () => {
  const west = flightSplitOf(day([...many(3, "T2", "274", "09:00"), ...many(9, "T2", "231", "09:00")]), "T2", "COLLECTED_FLIGHT_RECORDS", 1200);
  assert.deepEqual([west.eastPct, west.westPct, west.larger, west.expected.east, west.expected.west], [25, 75, "WEST", 300, 900]);
  const equal = flightSplitOf(day([...many(5, "T2", "274", "09:00"), ...many(5, "T2", "231", "09:00")]), "T2", "COLLECTED_FLIGHT_RECORDS", 1001);
  assert.deepEqual([equal.eastPct, equal.westPct, equal.larger], [50, 50, "EQUAL"]);
  assert.equal(equal.expected.east + equal.expected.west, 1001, "an odd total still adds up exactly");
  assert.match(sharesBody(equal, "ko"), /동·서 같음/);
});

test("centre and unconfirmed flights stay out of the denominator and are named beside the ratio", () => {
  const rows = [...many(6, "T1", "9", "09:00"), ...many(2, "T1", "29", "09:00"), ...many(4, "T1", "27", "09:00"), ...many(10, "T1", "13", "09:00"), flight("T1", "", "09:30")];
  const split = flightSplitOf(day(rows), "T1", "COLLECTED_FLIGHT_RECORDS", 8000);
  assert.deepEqual([split.total, split.east, split.west, split.center, split.unverified], [23, 6, 2, 4, 11]);
  assert.deepEqual([split.eastPct, split.westPct], [75, 25], "6 : 2, not 6 : 23");
  assert.deepEqual(split.expected, { total: 8000, east: 6000, west: 2000 });
  assert.equal(split.unverifiedPct, 47.8);
  assert.match(flightsBody(split, "ko"), /중앙 4편 · 위치 미확인 11편\(전체의 47\.8%\)/);
});

test("a side with no flights, or no confirmed flight at all", () => {
  const westless = flightSplitOf(day(many(7, "T2", "274", "09:00")), "T2", "COLLECTED_FLIGHT_RECORDS", 500);
  assert.deepEqual([westless.eastPct, westless.westPct, westless.expected.east, westless.expected.west], [100, 0, 500, 0]);
  const none = flightSplitOf(day(many(7, "T2", "208", "09:00")), "T2", "COLLECTED_FLIGHT_RECORDS", 500);
  assert.deepEqual([none.eastPct, none.westPct, none.larger, none.expected], [null, null, null, null], "nothing is assigned by force");
  assert.match(sharesBody(none, "ko"), /비율을 계산하지 않았습니다/);
  assert.equal(flightSplitOf(day(many(3, "T1", "9", "09:00")), "T2", "COLLECTED_FLIGHT_RECORDS", 500), null, "another terminal's flights never count");
});

test("rounding: the two estimates always add up to the terminal total", () => {
  for (let total = 0; total < 400; total += 7) {
    for (const [east, west] of [[1, 2], [1, 6], [7, 13], [5, 5], [1, 0], [0, 4], [333, 334]]) {
      const parts = splitByRatio(total, east, west);
      assert.equal(parts.east + parts.west, total, `${total} ${east}:${west}`);
      assert.ok(parts.east >= 0 && parts.west >= 0);
    }
  }
  for (const [east, west] of [[1, 2], [2, 1], [1, 6], [333, 334]]) {
    const shares = sharePercents(east, west);
    assert.equal(shares.eastPct + shares.westPct, 100);
  }
  assert.equal(splitByRatio(100, 0, 0), null);
});

test("hourly lines carry counts, shares and the unconfirmed ones", () => {
  const rows = [...many(8, "T2", "274", "08:10"), ...many(4, "T2", "231", "08:40"), ...many(11, "T2", "274", "09:10"), ...many(7, "T2", "231", "09:20"), flight("T2", "208", "09:30"), ...many(6, "T2", "274", "10:00"), ...many(12, "T2", "231", "10:05")];
  const split = flightSplitOf(day(rows), "T2", "COLLECTED_FLIGHT_RECORDS", null);
  assert.equal(hourBody(split.hours[0], "ko"), "08–09시 · 동 8편 / 서 4편 (동 67% · 서 33%)");
  assert.equal(hourBody(split.hours[1], "ko"), "09–10시 · 동 11편 / 서 7편 (동 61% · 서 39%) · 미확인 1");
  assert.equal(hourBody(split.hours[2], "en"), "10:00–11:00 · E 6 / W 12 (E 33% · W 67%)");
  assert.equal(split.expected, null, "no terminal-wide figure → no estimate");
});

// --- from a live summary -------------------------------------------------

const band = (hour) => ({ targetStartAt: `${DATE}T${String(hour).padStart(2, "0")}:00:00+09:00`, targetEndAt: `${DATE}T${String(hour + 1).padStart(2, "0")}:00:00+09:00`, expectedPassengers: 1000 });
const summaryFor = ({ rows = T2_EXAMPLE, coverage = "COMPLETE", bands = Array.from({ length: 24 }, (_, hour) => band(hour)), retrieved = "2026-09-29T09:42:00Z", relation = "TODAY", airportDate = DATE, sidesRows = rows } = {}) => ({
  serviceDateKst: DATE, dayRelation: relation, areas: {},
  airport: {
    serviceDateKst: airportDate,
    passengerForecastTimelineByTerminal: { T2: bands, T1: [] },
    forecastCoverage: { all: coverage, byTerminal: { T2: coverage, T1: "UNAVAILABLE" } },
    passengerForecastRetrievedAtByTerminal: { T2: retrieved, T1: null },
    sides: airportSides(DATE, relation, [], sidesRows, [], false, false),
  },
});
const sidesOf = (summary) => summary.airport.sides;

test("from a summary: the terminal-wide expected departures are used only when complete, current and for this date", () => {
  const ok = splitFromSummary(summaryFor(), sidesOf(summaryFor()), "T2", NOW);
  assert.equal(ok.status, "OK");
  assert.deepEqual(ok.split.expected, { total: 24_000, east: 14_400, west: 9_600 });
  const partial = summaryFor({ coverage: "PARTIAL" });
  assert.equal(splitFromSummary(partial, sidesOf(partial), "T2", NOW).split.expected, null, "an incomplete day is never summed");
  const none = summaryFor({ bands: [] });
  assert.equal(splitFromSummary(none, sidesOf(none), "T2", NOW).split.expected, null);
  const oldForecast = summaryFor({ retrieved: "2026-09-27T00:00:00Z" });
  assert.equal(splitFromSummary(oldForecast, sidesOf(oldForecast), "T2", NOW).split.expected, null, "an old forecast gives no estimate but keeps the flight comparison");
  const otherDay = summaryFor({ airportDate: "2026-09-28" });
  assert.equal(splitFromSummary(otherDay, sidesOf(otherDay), "T2", NOW).split.expected, null, "another date's forecast is never used");
  assert.equal(splitFromSummary(otherDay, sidesOf(otherDay), "T2", NOW).status, "OK");
});

test("from a summary: old flight records, a missing block or an empty terminal show no comparison", () => {
  const old = summaryFor({ rows: T2_EXAMPLE.map((row) => ({ ...row, retrievedAt: "2026-09-26T23:00:00Z" })) });
  assert.equal(splitFromSummary(old, sidesOf(old), "T2", NOW).status, "STALE");
  const oldPast = { ...old, dayRelation: "PAST" };
  assert.equal(splitFromSummary(oldPast, sidesOf(oldPast), "T2", NOW).status, "OK", "a finished day is history, not stale");
  assert.equal(splitFromSummary(summaryFor(), null, "T2", NOW).status, "NONE");
  assert.equal(splitFromSummary(summaryFor(), sidesOf(summaryFor()), "T1", NOW).status, "NO_TERMINAL_FLIGHTS");
  const mismatch = { ...summaryFor(), serviceDateKst: "2026-09-30" };
  assert.equal(splitFromSummary(mismatch, sidesOf(mismatch), "T2", NOW).status, "DATE_MISMATCH");
});

test("tomorrow: the official schedule is compared the same way", () => {
  const tomorrow = "2026-09-30";
  const schedule = [
    ...Array.from({ length: 6 }, (_, i) => ({ physicalFlightId: `E${i}`, terminal: "T2", gate: "274", scheduledTime: "09:10", status: "scheduled" })),
    ...Array.from({ length: 2 }, (_, i) => ({ physicalFlightId: `W${i}`, terminal: "T2", gate: "231", scheduledTime: "09:30", status: "scheduled" })),
  ];
  const sides = airportSides(tomorrow, "FUTURE", [], [], schedule, true, false, "2026-09-29T01:00:00Z");
  const summary = { serviceDateKst: tomorrow, dayRelation: "FUTURE", airport: { serviceDateKst: tomorrow, passengerForecastTimelineByTerminal: { T2: Array.from({ length: 24 }, (_, h) => ({ ...band(h), targetStartAt: band(h).targetStartAt.replace(DATE, tomorrow), targetEndAt: band(h).targetEndAt.replace(DATE, tomorrow), expectedPassengers: 400 })) }, forecastCoverage: { all: "COMPLETE", byTerminal: { T2: "COMPLETE" } }, passengerForecastRetrievedAtByTerminal: { T2: "2026-09-29T09:42:00Z" }, sides } };
  const result = splitFromSummary(summary, sides, "T2", NOW);
  assert.equal(result.status, "OK");
  assert.equal(result.split.basis, "OFFICIAL_DEPARTURE_SCHEDULE");
  assert.deepEqual([result.split.eastPct, result.split.westPct, result.split.expected.east, result.split.expected.west], [75, 25, 7200, 2400]);
});

// --- screen, copied text and image read one set of numbers ---------------

test("the prep facts, the copied text and the image carry the same numbers as the card", () => {
  const summary = summaryFor();
  const input = prepInputFromSummary(summary, { kind: "airport", terminal: "T2", side: null }, null, NOW);
  const prep = buildBusinessPrep(input);
  const split = splitFromSummary(summary, sidesOf(summary), "T2", NOW).split;
  const flightsFact = prep.facts.find((fact) => fact.kind === "FLIGHT_SPLIT");
  const estimateFact = prep.facts.find((fact) => fact.kind === "FLIGHT_SPLIT_ESTIMATE");
  assert.ok(flightsFact && estimateFact);
  for (const lang of ["ko", "en", "zh", "ja"]) {
    const doc = buildShareDocument({ prep, serviceDate: DATE, place: { kind: "airport", terminal: "T2", side: null }, industry: "beauty", hours: null, lang, link: shareLink("https://koretaildata.com", lang, DATE), savedAt: "2026-09-29T01:00:00.000Z" });
    const text = shareText(doc);
    const lines = doc.lines.map((line) => line.text);
    for (const fact of [flightsFact, estimateFact]) {
      const line = factLine(fact, DATE, lang);
      assert.ok(text.includes(line), `${lang}: copy text`);
      assert.ok(lines.includes(line), `${lang}: image lines`);
    }
    assert.ok(factLine(flightsFact, DATE, lang).includes(flightSentence(split, lang)));
    assert.ok(factLine(estimateFact, DATE, lang).includes(estimateSentence({ terminal: "T2", ...split.expected }, lang)));
    assert.ok(factLine(estimateFact, DATE, lang).includes(splitCopy.estimateNote[lang]), `${lang}: the short warning travels with the number`);
  }
  assert.match(factLine(flightsFact, DATE, "ko"), /동편 120편 60% · 서편 80편 40% · 중앙 0편 · 위치 미확인 20편\(전체의 9\.1%\)\. 동·서 위치가 확인된 항공편 기준/);
  assert.match(factLine(estimateFact, DATE, "ko"), /동편 약 14,400명 · 서편 약 9,600명 \(터미널 전체 예상 24,000명 기준 · 확인된 항공편 기준 추정\)\. 실제 동·서편 승객 수가 아닙니다/);
  assert.equal(prep.actions.some((action) => /SPLIT/.test(action.rule)), false, "it is a comparison, never a staffing or stock action");
});

test("stale flight records or no expected total leave the facts out or shorter", () => {
  const old = summaryFor({ rows: T2_EXAMPLE.map((row) => ({ ...row, retrievedAt: "2026-09-26T23:00:00Z" })) });
  const oldPrep = buildBusinessPrep(prepInputFromSummary(old, { kind: "airport", terminal: "T2", side: null }, null, NOW));
  assert.equal(oldPrep.facts.some((fact) => /FLIGHT_SPLIT/.test(fact.kind)), false);
  const noTotal = summaryFor({ coverage: "PARTIAL" });
  const prep = buildBusinessPrep(prepInputFromSummary(noTotal, { kind: "airport", terminal: "T2", side: null }, null, NOW));
  assert.equal(prep.facts.some((fact) => fact.kind === "FLIGHT_SPLIT"), true);
  assert.equal(prep.facts.some((fact) => fact.kind === "FLIGHT_SPLIT_ESTIMATE"), false);
  // Built directly, a split whose records are old is dropped by the prep itself too.
  const direct = buildBusinessPrep({ serviceDate: DATE, dayRelation: "TODAY", nowIso: NOW, place: { kind: "airport", terminal: "T2", side: null }, hours: null,
    airport: { bands: [], coverage: "UNAVAILABLE", retrievedAt: null, split: { ...flightSplitOf(day(T2_EXAMPLE), "T2", "COLLECTED_FLIGHT_RECORDS", 100), retrievedAt: "2026-09-26T23:00:00Z" } } });
  assert.equal(direct.facts.some((fact) => /FLIGHT_SPLIT/.test(fact.kind)), false);
});

test("the estimate is a separate calculation from the hall split: the halls stay withheld and are never read", () => {
  const summary = summaryFor();
  assert.equal(sidesOf(summary).halls, null);
  assert.equal(splitFromSummary(summary, sidesOf(summary), "T2", NOW).status, "OK");
  for (const file of ["lib/airport-flight-split.ts", "lib/airport-flight-split-copy.ts"]) {
    const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(source, /summarizeHallSides|hallSideOf|hallsOn|AIRPORT_HALL_SIDES|\.halls\b|t[12]dg/, file);
  }
  const words = ["ko", "en", "zh", "ja"].map((lang) => estimateSentence({ terminal: "T2", total: 100, east: 60, west: 40 }, lang)).join("\n");
  assert.doesNotMatch(words, /실제 동·서편 승객 수입니다|actual passengers are/i);
});
