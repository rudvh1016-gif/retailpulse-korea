import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AIRPORT_ZONE_MAPPING_VERSION,
  buildZoneMapIndex,
  deriveZoneMapping,
  extractZoneEvidence,
  resolveZoneMapping,
  summarizeZoneMappings,
} from "../lib/airport-zone-map.ts";

const facility = (overrides = {}) => ({
  facilityId: "1001",
  terminal: "T1",
  floor: "3층",
  dutyArea: "DUTY_FREE",
  arrivalDeparture: "DEPARTURE",
  locationRaw: "제1여객터미널 3층 면세지역 27번 게이트 부근",
  ...overrides,
});

const AT = "2026-09-04T00:00:00.000Z";

test("a gate the official text names is proven, and quoted back as evidence", () => {
  const mapping = deriveZoneMapping(facility(), AT);
  assert.equal(mapping.mappingMethod, "OFFICIAL_DIRECT");
  assert.equal(mapping.gate, "27");
  assert.equal(mapping.gateGroup, null);
  assert.equal(mapping.confidence, "PROVEN");
  assert.match(mapping.evidenceText, /27번 게이트/);
  assert.equal(mapping.mappingVersion, AIRPORT_ZONE_MAPPING_VERSION);
  // The official structured fields are carried through unchanged, never re-derived.
  assert.equal(mapping.terminal, "T1");
  assert.equal(mapping.floor, "3층");
  assert.equal(mapping.dutyArea, "DUTY_FREE");
  assert.equal(mapping.arrivalDeparture, "DEPARTURE");
});

test("a stated gate range stays literal — the numbers in between are never enumerated", () => {
  const mapping = deriveZoneMapping(facility({ locationRaw: "제2여객터미널 3층 면세지역 24~27번 게이트" }), AT);
  assert.equal(mapping.gateGroup, "24~27");
  assert.equal(mapping.gate, null, "a range must never collapse into one gate");
  assert.equal(mapping.mappingMethod, "OFFICIAL_DIRECT");
  // A hyphen and an en dash are the same statement as a tilde.
  assert.equal(extractZoneEvidence("101-104번 탑승구").gateGroup, "101~104");
  assert.equal(extractZoneEvidence("230–232번 게이트").gateGroup, "230~232");
});

test("two gates named in one string are a group, never a pick", () => {
  const evidence = extractZoneEvidence("제1여객터미널 4층 25번 게이트, 26번 게이트 사이");
  assert.equal(evidence.gateGroup, "25,26");
  assert.equal(evidence.gate, null);
});

test("a departure checkpoint the text names is proven", () => {
  const mapping = deriveZoneMapping(facility({ locationRaw: "제1여객터미널 3층 2번 출국장 앞" }), AT);
  assert.equal(mapping.checkpointId, "2");
  assert.equal(mapping.mappingMethod, "OFFICIAL_DIRECT");
  assert.equal(extractZoneEvidence("제3출국장 인근").checkpointId, "3");
  assert.equal(extractZoneEvidence("출국장 4 부근").checkpointId, "4");
});

test("a terminal and a floor are not a gate: vague text stays AMBIGUOUS", () => {
  for (const locationRaw of [
    "제1여객터미널 3층",
    "제2여객터미널 지하1층 일반지역",
    "탑승동 4층 면세지역",
    "제1교통센터 지하1층",
    "",
    null,
  ]) {
    const mapping = deriveZoneMapping(facility({ locationRaw }), AT);
    assert.equal(mapping.mappingMethod, "AMBIGUOUS", `${locationRaw} must not be treated as located`);
    assert.equal(mapping.gate, null);
    assert.equal(mapping.gateGroup, null);
    assert.equal(mapping.checkpointId, null);
    assert.equal(mapping.confidence, "NONE");
    assert.equal(mapping.evidenceText, null);
  }
});

test("a floor number is never mistaken for a gate number", () => {
  // "3층" and "지하1층" carry digits; only a gate word makes a digit a gate.
  const evidence = extractZoneEvidence("제1여객터미널 지하1층 일반지역 3번 출입구");
  assert.equal(evidence.gate, null);
  assert.equal(evidence.gateGroup, null);
  assert.equal(evidence.checkpointId, null);
});

test("an unmapped facility resolves to AMBIGUOUS with no proximity, never to a neighbour", () => {
  const index = buildZoneMapIndex({
    mappingVersion: AIRPORT_ZONE_MAPPING_VERSION,
    generatedAt: AT,
    evidenceSource: "x",
    notes: [],
    counts: { totalFacilities: 2, officialDirect: 1, officialMapReview: 0, ambiguous: 1, withGate: 1, withGateGroup: 0, withCheckpoint: 0 },
    mappings: [deriveZoneMapping(facility(), AT)],
  });
  const resolved = resolveZoneMapping(index, {
    facilityId: "9999", terminal: "T1", floor: "3층", dutyArea: "DUTY_FREE",
    arrivalDeparture: "DEPARTURE", locationRaw: "제1여객터미널 3층 면세지역",
  });
  assert.equal(resolved.mappingMethod, "AMBIGUOUS");
  assert.equal(resolved.gate, null);
  assert.equal(resolved.checkpointId, null);
  // 1001 sits at gate 27; 9999 must not inherit it merely by being nearby in the file.
  assert.equal(index.get("1001").gate, "27");
});

test("a mapping written under a different version is ignored rather than reinterpreted", () => {
  const stale = { ...deriveZoneMapping(facility(), AT), mappingVersion: "airport-zone-map.v0" };
  const index = buildZoneMapIndex({
    mappingVersion: AIRPORT_ZONE_MAPPING_VERSION,
    generatedAt: AT, evidenceSource: "x", notes: [],
    counts: { totalFacilities: 1, officialDirect: 0, officialMapReview: 0, ambiguous: 1, withGate: 0, withGateGroup: 0, withCheckpoint: 0 },
    mappings: [stale],
  });
  assert.equal(index.size, 0);
});

test("counts add up: everything not proven is ambiguous, and there is no fourth state", () => {
  const mappings = [
    deriveZoneMapping(facility({ facilityId: "1" }), AT),
    deriveZoneMapping(facility({ facilityId: "2", locationRaw: "제2여객터미널 3층 24~27번 게이트" }), AT),
    { ...deriveZoneMapping(facility({ facilityId: "3", locationRaw: "제1여객터미널 3층 1번 출국장" }), AT), mappingMethod: "OFFICIAL_MAP_REVIEW" },
  ];
  const counts = summarizeZoneMappings(1232, mappings);
  assert.equal(counts.officialDirect, 2);
  assert.equal(counts.officialMapReview, 1);
  assert.equal(counts.ambiguous, 1229);
  assert.equal(counts.officialDirect + counts.officialMapReview + counts.ambiguous, counts.totalFacilities);
  assert.equal(counts.withGate, 1);
  assert.equal(counts.withGateGroup, 1);
  assert.equal(counts.withCheckpoint, 1);
});

test("the generator only reads Production and only writes a local file", async () => {
  const script = await readFile(new URL("../scripts/generate-airport-zone-map.ts", import.meta.url), "utf8");
  assert.match(script, /SELECT facility_id/);
  assert.doesNotMatch(script, /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/,
    "the A3 generator must never write to Production");
  assert.match(script, /mappingMethod === "OFFICIAL_MAP_REVIEW"/,
    "a human's map review must survive regeneration");
  // One instant per run, so regenerating an unchanged directory is a no-op diff
  // rather than a churn of timestamps.
  assert.match(script, /const reviewedAt = new Date\(\)\.toISOString\(\);/);
});

test("the A3 workflow adds no schedule and calls no provider", async () => {
  const workflow = await readFile(new URL("../.github/workflows/generate-zone-map.yml", import.meta.url), "utf8");
  assert.doesNotMatch(workflow, /^\s*schedule:/m, "A3 must not add a sixth scheduled job");
  assert.match(workflow, /workflow_dispatch:/);
  // It reads D1 and nothing else: no provider key may be handed to it.
  assert.match(workflow, /CLOUDFLARE_D1_WRITE_TOKEN/);
  assert.doesNotMatch(workflow, /DATA_GO_KR_SERVICE_KEY|SEOUL_OPEN_DATA_KEY/,
    "deriving a mapping from stored rows needs no provider credential");
});
