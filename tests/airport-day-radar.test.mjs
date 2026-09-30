import assert from "node:assert/strict";
import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { dailyFlightProfile, profileOf } from "../lib/airport-day-profile.ts";
import { radar, sameWeekdayDays, similarDays, standing, terminalDay } from "../lib/airport-day-compare.ts";
import { radarLine, similarLines } from "../lib/airport-day-copy.ts";
import { collectAirportComposition } from "../lib/airport-composition-history.ts";
import { readAirportDays } from "../app/api/live/airport-days/route.ts";
import { summarizeGateSides } from "../lib/airport-sides.ts";

let seq = 0;
const row = (day, terminal, gate, time, airportCode = "도쿄/나리타", extra = {}) => ({
  physicalFlightId: `P${++seq}`, terminal, gate, scheduledAt: `${day}T${time}:00+09:00`, status: "scheduled", retrievedAt: `${day}T00:00:00Z`, airportCode, ...extra,
});
/** A day with `n` T2 departures: east/west/unconfirmed in the given proportions, all at `hour`. */
const dayRows = (day, { east = 0, west = 0, unverified = 0, hour = "09", dest = "도쿄/나리타" } = {}) => [
  ...Array.from({ length: east }, (_, i) => row(day, "T2", "274", `${hour}:${String(i % 60).padStart(2, "0")}`, dest)),
  ...Array.from({ length: west }, (_, i) => row(day, "T2", "231", `${hour}:${String(i % 60).padStart(2, "0")}`, dest)),
  ...Array.from({ length: unverified }, (_, i) => row(day, "T2", "208", `${hour}:${String(i % 60).padStart(2, "0")}`, dest)),
];
const t2 = (rows, day, complete = true) => terminalDay(dailyFlightProfile(rows, day, complete), "T2");

test("the day profile counts exactly what the comparison card counts, plus hours and destinations", () => {
  const day = "2026-09-29";
  const rows = [
    row(day, "T2", "274", "09:10"), row(day, "T2", "274", "09:10", "도쿄/나리타", { physicalFlightId: "P1" }), row(day, "T2", "231", "10:20", "오사카/ 간사이"),
    row(day, "T2", "208", "11:00", "상하이/푸동"), row(day, "T2", "231", "12:00", "홍콩", { status: "cancelled" }),
    row(day, "T1", "9", "08:00"), row(day, "", "110", "08:30", "다낭"), row(day, "", "7", "08:40"),
  ];
  const profile = dailyFlightProfile(rows, day, true);
  const card = summarizeGateSides(rows, day).byArea;
  assert.equal(profile.T2.total, card.T2.total);
  assert.deepEqual(profile.T2.sides, [card.T2.EAST, card.T2.WEST, card.T2.CENTER, card.T2.UNVERIFIED]);
  assert.equal(profile.T2.hours[9], 1);
  assert.deepEqual(profile.T2.destinations, { "도쿄/나리타": 1, "오사카/간사이": 1, "상하이/푸동": 1 });
  assert.equal(profile.cancelled, 1);
  assert.equal(profile.unknownBuilding, 1);
  const t1 = terminalDay(profile, "T1");
  assert.equal(t1.total, 2, "T1 includes the concourse, as the map does");
  assert.deepEqual(t1.sides, [1, 0, 0, 0], "sides are the main building's, as on the card");
  assert.deepEqual(t1.groups, { JP: 1, SEA: 1 });
  assert.equal(profileOf({ profile }).day, day);
  assert.equal(profileOf({ profile: { ...profile, v: 99 } }), null);
  assert.equal(profileOf({}), null);
});

// --- the collector writes the profile, changed-only ------------------------

class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.values) }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.values); return { meta: { changes: Number(r.changes) } }; }
}
const d1 = (db) => ({ prepare: (sql) => new Stmt(db, sql) });
function openDb(name) {
  const path = join(tmpdir(), `rpk-day-radar-${name}-${process.pid}.db`);
  const db = new DatabaseSync(path);
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join("drizzle", file), "utf8").replaceAll("--> statement-breakpoint", ""));
  return { db, path };
}
function insertFlight(db, f) {
  db.prepare(`INSERT INTO airport_flights (id, source_id, record_origin, direction, flight_number, airline_code, airport_code, terminal, gate, status, scheduled_at, event_at, retrieved_at, freshness, schema_version, quality_status, source_hash, physical_flight_id)
    VALUES (?, 'INCHEON_FLIGHT_DETAIL', 'LIVE', 'departure', ?, 'KE', ?, ?, ?, ?, ?, ?, ?, 'LIVE', 'v1', 'VALID', ?, ?)`)
    .run(`id${f.physicalFlightId}`, `KE${f.physicalFlightId}`, f.airportCode, f.terminal || null, f.gate, f.status, f.scheduledAt, f.scheduledAt, f.retrievedAt, `h${f.physicalFlightId}`, f.physicalFlightId);
}

test("the collector stores the profile with the composition, marks completeness honestly, and writes only on change", async () => {
  const { db, path } = openDb("collector");
  try {
    const now = new Date("2026-09-30T06:07:00+09:00");
    for (const f of [...dayRows("2026-09-29", { east: 3, west: 2 }), ...dayRows("2026-09-30", { east: 1 })]) insertFlight(db, f);
    // One scan covering both days, run after 09-29 ended but during 09-30.
    db.prepare(`INSERT INTO collector_runs (run_id, source_id, status, started_at, finished_at, detail) VALUES ('r1', 'INCHEON_FLIGHT_DETAIL', 'SUCCESS', '2026-09-29T21:05:00.000Z', '2026-09-29T21:06:00.000Z', 'recent 2026-09-29..2026-09-30; ok')`).run();
    const first = await collectAirportComposition(d1(db), now);
    assert.equal(first.records, 2);
    const stored = Object.fromEntries(db.prepare("SELECT day, payload FROM airport_daily_composition").all().map((r) => [r.day, JSON.parse(r.payload)]));
    assert.equal(stored["2026-09-29"].profile.complete, true, "a scan ran after the day ended");
    assert.equal(stored["2026-09-30"].profile.complete, false, "today is never a complete day");
    assert.deepEqual(stored["2026-09-29"].profile.T2.sides, [3, 2, 0, 0]);
    assert.ok(stored["2026-09-29"].all, "the airline composition is still there for its existing reader");
    const again = await collectAirportComposition(d1(db), now);
    assert.equal(again.records, 0, "unchanged days cost no writes");
  } finally { db.close(); unlinkSync(path); }
});

test("the history route reads at most 63 stored days before the date, and never the date itself", async () => {
  const { db, path } = openDb("route");
  try {
    for (let i = 0; i < 70; i++) {
      const day = new Date(Date.UTC(2026, 8, 30) - i * 86_400_000).toISOString().slice(0, 10);
      const profile = dailyFlightProfile(dayRows(day, { east: 2, west: 1 }), day, true);
      db.prepare("INSERT INTO airport_daily_composition (day, payload, source_hash, calculated_at) VALUES (?, ?, ?, ?)").run(day, JSON.stringify({ all: {}, profile }), `h${i}`, "2026-09-30T00:00:00Z");
    }
    db.prepare("INSERT INTO airport_daily_composition (day, payload, source_hash, calculated_at) VALUES ('2026-06-01', ?, 'old', 'x')").run(JSON.stringify({ all: {} }));
    const result = await readAirportDays(d1(db), "2026-09-30");
    assert.equal(result.rowsRead, 63);
    assert.equal(result.history.length, 63);
    assert.ok(result.history.every((entry) => entry.T2.day < "2026-09-30" && entry.T2.day >= "2026-07-29"));
    assert.deepEqual(result.history[0].T2.groups, { JP: 3 });
    const plan = db.prepare("EXPLAIN QUERY PLAN SELECT day, payload FROM airport_daily_composition WHERE day >= ? AND day < ? ORDER BY day DESC LIMIT 63").all("2026-07-29", "2026-09-30");
    assert.ok(plan.some((step) => /USING (INDEX|PRIMARY KEY)|sqlite_autoindex/.test(step.detail)), JSON.stringify(plan));
  } finally { db.close(); unlinkSync(path); }
});

// --- comparisons ------------------------------------------------------------

const TODAY = "2026-09-30"; // Wednesday
const weeksBack = (n) => new Date(Date.UTC(2026, 8, 30) - n * 7 * 86_400_000).toISOString().slice(0, 10);

test("same weekday: only complete past days, and 'usual' only from four days", () => {
  const history = [1, 2, 3].map((w) => t2(dayRows(weeksBack(w), { east: 10, west: 10 }), weeksBack(w)));
  history.push(t2(dayRows("2026-09-29", { east: 50 }), "2026-09-29")); // another weekday
  history.push(t2(dayRows(weeksBack(4), { east: 10, west: 10 }), weeksBack(4), false)); // incomplete
  const current = t2(dayRows(TODAY, { east: 20, west: 10 }), TODAY, false);
  const days = sameWeekdayDays(current, history);
  assert.deepEqual(days.map((day) => day.day), [weeksBack(1), weeksBack(2), weeksBack(3)]);
  const { items } = radar({ current, history, terminal: "T2" });
  const total = items.find((item) => item.kind === "WEEKDAY_TOTAL");
  assert.equal(total.standing.usual, false);
  assert.equal(radarLine(total, "T2", "ko", () => ""), "T2 출발편 수 30편: 확인된 같은 요일 3일과 오늘 중 1번째로 많음 (20편–20편)");
  const usual = radar({ current, history: [...history, t2(dayRows(weeksBack(5), { east: 12, west: 10 }), weeksBack(5))], terminal: "T2" }).items.find((item) => item.kind === "WEEKDAY_TOTAL");
  assert.match(radarLine(usual, "T2", "ko", () => ""), /평소\(같은 요일 최근 4일, 20편–22편\)보다 많음/);
});

test("a value inside the past range is not listed, and the busiest hour never says 'more than usual'", () => {
  const history = [1, 2, 3, 4].map((w) => t2(dayRows(weeksBack(w), { east: 10 + w, west: 10 }), weeksBack(w)));
  const current = t2(dayRows(TODAY, { east: 12, west: 10, hour: "14" }), TODAY, false);
  const { items } = radar({ current, history, terminal: "T2" });
  assert.equal(items.some((item) => item.kind.startsWith("WEEKDAY")), false);
  const peak = items.find((item) => item.kind === "WITHIN_DAY_PEAK");
  assert.equal(peak.hour, 14);
  const line = radarLine(peak, "T2", "ko", () => "");
  assert.match(line, /오늘 안에서의 비교/);
  assert.doesNotMatch(line, /평소/);
});

test("side shares are compared only with days classified by the same gate table", () => {
  const history = [1, 2, 3, 4].map((w) => ({ ...t2(dayRows(weeksBack(w), { east: 5, west: 15 }), weeksBack(w)), sidesVersion: "airport-sides.v0" }));
  const current = t2(dayRows(TODAY, { east: 15, west: 5 }), TODAY, false);
  assert.equal(radar({ current, history, terminal: "T2" }).items.some((item) => item.kind === "WEEKDAY_EAST_SHARE"), false);
  const same = history.map((day) => ({ ...day, sidesVersion: current.sidesVersion }));
  assert.equal(radar({ current, history: same, terminal: "T2" }).items[0].kind, "WEEKDAY_EAST_SHARE");
});

test("since the last look: only value changes of the same date and terminal", () => {
  const current = t2(dayRows(TODAY, { east: 11, west: 10 }), TODAY, false);
  const last = { date: TODAY, terminal: "T2", checkedAt: "2026-09-30T01:00:00Z", total: 20, east: 10, west: 10, groups: { JP: 20 } };
  const item = radar({ current, history: [], lastSeen: last, terminal: "T2" }).items.find((entry) => entry.kind === "SINCE_LAST");
  assert.deepEqual(item.changes.map((change) => change.what), ["TOTAL", "EAST", "JP"]);
  assert.match(radarLine(item, "T2", "ko", () => "10:00"), /지난번 확인\(10:00\) 이후 달라진 값: 출발편 수 20→21/);
  assert.equal(radar({ current, history: [], lastSeen: { ...last, total: 21, east: 11, groups: { JP: 21 } }, terminal: "T2" }).items.some((entry) => entry.kind === "SINCE_LAST"), false, "same values: nothing changed");
  assert.equal(radar({ current, history: [], lastSeen: { ...last, terminal: "T1" }, terminal: "T2" }).items.some((entry) => entry.kind === "SINCE_LAST"), false);
});

test("at most three items, in the fixed order", () => {
  const history = [1, 2, 3, 4].map((w) => t2(dayRows(weeksBack(w), { east: 10, west: 10 }), weeksBack(w)));
  const current = t2([...dayRows(TODAY, { east: 40, west: 5 }), ...dayRows(TODAY, { east: 5, dest: "상하이/푸동" })], TODAY, false);
  const { items } = radar({ current, history, terminal: "T2", holidays: [{ country: "CN", name: "国庆节" }], lastSeen: { date: TODAY, terminal: "T2", checkedAt: "2026-09-30T00:00:00Z", total: 1, east: 1, west: 0, groups: {} } });
  assert.equal(items.length, 3);
  assert.ok(items.every((item) => item.kind.startsWith("WEEKDAY")), items.map((item) => item.kind).join(","));
});

test("similar days: reproducible, never the day itself or a later day, missing parts left out, not forced to three", () => {
  const history = [
    t2(dayRows("2026-09-23", { east: 20, west: 10 }), "2026-09-23"),
    t2(dayRows("2026-09-22", { east: 20, west: 10, hour: "18" }), "2026-09-22"),
    t2(dayRows("2026-09-16", { east: 5, west: 5 }), "2026-09-16"),
    t2(dayRows("2026-09-30", { east: 20, west: 10 }), "2026-09-30"),
    t2(dayRows("2026-10-01", { east: 20, west: 10 }), "2026-10-01"),
    t2(dayRows("2026-09-21", { east: 20, west: 10 }), "2026-09-21", false),
  ];
  const current = t2(dayRows(TODAY, { east: 20, west: 10 }), TODAY, false);
  const first = similarDays({ current, history });
  const second = similarDays({ current, history: [...history].reverse() });
  assert.deepEqual(first.map((item) => item.day.day), second.map((item) => item.day.day), "order does not depend on input order");
  assert.deepEqual(first.map((item) => item.day.day), ["2026-09-23", "2026-09-16", "2026-09-22"]);
  assert.equal(first[0].distance, 0);
  assert.ok(first.every((item) => item.missing.includes("HOLIDAY")), "no holiday lookup: left out, not 0");
  const lines = similarLines(first[0], current, "ko");
  assert.match(lines.alike, /출발편 수\(오늘 30 · 그날 30\)/);
  assert.equal(lines.busiest, "09–10시 30편");
  assert.equal(similarDays({ current, history: history.slice(0, 1) }).length, 1, "not padded to three");
  const noHours = { ...history[0], day: "2026-09-15", hours: history[0].hours.map(() => 0) };
  assert.equal(similarDays({ current, history: [noHours] }).length, 0, "a day whose hours cannot be compared is not a candidate");
  const withHoliday = similarDays({ current, history, isHoliday: (day) => day === "2026-09-23" });
  const holidayDay = withHoliday.find((item) => item.day.day === "2026-09-23");
  assert.equal(holidayDay.components.find((component) => component.name === "HOLIDAY").distance, 1, "a holiday difference counts");
  assert.ok(Math.abs(holidayDay.distance - 0.5 / 5) < 1e-9, "calendar flags weigh half: 0.5 of a total weight of 4 + 0.5 + 0.5");
  // A same-shaped day of another weekday is still closer than a same-weekday day of a clearly different size.
  const tuesday = t2(dayRows("2026-09-29", { east: 20, west: 10 }), "2026-09-29");
  assert.equal(similarDays({ current, history: [tuesday, history[2]] })[0].day.day, "2026-09-29");
});

test("standing reports rank, range and verdict without inventing percentiles", () => {
  assert.deepEqual(standing(15, [10, 20, 12]), { value: 15, past: [10, 20, 12], rank: 2, of: 4, min: 10, max: 20, verdict: "WITHIN", usual: false });
  assert.equal(standing(25, [10, 20, 12, 11]).verdict, "ABOVE");
  assert.equal(standing(5, []), null);
});
