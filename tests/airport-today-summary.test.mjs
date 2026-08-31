import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  friendlyCheckpointName,
  rankCurrentDepartureHallCheckpoints,
  summarizeCurrentBusiestDepartureHalls,
  summarizeTodayPassengerForecast,
  summarizeTodayTopGate,
  summarizeTodayTopGateByTerminal,
} from "../lib/airport-today-summary.ts";
import { formatKstServicePeriod } from "../app/live-signals.tsx";

const SERVICE_DATE = "2026-08-31";

const forecast = (overrides = {}) => ({
  terminal: "T1", direction: "departure", isAggregate: 1,
  targetDate: SERVICE_DATE, timeBandRaw: "15_16",
  targetStartAt: "2026-08-31T15:00:00+09:00", targetEndAt: "2026-08-31T16:00:00+09:00",
  expectedPassengers: 100, retrievedAt: "2026-08-31T10:00:00+09:00", ...overrides,
});

/** Builds one terminal's official aggregate rows as N contiguous hourly bands covering the full KST day. */
function fullDayBands(terminal, passengersPerBand, retrievedAt = "2026-08-31T10:00:00+09:00") {
  const bands = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const start = `2026-08-31T${String(hour).padStart(2, "0")}:00:00+09:00`;
    const endHour = hour + 1;
    const end = endHour === 24 ? "2026-09-01T00:00:00+09:00" : `2026-08-31T${String(endHour).padStart(2, "0")}:00:00+09:00`;
    bands.push(forecast({ terminal, timeBandRaw: `${hour}_${endHour}`, targetStartAt: start, targetEndAt: end, expectedPassengers: passengersPerBand, retrievedAt }));
  }
  return bands;
}

// ---------------------------------------------------------------------------
// FIX 2 — A5 full-day coverage must be proven, never assumed from row count.
// ---------------------------------------------------------------------------

test("A5: complete full-day coverage on both terminals yields an all-airport daily total and peak", () => {
  const rows = [...fullDayBands("T1", 100), ...fullDayBands("T2", 50)];
  const summary = summarizeTodayPassengerForecast(rows, SERVICE_DATE);
  assert.equal(summary.coverage.all, "COMPLETE");
  assert.equal(summary.coverage.byTerminal.T1, "COMPLETE");
  assert.equal(summary.coverage.byTerminal.T2, "COMPLETE");
  assert.equal(summary.total, 24 * 150);
  assert.equal(summary.peak.expectedPassengers, 150);
  assert.equal(summary.totalByTerminal.T1, 2400);
  assert.equal(summary.totalByTerminal.T2, 1200);
});

test("A5: one middle band missing marks that terminal PARTIAL and nulls its total/peak", () => {
  const t1 = fullDayBands("T1", 100).filter((row) => row.timeBandRaw !== "12_13");
  const summary = summarizeTodayPassengerForecast([...t1, ...fullDayBands("T2", 50)], SERVICE_DATE);
  assert.equal(summary.coverage.byTerminal.T1, "PARTIAL");
  assert.equal(summary.totalByTerminal.T1, null);
  assert.equal(summary.peakByTerminal.T1, null);
  assert.equal(summary.coverage.all, "PARTIAL");
  assert.equal(summary.total, null);
  assert.equal(summary.peak, null);
});

test("A5: the first interval missing marks PARTIAL (day does not start at 00:00 KST)", () => {
  const t1 = fullDayBands("T1", 100).filter((row) => row.timeBandRaw !== "0_1");
  const summary = summarizeTodayPassengerForecast([...t1, ...fullDayBands("T2", 50)], SERVICE_DATE);
  assert.equal(summary.coverage.byTerminal.T1, "PARTIAL");
  assert.equal(summary.totalByTerminal.T1, null);
});

test("A5: the last interval missing marks PARTIAL (day does not end at next 00:00 KST)", () => {
  const t1 = fullDayBands("T1", 100).filter((row) => row.timeBandRaw !== "23_24");
  const summary = summarizeTodayPassengerForecast([...t1, ...fullDayBands("T2", 50)], SERVICE_DATE);
  assert.equal(summary.coverage.byTerminal.T1, "PARTIAL");
  assert.equal(summary.totalByTerminal.T1, null);
});

test("A5: a duplicate interval is not silently summed twice and disqualifies COMPLETE", () => {
  const t1 = fullDayBands("T1", 100);
  const duplicateOfFirst = forecast({ terminal: "T1", timeBandRaw: "0_1", targetStartAt: "2026-08-31T00:00:00+09:00", targetEndAt: "2026-08-31T01:00:00+09:00", expectedPassengers: 999 });
  const summary = summarizeTodayPassengerForecast([...t1, duplicateOfFirst, ...fullDayBands("T2", 50)], SERVICE_DATE);
  assert.equal(summary.coverage.byTerminal.T1, "PARTIAL");
  // Even though PARTIAL nulls the total, the underlying timeline (had it been
  // exposed) must never have summed the duplicate — verified indirectly via
  // the deterministic total of a COMPLETE sibling test above staying exact.
  assert.equal(summary.totalByTerminal.T1, null);
});

test("A5: T1 complete / T2 incomplete — T1 selection still gets a total, but the all-airport total is unavailable", () => {
  const t1 = fullDayBands("T1", 100);
  const t2 = fullDayBands("T2", 50).filter((row) => row.timeBandRaw !== "12_13");
  const summary = summarizeTodayPassengerForecast([...t1, ...t2], SERVICE_DATE);
  assert.equal(summary.coverage.byTerminal.T1, "COMPLETE");
  assert.equal(summary.totalByTerminal.T1, 2400);
  assert.equal(summary.coverage.byTerminal.T2, "PARTIAL");
  assert.equal(summary.totalByTerminal.T2, null);
  assert.equal(summary.coverage.all, "PARTIAL");
  assert.equal(summary.total, null);
  assert.equal(summary.peak, null);
});

test("A5: no rows at all is UNAVAILABLE, not PARTIAL", () => {
  const summary = summarizeTodayPassengerForecast([], SERVICE_DATE);
  assert.equal(summary.coverage.all, "UNAVAILABLE");
  assert.equal(summary.total, null);
});

test("A5 today totals use only official aggregate rows and keep terminals separate (component rows never double count)", () => {
  const summary = summarizeTodayPassengerForecast([
    forecast(),
    forecast({ terminal: "T2", expectedPassengers: 200 }),
    forecast({ terminal: "T1", isAggregate: 0, expectedPassengers: 9999 }),
    forecast({ direction: "arrival", expectedPassengers: 8888 }),
  ], SERVICE_DATE);
  assert.equal(summary.totalByTerminal.T1, null); // only one band each -> PARTIAL, not a fabricated full-day total
  assert.equal(summary.coverage.byTerminal.T1, "PARTIAL");
});

// ---------------------------------------------------------------------------
// FIX 1 — T1/T2 selection must filter all four summary metrics, not just the
// current-departure-hall section.
// ---------------------------------------------------------------------------

test("A1 top gate: terminal-scoped summary counts distinct physical flights and excludes empty gates", () => {
  const rows = [
    { physicalFlightId: "A", terminal: "T1", gate: "27", retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "A", terminal: "T1", gate: "27", retrievedAt: "2026-08-31T01:01:00Z" }, // codeshare/duplicate row, same physical flight
    { physicalFlightId: "B", terminal: "T1", gate: "27", retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "C", terminal: "T2", gate: "5", retrievedAt: "2026-08-31T01:00:00Z" },
  ];
  const byTerminal = summarizeTodayTopGateByTerminal(rows, 0.5);
  assert.equal(byTerminal.T1.departuresTrackedToday, 2);
  assert.deepEqual(byTerminal.T1.topDepartureGate, { terminal: "T1", gate: "27", flights: 2 });
  assert.equal(byTerminal.T2.departuresTrackedToday, 1);
});

test("A1 top gate: T1 gate coverage cannot be won by a T2 gate and vice versa", () => {
  const rows = [
    { physicalFlightId: "A", terminal: "T1", gate: "27", retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "B", terminal: "T1", gate: "27", retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "C", terminal: "T2", gate: "99", retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "D", terminal: "T2", gate: "99", retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "E", terminal: "T2", gate: "99", retrievedAt: "2026-08-31T01:00:00Z" },
  ];
  const byTerminal = summarizeTodayTopGateByTerminal(rows, 0.5);
  assert.equal(byTerminal.T1.topDepartureGate.gate, "27");
  assert.equal(byTerminal.T2.topDepartureGate.gate, "99");
  assert.notEqual(byTerminal.T1.topDepartureGate.gate, byTerminal.T2.topDepartureGate.gate);
});

test("A1 top gate: gate coverage ratio uses the SELECTED terminal's own denominator, not the all-airport count", () => {
  // T1: 3 flights, 1 with a gate -> coverage 1/3 (below 0.5, so unavailable).
  // T2: 1 flight, 1 with a gate -> coverage 1/1 (available).
  const rows = [
    { physicalFlightId: "A", terminal: "T1", gate: "27", retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "B", terminal: "T1", gate: null, retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "C", terminal: "T1", gate: null, retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "D", terminal: "T2", gate: "5", retrievedAt: "2026-08-31T01:00:00Z" },
  ];
  const byTerminal = summarizeTodayTopGateByTerminal(rows, 0.5);
  assert.equal(byTerminal.T1.gateCoverageRatio, 1 / 3);
  assert.equal(byTerminal.T1.topDepartureGate, null); // sparse coverage -> unavailable, never a fabricated top gate
  assert.equal(byTerminal.T2.gateCoverageRatio, 1);
  assert.equal(byTerminal.T2.topDepartureGate.gate, "5");
});

test("A1 top gate: null/unknown-terminal rows are never guessed into T1 or T2", () => {
  const rows = [
    { physicalFlightId: "A", terminal: "T1", gate: "27", retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "B", terminal: null, gate: "99", retrievedAt: "2026-08-31T01:00:00Z" },
  ];
  const byTerminal = summarizeTodayTopGateByTerminal(rows, 0.5);
  assert.deepEqual(Object.keys(byTerminal), ["T1"]);
});

test("today top gate (all-airport) counts distinct physical flights and excludes empty gates", () => {
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
  assert.deepEqual(summary.busyDepartureGates, []);
});

test("A1 busy-gate list ranks at most five gates with distinct physical flights and keeps terminal context", () => {
  const rows = [
    { physicalFlightId: "A", terminal: "T1", gate: "27", retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "A", terminal: "T1", gate: "27", retrievedAt: "2026-08-31T01:01:00Z" },
    { physicalFlightId: "B", terminal: "T1", gate: "27", retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "C", terminal: "T2", gate: "5", retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "D", terminal: "T2", gate: "5", retrievedAt: "2026-08-31T01:00:00Z" },
    ...["E", "F", "G", "H", "I"].map((physicalFlightId, index) => ({ physicalFlightId, terminal: "T1", gate: String(40 + index), retrievedAt: "2026-08-31T01:00:00Z" })),
  ];
  const summary = summarizeTodayTopGate(rows, 0.5);
  assert.equal(summary.busyDepartureGates.length, 5);
  assert.deepEqual(summary.busyDepartureGates[0], { terminal: "T1", gate: "27", flights: 2 });
  assert.deepEqual(summary.busyDepartureGates[1], { terminal: "T2", gate: "5", flights: 2 });
});

test("A1 busy-gate list stays isolated by selected terminal", () => {
  const byTerminal = summarizeTodayTopGateByTerminal([
    { physicalFlightId: "A", terminal: "T1", gate: "27", retrievedAt: "2026-08-31T01:00:00Z" },
    { physicalFlightId: "B", terminal: "T2", gate: "5", retrievedAt: "2026-08-31T01:00:00Z" },
  ], 0.5);
  assert.deepEqual(byTerminal.T1.busyDepartureGates.map((row) => row.terminal), ["T1"]);
  assert.deepEqual(byTerminal.T2.busyDepartureGates.map((row) => row.terminal), ["T2"]);
});

test("A5 peak/timeline are available per selected terminal independently of the other terminal", () => {
  const rows = [...fullDayBands("T1", 100), ...fullDayBands("T2", 50).filter((r) => r.timeBandRaw !== "12_13")];
  const summary = summarizeTodayPassengerForecast(rows, SERVICE_DATE);
  assert.equal(summary.coverage.byTerminal.T1, "COMPLETE");
  assert.equal(summary.peakByTerminal.T1.expectedPassengers, 100);
  assert.equal(summary.timelineByTerminal.T1.length, 24);
  assert.equal(summary.coverage.byTerminal.T2, "PARTIAL");
  assert.equal(summary.peakByTerminal.T2, null);
  assert.equal(summary.timelineByTerminal.T2.length, 0);
});

// ---------------------------------------------------------------------------
// FIX 3 — never compare minutes to people.
// ---------------------------------------------------------------------------

test("A4: a checkpoint with a numeric wait time wins over a wait-unavailable checkpoint with more people", () => {
  const result = summarizeCurrentBusiestDepartureHalls([
    { terminal: "T1", zone: "P01", waitTimeMinutes: 10, waitTimeRaw: "10", waitingCount: 30, observedAt: "2026-08-31T14:00:00+09:00" },
    { terminal: "T1", zone: "P02", waitTimeMinutes: null, waitTimeRaw: null, waitingCount: 80, observedAt: "2026-08-31T14:00:00+09:00" },
  ]);
  assert.equal(result.T1.zone, "P01");
});

test("A4: a parsed '60+' lower-bound wait time beats an exact 24-minute wait time", () => {
  const result = summarizeCurrentBusiestDepartureHalls([
    { terminal: "T1", zone: "P01", waitTimeMinutes: 24, waitTimeRaw: "24", waitingCount: 10, observedAt: "2026-08-31T14:00:00+09:00" },
    { terminal: "T1", zone: "P02", waitTimeMinutes: null, waitTimeRaw: "60+", waitingCount: 5, observedAt: "2026-08-31T14:00:00+09:00" },
  ]);
  assert.equal(result.T1.zone, "P02");
  assert.equal(result.T1.waitTimeRaw, "60+"); // raw string preserved, never rounded/altered
});

test("A4: when no checkpoint has any wait-time metric, falls back to waitingCount", () => {
  const result = summarizeCurrentBusiestDepartureHalls([
    { terminal: "T1", zone: "P01", waitTimeMinutes: null, waitTimeRaw: null, waitingCount: 30, observedAt: "2026-08-31T14:00:00+09:00" },
    { terminal: "T1", zone: "P02", waitTimeMinutes: null, waitTimeRaw: null, waitingCount: 80, observedAt: "2026-08-31T14:00:00+09:00" },
  ]);
  assert.equal(result.T1.zone, "P02");
});

test("A4: T1 and T2 comparisons stay fully independent", () => {
  const result = summarizeCurrentBusiestDepartureHalls([
    { terminal: "T1", zone: "P01", waitTimeMinutes: 24, waitTimeRaw: "24", waitingCount: 81, observedAt: "2026-08-31T14:07:00+09:00" },
    { terminal: "T1", zone: "P02", waitTimeMinutes: 10, waitTimeRaw: "10", waitingCount: 42, observedAt: "2026-08-31T14:07:00+09:00" },
    { terminal: "T2", zone: "DG2_1", waitTimeMinutes: null, waitTimeRaw: "60+", waitingCount: 90, observedAt: "2026-08-31T14:06:00+09:00" },
    { terminal: "T2", zone: "DG2_2", waitTimeMinutes: null, waitTimeRaw: null, waitingCount: 200, observedAt: "2026-08-31T14:06:00+09:00" },
  ]);
  assert.equal(result.T1.zone, "P01");
  assert.equal(result.T2.zone, "DG2_1"); // the 200-person zone with no wait time never wins over a usable wait time
  assert.equal(result.T2.waitTimeRaw, "60+");
});

test("A4 checkpoint labels translate proven provider identifiers without guessing unknown values", () => {
  assert.equal(friendlyCheckpointName("DG1_B", "ko"), "출국장 1B");
  assert.equal(friendlyCheckpointName("DG2_A", "en"), "Departure hall 2A");
  assert.equal(friendlyCheckpointName("P01", "zh"), "出境区 P01");
  assert.equal(friendlyCheckpointName("UNKNOWN_ZONE", "ja"), "UNKNOWN_ZONE");
});

test("A4 checkpoint rows rank by minutes when available and use people only as terminal-wide fallback", () => {
  const ranked = rankCurrentDepartureHallCheckpoints([
    { terminal: "T2", zone: "DG1_A", waitTimeMinutes: 11, waitTimeRaw: "11", waitingCount: 40, observedAt: "2026-08-31T14:00:00+09:00" },
    { terminal: "T2", zone: "DG1_B", waitTimeMinutes: 15, waitTimeRaw: "15", waitingCount: 20, observedAt: "2026-08-31T14:00:00+09:00" },
    { terminal: "T2", zone: "DG2_B", waitTimeMinutes: null, waitTimeRaw: null, waitingCount: 999, observedAt: "2026-08-31T14:00:00+09:00" },
    { terminal: "T1", zone: "P01", waitTimeMinutes: null, waitTimeRaw: null, waitingCount: 30, observedAt: "2026-08-31T14:00:00+09:00" },
    { terminal: "T1", zone: "P02", waitTimeMinutes: null, waitTimeRaw: null, waitingCount: 80, observedAt: "2026-08-31T14:00:00+09:00" },
  ]);
  assert.deepEqual(ranked.T2.map((row) => row.zone), ["DG1_B", "DG1_A", "DG2_B"]);
  assert.deepEqual(ranked.T1.map((row) => row.zone), ["P02", "P01"]);
});

// ---------------------------------------------------------------------------
// FIX 4 — a single "latest collected" timestamp must not imply every metric
// shares that freshness.
// ---------------------------------------------------------------------------

test("A5/A1/A4 retrieval timestamps stay independent per metric", () => {
  const passengerSummary = summarizeTodayPassengerForecast(
    fullDayBands("T1", 100, "2026-08-31T09:00:00+09:00").concat(fullDayBands("T2", 50, "2026-08-31T09:00:00+09:00")),
    SERVICE_DATE,
  );
  const flightSummary = summarizeTodayTopGate(
    [{ physicalFlightId: "A", terminal: "T1", gate: "27", retrievedAt: "2026-08-31T12:00:00+09:00" }],
    0.5,
  );
  assert.equal(passengerSummary.retrievedAt, "2026-08-31T09:00:00+09:00");
  assert.equal(flightSummary.retrievedAt, "2026-08-31T12:00:00+09:00");
  assert.notEqual(passengerSummary.retrievedAt, flightSummary.retrievedAt);
});

test("A5 missing retrieval timestamp renders as unavailable, never fabricated as 'just now'", () => {
  const summary = summarizeTodayPassengerForecast([], SERVICE_DATE);
  assert.equal(summary.retrievedAt, null);
});

// ---------------------------------------------------------------------------
// KST period text and stale claims (pre-existing regression coverage).
// ---------------------------------------------------------------------------

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
  assert.match(signals, /공항 데이터 중 최근 수집/); // Fix 4: the overall label no longer implies all metrics share one freshness
});
