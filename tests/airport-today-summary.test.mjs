import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  summarizeCurrentBusiestDepartureHalls,
  summarizeTodayPassengerForecast,
  summarizeTodayTopGate,
} from "../lib/airport-today-summary.ts";
import { formatKstServicePeriod } from "../app/live-signals.tsx";

const forecast = (overrides = {}) => ({
  terminal: "T1", direction: "departure", isAggregate: 1,
  targetDate: "2026-08-31", timeBandRaw: "15_16",
  targetStartAt: "2026-08-31T15:00:00+09:00", targetEndAt: "2026-08-31T16:00:00+09:00",
  expectedPassengers: 100, retrievedAt: "2026-08-31T10:00:00+09:00", ...overrides,
});

test("A5 today totals use only official aggregate rows and keep terminals separate", () => {
  const summary = summarizeTodayPassengerForecast([
    forecast(),
    forecast({ terminal: "T2", expectedPassengers: 200 }),
    forecast({ terminal: "T1", isAggregate: 0, expectedPassengers: 9999 }),
    forecast({ direction: "arrival", expectedPassengers: 8888 }),
  ]);
  assert.equal(summary.total, 300);
  assert.deepEqual(summary.byTerminal, { T1: 100, T2: 200 });
});

test("A5 peak combines matching T1/T2 aggregate bands without component double count", () => {
  const summary = summarizeTodayPassengerForecast([
    forecast({ expectedPassengers: 100 }),
    forecast({ terminal: "T2", expectedPassengers: 200 }),
    forecast({ timeBandRaw: "16_17", targetStartAt: "2026-08-31T16:00:00+09:00", targetEndAt: "2026-08-31T17:00:00+09:00", expectedPassengers: 250 }),
    forecast({ terminal: "T2", timeBandRaw: "16_17", targetStartAt: "2026-08-31T16:00:00+09:00", targetEndAt: "2026-08-31T17:00:00+09:00", expectedPassengers: 300 }),
    forecast({ isAggregate: 0, expectedPassengers: 9000 }),
  ]);
  assert.equal(summary.peak.expectedPassengers, 550);
  assert.equal(summary.peak.targetStartAt, "2026-08-31T16:00:00+09:00");
});

test("today top gate counts distinct physical flights and excludes empty gates", () => {
  const summary = summarizeTodayTopGate([
    { physicalFlightId: "A", terminal: "T1", gate: "27", retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "A", terminal: "T1", gate: "27", retrievedAt: "2026-08-31T01:01:00Z" },
    { physicalFlightId: "B", terminal: "T1", gate: "27", retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "C", terminal: "T2", gate: " ", retrievedAt: "2026-08-31T01:00:00Z" },
  ], 0.5);
  assert.equal(summary.departuresTrackedToday, 3);
  assert.deepEqual(summary.topDepartureGate, { terminal: "T1", gate: "27", flights: 2 });
});

test("sparse gate coverage yields unavailable instead of a fabricated top gate", () => {
  const summary = summarizeTodayTopGate([
    { physicalFlightId: "A", terminal: "T1", gate: "27", retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "B", terminal: "T1", gate: null, retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "C", terminal: "T2", gate: null, retrievedAt: "2026-08-31T01:00:00Z" },
  ], 0.5);
  assert.equal(summary.topDepartureGate, null);
});

test("A4 busiest checkpoint remains separate by terminal and preserves raw wait", () => {
  const result = summarizeCurrentBusiestDepartureHalls([
    { terminal: "T1", zone: "P01", waitTimeMinutes: 24, waitTimeRaw: "24", waitingCount: 81, observedAt: "2026-08-31T14:07:00+09:00" },
    { terminal: "T1", zone: "P02", waitTimeMinutes: 10, waitTimeRaw: "10", waitingCount: 42, observedAt: "2026-08-31T14:07:00+09:00" },
    { terminal: "T2", zone: "DG2_1", waitTimeMinutes: null, waitTimeRaw: "60+", waitingCount: 90, observedAt: "2026-08-31T14:06:00+09:00" },
  ]);
  assert.equal(result.T1.zone, "P01");
  assert.equal(result.T2.waitTimeRaw, "60+");
});

test("KST period is exact and stale public readiness claims are removed", () => {
  assert.match(formatKstServicePeriod("2026-08-31", "ko"), /2026\. 08\. 31\.|2026\.08\.31/);
  assert.match(formatKstServicePeriod("2026-08-31", "ko"), /00:00–23:59 KST/);
  const app = readFileSync(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  assert.equal(app.includes("실시간 공항 데이터 연결 준비 중"), false);
  assert.equal(app.includes("site still calls zero live data APIs"), false);
  const signals = readFileSync(new URL("../app/live-signals.tsx", import.meta.url), "utf8");
  assert.match(signals, /실제 운항편 기준 · 승객 수 아님/);
  assert.match(signals, /인천공항 공식 예상 · 실제 출국객 집계 아님/);
  assert.match(signals, /출국장 체크포인트 관측 · 탑승 게이트 아님/);
});
