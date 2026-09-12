/**
 * The operational lifecycle every scheduled collection must walk.
 *
 * Why a state machine instead of a boolean
 * ────────────────────────────────────────
 * Every operational mistake this repository has actually made came from
 * collapsing distinct states into one "ok":
 *
 *  - 2026-09-01: `/api/health` answered 200 while D1 was over quota. The site
 *    served pages with no data and the smoke called it healthy. HTTP 200 was
 *    read as "good data".
 *  - 2026-09-07: the A5 forecast archive trigger aborted every batch, so the
 *    collector RAN, the provider ANSWERED, and nothing was stored. "Execution
 *    succeeded" was read as "data stored".
 *  - Earlier: a COMPLETE forecast collected at 08:42 was served at 14:33.
 *    "Coverage complete" was read as "current".
 *
 * So these are deliberately five different states, and a check may only claim
 * the later one when it has evidence for it:
 *
 *   실행 성공 ≠ 자료 정상 ≠ 저장 성공 ≠ 사이트 반영 성공 ≠ 복구 성공
 *
 * The machine below is the enforcement. `HEALTHY` is the LAST stage, reachable
 * only by passing through every earlier one, and an UNKNOWN anywhere on the
 * path stops the walk instead of being skipped over.
 */

/** Ordered lifecycle. Index order IS the progression rule; do not reorder. */
export const LIFECYCLE_STAGES = [
  "EXPECTED",
  "TRIGGERED",
  "RUNNING",
  "COLLECTED",
  "VALIDATED",
  "PERSISTED",
  "PUBLISHED",
  "HEALTHY",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/**
 * Terminal-ish failure states. These are NOT stages: a job in one of them has
 * left the happy path, and the stage it reached before failing is reported
 * separately so "where did it stop" stays answerable.
 */
export const FAILURE_STATES = [
  "MISSED_RUN",
  "EXECUTION_ERROR",
  "INVALID_PAYLOAD",
  "PARTIAL_DATA",
  "STALE",
  "PERSISTENCE_FAILED",
  "PUBLICATION_MISMATCH",
  "RECOVERY_PENDING",
  "RECOVERY_RUNNING",
  "RECOVERY_FAILED",
  "DEGRADED",
  "HUMAN_REVIEW_REQUIRED",
  "UNKNOWN",
] as const;

export type FailureState = (typeof FAILURE_STATES)[number];
export type OperationalState = LifecycleStage | FailureState;

/** Overall rollup vocabulary for the single entry point. */
export type OverallStatus = "HEALTHY" | "DEGRADED" | "ERROR" | "UNKNOWN";

const STAGE_INDEX = new Map<LifecycleStage, number>(
  LIFECYCLE_STAGES.map((stage, index) => [stage, index]),
);

export function isLifecycleStage(value: string): value is LifecycleStage {
  return STAGE_INDEX.has(value as LifecycleStage);
}

export function isFailureState(value: string): value is FailureState {
  return (FAILURE_STATES as readonly string[]).includes(value);
}

export function stageIndex(stage: LifecycleStage): number {
  const index = STAGE_INDEX.get(stage);
  if (index === undefined) throw new Error(`unknown_lifecycle_stage_${stage}`);
  return index;
}

/**
 * Whether a transition is legal.
 *
 * Exactly one step forward, and only forward. This is the rule that makes
 * "HEALTHY" impossible to assert from, say, TRIGGERED: a check that has proof
 * the workflow started but no proof anything was stored cannot reach the end
 * of the chain no matter how it is written.
 */
export function canAdvance(from: LifecycleStage, to: LifecycleStage): boolean {
  return stageIndex(to) === stageIndex(from) + 1;
}

/** The stage after `from`, or null when `from` is already the last one. */
export function nextStage(from: LifecycleStage): LifecycleStage | null {
  return LIFECYCLE_STAGES[stageIndex(from) + 1] ?? null;
}

/**
 * One piece of evidence for one stage transition.
 *
 * `proven` is deliberately a three-valued answer, not a boolean. "I could not
 * measure this" and "I measured this and it was false" are different facts and
 * must not share a representation — conflating them is how UNKNOWN silently
 * became 0 in past quota reporting.
 */
export type Proof = "PROVEN" | "DISPROVEN" | "UNPROVABLE";

export interface StageEvidence {
  /** The stage this evidence would unlock. `EXPECTED` needs no evidence. */
  stage: Exclude<LifecycleStage, "EXPECTED">;
  proven: Proof;
  /** Failure state to report when `proven` is DISPROVEN. */
  failure: FailureState;
  /** Short, secret-free description of what was actually measured. */
  evidence: string;
}

export interface LifecycleWalk {
  /** The furthest stage actually proven. Never optimistic. */
  reached: LifecycleStage;
  /** Set when the walk stopped early. */
  state: OperationalState;
  /** The stage the walk could not pass, if any. */
  blockedAt: LifecycleStage | null;
  /** True when the walk stopped because something was unmeasurable. */
  unknown: boolean;
  /** Ordered trail of what was checked and what it showed. */
  trail: Array<{ stage: LifecycleStage; proven: Proof; evidence: string }>;
}

/**
 * Walks the lifecycle as far as the evidence actually reaches.
 *
 * Three properties matter and are each covered by a test:
 *  1. A missing evidence entry for a stage stops the walk at UNKNOWN. Absent
 *     evidence is never treated as success.
 *  2. UNPROVABLE stops the walk at UNKNOWN rather than continuing — so a job
 *     whose publication could not be checked is never HEALTHY.
 *  3. The first DISPROVEN stage decides the reported failure state, and later
 *     evidence cannot overwrite it. A job that failed to persist is not
 *     rescued by a stale-but-present public surface.
 */
export function walkLifecycle(evidence: readonly StageEvidence[]): LifecycleWalk {
  const byStage = new Map(evidence.map((item) => [item.stage, item]));
  const trail: LifecycleWalk["trail"] = [{ stage: "EXPECTED", proven: "PROVEN", evidence: "schedule declares this run" }];
  let reached: LifecycleStage = "EXPECTED";

  for (;;) {
    const next = nextStage(reached);
    if (!next) return { reached, state: "HEALTHY", blockedAt: null, unknown: false, trail };
    const item = byStage.get(next as Exclude<LifecycleStage, "EXPECTED">);
    // HEALTHY is not a seventh measurement — it is the NAME for "all seven
    // earlier stages proven". A caller may still supply evidence for it to add
    // a final gate (an open incident, a quota hold); absent that, reaching it
    // is the conclusion of the walk. Nothing is skipped either way: the loop
    // can only arrive here after PUBLISHED was itself proven.
    if (!item && next === "HEALTHY") {
      trail.push({ stage: next, proven: "PROVEN", evidence: "every earlier stage proven" });
      return { reached: next, state: "HEALTHY", blockedAt: null, unknown: false, trail };
    }
    if (!item) {
      trail.push({ stage: next, proven: "UNPROVABLE", evidence: "no check supplied evidence for this stage" });
      return { reached, state: "UNKNOWN", blockedAt: next, unknown: true, trail };
    }
    trail.push({ stage: next, proven: item.proven, evidence: item.evidence });
    if (item.proven === "UNPROVABLE") {
      return { reached, state: "UNKNOWN", blockedAt: next, unknown: true, trail };
    }
    if (item.proven === "DISPROVEN") {
      return { reached, state: item.failure, blockedAt: next, unknown: false, trail };
    }
    reached = next;
  }
}

/**
 * Which failure states are merely degraded (product still serves real
 * last-good data) versus an outright error.
 *
 * The split is a product judgement, not a severity guess: DEGRADED means a
 * visitor still sees truthful data with an honest staleness note, ERROR means
 * the surface is wrong or empty. `HUMAN_REVIEW_REQUIRED` is ERROR because
 * nothing will improve without a person.
 */
const DEGRADED_FAILURES = new Set<FailureState>([
  "MISSED_RUN",
  "PARTIAL_DATA",
  "STALE",
  "RECOVERY_PENDING",
  "RECOVERY_RUNNING",
  "DEGRADED",
]);

const ERROR_FAILURES = new Set<FailureState>([
  "EXECUTION_ERROR",
  "INVALID_PAYLOAD",
  "PERSISTENCE_FAILED",
  "PUBLICATION_MISMATCH",
  "RECOVERY_FAILED",
  "HUMAN_REVIEW_REQUIRED",
]);

export function severityOf(state: OperationalState): OverallStatus {
  if (state === "UNKNOWN") return "UNKNOWN";
  if (isLifecycleStage(state)) return state === "HEALTHY" ? "HEALTHY" : "DEGRADED";
  if (ERROR_FAILURES.has(state)) return "ERROR";
  if (DEGRADED_FAILURES.has(state)) return "DEGRADED";
  return "UNKNOWN";
}

/**
 * Rolls many per-job severities into one overall answer.
 *
 * The ordering rule the brief requires: ERROR beats UNKNOWN beats DEGRADED
 * beats HEALTHY, and — the part that is easy to get wrong — a single UNKNOWN
 * on an IMPORTANT signal must prevent HEALTHY. It does here structurally,
 * because UNKNOWN outranks both DEGRADED and HEALTHY. An unimportant signal
 * should not be passed in at all rather than be special-cased.
 */
export function rollUp(statuses: readonly OverallStatus[]): OverallStatus {
  if (!statuses.length) return "UNKNOWN";
  if (statuses.includes("ERROR")) return "ERROR";
  if (statuses.includes("UNKNOWN")) return "UNKNOWN";
  if (statuses.includes("DEGRADED")) return "DEGRADED";
  return "HEALTHY";
}
