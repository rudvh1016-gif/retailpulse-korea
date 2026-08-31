import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAirportPassengerForecastRow } from "../lib/source-adapters.ts";
import {
  summarizeRemainingPassengerForecast,
  summarizeTodayPassengerForecast,
} from "../lib/airport-today-summary.ts";
import { buildAreaCurrentBrief } from "../lib/current-brief.ts";
import {
  isValidKstDay,
  kstDayBounds,
  kstDayOf,
  kstHourStartIsoOf,
  kstNowIsoOf,
  relateKstDay,
  shiftKstDay,
} from "../lib/kst.ts";
import { COVERAGE_PROBES, buildCoverageContext, isReadOnlyProbe } from "../lib/data-coverage.ts";

const a5Row = (overrides = {}) => ({
  adate: "20260831",
  atime: "09_10",
  t1dgsum1: "1200",
  t2dgsum2: "800",
  ...overrides,
});

/**
 * Production evidence (read-only D1 diagnostic, 2026-08-31): every stored day
 * held 23 of 24 hourly bands and ended at 23:00 instead of next-day 00:00,
 * while the collector reported one SCHEMA_A5_ATIME_END_HOUR rejection per
 * request. The band the provider writes as the midnight wrap was being thrown
 * away, which kept full-day coverage permanently PARTIAL.
 */
test("A5: the day's final band written as the midnight wrap is kept, not discarded", async () => {
  const rows = await normalizeAirportPassengerForecastRow(a5Row({ atime: "23_00" }), "2026-08-31T00:00:00Z");
  assert.ok(rows.length > 0, "the wrap band must produce canonical rows");
  assert.equal(rows[0].targetStartAt, "2026-08-31T23:00:00+09:00");
  assert.equal(rows[0].targetEndAt, "2026-09-01T00:00:00+09:00", "23_00 ends at the following midnight");
  assert.equal(rows[0].targetDate, "2026-08-31", "the band still belongs to its own service day");
});

test("A5: 23_24 and 23_00 describe the same band", async () => {
  const [viaTwentyFour] = await normalizeAirportPassengerForecastRow(a5Row({ atime: "23_24" }), "2026-08-31T00:00:00Z");
  const [viaWrap] = await normalizeAirportPassengerForecastRow(a5Row({ atime: "23_00" }), "2026-08-31T00:00:00Z");
  assert.equal(viaWrap.targetStartAt, viaTwentyFour.targetStartAt);
  assert.equal(viaWrap.targetEndAt, viaTwentyFour.targetEndAt);
});

test("A5: a 00 end hour after any other start stays rejected rather than invented", async () => {
  for (const atime of ["05_00", "00_00", "12_00"]) {
    await assert.rejects(
      normalizeAirportPassengerForecastRow(a5Row({ atime }), "2026-08-31T00:00:00Z"),
      (error) => error.message === "SCHEMA_A5_ATIME_END_HOUR",
      `${atime} is ambiguous and must not be given a meaning`,
    );
  }
});

/** Rebuilds the exact production band grid: 00_01 … 22_23 plus the wrap band. */
function productionDayBands(terminal, date = "2026-08-31") {
  const bands = [];
  for (let hour = 0; hour < 23; hour += 1) {
    const start = String(hour).padStart(2, "0");
    const end = String(hour + 1).padStart(2, "0");
    bands.push({
      terminal, direction: "departure", isAggregate: 1, targetDate: date,
      timeBandRaw: `${start}_${end}`,
      targetStartAt: `${date}T${start}:00:00+09:00`,
      targetEndAt: `${date}T${end}:00:00+09:00`,
      expectedPassengers: 1000 + hour,
      retrievedAt: "2026-08-31T14:23:00.162Z",
    });
  }
  return bands;
}

const wrapBand = (terminal, date = "2026-08-31") => ({
  terminal, direction: "departure", isAggregate: 1, targetDate: date,
  timeBandRaw: "23_00",
  targetStartAt: `${date}T23:00:00+09:00`,
  targetEndAt: "2026-09-01T00:00:00+09:00",
  expectedPassengers: 900,
  retrievedAt: "2026-08-31T14:23:00.162Z",
});

test("coverage stays PARTIAL while the final band is missing, and only then hides the day's numbers", () => {
  const rows = [...productionDayBands("T1"), ...productionDayBands("T2")];
  const summary = summarizeTodayPassengerForecast(rows, "2026-08-31");
  assert.equal(summary.coverage.all, "PARTIAL", "23 of 24 bands cannot prove a full day");
  assert.equal(summary.total, null, "a partial day must never present a whole-day total");
  assert.equal(summary.peak, null, "a missing band could hide the true peak");
  assert.deepEqual(summary.timeline, []);
});

test("with the wrap band restored the same day proves COMPLETE and reports real numbers", () => {
  const rows = [
    ...productionDayBands("T1"), wrapBand("T1"),
    ...productionDayBands("T2"), wrapBand("T2"),
  ];
  const summary = summarizeTodayPassengerForecast(rows, "2026-08-31");
  assert.equal(summary.coverage.all, "COMPLETE");
  assert.equal(summary.coverage.byTerminal.T1, "COMPLETE");
  assert.equal(summary.timeline.length, 24, "a full KST day is 24 hourly bands");
  assert.equal(summary.timeline.at(-1).targetEndAt, "2026-09-01T00:00:00+09:00");
  const expected = summary.timeline.reduce((sum, band) => sum + band.expectedPassengers, 0);
  assert.equal(summary.total, expected, "the total is the sum of official bands, never an estimate");
  assert.ok(summary.peak, "a complete day can name its peak");
});

test("remaining departures counts whole official bands and never pro-rates the current hour", () => {
  const rows = [
    ...productionDayBands("T1"), wrapBand("T1"),
    ...productionDayBands("T2"), wrapBand("T2"),
  ];
  const summary = summarizeTodayPassengerForecast(rows, "2026-08-31");
  // 21:30 KST — the 21:00–22:00 band is in progress.
  const nowIso = "2026-08-31T12:30:00.000Z";
  const remaining = summarizeRemainingPassengerForecast(summary.timeline, summary.coverage.all, nowIso);
  assert.ok(remaining);
  assert.equal(remaining.fromAt, "2026-08-31T21:00:00+09:00", "the in-progress band is counted from its own start");
  assert.equal(remaining.toAt, "2026-09-01T00:00:00+09:00", "through the end of the KST day");
  assert.equal(remaining.bands, 3);
  const manual = summary.timeline
    .filter((band) => Date.parse(band.targetEndAt) > Date.parse(nowIso))
    .reduce((sum, band) => sum + band.expectedPassengers, 0);
  assert.equal(remaining.expectedPassengers, manual);
});

test("remaining departures is withheld entirely when the day is not provably complete", () => {
  const rows = [...productionDayBands("T1"), ...productionDayBands("T2")];
  const summary = summarizeTodayPassengerForecast(rows, "2026-08-31");
  const remaining = summarizeRemainingPassengerForecast(summary.timeline, summary.coverage.all, "2026-08-31T12:30:00.000Z");
  assert.equal(remaining, null, "an understated remainder is worse than no number");
});

/**
 * Production evidence (same diagnostic): at 22:55 KST the latest Seoul issue
 * covered 00:00–11:00 the NEXT day, so a "today only" filter reported zero
 * bands and the UI claimed no forecast existed while twelve official bands
 * were stored.
 */
test("the Seoul peak uses the official horizon even when every band falls after midnight", () => {
  const nowIso = "2026-08-31T13:55:00.000Z"; // 22:55 KST
  const realtimeForecast = Array.from({ length: 12 }, (_, index) => ({
    targetAt: `2026-09-01T${String(index).padStart(2, "0")}:00:00+09:00`,
    congestionLevel: index === 4 ? 4 : 1,
    populationMin: 1000,
    populationMax: index === 4 ? 9000 : 2000,
  }));
  const brief = buildAreaCurrentBrief({
    realtime: { congestionLevel: 1, populationMin: 100, populationMax: 200, observedAt: "2026-08-31T22:55:00+09:00", freshness: "LIVE" },
    realtimeForecast,
    weather: [],
    eventCount: 0,
    nowIso,
  });
  assert.ok(brief.upcomingPeak, "a published forecast must not be reported as unavailable");
  assert.equal(brief.upcomingPeak.targetAt, "2026-09-01T04:00:00+09:00");
  assert.equal(brief.upcomingPeak.dayOffset, "TOMORROW", "the day is stated so 04:00 cannot read as already past");
  assert.ok(brief.evidenceTypes.includes("SEOUL_FORECAST"));
  assert.equal(brief.forecastHorizonEndAt, "2026-09-01T11:00:00+09:00");
});

test("a same-day peak is still labelled today, and past bands never win", () => {
  const nowIso = "2026-08-31T04:00:00.000Z"; // 13:00 KST
  const brief = buildAreaCurrentBrief({
    realtime: null,
    realtimeForecast: [
      { targetAt: "2026-08-31T09:00:00+09:00", congestionLevel: 4, populationMin: 1, populationMax: 99999 },
      { targetAt: "2026-08-31T18:00:00+09:00", congestionLevel: 3, populationMin: 1, populationMax: 500 },
    ],
    weather: [],
    eventCount: 0,
    nowIso,
  });
  assert.equal(brief.upcomingPeak.targetAt, "2026-08-31T18:00:00+09:00", "an hour that already passed is not upcoming");
  assert.equal(brief.upcomingPeak.dayOffset, "TODAY");
});

test("no forecast rows means no peak — never a fabricated one", () => {
  const brief = buildAreaCurrentBrief({
    realtime: null, realtimeForecast: [], weather: [], eventCount: 0,
    nowIso: "2026-08-31T04:00:00.000Z",
  });
  assert.equal(brief.upcomingPeak, null);
  assert.equal(brief.forecastHorizonEndAt, null);
  assert.ok(!brief.evidenceTypes.includes("SEOUL_FORECAST"));
});

test("KST helpers stay in the +09:00 offset space rows are stored in", () => {
  const nowIso = "2026-08-31T14:23:35.000Z";
  assert.equal(kstDayOf(nowIso), "2026-08-31");
  assert.equal(kstNowIsoOf(nowIso), "2026-08-31T23:23:35+09:00");
  assert.equal(kstHourStartIsoOf(nowIso), "2026-08-31T23:00:00+09:00");
  assert.equal(shiftKstDay("2026-08-31", 1), "2026-09-01");
  assert.equal(shiftKstDay("2026-09-01", -1), "2026-08-31");
  assert.deepEqual(kstDayBounds("2026-08-31"), {
    startAt: "2026-08-31T00:00:00+09:00",
    endAt: "2026-09-01T00:00:00+09:00",
  });
  assert.equal(relateKstDay("2026-08-30", "2026-08-31"), "PAST");
  assert.equal(relateKstDay("2026-08-31", "2026-08-31"), "TODAY");
  assert.equal(relateKstDay("2026-09-01", "2026-08-31"), "FUTURE");
});

test("an instant just before KST midnight still resolves to the correct KST day", () => {
  // 14:59 UTC is 23:59 KST on the SAME KST day; 15:00 UTC has rolled over.
  assert.equal(kstDayOf("2026-08-31T14:59:00.000Z"), "2026-08-31");
  assert.equal(kstDayOf("2026-08-31T15:00:00.000Z"), "2026-09-01");
});

test("only real calendar days are accepted as a service date", () => {
  for (const good of ["2026-08-31", "2026-02-28", "2028-02-29"]) assert.equal(isValidKstDay(good), true, good);
  for (const bad of ["2026-02-30", "2026-13-01", "26-08-31", "2026-8-31", "", null, undefined, "2026-08-31T00:00:00Z"]) {
    assert.equal(isValidKstDay(bad), false, String(bad));
  }
});

test("every data-coverage probe is a bare SELECT and can never write to Production", () => {
  assert.ok(COVERAGE_PROBES.length > 0);
  for (const probe of COVERAGE_PROBES) {
    assert.equal(isReadOnlyProbe(probe), true, `${probe.name} must be read-only`);
    assert.match(probe.sql.trim(), /^SELECT/i);
  }
  assert.equal(isReadOnlyProbe({ name: "x", meaning: "", sql: "DELETE FROM airport_flights", params: () => [] }), false);
  assert.equal(isReadOnlyProbe({ name: "x", meaning: "", sql: "SELECT 1; DROP TABLE airport_flights", params: () => [] }), false);
});

test("coverage probe parameters are built in the KST offset space", () => {
  const context = buildCoverageContext("2026-08-31T14:23:35.000Z");
  assert.equal(context.kstToday, "2026-08-31");
  assert.equal(context.kstNowIso, "2026-08-31T23:23:35+09:00");
  assert.equal(context.kstHourStartIso, "2026-08-31T23:00:00+09:00");
});
