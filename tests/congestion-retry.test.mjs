/**
 * Does the A4 fresh-runner retry start only when a fresh runner would help,
 * and can it ever outspend the normal cycle it is meant to protect?
 *
 * No provider is called. Every scenario below is a real collector log shape,
 * copied from Production job output, fed to the real decision function; the
 * last group checks that the workflow actually consumes that decision, because
 * a correct function nothing is wired to would change nothing at all.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { decideCongestionRetry, decideWeeklySeoulRetry, isFreshRunnerFailure, RETRYABLE_A4_SOURCES, RETRYABLE_WEEKLY_SEOUL_SOURCES, shouldRetryForecast } =
  await import("../lib/congestion-retry.ts");

const line = (object) => JSON.stringify(object);

// Verbatim shapes from run 34961592829 (2026-09-15 11:11 UTC).
const T1_TIMEOUT = line({
  source: "airport_congestion", mode: "PRIMARY", status: "ERROR", changedRows: 0,
  detail: "terminals none; changed rows 0; storage writes 0; failed P01: failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT attempts=4 elapsedMs=100267 retryExhausted=true",
});
const T2_TIMEOUT = line({
  source: "airport_congestion_t2", mode: "PRIMARY", status: "ERROR", changedRows: 0,
  detail: "failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT attempts=3 elapsedMs=66571 retryExhausted=true",
});
const T1_OK = line({ source: "airport_congestion", mode: "PRIMARY", status: "SUCCESS", changedRows: 12, detail: "terminals P01:12; changed rows 12; storage writes 48" });
const T2_OK = line({ source: "airport_congestion_t2", mode: "PRIMARY", status: "SUCCESS", changedRows: 8, detail: "pages 1; totalCount 8; normalized 8; changed rows 8; storage writes 32" });
const SEOUL_OK = line({ source: "seoul_realtime", mode: "PRIMARY", status: "SUCCESS", changedRows: 42 });
const SEOUL_FAIL = line({ source: "seoul_realtime", mode: "PRIMARY", status: "ERROR", changedRows: 0, detail: "failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT attempts=2 elapsedMs=40000 retryExhausted=true" });
const MEMORY = line({ operationalMemory: "PERSISTED", source: "airport_congestion", sourceCount: 1 });

const log = (...lines) => [MEMORY, ...lines].join("\n") + "\n";
const verdictFor = (decision, source) => decision.decisions.find((item) => item.source === source)?.verdict;

test("the existing A5 job ladder retries classified transient failures only", () => {
  const result = (status, detail, source = "airport_passenger_forecast") => line({ source, status, detail });
  for (const detail of [
    "failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT attempts=2 retryExhausted=true",
    "failureClass=TIMEOUT attempts=2 retryExhausted=true",
    "failureClass=HTTP httpStatus=503 attempts=2 retryExhausted=true",
  ]) {
    assert.equal(shouldRetryForecast(result("ERROR", detail)), true);
    assert.equal(shouldRetryForecast(result("ERROR", detail, "airport_passenger_forecast_recovery")), true);
    assert.equal(shouldRetryForecast(result("PARTIAL", detail)), false, "D1-targeted recovery owns the missing day");
    assert.equal(shouldRetryForecast(result("SUCCESS", detail)), false);
  }
  for (const detail of [
    "failureClass=AUTH causeCode=FORECAST_RESULT_30", "failureClass=SCHEMA", "failureClass=VALIDATION",
    "failureClass=NO_DATA", "failureClass=MALFORMED_JSON", "failureClass=HTTP httpStatus=429",
    "failureClass=HTTP httpStatus=403", "failureClass=HTTP httpStatus=503 retryDeferred=true",
    "failureClass=NETWORK | failureClass=AUTH", "failureClass=NETWORK | row: forecast_adate_format",
    "failureClass=NETWORK | failureClass=NO_DATA", "coverage incomplete", "",
  ]) assert.equal(shouldRetryForecast(result("ERROR", detail)), false, detail);
  assert.equal(shouldRetryForecast(""), false);
  assert.equal(shouldRetryForecast(log(T1_TIMEOUT)), false);
  assert.equal(shouldRetryForecast(log(result("ERROR", "failureClass=NETWORK"), result("SUCCESS", "covered"))), false);
});

test("A5 workflow retries consume their own result classification and stay spaced/bounded", async () => {
  for (const file of ["collect-forecast.yml", "collect-forecast-recovery.yml"]) {
    const workflow = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    assert.match(workflow, /needs\.collect\.outputs\.retry_forecast == 'true'/);
    assert.match(workflow, /needs\.retry_1\.outputs\.retry_forecast == 'true'/);
    assert.equal((workflow.match(/uses: \.\/\.github\/workflows\/collect-attempt\.yml/g) ?? []).length, 3);
  }
  const shared = await readFile(new URL("../.github/workflows/collect-attempt.yml", import.meta.url), "utf8");
  assert.match(shared, /set -o pipefail/);
  assert.match(shared, /jobs\.collect\.outputs\.retry_forecast/);
  assert.match(shared, /scripts\/decide-congestion-retry\.ts .*--forecast/);
  assert.match(shared, /inputs\.attempt > 1 && startsWith\(inputs\.sources, 'airport_passenger_forecast'\)/);
  assert.match(shared, /run: sleep 10/);
});

test("A4 healthy and Seoul failing asks for zero extra A4 requests", () => {
  // The bug this closes: the old gate saw only the job's red badge, so a
  // Seoul-only failure re-requested BOTH airport datasets.
  const decision = decideCongestionRetry(log(T1_OK, T2_OK, SEOUL_FAIL));
  assert.deepEqual(decision.sources, []);
  assert.equal(verdictFor(decision, "airport_congestion"), "ALREADY_HEALTHY");
  assert.equal(verdictFor(decision, "airport_congestion_t2"), "ALREADY_HEALTHY");
});

test("T1 connect timeout with T2 healthy retries T1 only", () => {
  const decision = decideCongestionRetry(log(T1_TIMEOUT, T2_OK, SEOUL_OK));
  assert.deepEqual(decision.sources, ["airport_congestion"]);
  assert.equal(verdictFor(decision, "airport_congestion_t2"), "ALREADY_HEALTHY");
});

test("T2 connect timeout with T1 healthy retries T2 only", () => {
  const decision = decideCongestionRetry(log(T1_OK, T2_TIMEOUT, SEOUL_OK));
  assert.deepEqual(decision.sources, ["airport_congestion_t2"]);
});

test("both timing out retries both, and never Seoul", () => {
  const decision = decideCongestionRetry(log(T1_TIMEOUT, T2_TIMEOUT, SEOUL_FAIL));
  assert.deepEqual(decision.sources, ["airport_congestion", "airport_congestion_t2"]);
  assert.equal(verdictFor(decision, "seoul_realtime"), "NOT_AN_A4_SOURCE");
  for (const source of decision.sources) assert.ok(RETRYABLE_A4_SOURCES.includes(source));
});

test("auth, schema and storage failures ask for zero extra requests", () => {
  for (const detail of [
    "failureClass=AUTH causeCode=SERVICE_KEY_REJECTED attempts=1 elapsedMs=0 retryExhausted=false",
    "failureClass=SCHEMA causeCode=CONGESTION_RESULT_30 attempts=1 elapsedMs=0 retryExhausted=false",
    "failureClass=VALIDATION causeCode=D1_WRITE_FAILED attempts=1 elapsedMs=0 retryExhausted=false",
    "failureClass=PROVIDER causeCode=PROVIDER_UNAVAILABLE attempts=3 elapsedMs=9000 retryExhausted=true",
  ]) {
    const decision = decideCongestionRetry(log(
      line({ source: "airport_congestion", status: "ERROR", detail }),
      line({ source: "airport_congestion_t2", status: "ERROR", detail }),
    ));
    assert.deepEqual(decision.sources, [], detail);
    assert.equal(verdictFor(decision, "airport_congestion"), "FAILED_FOR_ANOTHER_REASON");
  }
});

test("a missing key (NEEDS_KEY) is never answered with another request", () => {
  const decision = decideCongestionRetry(log(
    line({ source: "airport_congestion", status: "NEEDS_KEY", detail: "DATA_GO_KR_SERVICE_KEY is not configured" }),
    line({ source: "airport_congestion_t2", status: "NEEDS_KEY", detail: "DATA_GO_KR_SERVICE_KEY is not configured" }),
  ));
  assert.deepEqual(decision.sources, []);
});

test("a result that cannot be determined asks for zero extra requests", () => {
  // The job died before printing per-source results, or the log was lost.
  for (const body of ["", "npm ERR! something exploded", log(SEOUL_OK)]) {
    const decision = decideCongestionRetry(body);
    assert.deepEqual(decision.sources, []);
    assert.equal(verdictFor(decision, "airport_congestion"), "RESULT_UNKNOWN");
  }
});

test("a source already recovered later in the same cycle is not retried", () => {
  const decision = decideCongestionRetry(log(T1_TIMEOUT, T2_TIMEOUT, T1_OK));
  assert.deepEqual(decision.sources, ["airport_congestion_t2"]);
  assert.equal(verdictFor(decision, "airport_congestion"), "ALREADY_HEALTHY");
});

test("a detail carrying a second, different failure is not a fresh-runner case", () => {
  // One problem a new address fixes plus one it does not is not a case for
  // spending a request — the other problem would still be there.
  assert.equal(isFreshRunnerFailure(
    "failed P01: failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT attempts=4 | failed P02: failureClass=AUTH causeCode=SERVICE_KEY_REJECTED attempts=1",
  ), false);
  assert.equal(isFreshRunnerFailure("failureClass=NETWORK causeCode=ECONNRESET attempts=4"), false);
  assert.equal(isFreshRunnerFailure("changed rows 0; storage writes 0"), false);
  assert.equal(isFreshRunnerFailure(undefined), false);
  assert.equal(isFreshRunnerFailure("failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT attempts=3"), true);
});

test("only allowlisted source names can ever reach the retry job", () => {
  const decision = decideCongestionRetry(log(
    line({ source: "airport_congestion; rm -rf /", status: "ERROR", detail: "failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT" }),
    line({ source: "seoul_realtime", status: "ERROR", detail: "failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT" }),
  ));
  assert.deepEqual(decision.sources, []);
});

// ── Weekly Seoul quarter checks (collect-sales.yml) ────────────────────────

// Verbatim from run 38099853388 (2026-10-11 00:51 UTC): Store Dynamics died on
// its first request. Estimated sales failed the same way that run but printed
// no detail yet; this is the line it prints now (lib/collector.ts).
const STORE_CONNECT_TIMEOUT = line({
  source: "store_dynamics", status: "ERROR", providerRequests: 1, sourceHealth: "STALE", lastGoodPreserved: true,
  detail: "failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT attempts=1 elapsedMs=10492 retryExhausted=true",
});
const SALES_CONNECT_TIMEOUT = line({
  source: "seoul_sales", mode: "PRIMARY", status: "ERROR", changedRows: 0, providerRequests: 1,
  detail: "failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT attempts=1 elapsedMs=10021 retryExhausted=true",
});
const seoulFailure = (source, detail, providerRequests = 1) =>
  line({ source, mode: "PRIMARY", status: "ERROR", changedRows: 0, providerRequests, ...(detail === undefined ? {} : { detail }) });

test("the weekly Seoul retry fires for the 2026-10-11 first-request connect timeout", () => {
  const decision = decideWeeklySeoulRetry(log(SALES_CONNECT_TIMEOUT, STORE_CONNECT_TIMEOUT));
  assert.deepEqual(decision.sources, ["seoul_sales", "store_dynamics"]);
  assert.equal(verdictFor(decision, "seoul_sales"), "RETRY_FRESH_RUNNER");
  assert.equal(verdictFor(decision, "store_dynamics"), "RETRY_FRESH_RUNNER");
  // Only the source that failed is collected again.
  const one = decideWeeklySeoulRetry(log(line({ source: "seoul_sales", status: "SUCCESS", changedRows: 0, providerRequests: 24 }), STORE_CONNECT_TIMEOUT));
  assert.deepEqual(one.sources, ["store_dynamics"]);
  assert.equal(verdictFor(one, "seoul_sales"), "ALREADY_HEALTHY");
});

test("auth, 403, quota, Seoul result codes and every other failure never earn a weekly Seoul retry", () => {
  const cases = {
    "no detail (the pre-fix sales line)": seoulFailure("seoul_sales", undefined),
    "HTTP 401": seoulFailure("seoul_sales", "failureClass=HTTP httpStatus=401 attempts=1 elapsedMs=310 retryExhausted=true"),
    "HTTP 403": seoulFailure("store_dynamics", "failureClass=HTTP httpStatus=403 attempts=1 elapsedMs=290 retryExhausted=true"),
    "HTTP 429": seoulFailure("seoul_sales", "failureClass=HTTP httpStatus=429 attempts=1 elapsedMs=280 retryExhausted=true"),
    "HTTP 503": seoulFailure("seoul_sales", "failureClass=HTTP httpStatus=503 attempts=1 elapsedMs=2000 retryExhausted=true"),
    "invalid key (INFO-100)": seoulFailure("seoul_sales", "failureClass=VALIDATION causeCode=SEOUL_RESULT_INFO_100 attempts=1 elapsedMs=0 retryExhausted=false"),
    "request limit (ERROR-337)": seoulFailure("store_dynamics", "failureClass=VALIDATION causeCode=SEOUL_RESULT_ERROR_337 attempts=1 elapsedMs=0 retryExhausted=false"),
    "rate formula drift (2026-09-03)": seoulFailure("store_dynamics", "failureClass=VALIDATION causeCode=STORE_DYNAMICS_RATE_FORMULA attempts=1 elapsedMs=0 retryExhausted=false", 6),
    "timeout after the connection opened": seoulFailure("seoul_sales", "failureClass=TIMEOUT attempts=1 elapsedMs=30000 retryExhausted=true"),
    "connect timeout mixed with an auth failure": seoulFailure("seoul_sales", "failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT attempts=1; failureClass=AUTH causeCode=SERVICE_KEY attempts=1"),
    "connect timeout after this runner was already answered": seoulFailure("seoul_sales", "failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT attempts=1 elapsedMs=10010 retryExhausted=true", 7),
    "connect timeout with no request count": line({ source: "store_dynamics", status: "ERROR", detail: "failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT attempts=1" }),
    "missing key": line({ source: "seoul_sales", status: "NEEDS_KEY", changedRows: 0, providerRequests: 0 }),
  };
  for (const [name, result] of Object.entries(cases)) {
    const decision = decideWeeklySeoulRetry(log(result));
    assert.deepEqual(decision.sources, [], name);
    const { source } = JSON.parse(result);
    if (RETRYABLE_WEEKLY_SEOUL_SOURCES.includes(source)) {
      assert.equal(verdictFor(decision, source), "FAILED_FOR_ANOTHER_REASON", `${name} is a failure, never "healthy"`);
    }
  }
  // PARTIAL kept what it got and is not a connect failure; no line is never a guess.
  const partial = decideWeeklySeoulRetry(log(line({ source: "seoul_sales", status: "PARTIAL", changedRows: 3, providerRequests: 25 })));
  assert.equal(verdictFor(partial, "seoul_sales"), "ALREADY_HEALTHY");
  assert.equal(verdictFor(partial, "store_dynamics"), "RESULT_UNKNOWN");
  assert.deepEqual(decideWeeklySeoulRetry("").sources, []);
});

test("the weekly Seoul decision names only its own two sources", () => {
  assert.deepEqual([...RETRYABLE_WEEKLY_SEOUL_SOURCES], ["seoul_sales", "store_dynamics"]);
  const decision = decideWeeklySeoulRetry(log(SEOUL_FAIL, T1_TIMEOUT, seoulFailure("seoul_sales; rm -rf /", "failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT")));
  assert.deepEqual(decision.sources, []);
  // A later success on the same log wins, as in decideCongestionRetry.
  assert.deepEqual(decideWeeklySeoulRetry(log(STORE_CONNECT_TIMEOUT, line({ source: "store_dynamics", status: "SUCCESS", changedRows: 0, providerRequests: 7 }))).sources, []);
});

// ── The workflow must actually use the decision ────────────────────────────

const realtime = await readFile(new URL("../.github/workflows/collect-realtime-cycle.yml", import.meta.url), "utf8");
const attempt = await readFile(new URL("../.github/workflows/collect-attempt.yml", import.meta.url), "utf8");

test("the collect job publishes the decision and the retry job is gated on it", () => {
  assert.match(realtime, /scripts\/decide-congestion-retry\.ts/,
    "the decision function must actually run in the workflow, not merely exist");
  assert.match(realtime, /retry_sources: \$\{\{ steps\.retry_decision\.outputs\.retry_sources \}\}/);
  assert.match(realtime, /needs\.collect\.outputs\.retry_sources != ''/,
    "without this the retry still starts on any failure at all");
  assert.match(realtime, /sources: \$\{\{ needs\.collect\.outputs\.retry_sources \}\}/,
    "the retry must collect the sources the decision named, not a fixed pair");
  assert.doesNotMatch(realtime, /sources: airport_congestion,airport_congestion_t2/,
    "the hardcoded pair is what re-requested a healthy terminal");
});

test("the retry is bounded to one provider request per source", () => {
  assert.match(realtime, /a4_max_attempts_per_request: "1"/);
  assert.match(attempt, /RPK_A4_MAX_ATTEMPTS_PER_REQUEST: \$\{\{ inputs\.a4_max_attempts_per_request \}\}/);
  assert.match(attempt, /a4_max_attempts_per_request:/);
});

test("the original attempt's failure is never hidden", () => {
  assert.match(realtime, /set -o pipefail/,
    "piping the collector through tee without pipefail would turn every failure green");
});

test("there is no retry of the retry", () => {
  // collect-attempt.yml must not chain another attempt after itself, and the
  // realtime workflow must declare exactly one retry job.
  assert.doesNotMatch(attempt, /uses: \.\/\.github\/workflows\/collect-attempt\.yml/);
  assert.equal((realtime.match(/uses: \.\/\.github\/workflows\/collect-attempt\.yml/g) ?? []).length, 1);
  assert.doesNotMatch(realtime, /attempt: 3/);
});

test("the shared attempt policy is unchanged for every other caller", async () => {
  const dir = new URL("../.github/workflows/", import.meta.url);
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(dir);
  const callers = [];
  for (const file of files) {
    if (file === "collect-realtime.yml" || file === "collect-realtime-cycle.yml" || file === "collect-attempt.yml") continue;
    const body = await readFile(new URL(file, dir), "utf8");
    if (body.includes("collect-attempt.yml")) callers.push([file, body]);
  }
  assert.ok(callers.length > 0, "A1, A5 and weather call this workflow; the test is pointless if none do");
  for (const [file, body] of callers) {
    assert.doesNotMatch(body, /a4_max_attempts_per_request/,
      `${file} must keep its own retry policy — this change is A4-only`);
  }
});

// ── collect-sales.yml must actually use the weekly Seoul decision ──────────

const sales = await readFile(new URL("../.github/workflows/collect-sales.yml", import.meta.url), "utf8");

test("the weekly Seoul collection publishes its decision and keeps its own failure visible", () => {
  assert.match(sales, /set -o pipefail\n\s+npm run collect:production 2>&1 \| tee "\$RUNNER_TEMP\/collector\.log"/);
  assert.match(sales, /scripts\/decide-congestion-retry\.ts "\$RUNNER_TEMP\/collector\.log" --weekly-seoul/);
  assert.match(sales, /retry_weekly_seoul: \$\{\{ steps\.retry_decision\.outputs\.retry_weekly_seoul \}\}/);
  assert.match(sales, /cron: "7 22 \* \* 6"/, "the weekly slot itself is unchanged");
  assert.match(sales, /group: production-collector-sales\n\s+cancel-in-progress: false/,
    "retries stay inside the run, so the weekly concurrency group still serializes them");
});

test("the weekly Seoul retry is at most two fresh runners, each gated on the previous attempt's own decision", () => {
  const uses = sales.match(/uses: \.\/\.github\/workflows\/collect-attempt\.yml/g) ?? [];
  assert.equal(uses.length, 2, "exactly two retries; there is no third");
  assert.doesNotMatch(sales, /attempt: 4/);
  const job = (name) => {
    const start = sales.indexOf(`\n  ${name}:\n`);
    assert.ok(start >= 0, `${name} job exists`);
    const next = sales.slice(start + 1).search(/\n  [a-z0-9_]+:\n/);
    return next < 0 ? sales.slice(start) : sales.slice(start, start + 1 + next);
  };
  for (const [name, previous, attemptNo] of [["retry_1", "collect", 2], ["retry_2", "retry_1", 3]]) {
    const body = job(name);
    assert.match(body, /github\.ref == 'refs\/heads\/main'/, `${name} never runs from a branch dispatch`);
    assert.match(body, /vars\.ENABLE_PRODUCTION_COLLECTOR == 'true'/, `${name} keeps the production gate`);
    assert.match(body, new RegExp(`needs\\.${previous}\\.result == 'failure'`), `${name} needs the previous attempt to have failed`);
    assert.match(body, new RegExp(`needs\\.${previous}\\.outputs\\.retry_weekly_seoul != ''`), `${name} needs the previous attempt's connect-timeout verdict`);
    assert.match(body, new RegExp(`sources: \\$\\{\\{ needs\\.${previous}\\.outputs\\.retry_weekly_seoul \\}\\}`), `${name} collects only what failed`);
    assert.match(body, new RegExp(`attempt: ${attemptNo}\\n`));
  }
  assert.match(job("retry_2"), /needs: \[collect, retry_1\]/);
});

test("collect-attempt spaces the weekly Seoul retries and scopes the Seoul key to them", () => {
  assert.match(attempt, /retry_weekly_seoul:\n\s+description: [^\n]+\n\s+value: \$\{\{ jobs\.collect\.outputs\.retry_weekly_seoul \}\}/);
  assert.match(attempt, /retry_weekly_seoul: \$\{\{ steps\.weekly_seoul_retry_decision\.outputs\.retry_weekly_seoul \}\}/);
  assert.match(attempt, /if: \$\{\{ inputs\.attempt > 1 && \(contains\(inputs\.sources, 'seoul_sales'\) \|\| contains\(inputs\.sources, 'store_dynamics'\)\) \}\}\n\s+run: sleep \$\{\{ inputs\.attempt == 2 && 60 \|\| 300 \}\}/);
  assert.match(attempt, /SEOUL_OPEN_DATA_KEY: \$\{\{ \(contains\(inputs\.sources, 'seoul_sales'\) \|\| contains\(inputs\.sources, 'store_dynamics'\)\) && secrets\.SEOUL_OPEN_DATA_KEY \|\| '' \}\}/,
    "every other caller of the shared attempt must keep receiving no Seoul key");
  assert.equal((attempt.match(/SEOUL_OPEN_DATA_KEY:/g) ?? []).length, 1, "the key is assigned only by that one scoped line");
});
