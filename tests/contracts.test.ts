import assert from "node:assert/strict";
import test from "node:test";
import { assertFeatureAvailableAtCutoff, assertTargetMatch, type ForecastFeature, type PredictionInput } from "../lib/contracts";
import { createImmutablePrediction, fourWeekAverageBaseline, sameWeekdayBaseline, seasonalNaiveBaseline } from "../lib/forecast";
import { classifySourceFetchFailure, fetchOfficialJson, normalizeAirportCongestion, normalizeAirportFlight, normalizeScheduledAirportFlight, SourceFetchError } from "../lib/source-adapters";

const feature: ForecastFeature = {
  sourceId: "TEST",
  eventAt: "2026-08-23T00:00:00.000Z",
  availableAt: "2026-08-23T01:00:00.000Z",
  ingestionAt: "2026-08-23T01:01:00.000Z",
  value: 10,
  recordOrigin: "LIVE",
};

const prediction: PredictionInput = {
  predictionId: "pred-1",
  createdAt: "2026-08-23T09:00:00.000Z",
  targetAt: "2026-08-24T09:00:00.000Z",
  dataCutoff: "2026-08-23T08:59:59.000Z",
  targetId: "AREA_ACTIVITY",
  area: "myeongdong",
  value: 82,
  forecastClass: "HIGH",
  confidence: "MODERATE",
  modelVersion: "BASELINE_V1",
  proxyVersion: "FRP_V1",
  featureVersion: "FEATURE_V1",
  sourceVersions: { TEST: "v1" },
  inputHash: "input-hash",
  recordOrigin: "FORECAST",
};

test("rejects future data and backfill from prospective features", () => {
  assert.throws(() => assertFeatureAvailableAtCutoff({ ...feature, availableAt: "2026-08-24T00:00:00.000Z" }, prediction.dataCutoff), /future_leakage/);
  assert.throws(() => assertFeatureAvailableAtCutoff({ ...feature, recordOrigin: "BACKFILLED" }, prediction.dataCutoff), /backfill_not_prospective/);
});

test("requires like-for-like target matching", () => {
  assert.doesNotThrow(() => assertTargetMatch("AREA_ACTIVITY", "AREA_ACTIVITY"));
  assert.throws(() => assertTargetMatch("AREA_ACTIVITY", "FOREIGN_RETAIL_PROXY"), /target_mismatch/);
});

test("creates a frozen, hashed prediction without mutating its evidence", async () => {
  const result = await createImmutablePrediction(prediction, [feature]);
  assert.equal(result.predictionHash.length, 64);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.predictionId, "pred-1");
});

test("calculates simple baselines only from supplied history", () => {
  assert.equal(sameWeekdayBaseline([10, 20]), 20);
  assert.equal(fourWeekAverageBaseline([10, 20, 30, 40, 50]), 35);
  assert.equal(seasonalNaiveBaseline([1, 2, 3, 4, 5, 6, 7, 8], 7), 2);
  assert.equal(seasonalNaiveBaseline([1, 2], 7), null);
});

test("normalizes official airport flight fields without inferring terminals", async () => {
  const record = await normalizeAirportFlight({ flightId: "KE703", scheduleDateTime: "2026-08-24T09:20:00+09:00", terminalId: "2", gate: "249", chkinrange: "D01-D10", status: "ON TIME" }, "departure", "2026-08-24T00:00:00.000Z");
  assert.equal(record.terminal, "T2");
  assert.equal(record.gate, "249");
  assert.equal(record.checkinCounter, "D01-D10");
  assert.equal(record.status, "on_time");
  const noTerminal = await normalizeAirportFlight({ flightId: "OZ101", scheduleDateTime: "2026-08-24T10:20:00+09:00" }, "departure", "2026-08-24T00:00:00.000Z");
  assert.equal(noTerminal.terminal, null);
  assert.equal(noTerminal.qualityStatus, "PARTIAL");
});

test("normalizes compact KST timestamps and official lowercase gate fields", async () => {
  const record = await normalizeAirportFlight({
    flightId: "KE703",
    airline: "Korean Air",
    airport: "NRT",
    scheduleDateTime: "202608251430",
    estimatedDateTime: "202608251445",
    gatenumber: "231",
    chkinrange: "A01-A12",
    remark: "지연",
    terminalid: "2",
  }, "departure", "2026-08-25T04:00:00.000Z");
  assert.equal(record.scheduledAt, "2026-08-25T14:30:00+09:00");
  assert.equal(record.changedAt, "2026-08-25T14:45:00+09:00");
  assert.equal(record.gate, "231");
  assert.equal(record.status, "delayed");
  assert.equal(record.terminal, "T2");
});

test("physical flight identity deduplicates codeshares and survives changed time", async () => {
  const base = { scheduleDateTime: "202608301430", masterFlightId: "KE703", terminalId: "P01" };
  const operating = await normalizeAirportFlight({ ...base, flightId: "KE703", codeshare: "N", estimatedDateTime: "202608301430" }, "departure", "2026-08-30T00:00:00Z");
  const codeshare = await normalizeAirportFlight({ ...base, flightId: "DL9001", codeshare: "Y", estimatedDateTime: "202608301500" }, "departure", "2026-08-30T00:01:00Z");
  const nextDate = await normalizeAirportFlight({ ...base, scheduleDateTime: "202608311430", flightId: "KE703" }, "departure", "2026-08-30T00:00:00Z");
  assert.equal(operating.physicalFlightId, codeshare.physicalFlightId);
  assert.equal(codeshare.flightNumber, "KE703");
  assert.notEqual(operating.physicalFlightId, nextDate.physicalFlightId);
});

test("A3 schedule has no actual gate and stays a separate contract", async () => {
  const row = await normalizeScheduledAirportFlight({
    fid: "F1", season: "S26", firstdate: "20260801", lastdate: "20261031", st: "1430",
    flightId: "KE703", masterFlightId: "KE703", terminalId: "P01", ynMon: "Y", ynTue: "N",
  }, "2026-08-30T00:00:00Z");
  assert.equal(row.terminal, "T1");
  assert.equal(row.scheduledTime, "14:30");
  assert.deepEqual(row.weekdays, ["MON"]);
  assert.equal("gate" in row, false);
});

test("A4 accepts the official P01/T1 scope and rejects invented P03/T2", async () => {
  const base = { gateId: "DG3_E", waitLength: "245", occurtime: "202608272355" };
  assert.equal((await normalizeAirportCongestion({ ...base, terminalId: "P01" }, "2026-08-27T15:00:00Z")).terminal, "T1");
  await assert.rejects(normalizeAirportCongestion({ ...base, terminalId: "P03" }, "2026-08-27T15:00:00Z"), (error: unknown) => error instanceof SourceFetchError && error.code === "SCHEMA");
});

test("classifies malformed and HTTP source responses", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response("bad", { status: 500 });
  await assert.rejects(fetchOfficialJson(new URL("https://example.invalid"), { retries: 0 }), (error: unknown) => error instanceof SourceFetchError && error.code === "HTTP" && error.status === 500);
  globalThis.fetch = async () => new Response("not-json", { status: 200 });
  await assert.rejects(fetchOfficialJson(new URL("https://example.invalid"), { retries: 0 }), (error: unknown) => error instanceof SourceFetchError && error.code === "MALFORMED_JSON");
});

test("handles the production source error matrix with bounded retries", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });

  for (const status of [400, 401, 403]) {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return new Response("denied", { status }); };
    await assert.rejects(fetchOfficialJson(new URL("https://example.invalid"), { retries: 2, retryDelayMs: 0 }), (error: unknown) => error instanceof SourceFetchError && error.status === status);
    assert.equal(calls, 1);
  }

  globalThis.fetch = async () => new Response(null, { status: 204 });
  await assert.rejects(fetchOfficialJson(new URL("https://example.invalid"), { retries: 0 }), (error: unknown) => error instanceof SourceFetchError && error.code === "MALFORMED_JSON");

  for (const retryStatus of [429, 500]) {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return calls === 1 ? new Response("retry", { status: retryStatus }) : Response.json({ ok: true });
    };
    assert.deepEqual(await fetchOfficialJson(new URL("https://example.invalid"), { retries: 1, retryDelayMs: 0 }), { ok: true });
    assert.equal(calls, 2);
  }

  globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
  await assert.rejects(fetchOfficialJson(new URL("https://example.invalid"), { timeoutMs: 5, retries: 0 }), (error: unknown) => error instanceof SourceFetchError && error.code === "TIMEOUT");

  await assert.rejects(normalizeAirportFlight({ flightId: "KE703" }, "departure", "2026-08-25T00:00:00Z"), (error: unknown) => error instanceof SourceFetchError && error.code === "SCHEMA");
});

test("a real client abort is still classified TIMEOUT", () => {
  const abort = new Error("The operation was aborted");
  abort.name = "AbortError";
  const classified = classifySourceFetchFailure(abort);
  assert.equal(classified.code, "TIMEOUT");
  assert.equal(classified.message, "TIMEOUT");
  assert.equal(classified.causeCode, undefined);
});

test("connection-layer failures are classified NETWORK with the platform cause", () => {
  // Node models a failed fetch as a TypeError wrapping the real cause.
  const dnsFailure = new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }) });
  const classified = classifySourceFetchFailure(dnsFailure);
  assert.equal(classified.code, "NETWORK");
  assert.equal(classified.causeCode, "ENOTFOUND");
  // The operational detail now names the real reason instead of "TIMEOUT".
  assert.equal(classified.message, "NETWORK_ENOTFOUND");

  const reset = new TypeError("fetch failed", { cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }) });
  assert.equal(classifySourceFetchFailure(reset).message, "NETWORK_ECONNRESET");

  // An unknown-shaped failure stays NETWORK without inventing a cause.
  const bare = classifySourceFetchFailure(new Error("something odd"));
  assert.equal(bare.code, "NETWORK");
  assert.equal(bare.message, "NETWORK");
});

test("classification never echoes a non-code value and survives a cause cycle", () => {
  const lower = new TypeError("fetch failed", { cause: Object.assign(new Error("x"), { code: "not a code" }) });
  assert.equal(classifySourceFetchFailure(lower).message, "NETWORK");

  const leaky = new TypeError("fetch failed", { cause: Object.assign(new Error("x"), { code: "https://apis.data.go.kr/x?serviceKey=secret" }) });
  assert.equal(classifySourceFetchFailure(leaky).message, "NETWORK");

  const cyclic = new Error("a");
  cyclic.cause = cyclic;
  assert.equal(classifySourceFetchFailure(cyclic).code, "NETWORK");

  // An already-classified error is returned untouched.
  const existing = new SourceFetchError("HTTP", 503);
  assert.equal(classifySourceFetchFailure(existing), existing);
});

test("network classification does not change how many requests a source makes", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) });
  };
  try {
    // retries: 0 is what every data.go.kr collector uses — exactly one request.
    await assert.rejects(
      fetchOfficialJson(new URL("https://example.invalid"), { retries: 0 }),
      (error: unknown) => error instanceof SourceFetchError && error.code === "NETWORK" && error.causeCode === "ECONNREFUSED",
    );
    assert.equal(calls, 1, "retries:0 must stay one request per call");

    calls = 0;
    await assert.rejects(fetchOfficialJson(new URL("https://example.invalid"), { retries: 1, retryDelayMs: 0 }), SourceFetchError);
    assert.equal(calls, 2, "retries:1 must stay the pre-existing two requests");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
