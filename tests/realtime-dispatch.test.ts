import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyDispatchStatus,
  dispatchScheduledCollection,
  dispatchRealtimeCollection,
  dispatchUrl,
  DISPATCH_OWNER,
  DISPATCH_REF,
  DISPATCH_REPO,
  FORECAST_CRON,
  FORECAST_WORKFLOW_FILE,
  REALTIME_CRON,
  REALTIME_WORKFLOW_FILE,
  WEATHER_CRON,
  WEATHER_WORKFLOW_FILE,
  realtimeDispatchUrl,
  workflowForCron,
} from "../lib/realtime-dispatch";

const TOKEN = "ghp-SUPER-SECRET-DISPATCH-TOKEN";
const at = () => new Date("2026-08-31T02:30:00.000Z");

/** Records every call so "exactly one GitHub request" is provable. */
function recordingFetch(responder: (attempt: number) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return responder(calls.length);
  }) as unknown as typeof fetch;
  return { calls, impl };
}

test("dispatch targets exactly the realtime workflow on the right repo and ref", async () => {
  assert.equal(REALTIME_WORKFLOW_FILE, "collect-realtime.yml");
  assert.equal(DISPATCH_OWNER, "rudvh1016-gif");
  assert.equal(DISPATCH_REPO, "retailpulse-korea");
  assert.equal(DISPATCH_REF, "main");
  assert.equal(
    realtimeDispatchUrl(),
    "https://api.github.com/repos/rudvh1016-gif/retailpulse-korea/actions/workflows/collect-realtime.yml/dispatches",
  );

  const { calls, impl } = recordingFetch(() => new Response(null, { status: 204 }));
  const log = await dispatchRealtimeCollection({ GITHUB_DISPATCH_TOKEN: TOKEN }, impl, at);

  assert.equal(calls.length, 1, "a Cron invocation must make exactly one GitHub API call");
  assert.equal(calls[0].url, realtimeDispatchUrl());
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { ref: "main" });
  assert.deepEqual(log, {
    event: "dispatch_success", workflow: "collect-realtime.yml", ref: "main",
    status: 204, attempts: 1, at: "2026-08-31T02:30:00.000Z",
  });
});

test("each known cron dispatches only its explicitly allowlisted workflow", async () => {
  assert.equal(workflowForCron(REALTIME_CRON), REALTIME_WORKFLOW_FILE);
  assert.equal(workflowForCron(FORECAST_CRON), FORECAST_WORKFLOW_FILE);
  assert.equal(workflowForCron(WEATHER_CRON), WEATHER_WORKFLOW_FILE);
  assert.equal(dispatchUrl(FORECAST_WORKFLOW_FILE),
    "https://api.github.com/repos/rudvh1016-gif/retailpulse-korea/actions/workflows/collect-forecast.yml/dispatches");

  for (const [cron, workflow] of [
    [REALTIME_CRON, REALTIME_WORKFLOW_FILE],
    [FORECAST_CRON, FORECAST_WORKFLOW_FILE],
    [WEATHER_CRON, WEATHER_WORKFLOW_FILE],
  ] as const) {
    const { calls, impl } = recordingFetch(() => new Response(null, { status: 204 }));
    const log = await dispatchScheduledCollection(cron, { GITHUB_DISPATCH_TOKEN: TOKEN }, impl, at);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, dispatchUrl(workflow));
    assert.equal(log.workflow, workflow);
    assert.equal(log.event, "dispatch_success");
  }
});

test("unknown cron is ignored without token lookup or dispatch", async () => {
  const { calls, impl } = recordingFetch(() => new Response(null, { status: 204 }));
  const log = await dispatchScheduledCollection("0 0 * * *", { GITHUB_DISPATCH_TOKEN: TOKEN }, impl, at);
  assert.equal(calls.length, 0);
  assert.deepEqual(log, {
    event: "dispatch_ignored_cron", workflow: null, ref: "main",
    status: null, attempts: 0, at: "2026-08-31T02:30:00.000Z",
  });
});

test("the trigger can never dispatch a workflow outside the allowlist", async () => {
  const source = readFileSync(new URL("../lib/realtime-dispatch.ts", import.meta.url), "utf8");
  for (const other of [
    "collect-production.yml",
    "collect-sales.yml", "import-oneshot.yml", "deploy-cloudflare.yml",
  ]) {
    assert.equal(source.includes(other), false, `trigger must never reference ${other}`);
  }
  // Nor any collector, provider host, hashing or D1 work.
  for (const forbidden of [
    "collectAirport", "collectSeoul", "collectWeather", "collectTourism", "collectEstimated",
    "sha256", "apis.data.go.kr", "openapi.seoul.go.kr", "D1Database", "prepare(", "batch(",
  ]) {
    assert.equal(source.includes(forbidden), false, `trigger must not contain ${forbidden}`);
  }
});

test("the Worker scheduled handler stays trigger-only", () => {
  const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /async scheduled\(/);
  assert.match(worker, /dispatchScheduledCollection\(event\.cron, env\)/);
  for (const forbidden of ["collectAirport", "collectSeoul", "sha256", "env.DB", "runD1Batches", "apis.data.go.kr"]) {
    assert.equal(worker.includes(forbidden), false, `scheduled handler must not contain ${forbidden}`);
  }
});

test("204 succeeds; auth, missing and invalid failures never retry", async () => {
  assert.deepEqual(classifyDispatchStatus(204), { outcome: "dispatch_success", retryable: false });
  for (const [status, outcome] of [
    [401, "dispatch_auth_failed"], [403, "dispatch_auth_failed"],
    [404, "dispatch_not_found"], [422, "dispatch_invalid_request"],
    [429, "dispatch_rate_limited"],
  ] as const) {
    assert.deepEqual(classifyDispatchStatus(status), { outcome, retryable: false });

    const { calls, impl } = recordingFetch(() => new Response(null, { status }));
    const log = await dispatchRealtimeCollection({ GITHUB_DISPATCH_TOKEN: TOKEN }, impl, at);
    assert.equal(calls.length, 1, `HTTP ${status} must not be retried`);
    assert.equal(log.event, outcome);
    assert.equal(log.attempts, 1);
    assert.equal(log.status, status);
  }
});

test("transient 5xx and network failures retry exactly once, never more", async () => {
  assert.deepEqual(classifyDispatchStatus(500), { outcome: "dispatch_upstream_error", retryable: true });
  assert.deepEqual(classifyDispatchStatus(503), { outcome: "dispatch_upstream_error", retryable: true });

  // 5xx then success: two calls total.
  const recovering = recordingFetch((attempt) => new Response(null, { status: attempt === 1 ? 503 : 204 }));
  const recovered = await dispatchRealtimeCollection({ GITHUB_DISPATCH_TOKEN: TOKEN }, recovering.impl, at);
  assert.equal(recovering.calls.length, 2);
  assert.equal(recovered.event, "dispatch_success");
  assert.equal(recovered.attempts, 2);

  // Persistent 5xx: bounded at two calls, no retry storm.
  const failing = recordingFetch(() => new Response(null, { status: 500 }));
  const failed = await dispatchRealtimeCollection({ GITHUB_DISPATCH_TOKEN: TOKEN }, failing.impl, at);
  assert.equal(failing.calls.length, 2, "retry must stay bounded at one extra attempt");
  assert.equal(failed.event, "dispatch_upstream_error");
  assert.equal(failed.attempts, 2);

  // Network rejection is transient too, and still bounded.
  const networkCalls: number[] = [];
  const networkImpl = (async () => { networkCalls.push(1); throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
  const network = await dispatchRealtimeCollection({ GITHUB_DISPATCH_TOKEN: TOKEN }, networkImpl, at);
  assert.equal(networkCalls.length, 2);
  assert.equal(network.event, "dispatch_network_error");
  assert.equal(network.status, null);
});

test("a missing secret fails safely without any GitHub call", async () => {
  const { calls, impl } = recordingFetch(() => new Response(null, { status: 204 }));
  for (const env of [{}, { GITHUB_DISPATCH_TOKEN: "" }, { GITHUB_DISPATCH_TOKEN: "   " }]) {
    const log = await dispatchRealtimeCollection(env, impl, at);
    assert.equal(log.event, "dispatch_missing_token");
    assert.equal(log.attempts, 0);
    assert.equal(log.status, null);
  }
  assert.equal(calls.length, 0, "no token must mean no request at all");
});

test("the token never appears in the log record on any path", async () => {
  const statuses = [204, 401, 403, 404, 422, 429, 500];
  for (const status of statuses) {
    const { impl } = recordingFetch(() => new Response(null, { status }));
    const log = await dispatchRealtimeCollection({ GITHUB_DISPATCH_TOKEN: TOKEN }, impl, at);
    const serialized = JSON.stringify(log);
    assert.equal(serialized.includes(TOKEN), false, `token leaked at HTTP ${status}`);
    assert.equal(/authorization/i.test(serialized), false, "no authorization header may be logged");
    assert.equal(serialized.includes("Bearer"), false);
  }
  // The authorization header is sent but is not part of the returned record.
  const { calls, impl } = recordingFetch(() => new Response(null, { status: 204 }));
  await dispatchRealtimeCollection({ GITHUB_DISPATCH_TOKEN: TOKEN }, impl, at);
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(realtimeDispatchUrl().includes(TOKEN), false, "the URL must never carry the token");
});

test("the dispatch benchmark measures only the trigger path", () => {
  const benchmark = readFileSync(new URL("../scripts/benchmark-realtime-dispatch.ts", import.meta.url), "utf8");
  assert.match(benchmark, /dispatchRealtimeCollection/);
  assert.match(benchmark, /MEASURED_LOCAL/);
  // It must never import or invoke a collector, hash or D1 in the measured
  // path. The `excluded` array names them as documentation, so assert on
  // imports and call sites rather than on any occurrence of the words.
  assert.equal(/from "\.\.\/lib\/collector"/.test(benchmark), false, "must not import the collectors");
  assert.equal(/\bcollect[A-Z]\w*\(/.test(benchmark), false, "must not invoke a collector");
  assert.equal(/\bsha256\(/.test(benchmark), false, "must not hash");
  assert.equal(/\.(prepare|batch)\(/.test(benchmark), false, "must not touch D1");
  assert.equal(benchmark.includes("import { dispatchRealtimeCollection }"), true, "only the dispatch is imported");
  // fetch is stubbed, so no real GitHub request is ever made.
  assert.match(benchmark, /stubFetch/);
  // The emitted class must be MEASURED_LOCAL. The word MEASURED_CLOUDFLARE
  // may appear in prose explaining what this is NOT, but never as the value.
  assert.match(benchmark, /measurementClass: "MEASURED_LOCAL"/);
  assert.equal(/measurementClass:\s*"MEASURED_CLOUDFLARE"/.test(benchmark), false, "local CPU must never be reported as Cloudflare-measured");
});
