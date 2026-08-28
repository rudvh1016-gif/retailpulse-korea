import assert from "node:assert/strict";
import test from "node:test";

import { classifyDemoDemand, demoDemandThresholds } from "../lib/demand-index";
import { buildAirportPressure } from "../lib/airport-pressure";

test("demo demand levels use cohort thirds instead of absolute magic numbers", () => {
  const cohort = [82, 77, 71, 86, 74, 69];
  assert.deepEqual(demoDemandThresholds(cohort), { lowMax: 73, highMin: 78.66666666666667 });
  assert.equal(classifyDemoDemand(71, cohort), "low");
  assert.equal(classifyDemoDemand(77, cohort), "normal");
  assert.equal(classifyDemoDemand(82, cohort), "high");
});

test("airport pressure counts one physical aircraft once across codeshares", () => {
  const rows = buildAirportPressure([
    { physicalFlightId: "KE123-2026-08-28", marketingFlightCode: "KE123", direction: "departure", basis: "actual", terminal: "T1", gate: "29", gateObservedAt: "2026-08-28T13:30:00+09:00", scheduledAt: "2026-08-28T14:10:00+09:00", status: "onTime" },
    { physicalFlightId: "KE123-2026-08-28", marketingFlightCode: "DL9001", direction: "departure", basis: "actual", terminal: "T1", gate: "29", gateObservedAt: "2026-08-28T13:31:00+09:00", scheduledAt: "2026-08-28T14:10:00+09:00", status: "onTime" },
  ], { now: "2026-08-28T13:45:00+09:00" });
  assert.equal(rows[0].uniqueFlightCount, 1);
  assert.equal(rows[0].where.kind, "exactGate");
  assert.equal(rows[0].where.label, "29");
});

test("cancelled flights are excluded and stale or missing gates fall back to terminal", () => {
  const rows = buildAirportPressure([
    { physicalFlightId: "A", direction: "departure", basis: "actual", terminal: "T1", gate: "29", gateObservedAt: "2026-08-28T08:00:00+09:00", scheduledAt: "2026-08-28T14:10:00+09:00", status: "onTime" },
    { physicalFlightId: "B", direction: "departure", basis: "actual", terminal: "T1", scheduledAt: "2026-08-28T14:20:00+09:00", status: "onTime" },
    { physicalFlightId: "C", direction: "departure", basis: "actual", terminal: "T1", gate: "30", gateObservedAt: "2026-08-28T13:30:00+09:00", scheduledAt: "2026-08-28T14:30:00+09:00", status: "cancelled" },
  ], { now: "2026-08-28T13:45:00+09:00", gateFreshnessMinutes: 180 });
  assert.equal(rows[0].uniqueFlightCount, 2);
  assert.equal(rows[0].where.kind, "terminal");
  assert.equal(rows[0].confidence, "low");
});

test("scheduled service never implies a future exact gate", () => {
  const rows = buildAirportPressure([
    { physicalFlightId: "A", direction: "departure", basis: "scheduled", terminal: "T2", gate: "250", gateObservedAt: "2026-08-28T13:30:00+09:00", scheduledAt: "2026-08-29T14:10:00+09:00", status: "scheduled" },
  ], { now: "2026-08-28T13:45:00+09:00" });
  assert.equal(rows[0].basis, "scheduled");
  assert.equal(rows[0].where.kind, "terminal");
  assert.equal(rows[0].confidence, "low");
});

test("a zone is used only when an authoritative mapping is supplied", () => {
  const rows = buildAirportPressure([
    { physicalFlightId: "A", direction: "departure", basis: "actual", terminal: "T1", gate: "29", gateObservedAt: "2026-08-28T13:30:00+09:00", scheduledAt: "2026-08-28T14:10:00+09:00", status: "onTime" },
    { physicalFlightId: "B", direction: "departure", basis: "actual", terminal: "T1", gate: "30", gateObservedAt: "2026-08-28T13:30:00+09:00", scheduledAt: "2026-08-28T14:20:00+09:00", status: "delayed" },
  ], { now: "2026-08-28T13:45:00+09:00", gateZones: [{ terminal: "T1", id: "verified-east", label: "27–32", gates: ["27", "28", "29", "30", "31", "32"], authority: "official-topology" }] });
  assert.equal(rows[0].where.kind, "gateZone");
  assert.equal(rows[0].where.label, "27–32");
  assert.equal(rows[0].delayedFlightCount, 1);
});
