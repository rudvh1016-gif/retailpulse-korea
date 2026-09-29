import assert from "node:assert/strict";
import test from "node:test";
import { HOLIDAY_SOURCES, HOLIDAY_TRANSLATIONS, OFFICIAL_DAYS, calendarCoverage, holidaysOn, isPublished, officialDaysOn } from "../lib/holiday-calendar.ts";

const valid = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`));

test("every row is a real, ordered, sourced date in a published year", () => {
  for (const day of OFFICIAL_DAYS) {
    assert.ok(valid(day.start) && valid(day.end) && day.start <= day.end, JSON.stringify(day));
    assert.ok(day.name.length > 0);
    assert.ok(HOLIDAY_SOURCES[day.country].years.includes(Number(day.start.slice(0, 4))), `${day.country} ${day.start} is not in a published year`);
    if (day.country === "CN") assert.ok(day.quote && day.quote.length > 5, "China rows carry the notice's own words");
  }
  for (const source of Object.values(HOLIDAY_SOURCES)) {
    assert.match(source.url, /^https:\/\/(www\.gov\.cn|www8\.cao\.go\.jp)\//);
    assert.match(source.sha256, /^[0-9a-f]{64}$/);
    assert.equal(source.checkedOn, "2026-09-28");
  }
});

test("China's adjusted working days are never holidays", () => {
  assert.deepEqual(holidaysOn("2026-10-10", ["CN"]), []);
  assert.deepEqual(officialDaysOn("2026-10-10", ["CN"]).map((day) => day.kind), ["WORKING_DAY"]);
  assert.deepEqual(holidaysOn("2026-10-03", ["CN"]).map((day) => day.name), ["国庆节"]);
  assert.deepEqual(holidaysOn("2026-09-26", ["CN"]).map((day) => day.name), ["中秋节"]);
});

test("unpublished years are not computed", () => {
  assert.equal(isPublished("CN", "2027-10-01"), false);
  assert.deepEqual(officialDaysOn("2027-10-01", ["CN"]), []);
  assert.equal(isPublished("JP", "2027-10-11"), true);
  assert.equal(isPublished("JP", "2028-01-01"), false);
});

test("Japan's 休日 rows say whether they are substitute or citizens' holidays", () => {
  assert.deepEqual(holidaysOn("2026-05-06", ["JP"]).map((day) => day.kind), ["SUBSTITUTE"]);
  assert.deepEqual(holidaysOn("2026-09-22", ["JP"]).map((day) => day.kind), ["CITIZENS_HOLIDAY"]);
  assert.deepEqual(holidaysOn("2027-03-22", ["JP"]).map((day) => day.kind), ["SUBSTITUTE"]);
  assert.deepEqual(holidaysOn("2026-10-12", ["JP"]).map((day) => day.name), ["スポーツの日"]);
});

test("renewal is due from November of the last published year", () => {
  assert.deepEqual(calendarCoverage("2026-09-28").map((row) => [row.country, row.coveredThrough, row.renewalDue]), [["CN", "2026-12-31", false], ["JP", "2027-12-31", false]]);
  assert.equal(calendarCoverage("2026-11-01").find((row) => row.country === "CN").renewalDue, true);
});

test("translations exist only for published names", () => {
  const names = new Set(OFFICIAL_DAYS.map((day) => day.name));
  for (const name of Object.keys(HOLIDAY_TRANSLATIONS)) assert.ok(names.has(name), name);
});
