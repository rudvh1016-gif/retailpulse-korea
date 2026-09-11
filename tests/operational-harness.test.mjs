/**
 * The harness's own test matrix.
 *
 * Every scenario here is one the project has either actually hit or explicitly
 * decided it must never miss. The control case at the end matters as much as the
 * failures: a harness that reports a problem for a healthy system gets muted.
 *
 * One test is deliberately a MUTATION test — it reconstructs the lifecycle walk
 * with its UNKNOWN guard removed and asserts the mutant reaches HEALTHY where the
 * real implementation does not. Without it, "UNKNOWN blocks HEALTHY" would be a
 * claim backed by a test that might pass for unrelated reasons.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  LIFECYCLE_STAGES,
  canAdvance,
  nextStage,
  rollUp,
  severityOf,
  walkLifecycle,
} from "../lib/operational-states.ts";
import { evaluateSource, missedRunThresholdMs } from "../lib/source-lifecycle.ts";
import {
  FORBIDDEN_AUTOMATIC_ACTIONS,
  RECOVERY_RULES,
  admitRecovery,
  decideRecovery,
  recoveryExecutionId,
  verifyRecovery,
} from "../lib/recovery-orchestration.ts";
import {
  applyIncidentEvents,
  incidentFingerprint,
  repeatIncidents,
  unresolvedIncidents,
} from "../lib/incident-ledger.ts";
import { buildWatchdogReport, evaluateHeartbeat, heartbeatSilenceThresholdMs } from "../lib/watchdog.ts";
import { checkComparability } from "../lib/comparability.ts";
import { observeQuota } from "../lib/quota-observation.ts";
import { evaluateForecastPipeline } from "../lib/forecast-pipeline-state.ts";
import { SELF_EXEMPT_PATHS, scanForRuntimeLlm, isScannableProductionPath } from "../lib/runtime-llm-scan.ts";
import { buildHealthReport, runtimeLlmVerdict, summarizeHealthReport } from "../lib/operational-health.ts";

const NOW = "2026-09-11T06:00:00.000Z";
const HOUR = 3_600_000;

/** A source that is healthy in every respect. Each test breaks exactly one thing. */
function healthyObservation(overrides = {}) {
  return {
    sourceId: "INCHEON_PASSENGER_FORECAST",
    job: "collect-forecast.yml",
    enablement: "RUNTIME_ENABLED",
    expectedIntervalMs: HOUR,
    lastRun: {
      status: "OK",
      startedAt: "2026-09-11T05:42:00.000Z",
      finishedAt: "2026-09-11T05:43:10.000Z",
      recordsRead: 96,
      recordsWritten: 12,
      detail: null,
    },
    health: { status: "OK", lastRetrievedAt: "2026-09-11T05:43:00.000Z", consecutiveFailures: 0 },
    storedRows: 96,
    storageReadFailed: false,
    published: { present: true, asOf: "2026-09-11T05:45:00.000Z" },
    coverage: "COMPLETE",
    scopeMismatch: null,
    ...overrides,
  };
}

// ── the state machine itself ──

test("the lifecycle can only advance one stage at a time and never skips to HEALTHY", () => {
  assert.equal(LIFECYCLE_STAGES[0], "EXPECTED");
  assert.equal(LIFECYCLE_STAGES[LIFECYCLE_STAGES.length - 1], "HEALTHY");
  assert.ok(canAdvance("EXPECTED", "TRIGGERED"));
  assert.ok(!canAdvance("EXPECTED", "HEALTHY"), "EXPECTED must not reach HEALTHY in one step");
  assert.ok(!canAdvance("PUBLISHED", "RUNNING"), "the walk is forward-only");
  assert.equal(nextStage("HEALTHY"), null);
});

test("a missing evidence entry stops the walk at UNKNOWN instead of passing", () => {
  const walk = walkLifecycle([
    { stage: "TRIGGERED", proven: "PROVEN", failure: "MISSED_RUN", evidence: "ran" },
    // RUNNING deliberately absent.
    { stage: "COLLECTED", proven: "PROVEN", failure: "EXECUTION_ERROR", evidence: "answered" },
  ]);
  assert.equal(walk.state, "UNKNOWN");
  assert.equal(walk.reached, "TRIGGERED");
  assert.equal(walk.blockedAt, "RUNNING");
  assert.equal(walk.unknown, true);
});

test("the first DISPROVEN stage decides the failure and later evidence cannot overwrite it", () => {
  const walk = walkLifecycle([
    { stage: "TRIGGERED", proven: "PROVEN", failure: "MISSED_RUN", evidence: "ran" },
    { stage: "RUNNING", proven: "PROVEN", failure: "EXECUTION_ERROR", evidence: "finished" },
    { stage: "COLLECTED", proven: "PROVEN", failure: "EXECUTION_ERROR", evidence: "answered" },
    { stage: "VALIDATED", proven: "PROVEN", failure: "STALE", evidence: "fresh" },
    { stage: "PERSISTED", proven: "DISPROVEN", failure: "PERSISTENCE_FAILED", evidence: "nothing stored" },
    { stage: "PUBLISHED", proven: "PROVEN", failure: "PUBLICATION_MISMATCH", evidence: "surface has old rows" },
  ]);
  assert.equal(walk.state, "PERSISTENCE_FAILED");
  assert.equal(walk.reached, "VALIDATED");
});

test("MUTATION: removing the UNKNOWN guard makes an unmeasured source look HEALTHY", () => {
  const evidence = [
    { stage: "TRIGGERED", proven: "PROVEN", failure: "MISSED_RUN", evidence: "ran" },
    { stage: "RUNNING", proven: "PROVEN", failure: "EXECUTION_ERROR", evidence: "finished" },
    { stage: "COLLECTED", proven: "PROVEN", failure: "EXECUTION_ERROR", evidence: "answered" },
    { stage: "VALIDATED", proven: "PROVEN", failure: "STALE", evidence: "fresh" },
    { stage: "PERSISTED", proven: "PROVEN", failure: "PERSISTENCE_FAILED", evidence: "96 rows" },
    // The publication check could not run. This is the real-world case.
    { stage: "PUBLISHED", proven: "UNPROVABLE", failure: "PUBLICATION_MISMATCH", evidence: "not checked" },
  ];

  // The real implementation refuses.
  assert.equal(walkLifecycle(evidence).state, "UNKNOWN");

  // A mutant that treats UNPROVABLE as success — the tempting simplification —
  // reaches HEALTHY on the identical evidence. That difference is the guard's
  // entire value, and this assertion fails if the guard is ever removed.
  const mutant = (items) => {
    let reached = "EXPECTED";
    for (;;) {
      const next = nextStage(reached);
      if (!next) return reached;
      const item = items.find((entry) => entry.stage === next);
      if (!item) return reached === "PUBLISHED" ? "HEALTHY" : reached;
      if (item.proven === "DISPROVEN") return item.failure;
      reached = next;
    }
  };
  assert.equal(mutant(evidence), "HEALTHY");
  assert.notEqual(walkLifecycle(evidence).state, mutant(evidence));
});

test("the rollup puts UNKNOWN above DEGRADED so one unmeasured signal blocks HEALTHY", () => {
  assert.equal(rollUp(["HEALTHY", "HEALTHY", "HEALTHY"]), "HEALTHY");
  assert.equal(rollUp(["HEALTHY", "DEGRADED"]), "DEGRADED");
  assert.equal(rollUp(["HEALTHY", "DEGRADED", "UNKNOWN"]), "UNKNOWN");
  assert.equal(rollUp(["UNKNOWN", "ERROR"]), "ERROR");
  assert.equal(rollUp([]), "UNKNOWN", "zero checks is not zero problems");
  assert.equal(severityOf("STALE"), "DEGRADED");
  assert.equal(severityOf("PERSISTENCE_FAILED"), "ERROR");
  assert.equal(severityOf("HEALTHY"), "HEALTHY");
});

// ── per-source failure modes ──

test("the all-healthy control case reaches HEALTHY, so the harness is not a false alarm", () => {
  const verdict = evaluateSource(healthyObservation(), NOW);
  assert.equal(verdict.walk.state, "HEALTHY");
  assert.equal(verdict.severity, "HEALTHY");
  assert.equal(verdict.failureClass, null);
});

test("a stale source reports STALE, not success, even when its coverage is complete", () => {
  const verdict = evaluateSource(
    healthyObservation({
      health: { status: "OK", lastRetrievedAt: "2026-09-11T00:43:00.000Z", consecutiveFailures: 0 },
    }),
    NOW,
  );
  assert.equal(verdict.walk.state, "STALE");
  assert.equal(verdict.walk.reached, "COLLECTED");
});

test("a missing run reports MISSED_RUN rather than a downstream symptom", () => {
  const verdict = evaluateSource(healthyObservation({ lastRun: null }), NOW);
  assert.equal(verdict.walk.state, "MISSED_RUN");
  assert.equal(verdict.walk.reached, "EXPECTED");
});

test("an overdue run reports MISSED_RUN against its derived cadence", () => {
  const verdict = evaluateSource(
    healthyObservation({
      lastRun: { ...healthyObservation().lastRun, startedAt: "2026-09-11T02:42:00.000Z", finishedAt: "2026-09-11T02:43:00.000Z" },
    }),
    NOW,
  );
  assert.equal(verdict.walk.state, "MISSED_RUN");
  assert.ok(missedRunThresholdMs(HOUR) < 3 * HOUR);
});

test("HTTP 200 with an error or empty body reports INVALID_PAYLOAD, not a missed run", () => {
  const verdict = evaluateSource(
    healthyObservation({ lastRun: { ...healthyObservation().lastRun, status: "OK", recordsRead: 0, recordsWritten: 0 } }),
    NOW,
  );
  assert.equal(verdict.walk.state, "INVALID_PAYLOAD");
  assert.equal(verdict.severity, "ERROR");
});

test("a legitimately empty day is HEALTHY and is never reported as an outage", () => {
  const verdict = evaluateSource(
    healthyObservation({
      lastRun: { ...healthyObservation().lastRun, recordsRead: 0, recordsWritten: 0 },
      storedRows: 0,
      zeroIsLegitimate: true,
    }),
    NOW,
  );
  assert.equal(verdict.walk.state, "HEALTHY");
});

test("a legitimate idempotency skip is a success, not a failure", () => {
  const verdict = evaluateSource(
    healthyObservation({
      lastRun: { ...healthyObservation().lastRun, status: "SKIPPED_ALREADY_COMPLETE_TODAY", recordsRead: 0, recordsWritten: 0 },
    }),
    NOW,
  );
  assert.equal(verdict.walk.state, "HEALTHY");
});

test("partial pagination reports PARTIAL_DATA and an unreported extent is UNKNOWN", () => {
  assert.equal(evaluateSource(healthyObservation({ coverage: "PARTIAL" }), NOW).walk.state, "PARTIAL_DATA");
  assert.equal(evaluateSource(healthyObservation({ coverage: "UNKNOWN" }), NOW).walk.state, "UNKNOWN");
});

test("right-shaped data for the wrong date, area or terminal reports INVALID_PAYLOAD", () => {
  const verdict = evaluateSource(healthyObservation({ scopeMismatch: "requested T2, stored T1" }), NOW);
  assert.equal(verdict.walk.state, "INVALID_PAYLOAD");
  assert.match(verdict.walk.trail[verdict.walk.trail.length - 1].evidence, /wrong scope/);
});

test("a successful run that stored nothing reports PERSISTENCE_FAILED", () => {
  // The 2026-09-07 shape: the provider answered and an archive trigger aborted
  // every batch. Only a row count catches this.
  const verdict = evaluateSource(healthyObservation({ storedRows: 0 }), NOW);
  assert.equal(verdict.walk.state, "PERSISTENCE_FAILED");
});

test("a failed storage read is UNKNOWN, never PERSISTENCE_FAILED", () => {
  const verdict = evaluateSource(healthyObservation({ storedRows: 0, storageReadFailed: true }), NOW);
  assert.equal(verdict.walk.state, "UNKNOWN");
  assert.match(verdict.walk.trail[verdict.walk.trail.length - 1].evidence, /unverified/);
});

test("stored rows the public surface does not carry report PUBLICATION_MISMATCH", () => {
  const verdict = evaluateSource(healthyObservation({ published: { present: false, asOf: null } }), NOW);
  assert.equal(verdict.walk.state, "PUBLICATION_MISMATCH");
});

test("a fresh API behind a stale public surface reports PUBLICATION_MISMATCH", () => {
  const verdict = evaluateSource(
    healthyObservation({ published: { present: true, asOf: "2026-09-10T20:00:00.000Z" } }),
    NOW,
  );
  assert.equal(verdict.walk.state, "PUBLICATION_MISMATCH");
});

test("an unchecked public surface is UNKNOWN and therefore not HEALTHY", () => {
  const verdict = evaluateSource(healthyObservation({ published: null }), NOW);
  assert.equal(verdict.walk.state, "UNKNOWN");
  assert.equal(verdict.severity, "UNKNOWN");
});

test("an unreadable Actions Variable gate yields UNKNOWN rather than a guess", () => {
  const verdict = evaluateSource(healthyObservation({ enablement: "RUNTIME_ENABLE_STATE_UNKNOWN" }), NOW);
  assert.equal(verdict.walk.state, "UNKNOWN");
  assert.equal(verdict.walk.reached, "EXPECTED");
});

test("an explicitly disabled schedule reports MISSED_RUN with its reason", () => {
  const verdict = evaluateSource(healthyObservation({ enablement: "RUNTIME_DISABLED" }), NOW);
  assert.equal(verdict.walk.state, "MISSED_RUN");
  assert.match(verdict.walk.trail[1].evidence, /gated off/);
});

test("evidence never carries a URL, a token or a service key", () => {
  const verdict = evaluateSource(
    healthyObservation({
      lastRun: {
        ...healthyObservation().lastRun,
        status: "ERROR",
        detail: "https://apis.data.go.kr/x?serviceKey=SECRET Bearer abc123",
      },
    }),
    NOW,
  );
  const joined = verdict.walk.trail.map((step) => step.evidence).join(" ");
  assert.doesNotMatch(joined, /serviceKey|Bearer|https?:\/\//);
});

// ── recovery ──

test("only pre-approved failure classes are repaired automatically", () => {
  assert.equal(decideRecovery("MISSED_RUN", 0).approved, true);
  assert.equal(decideRecovery("STALE", 0).action, "REQUEST_ONLY_MISSING_COVERAGE");
  for (const forbidden of ["INVALID_PAYLOAD", "PERSISTENCE_FAILED", "PUBLICATION_MISMATCH", "HUMAN_REVIEW_REQUIRED"]) {
    const decision = decideRecovery(forbidden, 0);
    assert.equal(decision.approved, false, `${forbidden} must not auto-recover`);
    assert.equal(decision.stage, "HUMAN_REVIEW_REQUIRED");
  }
});

test("no recovery rule authorises any forbidden action", () => {
  const authorised = new Set(RECOVERY_RULES.map((rule) => rule.action));
  for (const forbidden of FORBIDDEN_AUTOMATIC_ACTIONS) {
    assert.ok(!authorised.has(forbidden), `${forbidden} must never be an authorised recovery action`);
  }
  assert.ok(RECOVERY_RULES.every((rule) => rule.maxAttempts > 0 && rule.maxAttempts <= 3));
});

test("an exhausted attempt budget escalates to a person instead of going quiet", () => {
  const decision = decideRecovery("MISSED_RUN", 3);
  assert.equal(decision.approved, false);
  assert.equal(decision.stage, "HUMAN_REVIEW_REQUIRED");
  assert.match(decision.reason, /budget exhausted/);
});

test("the execution id is stable across attempts and distinct across slots", () => {
  const parts = { sourceId: "KMA_VILAGE_FCST", targetDate: "2026-09-11", scheduledSlot: "0200", operation: "recover" };
  assert.equal(recoveryExecutionId(parts), recoveryExecutionId({ ...parts }));
  assert.notEqual(recoveryExecutionId(parts), recoveryExecutionId({ ...parts, scheduledSlot: "0500" }));
});

test("a duplicate recovery is refused, and a timeout alone does not release the lock", () => {
  const executionId = recoveryExecutionId({ sourceId: "A5", targetDate: "2026-09-11", scheduledSlot: "0042", operation: "recover" });
  const lock = { executionId, stage: "RECOVERY_STARTED", startedAt: "2026-09-11T00:42:00.000Z", updatedAt: "2026-09-11T00:42:00.000Z" };

  assert.equal(admitRecovery(executionId, null, { staleAfterMs: HOUR, nowIso: NOW }).admitted, true);
  assert.equal(admitRecovery(executionId, lock, { staleAfterMs: 24 * HOUR, nowIso: NOW }).admitted, false);

  // Five hours have passed and the lock is well past `staleAfterMs`. It is still
  // not released: elapsed time is not evidence the earlier attempt stopped.
  const stale = admitRecovery(executionId, lock, { staleAfterMs: HOUR, nowIso: NOW });
  assert.equal(stale.admitted, false);
  assert.equal(stale.state, "IN_PROGRESS");
  assert.match(stale.reason, /escalate rather than start a second one/);
});

test("a recovery is RECOVERED only after data, storage and surface are each re-verified", () => {
  assert.equal(verifyRecovery({ dataValid: true, storageValid: true, publicValid: true }).stage, "RECOVERED");
  assert.equal(verifyRecovery({ dataValid: true, storageValid: true, publicValid: true }).verified, true);

  // Each unmeasured layer leaves it PENDING, never RECOVERED.
  for (const pending of [
    { dataValid: null, storageValid: true, publicValid: true },
    { dataValid: true, storageValid: null, publicValid: true },
    { dataValid: true, storageValid: true, publicValid: null },
  ]) {
    const outcome = verifyRecovery(pending);
    assert.equal(outcome.stage, "RECOVERY_PENDING");
    assert.equal(outcome.verified, false);
  }

  // Each disproven layer is an outright failure.
  assert.equal(verifyRecovery({ dataValid: false, storageValid: true, publicValid: true }).stage, "RECOVERY_FAILED");
  assert.equal(verifyRecovery({ dataValid: true, storageValid: false, publicValid: true }).stage, "RECOVERY_FAILED");
  assert.equal(verifyRecovery({ dataValid: true, storageValid: true, publicValid: false }).stage, "RECOVERY_FAILED");
});

// ── incident ledger ──

test("the same failure increments one incident instead of creating new rows", () => {
  const parts = { sourceId: "KMA_VILAGE_FCST", failureClass: "STALE", contractVersion: "v1", logicalJob: "collect-weather.yml" };
  const events = [1, 2, 3, 4].map((index) => ({
    kind: "FAILURE",
    at: `2026-09-1${index}T00:00:00.000Z`,
    parts,
    runId: `run-${index}`,
    evidence: `stale at attempt ${index}`,
    lastGoodAt: "2026-09-10T00:00:00.000Z",
  }));
  const ledger = applyIncidentEvents([], events);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].occurrenceCount, 4);
  assert.equal(ledger[0].affectedRuns.length, 4);
  assert.equal(ledger[0].severity, "HIGH");
  assert.equal(repeatIncidents(ledger).length, 1);
  assert.equal(ledger[0].fingerprint, incidentFingerprint(parts));
});

test("a different contract version is a different incident", () => {
  const base = { sourceId: "A", failureClass: "STALE", logicalJob: "job.yml" };
  const ledger = applyIncidentEvents([], [
    { kind: "FAILURE", at: NOW, parts: { ...base, contractVersion: "v1" }, runId: "r1", evidence: "a", lastGoodAt: null },
    { kind: "FAILURE", at: NOW, parts: { ...base, contractVersion: "v2" }, runId: "r2", evidence: "b", lastGoodAt: null },
  ]);
  assert.equal(ledger.length, 2);
});

test("an unverified recovery leaves the incident DEGRADED, never RESOLVED", () => {
  const parts = { sourceId: "A5", failureClass: "MISSED_RUN", contractVersion: "v1", logicalJob: "collect-forecast.yml" };
  const fingerprint = incidentFingerprint(parts);
  const ledger = applyIncidentEvents([], [
    { kind: "FAILURE", at: NOW, parts, runId: "r1", evidence: "missed", lastGoodAt: null },
    { kind: "RECOVERY_STARTED", at: NOW, fingerprint },
    { kind: "RECOVERY_RESULT", at: NOW, fingerprint, result: "recovery exited zero", verified: false },
  ]);
  assert.equal(ledger[0].currentState, "DEGRADED");
  assert.equal(ledger[0].resolvedAt, null);
  assert.equal(ledger[0].recoveryAttempts, 1);
  assert.equal(unresolvedIncidents(ledger).length, 1);
});

test("a verified recovery resolves the incident, and a recurrence reopens the same row", () => {
  const parts = { sourceId: "A5", failureClass: "MISSED_RUN", contractVersion: "v1", logicalJob: "collect-forecast.yml" };
  const fingerprint = incidentFingerprint(parts);
  const resolved = applyIncidentEvents([], [
    { kind: "FAILURE", at: "2026-09-10T00:00:00.000Z", parts, runId: "r1", evidence: "missed", lastGoodAt: null },
    { kind: "RECOVERY_RESULT", at: "2026-09-10T01:00:00.000Z", fingerprint, result: "re-verified", verified: true },
  ]);
  assert.equal(resolved[0].currentState, "RESOLVED");
  assert.equal(unresolvedIncidents(resolved).length, 0);

  const reopened = applyIncidentEvents(resolved, [
    { kind: "FAILURE", at: NOW, parts, runId: "r2", evidence: "missed again", lastGoodAt: null },
  ]);
  assert.equal(reopened.length, 1, "a recurrence must not create a second row");
  assert.equal(reopened[0].occurrenceCount, 2, "the lifetime count must survive resolution");
  assert.equal(reopened[0].currentState, "OPEN");
  assert.equal(reopened[0].resolvedAt, null);
});

// ── watchdog ──

test("a heartbeat that was never seen is UNKNOWN, and a silent one is ERROR", () => {
  const never = evaluateHeartbeat(
    { name: "collect-weather.yml", lastSeenAt: null, expectedIntervalMs: 3 * HOUR, observedByIndependentPlatform: true },
    NOW,
  );
  assert.equal(never.state, "NEVER_SEEN");
  assert.equal(never.severity, "UNKNOWN");

  const silent = evaluateHeartbeat(
    { name: "collect-weather.yml", lastSeenAt: "2026-09-09T00:00:00.000Z", expectedIntervalMs: 3 * HOUR, observedByIndependentPlatform: true },
    NOW,
  );
  assert.equal(silent.state, "SILENT");
  assert.equal(silent.severity, "ERROR");
  assert.ok(heartbeatSilenceThresholdMs(3 * HOUR) > 3 * HOUR);
});

test("a heartbeat with no derivable cadence is UNKNOWN rather than assumed alive", () => {
  const verdict = evaluateHeartbeat(
    { name: "unknown.yml", lastSeenAt: "2026-09-11T05:00:00.000Z", expectedIntervalMs: null, observedByIndependentPlatform: true },
    NOW,
  );
  assert.equal(verdict.state, "UNKNOWN");
});

test("the watchdog always reports its own coverage gap and is never HEALTHY", () => {
  const report = buildWatchdogReport(
    [{ name: "collect-realtime.yml", lastSeenAt: "2026-09-11T05:52:00.000Z", expectedIntervalMs: 15 * 60_000, observedByIndependentPlatform: true }],
    NOW,
  );
  assert.equal(report.beats[0].state, "ALIVE");
  assert.notEqual(report.severity, "HEALTHY", "self-observation can never prove total coverage");
  assert.ok(report.unobservableScope.length >= 3);
  assert.ok(report.unobservableScope.some((scope) => /GitHub Actions itself/.test(scope)));
});

test("a self-observed-only job is listed as a watchdog coverage gap", () => {
  const report = buildWatchdogReport(
    [{ name: "collect-production.yml", lastSeenAt: "2026-09-11T05:00:00.000Z", expectedIntervalMs: 24 * HOUR, observedByIndependentPlatform: false }],
    NOW,
  );
  assert.deepEqual(report.coverageGaps, ["collect-production.yml"]);
});

// ── comparability ──

test("the comparability guard refuses the six named false equivalences", () => {
  const base = {
    populationUniverse: "x",
    period: "2026-09-11",
    timeWindow: "full_day",
    area: "ICN",
    terminalScope: "T1",
    unit: "people",
    metricDefinition: "x",
  };
  const pairs = [
    ["flight_origin_country", "passenger_nationality"],
    ["station_alighting_count", "unique_visitors"],
    ["foreign_presence", "foreign_sales"],
    ["airport_passengers", "store_traffic"],
    ["domestic_card_spend", "foreign_card_spend"],
    ["event_date_range", "open_now"],
  ];
  for (const [left, right] of pairs) {
    const result = checkComparability({ ...base, metricDefinition: left }, { ...base, metricDefinition: right });
    assert.equal(result.verdict, "NOT_COMPARABLE", `${left} vs ${right} must be refused`);
    assert.ok(result.forbiddenBy, "the refusal must name its rule");
  }
});

test("a named rule cannot be bypassed by relabelling the facets to match", () => {
  const facets = {
    populationUniverse: "foreign_presence",
    period: "2026-Q2",
    timeWindow: "full_day",
    area: "myeongdong",
    terminalScope: "NOT_APPLICABLE",
    unit: "people",
    metricDefinition: "identical",
  };
  const result = checkComparability(facets, { ...facets, populationUniverse: "foreign_sales" });
  assert.equal(result.verdict, "NOT_COMPARABLE");
  assert.equal(result.forbiddenBy, "PRESENCE_IS_NOT_SALES");
});

test("a single differing facet is enough to refuse, and a full match is comparable", () => {
  const facets = {
    populationUniverse: "short_stay_foreign",
    period: "2026-09-11",
    timeWindow: "14:00-15:00",
    area: "myeongdong",
    terminalScope: "NOT_APPLICABLE",
    unit: "people",
    metricDefinition: "living_population",
  };
  assert.equal(checkComparability(facets, facets).verdict, "COMPARABLE");
  const mismatch = checkComparability(facets, { ...facets, terminalScope: "T1", unit: "KRW" });
  assert.equal(mismatch.verdict, "NOT_COMPARABLE");
  assert.deepEqual(mismatch.mismatches, ["terminalScope", "unit"]);
});

// ── quota ──

test("an unmeasurable quota is UNKNOWN and OBSERVE_ONLY, never 0%", () => {
  const verdict = observeQuota({ resource: "cloudflare_d1_rows_read", used: null, limit: 5_000_000, basis: "UNKNOWN", measurementSource: null });
  assert.equal(verdict.level, "UNKNOWN");
  assert.equal(verdict.percent, null, "UNKNOWN must not be rendered as a number");
  assert.equal(verdict.observeOnly, true);
  assert.match(verdict.detail, /OBSERVE_ONLY/);
});

test("a measured quota reuses the existing guardrail thresholds verbatim", () => {
  const source = "cloudflare API usage endpoint";
  assert.equal(observeQuota({ resource: "r", used: 69, limit: 100, basis: "OFFICIAL_USAGE", measurementSource: source }).level, "NORMAL");
  assert.equal(observeQuota({ resource: "r", used: 70, limit: 100, basis: "OFFICIAL_USAGE", measurementSource: source }).level, "NOTICE");
  assert.equal(observeQuota({ resource: "r", used: 85, limit: 100, basis: "OFFICIAL_USAGE", measurementSource: source }).level, "PROTECT");
  assert.equal(observeQuota({ resource: "r", used: 95, limit: 100, basis: "OFFICIAL_USAGE", measurementSource: source }).level, "EMERGENCY");
  const estimated = observeQuota({ resource: "r", used: 50, limit: 100, basis: "INTERNAL_ESTIMATE", measurementSource: source });
  assert.equal(estimated.basis, "INTERNAL_ESTIMATE", "an estimate must never be reported as official usage");
});

test("a figure with unknown provenance may not gate anything", () => {
  const verdict = observeQuota({ resource: "r", used: 10, limit: 100, basis: "UNKNOWN", measurementSource: "a guess" });
  assert.equal(verdict.level, "UNKNOWN");
  assert.equal(verdict.observeOnly, true);
});

// ── forecast / outcome ──

function forecastObservation(overrides = {}) {
  return {
    targetDate: "2026-09-10",
    predictionCreated: true,
    inputsPresent: true,
    inputsFrozen: true,
    outcomeWindowClosed: true,
    outcomeRecorded: true,
    outcomeMatched: true,
    backfillOnly: false,
    matchedHours: 48,
    minimumSample: 24,
    modelMeanAbsoluteError: 800,
    baselineMeanAbsoluteError: 1_200,
    ...overrides,
  };
}

test("the earliest broken link in the forecast pipeline is the one reported", () => {
  assert.equal(evaluateForecastPipeline(forecastObservation({ predictionCreated: false })).state, "PREDICTION_NOT_CREATED");
  assert.equal(evaluateForecastPipeline(forecastObservation({ inputsPresent: false })).state, "INPUT_MISSING");
  assert.equal(evaluateForecastPipeline(forecastObservation({ inputsFrozen: false })).state, "INPUT_NOT_FROZEN");
  assert.equal(evaluateForecastPipeline(forecastObservation({ outcomeWindowClosed: false })).state, "OUTCOME_NOT_AVAILABLE_YET");
  assert.equal(evaluateForecastPipeline(forecastObservation({ outcomeRecorded: false })).state, "OUTCOME_MISSING");
  assert.equal(evaluateForecastPipeline(forecastObservation({ outcomeMatched: false })).state, "OUTCOME_MATCH_FAILED");
  assert.equal(evaluateForecastPipeline(forecastObservation({ backfillOnly: true })).state, "BACKFILL_ONLY");
  assert.equal(evaluateForecastPipeline(forecastObservation({ matchedHours: 3 })).state, "INSUFFICIENT_SAMPLE");
  assert.equal(evaluateForecastPipeline(forecastObservation({ predictionCreated: null })).state, "UNKNOWN");
});

test("no performance claim is allowed while the model matches the same-weekday baseline", () => {
  const tied = evaluateForecastPipeline(forecastObservation({ modelMeanAbsoluteError: 1_200, baselineMeanAbsoluteError: 1_200 }));
  assert.equal(tied.state, "BASELINE_NOT_INDEPENDENT");
  assert.equal(tied.performanceClaimAllowed, false);

  const withinTolerance = evaluateForecastPipeline(forecastObservation({ modelMeanAbsoluteError: 1_210, baselineMeanAbsoluteError: 1_200 }));
  assert.equal(withinTolerance.state, "BASELINE_NOT_INDEPENDENT");

  const noBaseline = evaluateForecastPipeline(forecastObservation({ baselineMeanAbsoluteError: null }));
  assert.equal(noBaseline.state, "FORECAST_EVIDENCE_NOT_DISCRIMINATING");

  const healthy = evaluateForecastPipeline(forecastObservation());
  assert.equal(healthy.state, "PIPELINE_HEALTHY");
  assert.equal(healthy.performanceClaimAllowed, true);
});

// ── runtime LLM ──

test("the runtime-LLM scan catches dependencies, endpoints and Workers AI bindings", () => {
  const offending = scanForRuntimeLlm(
    [
      { path: "lib/summarize.ts", content: 'await fetch("https://api.openai.com/v1/chat/completions")' },
      { path: "worker/ai.ts", content: "const answer = await env.AI.run('@cf/meta/llama-3-8b-instruct', input)" },
    ],
    ["openai", "drizzle-orm"],
  );
  assert.deepEqual(offending.offendingDependencies, ["openai"]);
  assert.equal(offending.offendingFiles.length, 2);
  assert.equal(runtimeLlmVerdict(offending), "RUNTIME_LLM_CALLS != 0");
});

test("an empty result from a scan that read nothing is UNKNOWN, not VERIFIED", () => {
  assert.equal(runtimeLlmVerdict({ offendingDependencies: [], offendingFiles: [], scannedFileCount: 0 }), "RUNTIME_LLM_CALLS = UNKNOWN");
  assert.equal(runtimeLlmVerdict({ offendingDependencies: [], offendingFiles: [], scannedFileCount: 400 }), "RUNTIME_LLM_CALLS = 0 VERIFIED");
});

test("the scan ignores build output and the suites that assert these strings are absent", () => {
  assert.equal(isScannableProductionPath("lib/collector.ts"), true);
  assert.equal(isScannableProductionPath("dist/server/index.js"), false);
  assert.equal(isScannableProductionPath("node_modules/openai/index.js"), false);
  assert.equal(isScannableProductionPath("tests/rendered-html.test.mjs"), false);
  assert.equal(isScannableProductionPath("e2e/typography.spec.ts"), false);
  // Otherwise a test forbidding `api.openai.com` would itself be a finding, and
  // the two checks could not both exist.
  assert.equal(scanForRuntimeLlm([{ path: "tests/x.test.mjs", content: "api.openai.com" }], []).findings.length, 0);
});

test("the scanner exempts exactly its own pattern table, and says so in the result", () => {
  // The exemption is unavoidable: RUNTIME_LLM_PATTERNS contains every string it
  // forbids. The protection is that it is exactly one file and it is reported.
  assert.deepEqual([...SELF_EXEMPT_PATHS], ["lib/runtime-llm-scan.ts"],
    "a second exemption would be a blind spot, not a necessity");

  const result = scanForRuntimeLlm(
    [
      { path: "lib/runtime-llm-scan.ts", content: "pattern: /api.openai.com/i" },
      { path: "lib/collector.ts", content: "const rows = await fetchOfficial(url);" },
    ],
    [],
  );
  assert.deepEqual(result.exemptedPaths, ["lib/runtime-llm-scan.ts"]);
  assert.deepEqual(result.offendingFiles, []);
  assert.equal(result.scannedFileCount, 1, "the exempted file must not be counted as scanned");
});

test("a real offender is still reported when the exemption is in play", () => {
  const result = scanForRuntimeLlm(
    [
      { path: "lib/runtime-llm-scan.ts", content: "pattern: /api.openai.com/i" },
      { path: "lib/summarize.ts", content: 'fetch("https://api.anthropic.com/v1/messages")' },
    ],
    [],
  );
  assert.deepEqual(result.offendingFiles, ["lib/summarize.ts"]);
  assert.equal(runtimeLlmVerdict(result), "RUNTIME_LLM_CALLS != 0");
});

// ── the central report ──

function reportInputs(overrides = {}) {
  return {
    nowIso: NOW,
    scheduler: {
      entries: [{ workflow: "collect-forecast.yml", driver: "WORKER_CRON", cron: "42 * * * *", enablement: "RUNTIME_ENABLED", notes: [] }],
      duplicateSchedulers: [],
      unroutedWorkerCrons: [],
      missingRoutedWorkflows: [],
      undispatchableRoutes: [],
      manualOnly: [],
    },
    docDrift: [],
    sources: [evaluateSource(healthyObservation(), NOW)],
    incidents: [],
    watchdog: buildWatchdogReport([], NOW),
    quota: [observeQuota({ resource: "r", used: 10, limit: 100, basis: "OFFICIAL_USAGE", measurementSource: "api" })],
    forecast: [evaluateForecastPipeline(forecastObservation())],
    runtimeLlm: { offendingDependencies: [], offendingFiles: [], scannedFileCount: 300, exemptedPaths: ["lib/runtime-llm-scan.ts"] },
    unwiredDefences: [],
    ...overrides,
  };
}

test("the watchdog's permanent coverage gap keeps the overall verdict off HEALTHY", () => {
  const report = buildHealthReport(reportInputs());
  assert.equal(report.areas.sources, "HEALTHY");
  assert.equal(report.areas.runtimeLlm, "HEALTHY");
  assert.equal(report.overall, "UNKNOWN", "nothing can observe the platforms themselves, so HEALTHY is unreachable");
  assert.equal(report.areas.watchdog, "UNKNOWN");
});

test("a duplicate live scheduler makes the whole report an ERROR", () => {
  const report = buildHealthReport(
    reportInputs({
      scheduler: { ...reportInputs().scheduler, duplicateSchedulers: ["collect-forecast.yml"] },
    }),
  );
  assert.equal(report.areas.scheduler, "ERROR");
  assert.equal(report.overall, "ERROR");
});

test("zero sources checked is UNKNOWN, not HEALTHY", () => {
  const report = buildHealthReport(reportInputs({ sources: [] }));
  assert.equal(report.areas.sources, "UNKNOWN");
});

test("a runtime model call makes the report an ERROR and names its verdict", () => {
  const report = buildHealthReport(
    reportInputs({ runtimeLlm: { offendingDependencies: ["openai"], offendingFiles: ["lib/x.ts"], scannedFileCount: 300 } }),
  );
  assert.equal(report.runtimeLlm.verdict, "RUNTIME_LLM_CALLS != 0");
  assert.equal(report.overall, "ERROR");
});

test("improvement candidates are deterministic and never authorise a code change", () => {
  const incidents = applyIncidentEvents([], [
    {
      kind: "FAILURE",
      at: NOW,
      parts: { sourceId: "A5", failureClass: "PERSISTENCE_FAILED", contractVersion: "v1", logicalJob: "collect-forecast.yml" },
      runId: "r1",
      evidence: "nothing stored",
      lastGoodAt: null,
    },
  ]);
  const inputs = reportInputs({
    incidents,
    docDrift: [{ file: "CLAUDE.md", claim: "Worker Cron has been removed", present: true, contradicted: true }],
    unwiredDefences: [{ module: "lib/quota-guard.ts", detail: "no production caller" }],
  });
  const first = buildHealthReport(inputs).improvements;
  const second = buildHealthReport(inputs).improvements;
  assert.deepEqual(first, second, "the same evidence must always produce the same ranking");
  assert.equal(first[0].priority, "P0");
  assert.ok(first.some((candidate) => candidate.priority === "P3" && /CLAUDE\.md/.test(candidate.title)));
  assert.ok(first.every((candidate) => candidate.automaticCodeChangeAllowed === false));
});

test("the human summary states the verdict, the gaps and the LLM conclusion", () => {
  const summary = summarizeHealthReport(buildHealthReport(reportInputs()));
  assert.match(summary, /^KORETAIL operational health: UNKNOWN/);
  assert.match(summary, /WATCHDOG_COVERAGE_GAP/);
  assert.match(summary, /RUNTIME_LLM_CALLS = 0 VERIFIED/);
  assert.match(summary, /declared exemption \(holds the pattern table itself\): lib\/runtime-llm-scan\.ts/);
  assert.match(summary, /SCHEDULER/);
  assert.doesNotMatch(summary, /undefined|NaN/);
});
