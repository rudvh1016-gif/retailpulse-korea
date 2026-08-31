import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAirportCurrentBrief,
  buildAreaCurrentBrief,
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

test("area brief never calls a next-day forecast today's remaining peak", () => {
  const brief = buildAreaCurrentBrief({
    realtime: null,
    realtimeForecast: [{ targetAt: "2026-09-01T00:00:00+09:00", congestionLevel: 4, populationMin: 38_000, populationMax: 40_000 }],
    weather: [],
    eventCount: 0,
    nowIso: "2026-08-31T23:30:00+09:00",
  });
  assert.equal(brief.upcomingPeak, null);
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
});
