import assert from "node:assert/strict";
import test from "node:test";
import {
  boundedRetryDelayMs,
  DATA_GO_KR_LOW_CALL_POLICY,
  DATA_GO_KR_PAGED_POLICY,
  fetchOfficialJson,
  KMA_GRID_RETRY_POLICY,
  safeSourceFailureDetail,
  SourceFetchError,
} from "../lib/source-adapters";

const URL_FIXTURE = new URL("https://provider.invalid/data?serviceKey=SECRET-VALUE");

function sequenceFetch(sequence: Array<Response | Error>) {
  let calls = 0;
  const fetchImpl = (async () => {
    const value = sequence[Math.min(calls, sequence.length - 1)];
    calls += 1;
    if (value instanceof Error) throw value;
    return value;
  }) as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

function networkError(code = "ECONNRESET"): Error {
  const cause = Object.assign(new Error("connection failed"), { code });
  return new TypeError("fetch failed", { cause });
}

function testPolicy(overrides: Record<string, unknown> = {}) {
  const delays: number[] = [];
  let clock = 0;
  return {
    options: {
      ...DATA_GO_KR_LOW_CALL_POLICY,
      sleep: async (delayMs: number) => { delays.push(delayMs); clock += delayMs; },
      random: () => 0,
      nowMs: () => clock,
      ...overrides,
    },
    delays,
  };
}

test("source-specific retry budgets remain bounded", () => {
  assert.deepEqual(DATA_GO_KR_LOW_CALL_POLICY.retryDelaysMs, [2_000, 10_000, 45_000]);
  assert.equal(DATA_GO_KR_LOW_CALL_POLICY.maxAttempts, 4);
  assert.deepEqual(DATA_GO_KR_PAGED_POLICY.retryDelaysMs, [5_000, 30_000]);
  assert.equal(DATA_GO_KR_PAGED_POLICY.maxAttempts, 3);
  assert.deepEqual(KMA_GRID_RETRY_POLICY.retryDelaysMs, [5_000, 30_000]);
  assert.equal(KMA_GRID_RETRY_POLICY.maxAttempts, 3);
});

test("NETWORK recovers on a later bounded attempt", async () => {
  const sequence = sequenceFetch([networkError(), Response.json({ ok: true })]);
  const { options, delays } = testPolicy({ fetchImpl: sequence.fetchImpl });
  assert.deepEqual(await fetchOfficialJson(URL_FIXTURE, options), { ok: true });
  assert.equal(sequence.calls(), 2);
  assert.deepEqual(delays, [2_000]);
});

test("multiple NETWORK failures can recover on the final allowed attempt", async () => {
  const sequence = sequenceFetch([networkError(), networkError(), networkError(), Response.json({ ok: true })]);
  const { options, delays } = testPolicy({ fetchImpl: sequence.fetchImpl });
  assert.deepEqual(await fetchOfficialJson(URL_FIXTURE, options), { ok: true });
  assert.equal(sequence.calls(), 4);
  assert.deepEqual(delays, [2_000, 10_000, 45_000]);
});

test("UND_ERR_CONNECT_TIMEOUT is preserved as a safe cause code", async () => {
  const sequence = sequenceFetch([networkError("UND_ERR_CONNECT_TIMEOUT")]);
  const { options } = testPolicy({ fetchImpl: sequence.fetchImpl, maxAttempts: 1 });
  await assert.rejects(fetchOfficialJson(URL_FIXTURE, options), (error: unknown) => {
    assert.ok(error instanceof SourceFetchError);
    assert.equal(error.code, "NETWORK");
    assert.equal(error.causeCode, "UND_ERR_CONNECT_TIMEOUT");
    assert.match(safeSourceFailureDetail(error), /causeCode=UND_ERR_CONNECT_TIMEOUT/);
    return true;
  });
});

test("a real AbortError is TIMEOUT and remains retryable", async () => {
  const sequence = sequenceFetch([new DOMException("aborted", "AbortError"), Response.json({ ok: true })]);
  const { options } = testPolicy({ fetchImpl: sequence.fetchImpl });
  assert.deepEqual(await fetchOfficialJson(URL_FIXTURE, options), { ok: true });
  assert.equal(sequence.calls(), 2);
});

for (const status of [500, 503]) {
  test(`HTTP ${status} retries and can recover`, async () => {
    const sequence = sequenceFetch([new Response("gateway", { status }), Response.json({ ok: true })]);
    const { options } = testPolicy({ fetchImpl: sequence.fetchImpl });
    assert.deepEqual(await fetchOfficialJson(URL_FIXTURE, options), { ok: true });
    assert.equal(sequence.calls(), 2);
  });
}

test("HTTP 429 honors bounded Retry-After", async () => {
  const sequence = sequenceFetch([
    new Response("limited", { status: 429, headers: { "retry-after": "12" } }),
    Response.json({ ok: true }),
  ]);
  const { options, delays } = testPolicy({ fetchImpl: sequence.fetchImpl });
  assert.deepEqual(await fetchOfficialJson(URL_FIXTURE, options), { ok: true });
  assert.deepEqual(delays, [12_000]);
});

test("retry exhaustion reports bounded attempts and elapsed recovery window", async () => {
  const sequence = sequenceFetch([networkError()]);
  const { options, delays } = testPolicy({ fetchImpl: sequence.fetchImpl });
  await assert.rejects(fetchOfficialJson(URL_FIXTURE, options), (error: unknown) => {
    assert.ok(error instanceof SourceFetchError);
    assert.equal(error.attempts, 4);
    assert.equal(error.elapsedMs, 57_000);
    assert.equal(error.retryExhausted, true);
    assert.match(safeSourceFailureDetail(error), /attempts=4/);
    assert.match(safeSourceFailureDetail(error), /retryExhausted=true/);
    return true;
  });
  assert.equal(sequence.calls(), 4, "the request policy must never exceed four attempts");
  assert.deepEqual(delays, [2_000, 10_000, 45_000]);
});

test("jitter and Retry-After are both capped", () => {
  assert.equal(boundedRetryDelayMs(2_000, { jitterMs: 500, random: () => 1 }), 2_500);
  assert.equal(boundedRetryDelayMs(2_000, { retryAfter: "120", jitterMs: 500, random: () => 1 }), 60_000);
});

for (const status of [400, 401, 403, 404, 422]) {
  test(`HTTP ${status} is permanent and never retried`, async () => {
    const sequence = sequenceFetch([new Response("permanent", { status })]);
    const { options, delays } = testPolicy({ fetchImpl: sequence.fetchImpl });
    await assert.rejects(fetchOfficialJson(URL_FIXTURE, options), (error: unknown) => {
      assert.ok(error instanceof SourceFetchError);
      assert.equal(error.code, "HTTP");
      assert.equal(error.status, status);
      assert.equal(error.attempts, 1);
      assert.equal(error.retryExhausted, false);
      return true;
    });
    assert.equal(sequence.calls(), 1);
    assert.deepEqual(delays, []);
  });
}

test("a provider auth result payload is returned once for deterministic validation", async () => {
  const sequence = sequenceFetch([Response.json({ response: { header: { resultCode: "30" } } })]);
  const { options, delays } = testPolicy({ fetchImpl: sequence.fetchImpl });
  const payload = await fetchOfficialJson(URL_FIXTURE, options);
  assert.deepEqual(payload, { response: { header: { resultCode: "30" } } });
  assert.equal(sequence.calls(), 1);
  assert.deepEqual(delays, []);
});

test("provider key failure diagnostics are classified as permanent AUTH", () => {
  const detail = safeSourceFailureDetail(new Error("airport_a2_result_30"));
  assert.equal(detail, "failureClass=AUTH causeCode=AIRPORT_A2_RESULT_30 attempts=1 elapsedMs=0 retryExhausted=false");
});

test("successful malformed JSON is deterministic and never retried", async () => {
  const sequence = sequenceFetch([new Response("not-json", { status: 200 })]);
  const { options, delays } = testPolicy({ fetchImpl: sequence.fetchImpl });
  await assert.rejects(fetchOfficialJson(URL_FIXTURE, options), (error: unknown) => {
    assert.ok(error instanceof SourceFetchError);
    assert.equal(error.code, "MALFORMED_JSON");
    assert.equal(error.attempts, 1);
    return true;
  });
  assert.equal(sequence.calls(), 1);
  assert.deepEqual(delays, []);
});

test("deterministic schema validation after a successful response never re-fetches", async () => {
  const sequence = sequenceFetch([Response.json({ response: { body: {} } })]);
  const { options } = testPolicy({ fetchImpl: sequence.fetchImpl });
  const payload = await fetchOfficialJson(URL_FIXTURE, options) as { response?: { required?: string } };
  assert.throws(() => {
    if (!payload.response?.required) throw new SourceFetchError("SCHEMA");
  }, (error: unknown) => error instanceof SourceFetchError && error.code === "SCHEMA");
  assert.equal(sequence.calls(), 1);
});

test("safe diagnostics never contain an authenticated URL or secret", () => {
  const detail = safeSourceFailureDetail(new Error(URL_FIXTURE.toString()));
  assert.equal(detail.includes("SECRET-VALUE"), false);
  assert.equal(detail.includes("https://"), false);
  assert.equal(detail, "failureClass=VALIDATION causeCode=COLLECTOR_ERROR attempts=1 elapsedMs=0 retryExhausted=false");
});
