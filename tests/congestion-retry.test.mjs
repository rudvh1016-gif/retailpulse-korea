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

const { decideCongestionRetry, isFreshRunnerFailure, RETRYABLE_A4_SOURCES } =
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

// ── The workflow must actually use the decision ────────────────────────────

const realtime = await readFile(new URL("../.github/workflows/collect-realtime.yml", import.meta.url), "utf8");
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
    if (file === "collect-realtime.yml" || file === "collect-attempt.yml") continue;
    const body = await readFile(new URL(file, dir), "utf8");
    if (body.includes("collect-attempt.yml")) callers.push([file, body]);
  }
  assert.ok(callers.length > 0, "A1, A5 and weather call this workflow; the test is pointless if none do");
  for (const [file, body] of callers) {
    assert.doesNotMatch(body, /a4_max_attempts_per_request/,
      `${file} must keep its own retry policy — this change is A4-only`);
  }
});
