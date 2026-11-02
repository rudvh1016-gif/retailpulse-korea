import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DATA_GO_KR_LOW_CALL_POLICY, DATA_GO_KR_PAGED_POLICY, fetchAirportCongestionJson, fetchOfficialJson, SourceFetchError, safeSourceFailureDetail } from "../lib/source-adapters";
import { boundedA4Policy, collectAirportCongestion, collectAirportCongestionT2 } from "../lib/collector";
import { decideCongestionRetry } from "../lib/congestion-retry";
const url = new URL("https://fixture.invalid/?serviceKey=never-log-this");
const connect = () => new TypeError("private request URL", { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
function harness(sequence: Array<Response | Error>, policy: { maxAttempts: number; timeoutMs: number; retryDelaysMs: readonly number[] } = DATA_GO_KR_LOW_CALL_POLICY, enabled = true) {
  let calls = 0, clock = 0;
  const delays: number[] = [];
  return { calls: () => calls, delays, options: {
    ...boundedA4Policy(policy, { A4_STOP_ON_INITIAL_CONNECT_TIMEOUT: enabled }),
    fetchImpl: (async () => { const item = sequence[Math.min(calls++, sequence.length - 1)]; if (item instanceof Error) throw item; return item; }) as typeof fetch,
    sleep: async (ms: number) => { delays.push(ms); clock += ms; }, nowMs: () => clock, random: () => 0,
  } };
}
for (const [name, policy, fetcher] of [
  ["T1", DATA_GO_KR_LOW_CALL_POLICY, fetchAirportCongestionJson],
  ["T2", DATA_GO_KR_PAGED_POLICY, fetchOfficialJson],
] as const) {
  test(`${name}: initial connect timeout fails after one request and qualifies for existing fallback`, async () => {
    const h = harness([connect()], policy);
    await assert.rejects(fetcher(url, h.options), (error: unknown) => {
      assert.ok(error instanceof SourceFetchError);
      assert.equal(error.attempts, 1); assert.equal(error.retryExhausted, false);
      const detail = safeSourceFailureDetail(error);
      assert.doesNotMatch(detail, /never-log|private|serviceKey/);
      assert.deepEqual(decideCongestionRetry(JSON.stringify({source: name === "T1" ? "airport_congestion" : "airport_congestion_t2", status: "ERROR", detail})).sources,
        [name === "T1" ? "airport_congestion" : "airport_congestion_t2"]);
      return true;
    });
    assert.equal(h.calls(), 1); assert.deepEqual(h.delays, []);
  });
}
test("default callers retain their connection retry ladder", async () => {
  const h = harness([connect(), Response.json({ok:true})], DATA_GO_KR_LOW_CALL_POLICY, false);
  assert.deepEqual(await fetchOfficialJson(url, h.options), {ok:true});
  assert.equal(h.calls(), 2); assert.deepEqual(h.delays, [2000]);
});
for (const first of [new TypeError("DNS", {cause:{code:"ENOTFOUND"}}), new TypeError("reset", {cause:{code:"ECONNRESET"}}), new DOMException("timeout", "AbortError"), new Response("gateway", {status:503})]) {
  test(`opt-in preserves recovery for ${first instanceof Response ? first.status : first.message}`, async () => {
    const h = harness([first, Response.json({ok:true})]);
    assert.deepEqual(await fetchOfficialJson(url, h.options), {ok:true}); assert.equal(h.calls(), 2);
  });
}
test("a connect code after headers does not trigger initial-connection handoff", async () => {
  const broken = new Response(new ReadableStream({start(controller) {controller.error(connect());}}));
  const h = harness([broken, Response.json({ok:true})]);
  assert.deepEqual(await fetchOfficialJson(url, h.options), {ok:true}); assert.equal(h.calls(), 2);
});
test("a later connection failure retains its ladder", async () => {
  const h = harness([new Response("gateway", {status:503}), connect(), Response.json({ok:true})]);
  assert.deepEqual(await fetchOfficialJson(url, h.options), {ok:true}); assert.equal(h.calls(), 3);
  assert.deepEqual(h.delays, [2000, 10000]);
});
for (const response of [new Response("denied", {status:403}), new Response("quota", {status:429}), new Response("bad json")]) {
  test(`permanent failure ${response.status} stays failed without fallback`, async () => {
    const h = harness([response]);
    await assert.rejects(fetchOfficialJson(url, h.options), error => {
      assert.deepEqual(decideCongestionRetry(JSON.stringify({source:"airport_congestion",status:"ERROR",detail:safeSourceFailureDetail(error)})).sources, []); return true;
    }); assert.equal(h.calls(), 1);
  });
}
test("actual T1/T2 collectors preserve ERROR and zero rows on initial connection failure", async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => {calls++; throw connect();};
  try {
    for (const collect of [collectAirportCongestion, collectAirportCongestionT2]) {
      const before = calls;
      const result = await collect({DATA_GO_KR_SERVICE_KEY:"fixture", A4_STOP_ON_INITIAL_CONNECT_TIMEOUT:true});
      assert.equal(result.status, "ERROR"); assert.equal(result.records, 0); assert.equal(calls-before, 1);
      assert.match(result.detail!, /attempts=1.*retryExhausted=false/);
    }
  } finally {globalThis.fetch = original;}
});
test("only the existing primary cycle opts in and retains one serialized fallback", () => {
  const cycle = readFileSync(".github/workflows/collect-realtime-cycle.yml", "utf8");
  const attempt = readFileSync(".github/workflows/collect-attempt.yml", "utf8");
  assert.match(cycle, /RPK_A4_STOP_ON_INITIAL_CONNECT_TIMEOUT: "true"/);
  assert.match(cycle, /retry_congestion:\s+needs: collect/);
  assert.match(cycle, /a4_max_attempts_per_request: "1"/);
  assert.doesNotMatch(attempt, /RPK_A4_STOP_ON_INITIAL_CONNECT_TIMEOUT/);
});

test("later T2 pages keep the original retry policy even when primary opts in", () => {
  assert.equal(boundedA4Policy(DATA_GO_KR_PAGED_POLICY, {A4_STOP_ON_INITIAL_CONNECT_TIMEOUT:true}, false).stopOnInitialConnectTimeout, false);
});
