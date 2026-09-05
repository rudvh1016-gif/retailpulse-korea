import assert from "node:assert/strict";
import test from "node:test";

import { buildTerminalBriefings, selectNextBand } from "../lib/terminal-briefing.ts";

const NOW = "2026-08-31T05:10:00Z"; // 14:10 KST

const band = (startHour, endHour, expected) => ({
  targetStartAt: `2026-08-31T${String(startHour).padStart(2, "0")}:00:00+09:00`,
  targetEndAt: `2026-08-31T${String(endHour).padStart(2, "0")}:00:00+09:00`,
  expectedPassengers: expected,
});

const baseInput = () => ({
  terminals: ["T1", "T2"],
  congestion: [
    { terminal: "T1", zone: "P01-DG1", waitTimeMinutes: 25, waitingCount: 300, observedAt: NOW, freshness: "LIVE" },
    { terminal: "T1", zone: "P01-DG3", waitTimeMinutes: 10, waitingCount: 90, observedAt: NOW, freshness: "LIVE" },
    { terminal: "T2", zone: "P03-DG1", waitTimeMinutes: 12, waitingCount: 120, observedAt: NOW, freshness: "LIVE" },
  ],
  timelineByTerminal: {
    T1: [band(13, 14, 1_800), band(14, 15, 2_400), band(15, 16, 2_100)],
    T2: [band(13, 14, 900), band(14, 15, 1_500), band(15, 16, 1_700)],
  },
  coverageByTerminal: { T1: "COMPLETE", T2: "COMPLETE" },
  peakByTerminal: { T1: band(14, 15, 2_400), T2: band(15, 16, 1_700) },
  remainingByTerminal: {
    T1: { expectedPassengers: 9_000, fromAt: "2026-08-31T14:00:00+09:00", toAt: "2026-09-01T00:00:00+09:00", bands: 10 },
    T2: { expectedPassengers: 6_000, fromAt: "2026-08-31T14:00:00+09:00", toAt: "2026-09-01T00:00:00+09:00", bands: 10 },
  },
  departuresByTerminal: { T1: 310, T2: 190 },
  topGateByTerminal: { T1: { terminal: "T1", gate: "29", flights: 14 }, T2: { terminal: "T2", gate: "248", flights: 9 } },
  dayRelation: "TODAY",
  nowIso: NOW,
});

test("each terminal card carries only that terminal's longest observed wait, next official band, peak, remaining, flights and gate", () => {
  const { terminals } = buildTerminalBriefings(baseInput());
  assert.equal(terminals.length, 2);
  const [t1, t2] = terminals;
  assert.equal(t1.checkpoint?.zone, "P01-DG1");
  assert.equal(t1.checkpointBasis, "WAIT_TIME");
  assert.equal(t1.nextBand?.targetStartAt, "2026-08-31T15:00:00+09:00", "next excludes the currently running 14:00 band");
  assert.equal(t1.peak?.expectedPassengers, 2_400);
  assert.equal(t1.remaining?.expectedPassengers, 9_000);
  assert.equal(t1.departures, 310);
  assert.equal(t1.topGate?.gate, "29");
  assert.deepEqual(t1.evidenceTypes, ["CHECKPOINT", "NEXT_BAND", "PEAK", "FLIGHTS"]);
  assert.equal(t2.checkpoint?.zone, "P03-DG1", "T2 never inherits a T1 checkpoint");
  assert.equal(t2.topGate?.gate, "248");
});

test("attention is the terminal with the longest observed wait, and says so", () => {
  const { attention } = buildTerminalBriefings(baseInput());
  assert.deepEqual(attention, { terminal: "T1", basis: "OBSERVED_WAIT" });
});

test("an equal observed wait picks nobody rather than an arbitrary terminal", () => {
  const input = baseInput();
  input.congestion = [
    { terminal: "T1", zone: "P01-DG1", waitTimeMinutes: 20, waitingCount: 300, observedAt: NOW, freshness: "LIVE" },
    { terminal: "T2", zone: "P03-DG1", waitTimeMinutes: 20, waitingCount: 120, observedAt: NOW, freshness: "LIVE" },
  ];
  assert.equal(buildTerminalBriefings(input).attention, null);
});

test("without any comparable wait, the larger official next band decides and the basis is labelled forecast", () => {
  const input = baseInput();
  input.congestion = [];
  assert.deepEqual(buildTerminalBriefings(input).attention, { terminal: "T1", basis: "FORECAST_NEXT_BAND" });
  input.timelineByTerminal = { T1: [], T2: [] };
  assert.equal(buildTerminalBriefings(input).attention, null, "no evidence, no pick");
});

test("a raw 60+ wait is comparable, and a people-only row never beats usable minutes", () => {
  const input = baseInput();
  input.congestion = [
    { terminal: "T2", zone: "P03-DG2", waitTimeMinutes: null, waitTimeRaw: "60+", waitingCount: 50, observedAt: NOW, freshness: "LIVE" },
    { terminal: "T2", zone: "P03-DG1", waitTimeMinutes: null, waitingCount: 900, observedAt: NOW, freshness: "LIVE" },
    { terminal: "T1", zone: "P01-DG1", waitTimeMinutes: 25, waitingCount: 300, observedAt: NOW, freshness: "LIVE" },
  ];
  const { terminals, attention } = buildTerminalBriefings(input);
  assert.equal(terminals[1].checkpoint?.zone, "P03-DG2");
  assert.deepEqual(attention, { terminal: "T2", basis: "OBSERVED_WAIT" });
});

test("peak and remaining are withheld unless the day's official bands are COMPLETE; next band is today-only", () => {
  const input = baseInput();
  input.coverageByTerminal = { T1: "PARTIAL", T2: "UNAVAILABLE" };
  const partial = buildTerminalBriefings(input);
  assert.equal(partial.terminals[0].peak, null);
  assert.equal(partial.terminals[0].remaining, null);
  assert.equal(partial.terminals[0].nextBand?.targetStartAt, "2026-08-31T15:00:00+09:00", "a future band is a single official band and may still be shown");
  assert.deepEqual(partial.terminals[0].evidenceTypes, ["CHECKPOINT", "NEXT_BAND", "FLIGHTS"]);

  const future = baseInput();
  future.dayRelation = "FUTURE";
  assert.equal(buildTerminalBriefings(future).terminals[0].nextBand, null, "a future day has no 'next' band");
});

test("selectNextBand skips malformed bands and finds the first band after now when none contains it", () => {
  const timeline = [
    { targetStartAt: "bad", targetEndAt: "bad", expectedPassengers: 1 },
    band(16, 17, 500),
    band(15, 16, 700),
  ];
  assert.equal(selectNextBand(timeline, NOW, "TODAY")?.targetStartAt, "2026-08-31T15:00:00+09:00");
  assert.equal(selectNextBand(timeline, "not-a-date", "TODAY"), null);
});
