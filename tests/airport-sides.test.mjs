import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  boardingAreaOf, gateSideCoverage, gateSideOf, hallSideOf, hallsOn, summarizeGateSides, summarizeHallSides, unverifiedReasonOf,
} from "../lib/airport-sides.ts";

const config = JSON.parse(readFileSync(new URL("../config/airport-sides.v1.json", import.meta.url), "utf8"));
const zoneMap = JSON.parse(readFileSync(new URL("../config/airport-zone-map.v1.json", import.meta.url), "utf8"));

const pad = (hour) => String(hour).padStart(2, "0");
function band(date, hour, terminal, values, extra = {}) {
  const next = hour === 23 ? "24" : pad(hour + 1);
  const end = hour === 23 ? `2026-09-30T00:00:00+09:00` : `${date}T${pad(hour + 1)}:00:00+09:00`;
  return Object.entries(values).map(([zone, expectedPassengers]) => ({
    terminal, zone, isAggregate: /sum/.test(zone) ? 1 : 0, targetDate: date, timeBandRaw: `${pad(hour)}_${next}`,
    targetStartAt: `${date}T${pad(hour)}:00:00+09:00`, targetEndAt: end, expectedPassengers, retrievedAt: "2026-09-28T20:42:46.166Z", ...extra,
  }));
}
const t1 = (d1, d2, d3, d4, d5, d6) => ({ t1dg1: d1, t1dg2: d2, t1dg3: d3, t1dg4: d4, t1dg5: d5, t1dg6: d6, t1dgsum1: d1 + d2 + d3 + d4 + d5 + d6 });
const DATE = "2026-09-29";

test("halls: T1 3 is east and 4 is west; T2 2 is east and 1 is west", () => {
  assert.deepEqual(hallSideOf("T1", "t1dg3"), { hall: 3, side: "EAST" });
  assert.deepEqual(hallSideOf("T1", "t1dg4"), { hall: 4, side: "WEST" });
  assert.deepEqual(hallSideOf("T2", "t2dg2"), { hall: 2, side: "EAST" });
  assert.deepEqual(hallSideOf("T2", "t2dg1"), { hall: 1, side: "WEST" });
  assert.deepEqual(hallsOn("T1", "EAST"), [1, 2, 3]);
  assert.deepEqual(hallsOn("T1", "WEST"), [4, 5, 6]);
  // Aggregates, arrival halls and the other terminal's fields have no side.
  for (const [terminal, field] of [["T1", "t1dgsum1"], ["T1", "t1eg1"], ["T2", "t2egsum1"], ["T2", "t1dg1"]]) assert.equal(hallSideOf(terminal, field), null);
});

test("every hall side is quoted from official text, and every T1 hall is its own field (5 and 6 are never one bundle)", () => {
  const texts = new Set(zoneMap.mappings.map((row) => row.officialLocationRaw));
  for (const hall of config.halls) {
    assert.ok(texts.has(hall.evidence), `${hall.terminal} hall ${hall.hall}: evidence not found in the official facility text`);
    assert.match(hall.evidence, hall.side === "EAST" ? /동편/ : /서편/);
    assert.match(hall.evidence, new RegExp(`${hall.hall}번\\s*출국장`));
  }
  assert.equal(new Set(config.halls.map((hall) => hall.field)).size, config.halls.length);
});

test("a whole day adds up: sides equal the official total every hour, and the day is the sum", () => {
  const rows = Array.from({ length: 24 }, (_, hour) => band(DATE, hour, "T1", t1(0, hour, 100 + hour, 50, 5, 0))).flat();
  const day = summarizeHallSides(rows, "T1", DATE);
  assert.equal(day.coverage, "COMPLETE");
  assert.equal(day.day.east + day.day.west, day.day.total);
  assert.equal(day.day.total, rows.filter((row) => row.zone === "t1dgsum1").reduce((sum, row) => sum + row.expectedPassengers, 0));
  assert.equal(day.peakBand.startAt, `${DATE}T23:00:00+09:00`);
  assert.equal(day.bands[23].endAt, "2026-09-30T00:00:00+09:00");
});

test("a missing hall field is not zero, and a half-published band never shows a side", () => {
  const rows = [
    ...band(DATE, 9, "T1", t1(0, 10, 20, 30, 40, 0)),
    ...band(DATE, 10, "T1", t1(0, 10, 20, 30, 40, 0)).filter((row) => row.zone !== "t1dg5"),
  ];
  const day = summarizeHallSides(rows, "T1", DATE);
  assert.equal(day.coverage, "PARTIAL");
  assert.equal(day.day, null, "no whole-day figure from two hours");
  const ten = day.bands.find((row) => row.startAt.includes("T10:"));
  assert.equal(ten.total, 100);
  assert.equal(ten.east, null);
  assert.equal(ten.west, null);
  assert.equal(day.confirmed.bands, 1);
  assert.deepEqual([day.confirmed.east, day.confirmed.west], [30, 70]);
});

test("halls that disagree with the official total are not split, and an official 0 stays 0", () => {
  const rows = band(DATE, 3, "T2", { t2dg1: 0, t2dg2: 0, t2dgsum2: 5 });
  const bandRow = summarizeHallSides(rows, "T2", DATE).bands[0];
  assert.equal(bandRow.total, 5);
  assert.equal(bandRow.sidesConsistent, false);
  const zero = summarizeHallSides(band(DATE, 1, "T2", { t2dg1: 0, t2dg2: 0, t2dgsum2: 0 }), "T2", DATE).bands[0];
  assert.deepEqual([zero.total, zero.east, zero.west], [0, 0, 0]);
});

test("another date or the other terminal never leaks into a day", () => {
  const rows = [...band(DATE, 9, "T1", t1(0, 1, 2, 3, 4, 0)), ...band("2026-09-30", 9, "T1", t1(0, 9, 9, 9, 9, 0)), ...band(DATE, 9, "T2", { t2dg1: 7, t2dg2: 8, t2dgsum2: 15 })];
  assert.equal(summarizeHallSides(rows, "T1", DATE).confirmed.total, 10);
  assert.equal(summarizeHallSides(rows, "T2", DATE).confirmed.total, 15);
});

test("gates: only officially named gates have a side; center stays center; the rest are unverified", () => {
  assert.equal(gateSideOf("T1", "9"), "EAST");
  assert.equal(gateSideOf("T1", "27"), "CENTER");
  assert.equal(gateSideOf("T1", "29"), "WEST");
  assert.equal(gateSideOf("T1", "10"), "UNVERIFIED", "between two east gates is still not proven");
  assert.equal(gateSideOf("T2", "274"), "EAST");
  assert.equal(gateSideOf("T2", "225"), "WEST");
  assert.equal(gateSideOf("T2", "1"), "UNVERIFIED", "the T2 '1번 게이트' text is an entrance, not a boarding gate");
  assert.equal(gateSideOf("T2", "291"), "UNVERIFIED");
  assert.equal(gateSideOf("CONCOURSE", "107"), "EAST");
  assert.equal(gateSideOf("T1", "107"), "UNVERIFIED", "a concourse gate is never a T1 main-building side");
  assert.equal(gateSideOf("UNKNOWN", "9"), "UNVERIFIED");
  assert.equal(gateSideOf("T1", ""), "UNVERIFIED");
});

test("every gate side is quoted from official text within the published gate range", () => {
  const texts = new Set([...zoneMap.mappings.map((row) => row.officialLocationRaw)]);
  for (const gate of config.gates) {
    const [low, high] = config.gateRanges[gate.area];
    assert.ok(Number(gate.gate) >= low && Number(gate.gate) <= high, `${gate.area} ${gate.gate} outside the published range`);
    assert.match(gate.evidence, new RegExp(`${gate.gate}번`));
    assert.match(gate.evidence, { EAST: /동편/, WEST: /서편/, CENTER: /중앙/ }[gate.side]);
    if (gate.source.startsWith("data.go.kr")) assert.ok(texts.has(gate.evidence), `${gate.area} ${gate.gate}: not in the official facility text`);
  }
});

const flight = (id, terminal, gate, time, extra = {}) => ({ physicalFlightId: id, terminal, gate, scheduledAt: `${DATE}T${time}:00+09:00`, status: "scheduled", retrievedAt: "2026-09-29T01:00:00Z", ...extra });

test("flights: codeshares count once, cancelled apart, concourse and unknown kept separate, and the sides add up", () => {
  const rows = [
    flight("A", "T1", "9", "08:10"), flight("A", "T1", "9", "08:10"), flight("A", "T1", "9", "08:10"),
    flight("B", "T1", "29", "08:40"),
    flight("C", "T1", "27", "09:00"),
    flight("D", "T1", "10", "09:05"),
    flight("E", null, "107", "09:10"),
    flight("F", null, null, "09:20"),
    flight("G", "T2", "274", "10:00", { status: "cancelled" }),
    flight("H", "T2", "231", "10:30", { status: "delayed" }),
    flight("I", "T1", "11", "08:00", { scheduledAt: "2026-09-30T00:10:00+09:00" }),
  ];
  const day = summarizeGateSides(rows, DATE);
  assert.equal(day.total, 7);
  assert.equal(day.cancelled, 1);
  assert.deepEqual(day.byArea.T1, { EAST: 1, WEST: 1, CENTER: 1, UNVERIFIED: 1, total: 4 });
  assert.deepEqual(day.byArea.CONCOURSE, { EAST: 1, WEST: 0, CENTER: 0, UNVERIFIED: 0, total: 1 });
  assert.deepEqual(day.byArea.UNKNOWN, { EAST: 0, WEST: 0, CENTER: 0, UNVERIFIED: 1, total: 1 });
  assert.deepEqual(day.byArea.T2, { EAST: 0, WEST: 1, CENTER: 0, UNVERIFIED: 0, total: 1 });
  for (const counts of Object.values(day.byArea)) assert.equal(counts.EAST + counts.WEST + counts.CENTER + counts.UNVERIFIED, counts.total);
  assert.equal(day.byHour.reduce((sum, hour) => sum + Object.values(hour.byArea).reduce((inner, counts) => inner + counts.total, 0), 0), day.total);
  assert.deepEqual(day.byHour.map((hour) => hour.hour), [8, 9, 10]);
  assert.equal(gateSideCoverage(day, "T1"), 0.75);
});

test("an unverified flight says why: no gate, a gate missing from the table, or a gate that does not belong to the building", () => {
  assert.equal(unverifiedReasonOf("T1", "9"), null);
  assert.equal(unverifiedReasonOf("T1", ""), "NO_GATE");
  assert.equal(unverifiedReasonOf("T1", null), "NO_GATE");
  assert.equal(unverifiedReasonOf("T1", "10"), "NOT_IN_TABLE");
  assert.equal(unverifiedReasonOf("T2", "250"), "NOT_IN_TABLE");
  assert.equal(unverifiedReasonOf("T2", "9"), "CONFLICT");
  assert.equal(unverifiedReasonOf("CONCOURSE", "150"), "CONFLICT");
  assert.equal(unverifiedReasonOf("UNKNOWN", "9"), "NO_TERMINAL");
  const day = summarizeGateSides([
    flight("A", "T2", "268", "10:00"),
    flight("B", "T2", "250", "10:05"), flight("C", "T2", "250", "10:10"), flight("D", "T2", "252", "10:20"),
    flight("E", "T2", "", "10:30"), flight("F", "T2", "9", "10:40"),
    flight("G", null, null, "10:50"),
  ], DATE);
  assert.deepEqual(day.unverifiedByArea.T2, { NO_GATE: 1, NOT_IN_TABLE: 3, CONFLICT: 1, NO_TERMINAL: 0 });
  assert.deepEqual(day.unverifiedByArea.UNKNOWN, { NO_GATE: 0, NOT_IN_TABLE: 0, CONFLICT: 0, NO_TERMINAL: 1 });
  for (const area of Object.keys(day.byArea)) {
    assert.equal(Object.values(day.unverifiedByArea[area]).reduce((sum, n) => sum + n, 0), day.byArea[area].UNVERIFIED);
  }
  // A missing table entry is listed by gate so the map work can start from the busiest one; a conflict is not.
  assert.deepEqual(day.unmappedGates, [{ area: "T2", gate: "250", flights: 2 }, { area: "T2", gate: "252", flights: 1 }]);
  // The terminal total counts every flight; unknown sides never shrink it.
  assert.equal(day.byArea.T2.total, 6);
  assert.equal(day.byArea.T2.EAST, 1);
  // All of the unverified flights sit in one hour, and that hour still counts them.
  assert.equal(day.byHour.find((hour) => hour.hour === 10).byArea.T2.UNVERIFIED, 5);
});

test("a gate change uses the newest retrieval and is reported, never counted twice", () => {
  const day = summarizeGateSides([
    flight("A", "T1", "9", "08:10", { retrievedAt: "2026-09-29T01:00:00Z" }),
    flight("A", "T1", "29", "08:10", { retrievedAt: "2026-09-29T02:00:00Z" }),
  ], DATE);
  assert.equal(day.total, 1);
  assert.equal(day.byArea.T1.WEST, 1);
  assert.equal(day.reassigned, 1);
});

test("the boarding building follows the stored terminal, and a bare 1xx gate only proves the concourse", () => {
  assert.equal(boardingAreaOf({ terminal: "T2", gate: "250" }), "T2");
  assert.equal(boardingAreaOf({ terminal: null, gate: "115" }), "CONCOURSE");
  assert.equal(boardingAreaOf({ terminal: null, gate: "9" }), "UNKNOWN");
});

test("the flight summary carries counts of flights only, never a person figure", () => {
  const day = summarizeGateSides([flight("A", "T1", "9", "08:10")], DATE);
  const keys = JSON.stringify(day);
  assert.doesNotMatch(keys, /passenger|people|visitor/i);
});

import { airportSides } from "../lib/airport-sides-summary.ts";

test("the public block withholds hall sides until the notice condition is met, and keeps gate counts", () => {
  const halls = band(DATE, 9, "T1", t1(0, 1, 2, 3, 4, 0));
  const flights = [flight("A", "T1", "9", "08:10")];
  const withheld = airportSides(DATE, "TODAY", halls, flights, [], false, false);
  assert.equal(withheld.halls, null);
  assert.equal(withheld.hallsWithheld, true);
  assert.doesNotMatch(JSON.stringify(withheld), /expectedPassengers|"east":\d/);
  assert.equal(withheld.gates.byArea.T1.EAST, 1);
  const shown = airportSides(DATE, "TODAY", halls, flights, [], false, true);
  assert.equal(shown.halls.T1.confirmed.total, 10);
});

test("a capped flight read is never a whole day, and a future day uses the official schedule snapshot", () => {
  const capped = airportSides(DATE, "TODAY", [], Array.from({ length: 2000 }, (_, i) => flight(String(i), "T1", "9", "08:10")), [], false, false);
  assert.equal(capped.gates, null);
  assert.equal(capped.gatesUnavailable, "CAPPED");
  const future = airportSides(DATE, "FUTURE", [], [], [{ physicalFlightId: "X", terminal: "T2", gate: "274", scheduledTime: "07:30", status: "scheduled" }], true, false, "2026-09-28T09:00:00Z");
  assert.equal(future.gateBasis, "OFFICIAL_DEPARTURE_SCHEDULE");
  assert.equal(future.gates.byArea.T2.EAST, 1);
  assert.equal(future.gates.retrievedAt, "2026-09-28T09:00:00Z");
  assert.equal(airportSides(DATE, "FUTURE", [], [], [], false, false).gatesUnavailable, "NO_RECORDS");
});
