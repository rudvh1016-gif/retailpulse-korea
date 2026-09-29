import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  USUAL_LATEST_SQL,
  USUAL_MIN_DAYS,
  compareWithUsual,
  holidayDates,
  holidayMonthsFor,
  usualBaselineStatement,
  usualHolidaySql,
} from "../lib/usual-comparison.ts";

function migrated() {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
      const sql = statement.trim();
      if (sql) db.exec(sql);
    }
  }
  return db;
}

const NOW = "2026-09-28T14:05:00+09:00";
const reading = (observedAt, min, max, extra = {}) => ({
  areaCode: "POI003", sourceId: "SEOUL_CITYDATA_PPLTN", schemaVersion: "v1", qualityStatus: "VALID",
  congestionLevel: 2, populationMin: min, populationMax: max, observedAt, ...extra,
});
const weekAgo = (weeks, minutes = 0) => {
  const ms = Date.parse(NOW) - weeks * 7 * 86_400_000 + minutes * 60_000;
  return `${new Date(ms + 9 * 3_600_000).toISOString().slice(0, 19)}+09:00`;
};
const compare = (candidates, overrides = {}) => compareWithUsual({
  area: "myeongdong", current: reading(NOW, 30_000, 32_000), candidates, holidays: new Set(), todayKst: "2026-09-28", generatedAt: NOW, ...overrides,
});

test("every statement is an index search on the real schema", () => {
  const db = migrated();
  const scans = (sql, binds) => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...binds).map((row) => String(row.detail))
    .filter((detail) => /^SCAN (seoul_realtime_area|holiday_months)\b/.test(detail));
  assert.deepEqual(scans(USUAL_LATEST_SQL, ["myeongdong"]), []);
  const baseline = usualBaselineStatement("myeongdong", NOW);
  assert.deepEqual(scans(baseline.sql, baseline.binds), []);
  const months = holidayMonthsFor(NOW);
  assert.deepEqual(scans(usualHolidaySql(months.length), months), []);
});

test("usual needs four distinct past dates and keeps ranges as ranges", () => {
  const four = [1, 2, 3, 4].map((week) => ({ weekOffset: week, ...reading(weekAgo(week), 20_000 + week * 100, 24_000) }));
  const higher = compare(four);
  assert.equal(higher.basis, "USUAL");
  assert.equal(higher.validDays, USUAL_MIN_DAYS);
  assert.deepEqual(higher.range, { min: 20_100, max: 24_000 });
  assert.equal(higher.verdict, "HIGHER", "30,000–32,000 sits wholly above every past range");
  assert.equal(compare(four, { current: reading(NOW, 23_000, 25_000) }).verdict, "OVERLAPS");
  assert.equal(compare(four, { current: reading(NOW, 10_000, 12_000) }).verdict, "LOWER");
  const three = compare(four.slice(0, 3));
  assert.equal(three.basis, "LAST_WEEK", "three dates are not 'usual'; last week is still an honest comparison");
  assert.deepEqual(three.range, { min: 20_100, max: 24_000 });
});

test("several readings on one date count once, and only near the same time", () => {
  const sameDay = [
    { weekOffset: 1, ...reading(weekAgo(1, -8), 1_000, 2_000) },
    { weekOffset: 1, ...reading(weekAgo(1, 1), 20_000, 21_000) },
    { weekOffset: 1, ...reading(weekAgo(1, 9), 5_000, 6_000) },
  ];
  const result = compare(sameDay);
  assert.equal(result.validDays, 1);
  assert.deepEqual(result.range, { min: 20_000, max: 21_000 }, "the closest reading to the same time wins");
  const far = compare([{ weekOffset: 1, ...reading(weekAgo(1, 25), 20_000, 21_000) }]);
  assert.equal(far.weeks[0].status, "INCOMPATIBLE", "a reading 25 minutes off is not the same time");
});

test("a different area code, source or schema is never compared", () => {
  const result = compare([
    { weekOffset: 1, ...reading(weekAgo(1), 20_000, 21_000, { areaCode: "POI999" }) },
    { weekOffset: 2, ...reading(weekAgo(2), 20_000, 21_000, { schemaVersion: "v0" }) },
    { weekOffset: 3, ...reading(weekAgo(3), 20_000, 21_000, { qualityStatus: "INVALID" }) },
  ]);
  assert.deepEqual(result.weeks.slice(0, 4).map((week) => week.status), ["INCOMPATIBLE", "INCOMPATIBLE", "INCOMPATIBLE", "MISSING"]);
  assert.equal(result.basis, "COLLECTING");
  assert.equal(result.verdict, null);
});

test("holidays are left out when known, and said to be unchecked when not", () => {
  const weeks = [1, 2, 3, 4, 5].map((week) => ({ weekOffset: week, ...reading(weekAgo(week), 20_000, 24_000) }));
  const holiday = compare(weeks, { holidays: new Set([weekAgo(2).slice(0, 10)]) });
  assert.equal(holiday.weeks[1].status, "HOLIDAY");
  assert.equal(holiday.validDays, 4);
  assert.equal(holiday.holidayCheck, "CHECKED");
  const unknown = compare(weeks, { holidays: null });
  assert.equal(unknown.holidayCheck, "UNAVAILABLE");
  assert.equal(unknown.todayIsHoliday, null);
  assert.equal(unknown.validDays, 5);
});

test("no reading today means no comparison, and a new area is still collecting", () => {
  assert.equal(compare([], { current: reading("2026-09-27T23:55:00+09:00", 1, 2) }).basis, "NO_CURRENT");
  assert.equal(compare([], { current: null }).basis, "NO_CURRENT");
  const itaewon = compare([]);
  assert.equal(itaewon.basis, "COLLECTING");
  assert.equal(itaewon.weeks.every((week) => week.status === "MISSING"), true);
});

test("holiday months: every needed month must be stored", () => {
  assert.deepEqual(holidayMonthsFor("2026-10-05T12:00:00+09:00", 8), ["2026-08", "2026-09", "2026-10"]);
  const rows = [{ month: "2026-09", payload: JSON.stringify([{ date: "2026-09-24", name: "추석" }]) }];
  assert.equal(holidayDates(rows, ["2026-09", "2026-10"]), null);
  assert.deepEqual([...holidayDates(rows, ["2026-09"])], ["2026-09-24"]);
  assert.equal(holidayDates([{ month: "2026-09", payload: "{" }], ["2026-09"]), null);
});

test("the statements return the readings the comparison needs from real rows", () => {
  const db = migrated();
  const insert = db.prepare(`INSERT INTO seoul_realtime_area (id, source_id, record_origin, area, area_code, area_name, congestion_level, congestion_label,
    population_min, population_max, observed_at, retrieved_at, freshness, schema_version, quality_status, source_hash)
    VALUES (?, 'SEOUL_CITYDATA_PPLTN', 'LIVE', 'myeongdong', 'POI003', '명동', 2, '보통', ?, ?, ?, ?, 'LIVE', 'v1', 'VALID', 'h')`);
  let id = 0;
  const start = Date.parse(NOW) - 60 * 86_400_000;
  for (let at = start; at <= Date.parse(NOW); at += 15 * 60_000) {
    const iso = `${new Date(at + 9 * 3_600_000).toISOString().slice(0, 19)}+09:00`;
    insert.run(`r${id += 1}`, 20_000, 22_000, iso, iso);
  }
  const current = db.prepare(USUAL_LATEST_SQL).get("myeongdong");
  const baseline = usualBaselineStatement("myeongdong", current.observedAt);
  const candidates = db.prepare(baseline.sql).all(...baseline.binds);
  assert.ok(candidates.length >= 8 && candidates.length <= 32, `bounded: ${candidates.length} rows`);
  const result = compareWithUsual({ area: "myeongdong", current, candidates, holidays: new Set(), todayKst: "2026-09-28", generatedAt: NOW });
  assert.equal(result.basis, "USUAL");
  assert.equal(result.validDays, 8);
  assert.equal(result.verdict, "OVERLAPS");
});
