/**
 * Level 1 check: turns what was observed about ONE source into lifecycle
 * evidence, so the state machine decides the verdict instead of a heuristic.
 *
 * Each stage here maps to exactly one of the five states the project refuses to
 * conflate:
 *
 *   TRIGGERED/RUNNING  → 실행이 시작되었나        (run truth)
 *   COLLECTED          → 제공자가 답했나          (provider truth)
 *   VALIDATED          → 그 자료가 쓸 수 있나     (fresh + useful truth)
 *   PERSISTED          → D1에 실제로 남았나       (storage truth)
 *   PUBLISHED          → 사이트가 그것을 보여주나 (public surface truth)
 *
 * Every `UNPROVABLE` below is deliberate. A harness that cannot measure
 * publication must say UNKNOWN, because lib/operational-states.ts then refuses
 * HEALTHY — which is the whole point of having the distinction.
 */
import type { FailureState, StageEvidence } from "./operational-states";
import { walkLifecycle, severityOf, type LifecycleWalk, type OverallStatus } from "./operational-states";
import type { RuntimeEnablement } from "./scheduler-truth";

/** A collector_runs row, narrowed to the columns an audit may read. */
export interface RunRecord {
  status: string;
  startedAt: string;
  finishedAt: string | null;
  recordsRead: number;
  recordsWritten: number;
  detail: string | null;
}

/** A source_health row, narrowed the same way. */
export interface HealthRecord {
  status: string;
  lastRetrievedAt: string | null;
  consecutiveFailures: number;
}

/**
 * Everything a level-1 check knows about one source.
 *
 * `null` on a measurement means NOT MEASURED and is always distinct from `0`.
 * That distinction is load-bearing: "no rows stored" and "I could not count
 * rows" lead to opposite verdicts (PERSISTENCE_FAILED vs UNKNOWN), and treating
 * the second as the first is exactly what made earlier recovery windows
 * re-request a whole cycle after a swallowed D1 read error.
 */
export interface SourceObservation {
  sourceId: string;
  /** Human label for the logical job, e.g. `collect-forecast.yml`. */
  job: string;
  enablement: RuntimeEnablement;
  /** How often a run is expected. null when the cadence is not derivable. */
  expectedIntervalMs: number | null;
  /** Most recent run for this source, or null when none was found. */
  lastRun: RunRecord | null;
  health: HealthRecord | null;
  /**
   * Rows readable right now for the logical period this source serves.
   * null = not measured. 0 = measured and empty.
   */
  storedRows: number | null;
  /** True when the count above came back from a FAILED read rather than an empty one. */
  storageReadFailed: boolean;
  /** Whether the public surface actually carries this source. null = not measured. */
  published: { present: boolean; asOf: string | null } | null;
  /**
   * Statuses that mean "correctly did nothing" — an already-complete same-day
   * guard or an already-healthy recovery window. These are successes, and
   * counting them as failures is how a working idempotency guard starts looking
   * like an outage.
   */
  legitimateSkipStatuses?: readonly string[];
  /** True when zero records is the provider's correct answer (a genuinely empty day). */
  zeroIsLegitimate?: boolean;
  /**
   * Whether the run captured the whole expected extent.
   *
   * A paginated provider that returns page 1 and then fails leaves a COMPLETE-
   * looking run with a partial result: the records it did read are all valid, so
   * nothing downstream notices. Only the collector knows how many pages it
   * expected, so it reports this; `null` means it did not, which is UNPROVABLE.
   */
  coverage?: "COMPLETE" | "PARTIAL" | "UNKNOWN" | null;
  /**
   * Set when the stored rows are for a different date, area or terminal than the
   * run was asked for. Right-shaped data for the wrong scope passes every count
   * and every freshness check, so it needs its own signal.
   */
  scopeMismatch?: string | null;
}

export const DEFAULT_LEGITIMATE_SKIP_STATUSES = [
  "SKIPPED_ALREADY_HEALTHY",
  "SKIPPED_ALREADY_COMPLETE_TODAY",
  "SKIPPED_FRESH",
] as const;

const SUCCESS_STATUSES = new Set(["OK", "SUCCESS", "COMPLETE", "COMPLETED"]);

function isSkip(status: string, allowed: readonly string[]): boolean {
  return allowed.some((value) => status === value || status.startsWith(value));
}

/**
 * How late a run may be before the schedule counts as missed.
 *
 * One whole extra interval plus five minutes. The interval absorbs a single
 * skipped slot (GitHub's scheduled queue is explicitly best-effort and
 * routinely late by minutes), and the five minutes absorbs the runner startup
 * that makes `started_at` later than the cron minute.
 */
export function missedRunThresholdMs(expectedIntervalMs: number): number {
  return expectedIntervalMs * 2 + 5 * 60_000;
}

/**
 * Builds the evidence chain for one source.
 *
 * The ordering matters as much as the content: the first DISPROVEN stage is the
 * reported failure, so a source that never ran is MISSED_RUN rather than STALE,
 * and a source that ran but stored nothing is PERSISTENCE_FAILED rather than
 * PUBLICATION_MISMATCH. Reporting the downstream symptom instead of the
 * upstream cause is what sends a recovery run at the wrong layer.
 */
export function buildSourceEvidence(observation: SourceObservation, nowIso: string): StageEvidence[] {
  const now = Date.parse(nowIso);
  const skips = observation.legitimateSkipStatuses ?? DEFAULT_LEGITIMATE_SKIP_STATUSES;
  const evidence: StageEvidence[] = [];
  const run = observation.lastRun;
  const startedAt = run ? Date.parse(run.startedAt) : NaN;
  const ageMs = Number.isFinite(startedAt) ? now - startedAt : null;

  // ── TRIGGERED: did the scheduler actually fire a run in its window? ──
  if (observation.enablement === "RUNTIME_ENABLE_STATE_UNKNOWN") {
    evidence.push({
      stage: "TRIGGERED",
      proven: "UNPROVABLE",
      failure: "UNKNOWN",
      evidence: `${observation.job} schedule is gated by an Actions Variable this check cannot read`,
    });
    return evidence;
  }
  if (observation.enablement === "RUNTIME_DISABLED") {
    evidence.push({
      stage: "TRIGGERED",
      proven: "DISPROVEN",
      failure: "MISSED_RUN",
      evidence: `${observation.job} schedule is gated off at runtime`,
    });
    return evidence;
  }
  if (!run) {
    evidence.push({
      stage: "TRIGGERED",
      proven: observation.expectedIntervalMs === null ? "UNPROVABLE" : "DISPROVEN",
      failure: "MISSED_RUN",
      evidence: observation.expectedIntervalMs === null
        ? `no run recorded and no expected cadence for ${observation.sourceId}`
        : `no run recorded for ${observation.sourceId}`,
    });
    return evidence;
  }
  if (ageMs === null) {
    evidence.push({ stage: "TRIGGERED", proven: "UNPROVABLE", failure: "UNKNOWN", evidence: "run start timestamp unparseable" });
    return evidence;
  }
  if (observation.expectedIntervalMs !== null && ageMs > missedRunThresholdMs(observation.expectedIntervalMs)) {
    evidence.push({
      stage: "TRIGGERED",
      proven: "DISPROVEN",
      failure: "MISSED_RUN",
      evidence: `last run started ${Math.round(ageMs / 60_000)} min ago, cadence ${Math.round(observation.expectedIntervalMs / 60_000)} min`,
    });
    return evidence;
  }
  evidence.push({
    stage: "TRIGGERED",
    proven: "PROVEN",
    failure: "MISSED_RUN",
    evidence: `run started ${run.startedAt}`,
  });

  // ── RUNNING: a run that never finished is still running or was lost. ──
  evidence.push({
    stage: "RUNNING",
    proven: run.finishedAt ? "PROVEN" : "UNPROVABLE",
    failure: "EXECUTION_ERROR",
    evidence: run.finishedAt ? `run finished ${run.finishedAt}` : "run has no finish timestamp",
  });

  // ── COLLECTED: the provider answered. A legitimate skip counts. ──
  const skipped = isSkip(run.status, skips);
  const failedRun = !skipped && !SUCCESS_STATUSES.has(run.status);
  evidence.push({
    stage: "COLLECTED",
    proven: failedRun ? "DISPROVEN" : "PROVEN",
    failure: "EXECUTION_ERROR",
    evidence: `run status ${run.status}, read ${run.recordsRead}, wrote ${run.recordsWritten}`,
  });
  if (failedRun) return evidence;

  // ── VALIDATED: useful AND current. Two separate ways to fail. ──
  // HTTP 200 with an empty or error body reads as a successful run that read
  // nothing; that is INVALID_PAYLOAD, not a missed run, and it must not be
  // confused with a genuinely empty day.
  if (!skipped && run.recordsRead === 0 && !observation.zeroIsLegitimate) {
    evidence.push({
      stage: "VALIDATED",
      proven: "DISPROVEN",
      failure: "INVALID_PAYLOAD",
      evidence: "run reported success while reading zero records",
    });
    return evidence;
  }
  const retrievedAt = observation.health?.lastRetrievedAt ?? null;
  const retrievedMs = retrievedAt ? Date.parse(retrievedAt) : NaN;
  if (!Number.isFinite(retrievedMs)) {
    // Changed-only semantic writes freeze an unchanged row's retrieved_at, so
    // source_health.last_retrieved_at is the ONLY proof a collector is healthy.
    // Without it, freshness is unmeasured rather than fine.
    evidence.push({
      stage: "VALIDATED",
      proven: "UNPROVABLE",
      failure: "STALE",
      evidence: "source_health has no last_retrieved_at to date the data by",
    });
    return evidence;
  }
  if (observation.expectedIntervalMs !== null && now - retrievedMs > missedRunThresholdMs(observation.expectedIntervalMs)) {
    evidence.push({
      stage: "VALIDATED",
      proven: "DISPROVEN",
      failure: "STALE",
      evidence: `data last retrieved ${Math.round((now - retrievedMs) / 60_000)} min ago`,
    });
    return evidence;
  }
  if (observation.scopeMismatch) {
    evidence.push({
      stage: "VALIDATED",
      proven: "DISPROVEN",
      failure: "INVALID_PAYLOAD",
      evidence: `stored rows are for the wrong scope: ${observation.scopeMismatch}`,
    });
    return evidence;
  }
  if (observation.coverage === "PARTIAL") {
    evidence.push({
      stage: "VALIDATED",
      proven: "DISPROVEN",
      failure: "PARTIAL_DATA",
      evidence: "the run captured only part of its expected extent",
    });
    return evidence;
  }
  if (observation.coverage === "UNKNOWN") {
    evidence.push({
      stage: "VALIDATED",
      proven: "UNPROVABLE",
      failure: "PARTIAL_DATA",
      evidence: "the run did not report whether its extent was complete",
    });
    return evidence;
  }
  evidence.push({ stage: "VALIDATED", proven: "PROVEN", failure: "STALE", evidence: `data retrieved ${retrievedAt}` });

  // ── PERSISTED: rows are actually readable. ──
  if (observation.storageReadFailed) {
    evidence.push({
      stage: "PERSISTED",
      proven: "UNPROVABLE",
      failure: "PERSISTENCE_FAILED",
      evidence: "the storage count query failed, so emptiness is unverified",
    });
    return evidence;
  }
  if (observation.storedRows === null) {
    evidence.push({ stage: "PERSISTED", proven: "UNPROVABLE", failure: "PERSISTENCE_FAILED", evidence: "no storage count was measured" });
    return evidence;
  }
  if (observation.storedRows === 0 && !observation.zeroIsLegitimate) {
    // The 2026-09-07 shape exactly: the run succeeded, the provider answered,
    // and a trigger aborted the batch. Only a row count catches it.
    evidence.push({
      stage: "PERSISTED",
      proven: "DISPROVEN",
      failure: "PERSISTENCE_FAILED",
      evidence: "run succeeded but zero rows are readable for the current period",
    });
    return evidence;
  }
  evidence.push({ stage: "PERSISTED", proven: "PROVEN", failure: "PERSISTENCE_FAILED", evidence: `${observation.storedRows} rows readable` });

  // ── PUBLISHED: the public surface carries it. ──
  if (observation.published === null) {
    evidence.push({ stage: "PUBLISHED", proven: "UNPROVABLE", failure: "PUBLICATION_MISMATCH", evidence: "the public surface was not checked" });
    return evidence;
  }
  if (!observation.published.present) {
    evidence.push({
      stage: "PUBLISHED",
      proven: "DISPROVEN",
      failure: "PUBLICATION_MISMATCH",
      evidence: "rows are stored but the public surface does not carry them",
    });
    return evidence;
  }
  // A present-but-old public surface is its own failure. The edge cache in front
  // of /api/live/summary means the API can be fresh while what a visitor
  // receives is not, and "the endpoint returned data" does not settle which.
  const publishedMs = observation.published.asOf ? Date.parse(observation.published.asOf) : NaN;
  if (observation.published.asOf && !Number.isFinite(publishedMs)) {
    evidence.push({
      stage: "PUBLISHED",
      proven: "UNPROVABLE",
      failure: "PUBLICATION_MISMATCH",
      evidence: "the public surface timestamp could not be parsed",
    });
    return evidence;
  }
  if (
    Number.isFinite(publishedMs) &&
    observation.expectedIntervalMs !== null &&
    retrievedMs - publishedMs > missedRunThresholdMs(observation.expectedIntervalMs)
  ) {
    evidence.push({
      stage: "PUBLISHED",
      proven: "DISPROVEN",
      failure: "PUBLICATION_MISMATCH",
      evidence: `stored data is dated ${retrievedAt} but the public surface still shows ${observation.published.asOf}`,
    });
    return evidence;
  }
  evidence.push({
    stage: "PUBLISHED",
    proven: "PROVEN",
    failure: "PUBLICATION_MISMATCH",
    evidence: `public surface carries this source as of ${observation.published.asOf ?? "unknown"}`,
  });
  return evidence;
}

export interface SourceVerdict {
  sourceId: string;
  job: string;
  walk: LifecycleWalk;
  severity: OverallStatus;
  /** The failure class used for incident fingerprinting. */
  failureClass: FailureState | null;
}

export function evaluateSource(observation: SourceObservation, nowIso: string): SourceVerdict {
  const walk = walkLifecycle(buildSourceEvidence(observation, nowIso));
  return {
    sourceId: observation.sourceId,
    job: observation.job,
    walk,
    severity: severityOf(walk.state),
    failureClass: walk.state === "HEALTHY" ? null : (walk.state as FailureState),
  };
}
