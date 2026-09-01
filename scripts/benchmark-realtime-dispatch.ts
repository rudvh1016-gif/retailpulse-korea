/**
 * Free-tier CPU benchmark for the TRIGGER-ONLY realtime scheduler.
 *
 * docs/ZERO_COST_HYBRID_AUDIT.md D.5 requires a benchmark before any Worker
 * Cron is enabled. The previous design failed that gate at 414% of the 10 ms
 * budget; this measures its replacement, which does only:
 *
 *   scheduled handler -> request construction -> authorization header
 *   -> one fetch dispatch -> response handling
 *
 * The realtime collectors are deliberately NOT in this path. `fetch` is
 * stubbed, so this makes ZERO GitHub API calls and ZERO provider calls.
 *
 * CPU comes from process.cpuUsage() (user+system) on this runner, so the
 * result is MEASURED_LOCAL — never MEASURED_CLOUDFLARE. Real Cloudflare
 * Worker CPU accounting requires a deployed Worker and account telemetry.
 */
import { dispatchRealtimeCollection } from "../lib/realtime-dispatch";

const OFFICIAL_CRON_CPU_LIMIT_MS = 10;
const ITERATIONS = 200;
const WARMUP = 20;

let calls = 0;
const stubFetch = (async () => {
  calls += 1;
  return new Response(null, { status: 204 });
}) as unknown as typeof fetch;

const env = { GITHUB_DISPATCH_TOKEN: "benchmark-placeholder-not-a-real-token" };

for (let i = 0; i < WARMUP; i += 1) await dispatchRealtimeCollection(env, stubFetch);

const perInvocation: number[] = [];
for (let i = 0; i < ITERATIONS; i += 1) {
  const before = process.cpuUsage();
  await dispatchRealtimeCollection(env, stubFetch);
  const cpu = process.cpuUsage(before);
  perInvocation.push((cpu.user + cpu.system) / 1000);
}

const sorted = [...perInvocation].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const p95 = sorted[Math.floor(sorted.length * 0.95)];
const round = (value: number) => Number(value.toFixed(4));

console.log(JSON.stringify({
  benchmark: "realtime-trigger-only-cron-cpu",
  runtime: `node ${process.version}`,
  measurementClass: "MEASURED_LOCAL",
  note: "Cloudflare production Worker CPU is BLOCKED: api.cloudflare.com is unreachable from this environment, so no Worker could be deployed or metered.",
  officialLimit: { source: "Cloudflare Workers Free", cronCpuMs: OFFICIAL_CRON_CPU_LIMIT_MS, subrequestsPerInvocation: 50 },
  pathMeasured: ["request construction", "authorization header", "single fetch dispatch", "response handling"],
  excluded: ["A4-T1 collector", "A4-T2 collector", "S1 collector", "hashing", "D1"],
  iterations: ITERATIONS,
  warmupIterations: WARMUP,
  cpuMillisPerInvocation: { median: round(median), p95: round(p95), min: round(sorted[0]), max: round(sorted[sorted.length - 1]) },
  budget: {
    medianPercentOfCronBudget: round((median / OFFICIAL_CRON_CPU_LIMIT_MS) * 100),
    p95PercentOfCronBudget: round((p95 / OFFICIAL_CRON_CPU_LIMIT_MS) * 100),
    headroomMsAtP95: round(OFFICIAL_CRON_CPU_LIMIT_MS - p95),
  },
  // Every Cron expression the production Worker fires, and how many
  // invocations each contributes per day. Adding the A5/weather recovery
  // windows changes only how OFTEN the handler runs, never what it does in
  // one invocation, so the per-invocation CPU figures above are unaffected.
  callModel: {
    externalSubrequestsPerInvocation: 1,
    invocationsPerDayByCron: {
      "7,22,37,52 * * * *": 96,
      "42 * * * *": 24,
      "10 2,5,8,11,14,17,20,23 * * *": 8,
      "53 * * * *": 24,
      "25 2,5,8,11,14,17,20,23 * * *": 8,
    },
    // Five is the Workers Free per-account Cron Trigger ceiling; a sixth
    // fails the deploy outright (Cloudflare code 10072).
    cronTriggersConfigured: 5,
    workersFreeCronTriggerLimit: 5,
    workerCronInvocationsPerDay: 160,
    githubDispatchesPerDay: 160,
    // One bounded transient retry per dispatch, against 5,000/hour authenticated.
    worstCaseGithubRequestsPerDay: 320,
    githubApiCallsMadeByThisBenchmark: 0,
    providerCallsMadeByThisBenchmark: 0,
  },
  verdict: p95 < OFFICIAL_CRON_CPU_LIMIT_MS ? "PASS_LOCAL" : "FAIL",
}, null, 2));

if (calls !== ITERATIONS + WARMUP) throw new Error("benchmark_fetch_accounting_mismatch");
