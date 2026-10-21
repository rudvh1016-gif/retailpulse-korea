import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DATA_GO_KR_LOW_CALL_POLICY, fetchAirportCongestionJson, fetchOfficialJson,
  SourceFetchError, safeSourceFailureDetail,
} from "../lib/source-adapters";
import { boundedA4Policy } from "../lib/collector";
import { decideCongestionRetry } from "../lib/congestion-retry";

const url = new URL("https://example.invalid/fixture");
const gate = (overrides: Record<string, unknown> = {}) => ({
  terminalId: "P01", gateId: "DG1_E", occurtime: "20261021070200", waitTime: "5", ...overrides,
});
const envelope = (items: unknown, code = "00") => ({ response: { header: { resultCode: code }, body: { items } } });
const missing = envelope(Array.from({ length: 12 }, (_, i) => gate({ gateId: `gate${i}` })));
const valid = envelope([gate({ waitLength: "0", occurtime: "20261021072400" })]);
const network = () => new TypeError("fixture network failure", { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });

function harness(sequence: Array<unknown>, maxAttempts = 4) {
  let calls = 0, now = 0;
  const delays: number[] = [];
  const fetchImpl: typeof fetch = async () => {
    const result = sequence[Math.min(calls++, sequence.length - 1)];
    if (result instanceof Error) throw result;
    return result instanceof Response ? result.clone() : Response.json(result);
  };
  return {
    calls: () => calls, delays,
    options: { ...DATA_GO_KR_LOW_CALL_POLICY, maxAttempts, fetchImpl, random: () => 0,
      nowMs: () => now, sleep: async (ms: number) => { delays.push(ms); now += ms; } },
  };
}

test("T1 all missing counts recheck at 2/10/45 seconds within the existing four requests", async () => {
  const h = harness([missing, missing, missing, valid]);
  assert.deepEqual(await fetchAirportCongestionJson(url, h.options), valid);
  assert.equal(h.calls(), 4);
  assert.deepEqual(h.delays, [2_000, 10_000, 45_000]);
});

test("transport and missing-count failures consume one shared ladder, never 4 x 4", async () => {
  const h = harness([network(), missing, new Response("unavailable", { status: 503 }), missing, valid]);
  await assert.rejects(fetchAirportCongestionJson(url, h.options), (error: unknown) => {
    assert.ok(error instanceof SourceFetchError);
    assert.equal(error.code, "SCHEMA");
    assert.equal(error.attempts, 4);
    assert.equal(error.elapsedMs, 57_000);
    assert.equal(error.retryExhausted, true);
    assert.match(safeSourceFailureDetail(error), /schemaField=waitLength:missing/);
    assert.deepEqual(decideCongestionRetry(JSON.stringify({ source: "airport_congestion", status: "ERROR", detail: safeSourceFailureDetail(error) })).sources, []);
    return true;
  });
  assert.equal(h.calls(), 4);
});

test("all-missing exhaustion is visible, secret-safe and bounded", async () => {
  const payload = envelope([gate({ privateValue: "do-not-log-this", diagnosticUrl: "https://example.invalid/?serviceKey=fixture-secret" })]);
  const h = harness([payload]);
  await assert.rejects(fetchAirportCongestionJson(url, h.options), (error: unknown) => {
    const detail = safeSourceFailureDetail(error);
    assert.match(detail, /failureClass=SCHEMA causeCode=T1_WAIT_LENGTH_UNREPORTED attempts=4 elapsedMs=57000 retryExhausted=true schemaField=waitLength:missing/);
    assert.doesNotMatch(detail, /do-not-log|fixture-secret|serviceKey|https/);
    return true;
  });
  assert.equal(h.calls(), 4);
});

test("fresh-runner cap stays one, and oversized configuration cannot exceed four", async () => {
  for (const ceiling of [1, 999]) {
    const h = harness([missing], boundedA4Policy(DATA_GO_KR_LOW_CALL_POLICY, { A4_MAX_ATTEMPTS_PER_REQUEST: ceiling }).maxAttempts);
    await assert.rejects(fetchAirportCongestionJson(url, h.options));
    assert.equal(h.calls(), ceiling === 1 ? 1 : 4);
  }
});

for (const [name, payload] of Object.entries({
  partial: envelope([gate(), gate({ waitLength: "2" })]),
  empty: envelope([]), malformedEnvelope: { response: { header: { resultCode: "00" }, body: {} } },
  malformedItems: envelope({}), wrongTerminal: envelope([gate({ terminalId: "P03" })]),
  badTime: envelope([gate({ occurtime: "invalid" })]), missingGate: envelope([{ terminalId: "P01", occurtime: "20261021070200" }]),
  emptyCount: envelope([gate({ waitLength: "" })]), textCount: envelope([gate({ waitLength: "unknown" })]),
  numericCount: envelope([gate({ waitLength: 5 })]), renamedField: envelope([gate({ waitLength: "bad", newCount: "5" })]),
  alternateCount: envelope([gate({ waitlength: "5" })]), validZero: valid,
  oversized: envelope(Array.from({ length: 51 }, () => gate())),
  auth: envelope([gate()], "30"), quota: envelope([gate()], "22"), providerError: envelope([gate()], "01"),
})) {
  test(`T1 does not recheck ${name}; existing normalization still decides its result`, async () => {
    const h = harness([payload]);
    assert.deepEqual(await fetchAirportCongestionJson(url, h.options), payload);
    assert.equal(h.calls(), 1);
    assert.deepEqual(h.delays, []);
  });
}

for (const items of [[gate({ waitLength: null })], { item: [gate()] }, { item: gate() }]) {
  test(`T1 documented item envelope and null/missing count recover without coercion: ${JSON.stringify(items)}`, async () => {
    const h = harness([envelope(items), valid]);
    assert.deepEqual(await fetchAirportCongestionJson(url, h.options), valid);
    assert.equal(h.calls(), 2);
  });
}

for (const status of [400, 401, 403, 429]) {
  for (const retryAfter of ["12", "120", "Wed, 21 Oct 2026 10:00:00 GMT"]) {
    test(`T1 HTTP ${status} with Retry-After ${retryAfter} stops, including after missing data`, async () => {
      const h = harness([missing, new Response("refused", { status, headers: { "retry-after": retryAfter } }), valid]);
      await assert.rejects(fetchAirportCongestionJson(url, h.options), (error: unknown) => error instanceof SourceFetchError && error.status === status && error.attempts === 2);
      assert.equal(h.calls(), 2);
      assert.deepEqual(h.delays, [2_000]);
    });
  }
}

for (const [retryAfter, delay] of [["12", 12_000], ["Thu, 01 Jan 1970 00:00:12 GMT", 12_000]] as const) {
  test(`T1 HTTP 503 honors Retry-After ${retryAfter}`, async () => {
    const h = harness([new Response("wait", { status: 503, headers: { "retry-after": retryAfter } }), valid]);
    assert.deepEqual(await fetchAirportCongestionJson(url, h.options), valid);
    assert.deepEqual(h.delays, [delay]);
  });
}

test("T1 long HTTP 503 cooldown defers instead of being bypassed by the payload recheck", async () => {
  const h = harness([missing, new Response("wait", { status: 503, headers: { "retry-after": "120" } }), valid]);
  await assert.rejects(fetchAirportCongestionJson(url, h.options), (error: unknown) => error instanceof SourceFetchError && error.retryDeferred && error.attempts === 2);
  assert.equal(h.calls(), 2);
  assert.deepEqual(h.delays, [2_000]);
});

test("successful malformed JSON never rechecks", async () => {
  const h = harness([new Response("{broken"), valid]);
  await assert.rejects(fetchAirportCongestionJson(url, h.options), (error: unknown) => error instanceof SourceFetchError && error.code === "MALFORMED_JSON");
  assert.equal(h.calls(), 1);
});

test("other sources retain no schema retry, and only the T1 collector opts in", async () => {
  const h = harness([missing]);
  assert.deepEqual(await fetchOfficialJson(url, h.options), missing);
  assert.equal(h.calls(), 1);
  const collector = readFileSync("lib/collector.ts", "utf8");
  assert.equal((collector.match(/await fetchAirportCongestionJson\(/g) ?? []).length, 1);
  const start = collector.indexOf("export async function collectAirportCongestion(");
  const end = collector.indexOf("export async function collectAirportCongestionT2(");
  assert.match(collector.slice(start, end), /await fetchAirportCongestionJson\(/);
  assert.doesNotMatch(collector.slice(end), /await fetchAirportCongestionJson\(/);
});

test("the conservative daily T1 ceiling does not increase", () => {
  assert.equal(96 * (DATA_GO_KR_LOW_CALL_POLICY.maxAttempts + 1), 480);
  assert.ok(480 < 1_000 * 0.70, "below NOTICE under the published development allowance, not official measured usage");
});
