import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { customWindow, departureMap, leadCouldFlip, minuteOfDay, positionOf, presetWindow, sideLead, windowLabel } from "../lib/airport-departure-map.ts";
import { DESTINATION_GROUPS, destinationOf, normalizeDestination } from "../lib/airport-destinations.ts";
import { leadLine, mapShareText, windowCountsLine } from "../lib/airport-departure-map-copy.ts";
import { summarizeGateSides } from "../lib/airport-sides.ts";
import { airportSides } from "../lib/airport-sides-summary.ts";
import { splitFromSummary } from "../lib/airport-flight-split.ts";

const DATE = "2026-09-29", NEXT = "2026-09-30";
let seq = 0;
const row = (terminal, gate, time, extra = {}) => ({
  physicalFlightId: `P${++seq}`, flightNumber: `KE${seq}`, airlineCode: "대한항공", airportCode: "도쿄/나리타",
  direction: "departure", terminal, gate, scheduledAt: `${extra.date ?? DATE}T${time}:00+09:00`, status: "scheduled", retrievedAt: "2026-09-29T00:57:00Z", ...extra,
});
const DAY = { startMin: 0, endMin: 1440 };

test("the whole-day window counts exactly what the comparison card counts", () => {
  const rows = [
    row("T2", "274", "09:10"), row("T2", "231", "10:20"), row("T2", "208", "11:00"), row("T2", "", "12:00"),
    row("T1", "9", "08:00"), row("T1", "29", "08:30"), row("T1", "27", "09:00"), row("T1", "13", "09:30"), row("", "110", "10:00"), row("", "7", "10:30"),
  ];
  for (const terminal of ["T1", "T2"]) {
    const map = departureMap({ date: DATE, nextDate: NEXT, terminal, window: DAY, rows });
    const card = summarizeGateSides(rows, DATE).byArea[terminal];
    assert.deepEqual(map.sides, card, `${terminal}: same side counts as the card`);
  }
  // And the card as the page builds it from a live summary.
  const summary = { serviceDateKst: DATE, dayRelation: "PAST", airport: { sides: airportSides(DATE, "PAST", [], rows, [], false, false) } };
  const split = splitFromSummary(summary, summary.airport.sides, "T2", "2026-09-30T10:00:00+09:00").split;
  const map = departureMap({ date: DATE, nextDate: NEXT, terminal: "T2", window: DAY, rows });
  assert.deepEqual([map.sides.EAST, map.sides.WEST, map.sides.CENTER, map.sides.UNVERIFIED], [split.east, split.west, split.center, split.unverified]);
});

test("codeshares count once (newest row wins), cancelled flights are apart, other directions are ignored", () => {
  const rows = [
    row("T2", "250", "09:00", { physicalFlightId: "X", flightNumber: "KE1", retrievedAt: "2026-09-29T00:00:00Z" }),
    row("T2", "274", "09:00", { physicalFlightId: "X", flightNumber: "DL1", retrievedAt: "2026-09-29T01:00:00Z" }),
    row("T2", "231", "09:00", { status: "cancelled" }),
    row("T2", "231", "09:00", { direction: "arrival" }),
  ];
  const map = departureMap({ date: DATE, nextDate: NEXT, terminal: "T2", window: DAY, rows });
  assert.equal(map.flights.length, 1);
  assert.equal(map.flights[0].gate, "274", "the gate of the newest retrieval");
  assert.equal(map.cancelled, 1);
  assert.equal(map.sides.total, 1);
});

test("every flight is either drawn at a known gate or listed apart, never both and never lost", () => {
  const rows = [
    row("T2", "274", "09:00"), row("T2", "291", "09:10"), row("T2", "228", "09:20"), row("T2", null, "09:30"), row("T2", "23A", "09:40"),
    row("T1", "13", "09:00"), row("T1", "27", "09:10"), row("", "116", "09:20"), row("", "110", "09:30"),
  ];
  for (const terminal of ["T1", "T2"]) {
    const map = departureMap({ date: DATE, nextDate: NEXT, terminal, window: DAY, rows });
    const placed = map.flights.filter((flight) => flight.position);
    const apart = [...map.unplaced.noGate, ...map.unplaced.notOnMap];
    assert.equal(placed.length + apart.length, map.flights.length, terminal);
    assert.equal(new Set([...placed, ...apart].map((flight) => flight.id)).size, map.flights.length);
    const drawn = map.gates.reduce((sum, gate) => sum + gate.flights, 0);
    assert.equal(drawn, placed.length, `${terminal}: the dots add up to the placed flights`);
  }
  const t2 = departureMap({ date: DATE, nextDate: NEXT, terminal: "T2", window: DAY, rows });
  assert.deepEqual(t2.unplaced.notOnMap.map((flight) => flight.gate).sort(), ["228", "23A"], "no official position: never drawn at a guessed place");
  const g291 = t2.flights.find((flight) => flight.gate === "291");
  assert.ok(g291.position, "291 is on the airport's own map, so it is drawn");
  assert.equal(g291.side, "EAST", "drawn, and east of the building's centre line by the midpoint rule");
  assert.equal(t2.unplaced.noGate.length, 1);
  const t1 = departureMap({ date: DATE, nextDate: NEXT, terminal: "T1", window: DAY, rows });
  assert.equal(t1.concourse, 2, "T1 includes the concourse as its own building");
  assert.equal(t1.sides.total, 2, "the side counts stay T1 main building only, like the card");
  assert.deepEqual(t1.unplaced.notOnMap.map((flight) => `${flight.building}:${flight.gate}`).sort(), ["CONCOURSE:116", "T1:13"]);
  assert.equal(t2.concourse, null, "T2 has no concourse");
});

test("a flight whose building is unknown is in neither terminal and is only counted", () => {
  const rows = [row("", "7", "09:00"), row(null, null, "09:10"), row("T2", "274", "09:20")];
  for (const terminal of ["T1", "T2"]) {
    const map = departureMap({ date: DATE, nextDate: NEXT, terminal, window: DAY, rows });
    assert.equal(map.unknownBuilding, 2);
    assert.ok(map.flights.every((flight) => flight.building !== "UNKNOWN"));
  }
});

test("the window keeps start <= t < end, to the minute", () => {
  const rows = [row("T2", "274", "08:59"), row("T2", "274", "09:00"), row("T2", "274", "09:59"), row("T2", "274", "10:00")];
  const map = departureMap({ date: DATE, nextDate: NEXT, terminal: "T2", window: { startMin: 540, endMin: 600 }, rows });
  assert.deepEqual(map.flights.map((flight) => flight.scheduledAt.slice(11, 16)), ["09:00", "09:59"]);
  assert.equal(minuteOfDay(DATE, "2026-09-29T09:59:00+09:00"), 599);
  assert.equal(minuteOfDay(DATE, "2026-09-30T00:30:00+09:00"), 1470);
  assert.equal(minuteOfDay(DATE, "not a time"), null);
  assert.deepEqual(customWindow(9, 18), { startMin: 540, endMin: 1080 });
  assert.equal(customWindow(18, 9), null);
  assert.equal(customWindow(0, 25), null);
  assert.deepEqual(presetWindow("NEXT3", 22 * 60 + 15), { startMin: 1335, endMin: 1515 });
  assert.deepEqual(presetWindow("NEXT1", null), DAY, "no 'from now' window for another date");
  assert.equal(windowLabel({ startMin: 1335, endMin: 1515 }), "22:15–01:15 (+1)");
  assert.equal(windowLabel(DAY), "00:00–24:00");
});

test("past midnight: the next day's rows are used only when they exist; otherwise the gap is stated", () => {
  const rows = [row("T2", "274", "23:30"), row("T2", "231", "22:00")];
  const nextRows = [row("T2", "231", "00:40", { date: NEXT }), row("T2", "231", "02:00", { date: NEXT })];
  const window = { startMin: 23 * 60, endMin: 25 * 60 };
  const covered = departureMap({ date: DATE, nextDate: NEXT, terminal: "T2", window, rows, nextRows });
  assert.equal(covered.nextDay, "COVERED");
  assert.deepEqual(covered.flights.map((flight) => [flight.scheduledAt.slice(11, 16), flight.day]), [["23:30", "SERVICE_DATE"], ["00:40", "NEXT_DAY"]]);
  assert.deepEqual([covered.sides.EAST, covered.sides.WEST], [1, 1]);
  const missing = departureMap({ date: DATE, nextDate: NEXT, terminal: "T2", window, rows, nextRows: [] });
  assert.equal(missing.nextDay, "MISSING");
  assert.equal(missing.flights.length, 1, "nothing after midnight is invented");
  assert.equal(departureMap({ date: DATE, nextDate: NEXT, terminal: "T2", window, rows, nextRows: null }).nextDay, "MISSING");
  assert.equal(departureMap({ date: DATE, nextDate: NEXT, terminal: "T2", window: DAY, rows }).nextDay, "NOT_NEEDED");
  // Rows of the next day never leak into a window that ends at midnight.
  assert.equal(departureMap({ date: DATE, nextDate: NEXT, terminal: "T2", window: DAY, rows: [...rows, ...nextRows] }).flights.length, 2);
});

test("destination groups never overlap, add up to the flights, and keep the unknown ones", () => {
  const rows = [
    row("T2", "274", "09:00", { airportCode: "도쿄/나리타" }), row("T2", "231", "09:10", { airportCode: "오사카/ 간사이" }),
    row("T2", "231", "09:20", { airportCode: "오사카/간사이" }), row("T2", "274", "09:30", { airportCode: "상하이/푸동" }),
    row("T2", "274", "09:40", { airportCode: "홍콩" }), row("T2", "208", "09:50", { airportCode: "어딘가" }), row("T2", "274", "10:00", { airportCode: null }),
  ];
  const map = departureMap({ date: DATE, nextDate: NEXT, terminal: "T2", window: DAY, rows });
  assert.equal(map.groups.reduce((sum, group) => sum + group.flights, 0), map.flights.length);
  const by = Object.fromEntries(map.groups.map((group) => [group.group, group]));
  assert.equal(by.JP.flights, 3, "spacing differences in the stored name are the same destination");
  assert.equal(by.CN.flights, 1);
  assert.equal(by.HK_MO_TW.flights, 1, "Hong Kong is not counted in mainland China");
  assert.equal(by.UNKNOWN.flights, 2);
  assert.equal(map.unknownDestination, 2);
  assert.deepEqual(by.JP.bySide, { EAST: 1, WEST: 2, CENTER: 0, UNVERIFIED: 0 });
  for (const group of map.groups) assert.equal(Object.values(group.bySide).reduce((a, b) => a + b, 0) + group.concourse, group.flights);
});

test("the destination table covers every destination seen in the stored departures and nothing is guessed", () => {
  const table = JSON.parse(readFileSync("config/airport-destinations.v1.json", "utf8"));
  const observed = JSON.parse(readFileSync("tests/fixtures/observed-destinations-2026-09.json", "utf8")).names;
  assert.equal(observed.length, 164);
  for (const name of observed) assert.ok(destinationOf(name), `${name} is in the table`);
  const names = table.destinations.map((entry) => normalizeDestination(entry.name));
  assert.equal(new Set(names).size, names.length, "one entry per destination");
  const codes = table.destinations.map((entry) => entry.iata);
  assert.equal(new Set(codes).size, codes.length);
  for (const entry of table.destinations) {
    assert.match(entry.iata, /^[A-Z]{3}$/);
    assert.match(entry.country, /^[A-Z]{2}$/);
    assert.ok(table.groupOf[entry.country], `${entry.country} has exactly one group`);
    assert.ok(table.sources[entry.source], `${entry.name} cites a source`);
  }
  for (const group of Object.values(table.groupOf)) assert.ok(DESTINATION_GROUPS.includes(group));
  assert.equal(destinationOf("어딘가"), null);
  assert.equal(destinationOf(""), null);
  assert.equal(destinationOf("홍콩").group, "HK_MO_TW");
  assert.equal(destinationOf("괌").group, "OCEANIA");
  assert.equal(destinationOf("김해").group, "DOMESTIC");
});

test("the lead sentence is a plain sentence, and warns when the flights without a gate could reverse it", () => {
  const sides = (EAST, WEST, UNVERIFIED) => ({ EAST, WEST, CENTER: 0, UNVERIFIED, total: EAST + WEST + UNVERIFIED });
  assert.deepEqual(sideLead(sides(12, 9, 0)), { larger: "EAST", by: 3 });
  assert.equal(sideLead(sides(0, 0, 4)), null);
  assert.equal(leadCouldFlip(sides(12, 9, 2)), false);
  assert.equal(leadCouldFlip(sides(12, 9, 3)), true);
  const map = (s) => ({ sides: s, concourse: null, unknownBuilding: 0 });
  assert.equal(leadLine(map(sides(12, 9, 0)), "ko"), "동편이 3편 더 많습니다.");
  assert.equal(leadLine(map(sides(12, 9, 5)), "ko"), "동편이 3편 더 많습니다. 아직 탑승구가 정해지지 않은 5편에 따라 달라질 수 있습니다.");
  assert.equal(leadLine(map(sides(4, 4, 0)), "ko"), "동편과 서편이 같습니다.");
  assert.match(leadLine(map(sides(0, 0, 3)), "ko"), /비교하지 않습니다/);
  assert.equal(leadLine(map(sides(2, 7, 0)), "en"), "West has 5 flights more.");
});

test("the copied text carries date, terminal, window, filter, counts, gaps and the limit", () => {
  const rows = [row("T1", "9", "09:00"), row("T1", "29", "09:30"), row("T1", "", "10:00"), row("", "110", "10:30", { airportCode: "상하이/푸동" })];
  const map = departureMap({ date: DATE, nextDate: NEXT, terminal: "T1", window: { startMin: 540, endMin: 660 }, rows });
  const text = mapShareText(map, { date: DATE, filter: "JP", basis: "운항 기록 기준", url: "https://koretaildata.com/ko/business" }, "ko");
  assert.match(text, /2026-09-29 T1 · 09:00–11:00/);
  assert.ok(text.includes(windowCountsLine(map, "ko")));
  assert.match(text, /탑승동 1편/);
  assert.match(text, /목적지 필터: 일본/);
  assert.match(text, /지도에 위치를 표시할 수 없는 출발편: 1편 \(탑승구 미배정 1편/);
  assert.match(text, /항공편 수이며 사람 수나 매장 방문객이 아닙니다/);
  assert.doesNotMatch(text, /승객 흐름|혼잡|방문객이 많/);
});

test("gate positions come from the official map table and exist for the drawn buildings only", () => {
  assert.deepEqual(positionOf("T2", "274") && typeof positionOf("T2", "274").x, "number");
  assert.equal(positionOf("T2", "228"), null);
  assert.equal(positionOf("UNKNOWN", "274"), null);
  assert.equal(positionOf("T1", "274"), null, "a T2 number is not a T1 gate");
});
