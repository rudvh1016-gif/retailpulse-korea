import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAirportCurrentBrief,
  buildAreaCurrentBrief,
  selectAirportNowBand,
  formatHumanFreshness,
  WEATHER_THRESHOLDS,
} from "../lib/current-brief.ts";

const NOW = "2026-08-31T05:00:00Z"; // 14:00 KST

test("area brief keeps current official observation and selects the strongest upcoming Seoul forecast", () => {
  const result = buildAreaCurrentBrief({
    realtime: { congestionLevel: 2, populationMin: 20_000, populationMax: 22_000, observedAt: NOW, freshness: "LIVE" },
    realtimeForecast: [
      { targetAt: "2026-08-31T16:00:00+09:00", congestionLevel: 3, populationMin: 23_000, populationMax: 25_000 },
      { targetAt: "2026-08-31T17:00:00+09:00", congestionLevel: 4, populationMin: 24_000, populationMax: 26_000 },
    ],
    weather: [], eventCount: 0, nowIso: NOW,
  });
  assert.equal(result.current?.populationMax, 22_000);
  assert.equal(result.upcomingPeak?.targetAt, "2026-08-31T17:00:00+09:00");
  assert.deepEqual(result.evidenceTypes, ["REALTIME", "SEOUL_FORECAST"]);
});

test("area forecast tie breaks by populationMax, then earliest targetAt", () => {
  const result = buildAreaCurrentBrief({ realtime: null, weather: [], eventCount: 0, nowIso: NOW, realtimeForecast: [
    { targetAt: "2026-08-31T18:00:00+09:00", congestionLevel: 4, populationMin: 1, populationMax: 30_000 },
    { targetAt: "2026-08-31T17:00:00+09:00", congestionLevel: 4, populationMin: 1, populationMax: 30_000 },
    { targetAt: "2026-08-31T16:00:00+09:00", congestionLevel: 4, populationMin: 1, populationMax: 29_000 },
  ] });
  assert.equal(result.upcomingPeak?.targetAt, "2026-08-31T17:00:00+09:00");
});

test("area brief ignores past forecasts and never invents a future peak", () => {
  const result = buildAreaCurrentBrief({ realtime: null, weather: [], eventCount: 0, nowIso: NOW, realtimeForecast: [
    { targetAt: "2026-08-31T13:00:00+09:00", congestionLevel: 4, populationMin: 1, populationMax: 50_000 },
  ] });
  assert.equal(result.upcomingPeak, null);
});

// Seoul publishes a rolling 12-hour forecast, so late in the evening every
// band it publishes falls on the next day. Discarding those bands reported a
// live official forecast as unavailable (production diagnostic, 2026-08-31).
// The guarantee that matters is that a next-day peak is never PRESENTED as
// today's — which `dayOffset` states outright — not that it is thrown away.
test("area brief surfaces a next-day peak but never labels it today", () => {
  const brief = buildAreaCurrentBrief({
    realtime: null,
    realtimeForecast: [{ targetAt: "2026-09-01T00:00:00+09:00", congestionLevel: 4, populationMin: 38_000, populationMax: 40_000 }],
    weather: [],
    eventCount: 0,
    nowIso: "2026-08-31T23:30:00+09:00",
  });
  assert.equal(brief.upcomingPeak?.targetAt, "2026-09-01T00:00:00+09:00");
  assert.equal(brief.upcomingPeak?.dayOffset, "TOMORROW");
  assert.notEqual(brief.upcomingPeak?.dayOffset, "TODAY");
});

test("weather advice uses explicit rain thresholds and chooses only one action", () => {
  assert.equal(WEATHER_THRESHOLDS.umbrellaProbability, 50);
  const umbrella = buildAreaCurrentBrief({ realtime: null, realtimeForecast: [], eventCount: 0, nowIso: NOW, weather: [
    { targetAt: "2026-08-31T16:00:00+09:00", precipitationProbability: 60, temperatureTenthC: 330 },
  ] });
  assert.deepEqual(umbrella.weatherAdvice, { kind: "UMBRELLA", probability: 60, targetAt: "2026-08-31T16:00:00+09:00" });
  const check = buildAreaCurrentBrief({ realtime: null, realtimeForecast: [], eventCount: 0, nowIso: NOW, weather: [
    { targetAt: "2026-08-31T16:00:00+09:00", precipitationProbability: 40, temperatureTenthC: 200 },
  ] });
  assert.equal(check.weatherAdvice?.kind, "CHECK_RAIN");
});

test("weather advice uses heat/cold only when rain is not meaningful and omits filler otherwise", () => {
  const hot = buildAreaCurrentBrief({ realtime: null, realtimeForecast: [], eventCount: 0, nowIso: NOW, weather: [
    { targetAt: "2026-08-31T16:00:00+09:00", precipitationProbability: 10, temperatureTenthC: 310 },
  ] });
  assert.equal(hot.weatherAdvice?.kind, "HOT");
  const quiet = buildAreaCurrentBrief({ realtime: null, realtimeForecast: [], eventCount: 0, nowIso: NOW, weather: [
    { targetAt: "2026-08-31T16:00:00+09:00", precipitationProbability: 10, temperatureTenthC: 210 },
  ] });
  assert.equal(quiet.weatherAdvice, null);
});

test("area brief preserves stale realtime and treats event count as context, not causality", () => {
  const result = buildAreaCurrentBrief({
    realtime: { congestionLevel: 3, populationMin: 1, populationMax: 2, observedAt: NOW, freshness: "STALE" },
    realtimeForecast: [], weather: [], eventCount: 2, nowIso: NOW,
  });
  assert.equal(result.current?.freshness, "STALE");
  assert.equal(result.eventCount, 2);
  assert.ok(result.evidenceTypes.includes("EVENTS"));
});

const congestion = [
  { terminal: "T1", zone: "P01", waitTimeMinutes: 12, waitTimeRaw: "12", waitingCount: 90, observedAt: NOW },
  { terminal: "T2", zone: "DG1_B", waitTimeMinutes: null, waitTimeRaw: "60+", waitingCount: 30, observedAt: NOW },
  { terminal: "T2", zone: "DG1_A", waitTimeMinutes: null, waitTimeRaw: null, waitingCount: 300, observedAt: NOW },
];

test("airport brief isolates T1/T2 and all scope uses comparable wait-time evidence", () => {
  const common = { congestion, forecastCoverage: "UNAVAILABLE", peak: null, departures: null, topGate: null };
  assert.equal(buildAirportCurrentBrief({ ...common, scope: "T1" }).checkpoint?.zone, "P01");
  assert.equal(buildAirportCurrentBrief({ ...common, scope: "T2" }).checkpoint?.zone, "DG1_B");
  assert.equal(buildAirportCurrentBrief({ ...common, scope: "all" }).checkpoint?.zone, "DG1_B");
});

test("airport brief preserves raw 60+ and never lets a people-only row beat usable minutes", () => {
  const result = buildAirportCurrentBrief({ scope: "T2", congestion, forecastCoverage: "UNAVAILABLE", peak: null, departures: null, topGate: null });
  assert.equal(result.checkpointBasis, "WAIT_TIME");
  assert.equal(result.checkpoint?.waitTimeRaw, "60+");
});

test("airport brief falls back to waitingCount only when the selected scope has no wait time", () => {
  const result = buildAirportCurrentBrief({ scope: "T1", congestion: [
    { terminal: "T1", zone: "P01", waitTimeMinutes: null, waitTimeRaw: null, waitingCount: 20, observedAt: NOW },
    { terminal: "T1", zone: "P02", waitTimeMinutes: null, waitTimeRaw: null, waitingCount: 50, observedAt: NOW },
  ], forecastCoverage: "UNAVAILABLE", peak: null, departures: null, topGate: null });
  assert.equal(result.checkpointBasis, "WAITING_COUNT");
  assert.equal(result.checkpoint?.zone, "P02");
});

test("airport A5 peak is exposed only for COMPLETE coverage", () => {
  const peak = { targetStartAt: "2026-08-31T18:00:00+09:00", targetEndAt: "2026-08-31T19:00:00+09:00", expectedPassengers: 6000 };
  assert.equal(buildAirportCurrentBrief({ scope: "all", congestion: [], forecastCoverage: "COMPLETE", peak, departures: null, topGate: null }).peak, peak);
  assert.equal(buildAirportCurrentBrief({ scope: "all", congestion: [], forecastCoverage: "PARTIAL", peak, departures: null, topGate: null }).peak, null);
  assert.equal(buildAirportCurrentBrief({ scope: "all", congestion: [], forecastCoverage: "UNAVAILABLE", peak, departures: null, topGate: null }).peak, null);
});

test("airport operation facts stay flights/gate assignments and separate from checkpoints", () => {
  const result = buildAirportCurrentBrief({ scope: "T2", congestion: [], forecastCoverage: "UNAVAILABLE", peak: null, departures: 254, topGate: { terminal: "T2", gate: "253", flights: 6 } });
  assert.equal(result.departures, 254);
  assert.deepEqual(result.topGate, { terminal: "T2", gate: "253", flights: 6 });
  assert.equal(result.checkpoint, null);
  assert.deepEqual(result.evidenceTypes, ["FLIGHTS"]);
});

test("human freshness renders today, yesterday and older KST dates without repeated numeric noise", () => {
  assert.equal(formatHumanFreshness("2026-08-31T09:34:00+09:00", "2026-08-31T12:00:00+09:00", "ko"), "09:34 기준");
  assert.equal(formatHumanFreshness("2026-08-30T23:40:00+09:00", "2026-08-31T12:00:00+09:00", "ko"), "어제 23:40 기준");
  assert.match(formatHumanFreshness("2026-08-28T09:10:00+09:00", "2026-08-31T12:00:00+09:00", "ko"), /8월 28일 09:10 기준/);

  // A clock face alone cannot say WHICH question it answers. The airport cards
  // showed a forecast collected at 08:42 next to a sum starting at 14:00, and
  // both read as "기준" — so the same number looked dated twice.
  const now = "2026-09-01T14:33:00+09:00";
  const collected = "2026-09-01T08:42:00+09:00";
  assert.equal(formatHumanFreshness(collected, now, "ko"), "08:42 기준");
  assert.equal(formatHumanFreshness(collected, now, "ko", "collected"), "08:42 수집");
  assert.equal(formatHumanFreshness(collected, now, "ko", "observed"), "08:42 관측");
  assert.equal(formatHumanFreshness(collected, now, "ko", "plain"), "08:42");
  assert.equal(formatHumanFreshness("2026-08-31T23:40:00+09:00", now, "ko", "collected"), "어제 23:40 수집");
  assert.equal(formatHumanFreshness(collected, now, "en", "collected"), "Collected 08:42");
  assert.equal(formatHumanFreshness(collected, now, "en", "observed"), "Observed 08:42");
  assert.equal(formatHumanFreshness(collected, now, "ja", "collected"), "08:42 取得");
  assert.equal(formatHumanFreshness(collected, now, "zh", "observed"), "08:42 观测");
});

/* ── The hour the reader is standing in ───────────────────────────────── */

// 14:00 KST bands across a short day, so "now" (14:00) is the third.
const BANDS = [
  { targetStartAt: "2026-08-31T12:00:00+09:00", targetEndAt: "2026-08-31T13:00:00+09:00", expectedPassengers: 1000 },
  { targetStartAt: "2026-08-31T13:00:00+09:00", targetEndAt: "2026-08-31T14:00:00+09:00", expectedPassengers: 4000 },
  { targetStartAt: "2026-08-31T14:00:00+09:00", targetEndAt: "2026-08-31T15:00:00+09:00", expectedPassengers: 2000 },
  { targetStartAt: "2026-08-31T15:00:00+09:00", targetEndAt: "2026-08-31T16:00:00+09:00", expectedPassengers: 3000 },
];

test("the now band is the one containing this moment, with the next band and the share of the peak", () => {
  const band = selectAirportNowBand({ timeline: BANDS, nowIso: NOW, peakExpectedPassengers: 4000, isToday: true });
  assert.equal(band?.targetStartAt, "2026-08-31T14:00:00+09:00");
  assert.equal(band?.expectedPassengers, 2000);
  assert.equal(band?.nextExpectedPassengers, 3000);
  assert.equal(band?.nextTargetStartAt, "2026-08-31T15:00:00+09:00");
  assert.equal(band?.nextTargetEndAt, "2026-08-31T16:00:00+09:00");
  assert.equal(band?.peakShare, 0.5);
});

test("the last band of the day reports no next band rather than wrapping to the first", () => {
  const band = selectAirportNowBand({
    timeline: BANDS,
    nowIso: "2026-08-31T06:30:00Z", // 15:30 KST, inside the final band
    peakExpectedPassengers: 4000,
    isToday: true,
  });
  assert.equal(band?.targetStartAt, "2026-08-31T15:00:00+09:00");
  assert.equal(band?.nextExpectedPassengers, null,
    "a wrap-around would claim the day starts again after it ends");
});

test('"now" is refused on a date the reader is not standing in', () => {
  assert.equal(selectAirportNowBand({ timeline: BANDS, nowIso: NOW, peakExpectedPassengers: 4000, isToday: false }), null);
});

test("a moment outside every band yields no now band", () => {
  assert.equal(selectAirportNowBand({
    timeline: BANDS, nowIso: "2026-08-30T22:00:00Z", peakExpectedPassengers: 4000, isToday: true,
  }), null);
});

test("no peak means no share, never a share of zero or of nothing", () => {
  assert.equal(selectAirportNowBand({ timeline: BANDS, nowIso: NOW, peakExpectedPassengers: null, isToday: true })?.peakShare, null);
  assert.equal(selectAirportNowBand({ timeline: BANDS, nowIso: NOW, peakExpectedPassengers: 0, isToday: true })?.peakShare, null);
});

test("a partial forecast day drops the now band, because a gap can hide the very next hour", () => {
  const nowBand = selectAirportNowBand({ timeline: BANDS, nowIso: NOW, peakExpectedPassengers: 4000, isToday: true });
  const common = {
    scope: "all", congestion: [], peak: null, departures: 100, topGate: null, nowBand,
  };
  assert.equal(buildAirportCurrentBrief({ ...common, forecastCoverage: "PARTIAL" }).nowBand, null);
  assert.equal(buildAirportCurrentBrief({ ...common, forecastCoverage: "UNAVAILABLE" }).nowBand, null);
  assert.equal(buildAirportCurrentBrief({ ...common, forecastCoverage: "COMPLETE" }).nowBand?.expectedPassengers, 2000);
});

test("the now band counts as passenger-forecast evidence even when no peak was proven", () => {
  const nowBand = selectAirportNowBand({ timeline: BANDS, nowIso: NOW, peakExpectedPassengers: null, isToday: true });
  const brief = buildAirportCurrentBrief({
    scope: "all", congestion: [], forecastCoverage: "COMPLETE", peak: null, nowBand, departures: null, topGate: null,
  });
  assert.deepEqual(brief.evidenceTypes, ["PASSENGER_FORECAST"]);
});
