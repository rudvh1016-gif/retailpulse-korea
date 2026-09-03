import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { deriveZoneMapping } from "../lib/airport-zone-map.ts";
import {
  buildFacilityOperationsBrief,
  deriveOperatingReference,
  flightsForTerminal,
} from "../lib/facility-operations.ts";

const NOW = "2026-09-04T06:00:00+09:00";
const AT = "2026-09-04T00:00:00.000Z";

const provenFacility = (overrides = {}) => ({
  facilityId: "1001", terminal: "T1", floor: "3층", dutyArea: "DUTY_FREE",
  arrivalDeparture: "DEPARTURE", locationRaw: "제1여객터미널 3층 면세지역 27번 게이트 부근 1번 출국장",
  ...overrides,
});

const flightAt = (minutesFromNow, terminal = "T1") => ({
  scheduledAt: new Date(Date.parse(NOW) + minutesFromNow * 60_000).toISOString(),
  terminal,
  gate: "27",
});

function brief(overrides = {}) {
  return buildFacilityOperationsBrief({
    mapping: deriveZoneMapping(provenFacility(), AT),
    nowIso: NOW,
    flights: [],
    forecastBands: [],
    checkpoints: [],
    sourceRetrievedAt: {},
    ...overrides,
  });
}

test("flight windows count this terminal's departures only, and nest correctly", () => {
  const flights = [
    flightAt(10), flightAt(20), flightAt(45), flightAt(90),
    // Another terminal's departures are not this shop's flow.
    flightAt(10, "T2"), flightAt(15, "T2"),
    // Already departed, and beyond the widest window.
    flightAt(-5), flightAt(200),
  ];
  const result = brief({ flights });
  assert.deepEqual(result.windows, [
    { minutes: 30, flights: 2 },
    { minutes: 60, flights: 3 },
    { minutes: 120, flights: 4 },
  ]);
  assert.equal(flightsForTerminal(flights, "T2").length, 2);
  assert.equal(flightsForTerminal(flights, null).length, 0, "no terminal means no claim");
});

test("an ambiguous facility never carries a gate, a group or a checkpoint", () => {
  const mapping = deriveZoneMapping(provenFacility({ locationRaw: "제1여객터미널 3층 면세지역" }), AT);
  assert.equal(mapping.mappingMethod, "AMBIGUOUS");
  const result = brief({
    mapping,
    flights: [flightAt(10)],
    checkpoints: [{ terminal: "T1", zone: "1", waitTimeMinutes: 45, waitingCount: 300, observedAt: NOW }],
  });
  assert.equal(result.gate, null);
  assert.equal(result.gateGroup, null);
  assert.equal(result.checkpointId, null);
  assert.equal(result.checkpoint, null, "an unlocated facility gets no checkpoint, however busy the terminal is");
  assert.ok(result.missingEvidence.includes("ZONE_MAPPING"));
  assert.ok(result.missingEvidence.includes("CHECKPOINT"));
  // Terminal-level facts it genuinely owns are still reported.
  assert.equal(result.terminal, "T1");
  assert.equal(result.windows[0].flights, 1);
});

test("a checkpoint attaches only on an exact proven zone, never on a terminal match", () => {
  const observations = [
    { terminal: "T1", zone: "3", waitTimeMinutes: 40, waitingCount: 200, observedAt: NOW },
  ];
  // The mapping proves checkpoint 1; the only observation is checkpoint 3.
  const mismatched = brief({ checkpoints: observations });
  assert.equal(mismatched.checkpointId, "1");
  assert.equal(mismatched.checkpoint, null, "a different checkpoint in the same terminal is not this store's queue");

  const matched = brief({
    checkpoints: [...observations, { terminal: "T1", zone: "1", waitTimeMinutes: 12, waitingCount: 40, observedAt: NOW }],
  });
  assert.equal(matched.checkpoint.zone, "1");
  assert.equal(matched.checkpoint.waitTimeMinutes, 12);
});

test("the forecast band and peak come from the facility's own terminal timeline", () => {
  const bands = [
    { targetStartAt: "2026-09-04T05:00:00+09:00", targetEndAt: "2026-09-04T06:00:00+09:00", expectedPassengers: 900 },
    { targetStartAt: "2026-09-04T06:00:00+09:00", targetEndAt: "2026-09-04T07:00:00+09:00", expectedPassengers: 1200 },
    { targetStartAt: "2026-09-04T09:00:00+09:00", targetEndAt: "2026-09-04T10:00:00+09:00", expectedPassengers: 3100 },
  ];
  const result = brief({ forecastBands: bands });
  assert.equal(result.nextBand.expectedPassengers, 1200, "the band containing now comes first");
  assert.equal(result.nextPeak.expectedPassengers, 3100, "the peak is the largest band still ahead");
  assert.ok(result.evidence.includes("PASSENGER_FORECAST"));
});

test("with nothing official to read, the reference says so instead of inventing calm", () => {
  const result = brief();
  assert.equal(result.operatingReference, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.missingEvidence.sort(), ["CHECKPOINT", "FLIGHTS", "PASSENGER_FORECAST"]);
  assert.deepEqual(result.evidence, ["ZONE_MAPPING"]);
});

test("the operating reference is deterministic across its thresholds", () => {
  const windows = (a, b, c) => [
    { minutes: 30, flights: a }, { minutes: 60, flights: b }, { minutes: 120, flights: c },
  ];
  const base = { nextBand: null, checkpoint: null, hasFlights: true, hasForecast: false };

  // An observed queue leads: passengers are still held before the airside shops.
  assert.equal(deriveOperatingReference({
    ...base, windows: windows(9, 12, 20),
    checkpoint: { terminal: "T1", zone: "1", waitTimeMinutes: 30, waitingCount: 100, observedAt: NOW },
  }), "INFLOW_WAITING");
  // A lower-bound "60+" string is a long wait too, and is never coerced to a number.
  assert.equal(deriveOperatingReference({
    ...base, windows: windows(0, 0, 0),
    checkpoint: { terminal: "T1", zone: "1", waitTimeMinutes: null, waitTimeRaw: "60+", waitingCount: 900, observedAt: NOW },
  }), "INFLOW_WAITING");
  // 29 minutes is below the threshold, so the flight counts decide instead.
  assert.equal(deriveOperatingReference({
    ...base, windows: windows(9, 12, 20),
    checkpoint: { terminal: "T1", zone: "1", waitTimeMinutes: 29, waitingCount: 100, observedAt: NOW },
  }), "CONCENTRATED_NOW");

  assert.equal(deriveOperatingReference({ ...base, windows: windows(8, 9, 12) }), "CONCENTRATED_NOW");
  assert.equal(deriveOperatingReference({ ...base, windows: windows(7, 9, 12) }), "FAST_PURCHASE_WATCH");
  assert.equal(deriveOperatingReference({ ...base, windows: windows(5, 10, 14) }), "FLOW_RISING");
  assert.equal(deriveOperatingReference({ ...base, windows: windows(4, 7, 9) }), "FAST_PURCHASE_WATCH");
  assert.equal(deriveOperatingReference({ ...base, windows: windows(3, 5, 8) }), "STABLE");
  assert.equal(deriveOperatingReference({ ...base, windows: windows(1, 4, 12) }), "FLOW_RISING");
  assert.equal(deriveOperatingReference({ ...base, windows: windows(0, 0, 0) }), "STABLE");
  assert.equal(deriveOperatingReference({
    windows: windows(0, 0, 0), nextBand: null, checkpoint: null, hasFlights: false, hasForecast: false,
  }), "INSUFFICIENT_EVIDENCE");
});

test("the same inputs always produce the same brief — no clock, no randomness, no model", () => {
  const inputs = {
    flights: [flightAt(10), flightAt(50)],
    forecastBands: [{ targetStartAt: "2026-09-04T06:00:00+09:00", targetEndAt: "2026-09-04T07:00:00+09:00", expectedPassengers: 1200 }],
    checkpoints: [{ terminal: "T1", zone: "1", waitTimeMinutes: 12, waitingCount: 40, observedAt: NOW }],
    sourceRetrievedAt: { flights: NOW },
  };
  assert.deepEqual(brief(inputs), brief(inputs));
});

test("A4 predicts no sales, no visitors and no score", async () => {
  const source = await readFile(new URL("../lib/facility-operations.ts", import.meta.url), "utf8");
  // Comments are stripped first: the module documents at length what it
  // refuses to compute, and a guard that trips on the word "score" inside
  // "never a 0-100 score" would punish the explanation rather than the code.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
  for (const forbidden of [
    "Math.random", "fetch(", "score", "Score", "revenue", "sales", "Sales",
    "visitors", "Visitors", "conversion", "predict",
  ]) {
    assert.equal(code.includes(forbidden), false, `A4 must not contain ${forbidden}`);
  }
  // And the prose must still say what the boundary is, in the file itself.
  assert.match(source, /checkpoint queue is not store visitors/);
  assert.match(source, /flight count is not a passenger count/);
});

test("the A4 endpoint is bounded, seeks indexes, and never widens beyond its window", async () => {
  const route = await readFile(new URL("../app/api/airport/facility-operations/route.ts", import.meta.url), "utf8");
  // The facility is a primary-key seek; every other read is filtered by that
  // facility's own terminal and by the widest window the brief reports.
  assert.match(route, /FROM airport_facility WHERE facility_id = \?/);
  assert.match(route, /scheduled_at >= \? AND scheduled_at <= \? AND terminal = \?/);
  assert.match(route, /WHERE target_date = \? AND terminal = \?/);
  assert.match(route, /FROM airport_congestion\s+WHERE terminal = \?/);
  for (const bound of ["LIMIT ?", "LIMIT 48", "LIMIT 24"]) {
    assert.ok(route.includes(bound), `${bound} must bound its read`);
  }
  assert.match(route, /LOOK_AHEAD_MINUTES = 120/);

  // The id reaching a query is the provider's `sn` and nothing else.
  assert.match(route, /\/\^\\d\{1,12\}\$\//);
  assert.match(route, /status: 400/);

  // A facility with no recognised terminal gets no terminal numbers at all.
  assert.match(route, /const flights = terminal \?/);
  assert.match(route, /const forecastBands = terminal \?/);
  assert.match(route, /const checkpoints = terminal \?/);

  // The mapping is bundled, so A3 costs no D1 read on this path either.
  assert.match(route, /buildZoneMapIndex\(zoneMapFile/);
  // A read failure must not read as "nothing is happening at your store".
  assert.match(route, /mode: "degraded"/);
  // A4 is its own endpoint precisely so the common path stays cheap. The
  // comment explaining that may name the summary; the code must not call it.
  const code = route.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.equal(code.includes("/api/live/summary"), false, "A4 must not read the summary path");
});

test("the operating reference never travels without the sentence saying what it is not", async () => {
  const signals = await readFile(new URL("../app/live-signals.tsx", import.meta.url), "utf8");
  const disclaimers = {
    ko: "공식 승객·항공편·출국장 데이터를 바탕으로 정리한 운영 참고이며 실제 매장 방문자 수나 매출을 의미하지 않습니다",
    en: "It does not mean store visitors or sales",
    zh: "并不代表实际到店人数或销售额",
    ja: "実際の来店客数や売上を意味しません",
  };
  for (const [lang, text] of Object.entries(disclaimers)) {
    assert.ok(signals.includes(text), `${lang} disclaimer must be present`);
  }
  // The reading and its boundary are adjacent in the markup, so the
  // interpretation cannot be rendered without it.
  const brief = signals.match(/<p className="my-store-reference">[\s\S]*?<\/p>\s*<p className="my-store-disclaimer">[\s\S]*?<\/p>/);
  assert.ok(brief, "the disclaimer must immediately follow the operating reference");
});

test("A4's screen predicts nothing and scores nothing", async () => {
  const signals = await readFile(new URL("../app/live-signals.tsx", import.meta.url), "utf8");
  const block = signals.match(/const myStoreText = \{[\s\S]*?\n\} as const;/)?.[0] ?? "";
  assert.ok(block.length > 0);
  for (const forbidden of [
    "매출", "방문객 수 예측", "예상 매출", "전환율", "점수",
    "sales forecast", "visitor forecast", "conversion", "score",
    "销售预测", "客流预测", "转化率", "评分",
    "売上予測", "来店予測", "コンバージョン", "スコア",
  ]) {
    // 매출 is allowed in exactly one shape: the sentence denying it.
    const occurrences = block.split(forbidden).length - 1;
    const allowed = forbidden === "매출" ? 1 : 0;
    assert.ok(occurrences <= allowed, `"${forbidden}" must not be promised on the store screen`);
  }
  // "AI" needs a word boundary — it is a substring of KORETAIL. No AI score is
  // offered anywhere on this screen, and no model produces any of its wording.
  assert.doesNotMatch(block, /\bAI\b/, "no AI claim belongs on the store screen");
});

test("the printed briefing keeps the boundary and drops the navigation", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const print = styles.match(/@media print \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(print.length > 0, "there must be a print stylesheet");
  // Pure white on paper, and the browser's own print — no paid PDF service.
  assert.match(print, /background: #ffffff !important/);
  assert.match(print, /\.my-store-brief, \.my-store-brief \* \{ visibility: visible; \}/);
  assert.match(print, /\.no-print[^{]*\{ display: none !important; \}/);
  // The disclaimer is inside .my-store-brief, so it prints with the numbers.
  const signals = await readFile(new URL("../app/live-signals.tsx", import.meta.url), "utf8");
  const article = signals.match(/<article className="my-store-brief">[\s\S]*?\n  <\/article>/)?.[0] ?? "";
  assert.match(article, /my-store-disclaimer/, "a printout handed to someone else must carry the boundary");
});
