import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { summarizeGateSides } from "../lib/airport-sides.ts";
import { airportSides } from "../lib/airport-sides-summary.ts";
import { estimateByFlights, flightSplitOf, roundToStep, sharePercents, splitFromSummary } from "../lib/airport-flight-split.ts";
import { estimateBasisLine, estimateBody, estimateNote, estimateSentence, flightSentence, flightsBody, hourBody, sharesBody, splitCopy } from "../lib/airport-flight-split-copy.ts";
import { buildBusinessPrep, prepInputFromSummary } from "../lib/business-prep.ts";
import { factLine } from "../lib/business-prep-copy.ts";
import { buildShareDocument, shareLink, shareText } from "../lib/prep-share.ts";

const DATE = "2026-09-29";
const NOW = "2026-09-29T10:00:00+09:00";
let seq = 0;
const flight = (terminal, gate, time, extra = {}) => ({ physicalFlightId: `F${++seq}`, terminal, gate, scheduledAt: `${DATE}T${time}:00+09:00`, status: "scheduled", retrievedAt: "2026-09-29T00:57:00Z", ...extra });
const many = (n, terminal, gate, time) => Array.from({ length: n }, () => flight(terminal, gate, time));
// T2 east gates 274, west gates 231 (both officially named), unverified 228 (no official coordinate), a no-gate flight.
const T2_EXAMPLE = [...many(120, "T2", "274", "09:10"), ...many(80, "T2", "231", "09:40"), ...many(20, "T2", "228", "09:50")];
const day = (rows) => summarizeGateSides(rows, DATE);

const parts = (estimate) => ({ east: estimate.east.people, west: estimate.west.people, center: estimate.center.people, unverified: estimate.unverified.people, concourse: estimate.concourse?.people ?? null });

test("the example: 120 east, 80 west, 20 unconfirmed → 60/40 ratio; 40,000 is spread over all 220 flights, the unconfirmed share stays apart", () => {
  const split = flightSplitOf(day(T2_EXAMPLE), "T2", "COLLECTED_FLIGHT_RECORDS", 40_000);
  assert.deepEqual([split.total, split.east, split.west, split.center, split.unverified, split.verified], [220, 120, 80, 0, 20, 200]);
  assert.deepEqual([split.eastPct, split.westPct, split.unverifiedPct, split.larger], [60, 40, 9.1, "EAST"]);
  // The ratio still rests on the confirmed flights only; the people are spread over ALL 220.
  assert.equal(split.expected.total, 40_000);
  assert.equal(split.expected.flights, 220);
  assert.deepEqual(parts(split.expected), { east: 21_800, west: 14_500, center: 0, unverified: 3_600, concourse: null });
  assert.deepEqual([split.expected.east.flights, split.expected.west.flights, split.expected.unverified.flights], [120, 80, 20]);
  assert.equal(flightsBody(split, "ko"), "동편 120편 60% · 서편 80편 40% · 중앙 0편 · 위치 미확인 20편(전체의 9.1%)");
  assert.equal(sharesBody(split, "ko"), "동·서 위치가 확인된 항공편 기준 (200편): 동편 60% · 서편 40% (동편이 더 많음)");
  assert.equal(estimateBody({ terminal: "T2", ...split.expected }, "ko"), "동편 약 21,800명 · 서편 약 14,500명 · 위치 미확인 약 3,600명");
  assert.notEqual(split.expected.east.people + split.expected.west.people, 40_000, "the unconfirmed share is not pushed into east and west to make them add up");
});

test("west larger, and equal", () => {
  const west = flightSplitOf(day([...many(3, "T2", "274", "09:00"), ...many(9, "T2", "231", "09:00")]), "T2", "COLLECTED_FLIGHT_RECORDS", 1200);
  assert.deepEqual([west.eastPct, west.westPct, west.larger, west.expected.east.people, west.expected.west.people], [25, 75, "WEST", 300, 900]);
  const equal = flightSplitOf(day([...many(5, "T2", "274", "09:00"), ...many(5, "T2", "231", "09:00")]), "T2", "COLLECTED_FLIGHT_RECORDS", 1001);
  assert.deepEqual([equal.eastPct, equal.westPct, equal.larger], [50, 50, "EQUAL"]);
  assert.deepEqual([equal.expected.east.people, equal.expected.west.people], [500, 500], "equal flights, equal people");
  assert.match(sharesBody(equal, "ko"), /동·서 차이 작음/);
});

test("centre and unconfirmed flights stay out of the ratio but keep their own share of the people", () => {
  const rows = [...many(6, "T1", "9", "09:00"), ...many(2, "T1", "29", "09:00"), ...many(4, "T1", "27", "09:00"), ...many(10, "T1", "13", "09:00"), flight("T1", "", "09:30")];
  const split = flightSplitOf(day(rows), "T1", "COLLECTED_FLIGHT_RECORDS", 8000);
  assert.deepEqual([split.total, split.east, split.west, split.center, split.unverified], [23, 6, 2, 4, 11]);
  assert.deepEqual([split.eastPct, split.westPct], [75, 25], "6 : 2, not 6 : 23");
  assert.equal(split.expected.flights, 23, "all 23 flights of the scope divide the people");
  assert.deepEqual(parts(split.expected), { east: 2_100, west: 700, center: 1_400, unverified: 3_800, concourse: 0 });
  assert.equal(split.unverifiedPct, 47.8);
  assert.match(flightsBody(split, "ko"), /중앙 4편 · 위치 미확인 11편\(전체의 47\.8%\)/);
  assert.equal(estimateBody({ terminal: "T1", ...split.expected }, "ko"), "동편 약 2,100명 · 서편 약 700명 · 중앙 약 1,400명 · 위치 미확인 약 3,800명");
});

test("a side with no flights, or no confirmed flight at all", () => {
  const westless = flightSplitOf(day(many(7, "T2", "274", "09:00")), "T2", "COLLECTED_FLIGHT_RECORDS", 500);
  assert.deepEqual([westless.eastPct, westless.westPct, westless.expected.east.people, westless.expected.west.people], [100, 0, 500, 0]);
  assert.equal(estimateBody({ terminal: "T2", ...westless.expected }, "ko"), "동편 약 500명 · 서편 0명", "a side with no flight is exactly none, not 'about 0'");
  const none = flightSplitOf(day(many(7, "T2", "228", "09:00")), "T2", "COLLECTED_FLIGHT_RECORDS", 500);
  assert.deepEqual([none.eastPct, none.westPct, none.larger, none.expected], [null, null, null, null], "nothing is assigned by force");
  assert.match(sharesBody(none, "ko"), /비율을 계산하지 않았습니다/);
  assert.equal(flightSplitOf(day(many(3, "T1", "9", "09:00")), "T2", "COLLECTED_FLIGHT_RECORDS", 500), null, "another terminal's flights never count");
});

test("rounding: every figure is to the nearest 100 and nothing is moved between groups to make them add up", () => {
  assert.deepEqual([0, 49, 50, 149, 150, 250, 15_649, 15_650].map(roundToStep), [0, 0, 100, 100, 200, 300, 15_600, 15_700]);
  for (const total of [0, 1, 99, 100, 1_001, 42_606, 52_493]) {
    for (const flights of [
      { east: 1, west: 2, center: 0, unverified: 0, concourse: null, outsideScope: 0 },
      { east: 101, west: 92, center: 0, unverified: 81, concourse: null, outsideScope: 0 },
      { east: 71, west: 78, center: 13, unverified: 0, concourse: 40, outsideScope: 3 },
      { east: 1, west: 0, center: 0, unverified: 998, concourse: null, outsideScope: 0 },
    ]) {
      const estimate = estimateByFlights(total, flights);
      const all = flights.east + flights.west + flights.center + flights.unverified + (flights.concourse ?? 0);
      assert.equal(estimate.flights, all);
      for (const [key, count] of Object.entries({ east: flights.east, west: flights.west, center: flights.center, unverified: flights.unverified, concourse: flights.concourse ?? 0 })) {
        const part = estimate[key];
        if (key === "concourse" && flights.concourse === null) { assert.equal(part, null); continue; }
        assert.equal(part.flights, count);
        assert.equal(part.people % 100, 0, `${key} is a multiple of 100`);
        assert.ok(Math.abs(part.people - (total * count) / all) <= 50, `${key} is within 50 of its exact share`);
      }
      // A group's people do not depend on how the other groups rounded.
      assert.equal(estimate.east.people, roundToStep((total * flights.east) / all));
    }
  }
  for (const [east, west] of [[1, 2], [2, 1], [1, 6], [333, 334]]) {
    const shares = sharePercents(east, west);
    assert.equal(shares.eastPct + shares.westPct, 100);
  }
  assert.equal(estimateByFlights(100, { east: 0, west: 0, center: 0, unverified: 0, concourse: null, outsideScope: 0 }), null);
  assert.equal(estimateByFlights(-1, { east: 1, west: 1, center: 0, unverified: 0, concourse: null, outsideScope: 0 }), null);
  assert.equal(estimateByFlights(Number.NaN, { east: 1, west: 1, center: 0, unverified: 0, concourse: null, outsideScope: 0 }), null);
});

test("a group too small to reach 100 people is 'under 100', not 'about 0' and not moved elsewhere", () => {
  const rows = [...many(1, "T2", "274", "09:00"), ...many(400, "T2", "231", "09:00"), ...many(1, "T2", "228", "09:00")];
  const split = flightSplitOf(day(rows), "T2", "COLLECTED_FLIGHT_RECORDS", 4_020);
  assert.deepEqual([split.expected.east.flights, split.expected.east.people, split.expected.unverified.flights, split.expected.unverified.people], [1, 0, 1, 0]);
  assert.equal(estimateBody({ terminal: "T2", ...split.expected }, "ko"), "동편 100명 미만 · 서편 약 4,000명 · 위치 미확인 100명 미만");
  assert.equal(estimateBody({ terminal: "T2", ...split.expected }, "en"), "East under 100 · West about 4,000 · Side not confirmed under 100");
  assert.match(estimateBody({ terminal: "T2", ...split.expected }, "zh"), /东侧 不足100人/);
  assert.match(estimateBody({ terminal: "T2", ...split.expected }, "ja"), /東側 100人より少ない/);
});

test("the equal-passengers-per-flight assumption and the rounding are stated in the short note, in every language", () => {
  assert.equal(splitCopy.estimateNote.ko, "실제 동·서편 승객 수가 아닙니다. 편당 승객 수가 같다는 가정의 참고값이며 백 명 단위로 반올림했습니다.");
  assert.match(splitCopy.estimateNote.en, /every flight carries the same number of passengers, rounded to the nearest hundred/);
  assert.match(splitCopy.estimateNote.zh, /每班航班旅客数相同的参考值，按百人取整/);
  assert.match(splitCopy.estimateNote.ja, /1便あたりの乗客数が同じという前提の参考値で、百人単位に四捨五入/);
  for (const lang of ["ko", "en", "zh", "ja"]) assert.ok(splitCopy.estimateNote[lang].length < (lang === "en" ? 180 : 110), `${lang}: short enough to sit under the number (${splitCopy.estimateNote[lang].length})`);
});

test("a terminal total of zero is 'none', not 'under 100'", () => {
  const rows = [...many(3, "T2", "274", "09:00"), ...many(2, "T2", "231", "09:00"), ...many(1, "T2", "228", "09:00")];
  const split = flightSplitOf(day(rows), "T2", "COLLECTED_FLIGHT_RECORDS", 0);
  assert.equal(estimateBody({ terminal: "T2", ...split.expected }, "ko"), "동편 0명 · 서편 0명 · 위치 미확인 0명");
});

test("T1: the headcount includes concourse-bound passengers, so concourse flights are in the divisor and shown as their own item", () => {
  // 60 east, 20 west at the T1 gates; 20 flights at concourse gates (stored terminal unknown, exact gate 101-132).
  const rows = [...many(60, "T1", "9", "09:00"), ...many(20, "T1", "29", "09:00"), ...many(20, "", "110", "10:00")];
  const split = flightSplitOf(day(rows), "T1", "COLLECTED_FLIGHT_RECORDS", 50_000);
  assert.deepEqual([split.total, split.east, split.west], [80, 60, 20], "the comparison card counts the T1 gates only");
  assert.deepEqual([split.eastPct, split.westPct], [75, 25], "the ratio is still the confirmed east:west flights of the T1 gates");
  assert.equal(split.expected.flights, 100, "the divisor is T1 gates + concourse");
  assert.deepEqual(parts(split.expected), { east: 30_000, west: 10_000, center: 0, unverified: 0, concourse: 10_000 });
  assert.equal(estimateBody({ terminal: "T1", ...split.expected }, "ko"), "동편 약 30,000명 · 서편 약 10,000명 · 탑승동 약 10,000명");
  assert.match(estimateNote({ terminal: "T1", ...split.expected }, "ko"), /T1 예상 출국객에는 탑승동으로 가는 승객이 포함된 것으로 보고/);
  assert.equal(estimateBasisLine({ terminal: "T1", ...split.expected }, "ko"), "터미널 전체 예상 50,000명 기준 · 같은 범위 출발편 100편(T1 본관 80편 + 탑승동 20편)으로 나눈 추정", "the two buildings are shown so the count reconciles with the card's T1 total");
  assert.equal(estimateBody({ terminal: "T1", ...split.expected }, "en"), "East about 30,000 · West about 10,000 · Concourse about 10,000");
  // T2 has no concourse: its scope is its own gates, and its note does not mention one.
  const t2 = flightSplitOf(day([...many(60, "T2", "274", "09:00"), ...many(20, "T2", "231", "09:00"), ...many(20, "", "110", "10:00")]), "T2", "COLLECTED_FLIGHT_RECORDS", 50_000);
  assert.equal(t2.expected.flights, 80, "concourse flights are never in the T2 divisor");
  assert.equal(t2.expected.concourse, null);
  assert.doesNotMatch(estimateNote({ terminal: "T2", ...t2.expected }, "ko"), /탑승동/);
  assert.doesNotMatch(estimateBasisLine({ terminal: "T2", ...t2.expected }, "ko"), /탑승동/);
  assert.doesNotMatch(estimateBody({ terminal: "T2", ...t2.expected }, "ko"), /탑승동/);
});

test("flights whose building is unknown are in neither scope: left out of the divisor and counted in the note", () => {
  const rows = [...many(30, "T2", "274", "09:00"), ...many(10, "T2", "231", "09:00"), ...many(5, "", "7", "09:00")];
  const split = flightSplitOf(day(rows), "T2", "COLLECTED_FLIGHT_RECORDS", 4_000);
  assert.equal(split.expected.flights, 40);
  assert.equal(split.expected.outsideScope, 5);
  assert.deepEqual(parts(split.expected), { east: 3_000, west: 1_000, center: 0, unverified: 0, concourse: null });
  assert.equal(estimateBasisLine({ terminal: "T2", ...split.expected }, "ko"), "터미널 전체 예상 4,000명 기준 · 같은 범위 출발편 40편으로 나눈 추정 · 터미널 미확인 5편 제외");
  const clean = flightSplitOf(day(T2_EXAMPLE), "T2", "COLLECTED_FLIGHT_RECORDS", 4_000);
  assert.equal(clean.expected.outsideScope, 0);
  assert.doesNotMatch(estimateBasisLine({ terminal: "T2", ...clean.expected }, "ko"), /미확인 \d+편 제외/);
});

test("hourly lines carry counts, shares and the unconfirmed ones", () => {
  const rows = [...many(8, "T2", "274", "08:10"), ...many(4, "T2", "231", "08:40"), ...many(11, "T2", "274", "09:10"), ...many(7, "T2", "231", "09:20"), flight("T2", "228", "09:30"), ...many(6, "T2", "274", "10:00"), ...many(12, "T2", "231", "10:05")];
  const split = flightSplitOf(day(rows), "T2", "COLLECTED_FLIGHT_RECORDS", null);
  assert.equal(hourBody(split.hours[0], "ko"), "08–09시 · 합계 12편 · 동 8편 / 서 4편 (동 67% · 서 33%)");
  assert.equal(hourBody(split.hours[1], "ko"), "09–10시 · 합계 19편 · 동 11편 / 서 7편 (동 61% · 서 39%) · 미확인 1편");
  assert.equal(hourBody(split.hours[2], "en"), "10:00–11:00 · total 18 flights · E 6 flights / W 12 flights (E 33% · W 67%)");
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
  assert.equal(ok.split.expected.total, 24_000);
  assert.deepEqual(parts(ok.split.expected), { east: 13_100, west: 8_700, center: 0, unverified: 2_200, concourse: null });
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
  assert.deepEqual([result.split.eastPct, result.split.westPct, result.split.expected.east.people, result.split.expected.west.people], [75, 25, 7200, 2400]);
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
    assert.ok(factLine(estimateFact, DATE, lang).includes(estimateBasisLine({ terminal: "T2", ...split.expected }, lang)), `${lang}: what was divided over how many flights travels with the number`);
  }
  assert.match(factLine(flightsFact, DATE, "ko"), /동편 120편 60% · 서편 80편 40% · 중앙 0편 · 위치 미확인 20편\(전체의 9\.1%\)\. 동·서 위치가 확인된 항공편 기준/);
  assert.match(factLine(estimateFact, DATE, "ko"), /예상 출국객\(하루 전체\): 동편 약 13,100명 · 서편 약 8,700명 · 위치 미확인 약 2,200명 \(터미널 전체 예상 24,000명 기준 · 같은 범위 출발편 220편으로 나눈 추정\)\. 실제 동·서편 승객 수가 아닙니다/);
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
    airport: { bands: [], coverage: "UNAVAILABLE", retrievedAt: null, split: { ...flightSplitOf(day(T2_EXAMPLE), "T2", "COLLECTED_FLIGHT_RECORDS", 100), retrievedAt: "2026-09-26T23:00:00Z", checkedAt: "2026-09-26T23:00:00Z" } } });
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
  const words = ["ko", "en", "zh", "ja"].map((lang) => estimateSentence({ terminal: "T2", ...estimateByFlights(100, { east: 60, west: 40, center: 0, unverified: 0, concourse: null, outsideScope: 0 }) }, lang)).join("\n");
  assert.doesNotMatch(words, /실제 동·서편 승객 수입니다|actual passengers are/i);
});

test("a rounded tie is never 'more on the west', and freshness follows the source stamp, not the rows' own", () => {
  const near = flightSplitOf(day([...many(199, "T2", "274", "09:00"), ...many(200, "T2", "231", "09:00")]), "T2", "COLLECTED_FLIGHT_RECORDS", 3500);
  assert.deepEqual([near.eastPct, near.westPct, near.larger], [50, 50, "EQUAL"]);
  assert.deepEqual([near.expected.east.people, near.expected.west.people], [1700, 1800], "the tie is judged on the percentages; the people follow the flights");
  // Rows are written changed-only, so their own stamp can be days old on a healthy quiet day.
  const quiet = summaryFor({ rows: T2_EXAMPLE.map((row) => ({ ...row, retrievedAt: "2026-09-27T00:57:00Z" })), retrieved: "2026-09-27T09:42:00Z" });
  assert.equal(splitFromSummary(quiet, sidesOf(quiet), "T2", NOW).status, "STALE", "with only row stamps, 2-day-old rows are stale");
  const collected = { ...quiet, sources: [{ sourceId: "INCHEON_FLIGHT_DETAIL", retrievedAt: "2026-09-29T00:57:00Z" }, { sourceId: "INCHEON_PASSENGER_FORECAST", retrievedAt: "2026-09-29T09:42:00Z" }] };
  const fresh = splitFromSummary(collected, sidesOf(collected), "T2", NOW);
  assert.equal(fresh.status, "OK", "the source was collected this morning, the unchanged rows are still current");
  assert.deepEqual(parts(fresh.split.expected), { east: 13_100, west: 8_700, center: 0, unverified: 2_200, concourse: null });
  const oldSource = { ...quiet, sources: [{ sourceId: "INCHEON_FLIGHT_DETAIL", retrievedAt: "2026-09-27T00:57:00Z" }] };
  assert.equal(splitFromSummary(oldSource, sidesOf(oldSource), "T2", NOW).status, "STALE", "a source that has not collected for 2 days is stale");
});

test("the prep gate fact follows the same source stamp", () => {
  const summary = { ...summaryFor({ rows: T2_EXAMPLE.map((row) => ({ ...row, retrievedAt: "2026-09-27T00:57:00Z" })), retrieved: "2026-09-27T09:42:00Z" }),
    sources: [{ sourceId: "INCHEON_FLIGHT_DETAIL", retrievedAt: "2026-09-29T00:57:00Z" }, { sourceId: "INCHEON_PASSENGER_FORECAST", retrievedAt: "2026-09-29T09:42:00Z" }] };
  const EARLY = "2026-09-29T08:00:00+09:00";
  const prep = buildBusinessPrep(prepInputFromSummary(summary, { kind: "airport", terminal: "T2", side: null }, null, EARLY));
  assert.ok(prep.facts.some((fact) => fact.kind === "GATE_PEAK"), "gate peak kept on a quiet but freshly collected day");
  assert.ok(prep.facts.some((fact) => fact.kind === "FLIGHT_SPLIT"));
  assert.ok(prep.facts.some((fact) => fact.kind === "FLIGHT_SPLIT_ESTIMATE"));
});

test("the share lists the whole-day comparison apart from the store hours, with its sources and times", () => {
  const summary = summaryFor();
  const place = { kind: "airport", terminal: "T2", side: null };
  // Hours that yield no gate peak at all: the comparison is still sourced.
  const prep = buildBusinessPrep(prepInputFromSummary(summary, place, { open: "02:00", close: "03:00" }, "2026-09-29T01:30:00+09:00"));
  const doc = buildShareDocument({ prep, serviceDate: DATE, place, industry: "beauty", hours: { open: "02:00", close: "03:00" }, lang: "ko", link: shareLink("https://koretaildata.com", "ko", DATE), savedAt: "2026-09-29T01:00:00.000Z" });
  const text = shareText(doc);
  const at = (needle) => text.indexOf(needle);
  assert.ok(at("■ 영업시간 안에서 확인된 사실") < at("■ 하루 전체 참고 (영업시간과 무관)"));
  assert.ok(at("■ 하루 전체 참고 (영업시간과 무관)") < at("T2 출발편(하루 전체)"), "the flight line sits under the whole-day heading");
  assert.ok(at("■ 하루 전체 참고 (영업시간과 무관)") < at("예상 출국객(하루 전체)"));
  assert.ok(at("■ 하루 전체 참고 (영업시간과 무관)") < at("■ 준비할 일"));
  assert.match(text, /자료 기준: .*인천공항 공식 출국 예상 .* · 인천공항 운항 정보/);
  assert.match(text, /출처: .*인천공항 공식 출국 예상.*인천공항 운항 정보/);
  assert.doesNotMatch(text, /자료 기준: 없음/);
});
