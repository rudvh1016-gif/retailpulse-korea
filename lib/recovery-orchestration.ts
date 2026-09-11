/**
 * Pre-approved recovery, and the proof that it worked.
 *
 * Two separate jobs live here, and keeping them separate is the point.
 *
 * 1. DECIDING whether a detected failure may be repaired without a person.
 *    The allowlist is a closed rule table, not a judgement: a failure class
 *    either appears in it or the answer is HUMAN_REVIEW_REQUIRED. Nothing in
 *    this module can invent a new recovery action, and nothing in it can widen
 *    the table at runtime.
 *
 * 2. RE-VERIFYING the result. A recovery run that reports success has proven
 *    nothing — "복구 성공" is its own state, separate from "실행 성공". The
 *    pipeline therefore does not end at RECOVERY_COMPLETED; it ends at
 *    RECOVERED only after the data, the storage and the public surface have
 *    each been re-checked. A recovery whose re-check is unmeasurable stays
 *    RECOVERY_PENDING rather than being called fixed.
 *
 * This module decides and records. It performs no provider call, no write and
 * no dispatch, so every rule below is unit-testable without a network.
 * lib/collection-recovery.ts remains the place that plans WHAT to re-request
 * for the two sources it covers; this is the layer above it.
 */
import type { FailureState } from "./operational-states";

/** The recovery pipeline, in order. RECOVERED is the only success. */
export const RECOVERY_STAGES = [
  "DETECTED",
  "RECOVERY_APPROVED_BY_RULE",
  "RECOVERY_STARTED",
  "RECOVERY_COMPLETED",
  "DATA_VALIDATED",
  "STORAGE_VALIDATED",
  "PUBLIC_VALIDATED",
  "RECOVERED",
] as const;

export type RecoveryStage = (typeof RECOVERY_STAGES)[number];

/**
 * Actions a rule may authorise. Deliberately short and deliberately boring:
 * every entry is "ask the same provider for the same thing again, or wait".
 */
export type RecoveryAction =
  | "REDISPATCH_SAME_WORKFLOW"
  | "REQUEST_ONLY_MISSING_COVERAGE"
  | "WAIT_FOR_NEXT_SCHEDULED_SLOT"
  | "NONE";

/**
 * Everything automatic recovery may never do.
 *
 * This list is asserted by tests against the rule table, so a future rule that
 * tries to authorise one of these fails the build rather than shipping. Each
 * entry is here because doing it automatically would either change what the
 * product claims, spend money, or destroy evidence.
 */
export const FORBIDDEN_AUTOMATIC_ACTIONS = [
  "SWAP_PROVIDER",
  "ADD_NEW_API",
  "FIX_AUTHENTICATION",
  "CHANGE_SCHEMA",
  "DELETE_DATA",
  "EDIT_PAST_PREDICTION",
  "CHANGE_MODEL_WEIGHT_OR_THRESHOLD",
  "UPGRADE_TO_PAID_PLAN",
  "CHANGE_CODE",
  "FIX_UNKNOWN_BUG",
] as const;

export type ForbiddenAction = (typeof FORBIDDEN_AUTOMATIC_ACTIONS)[number];

export interface RecoveryRule {
  failureClass: FailureState;
  action: RecoveryAction;
  /** Why this is safe to do without a person. */
  rationale: string;
  /** Hard ceiling on automatic attempts per logical job per day. */
  maxAttempts: number;
}

/**
 * The closed rule table.
 *
 * MISSED_RUN and STALE are repairable because the repair is literally "ask the
 * same endpoint for the same window again" — bounded, idempotent and already
 * implemented. PARTIAL_DATA asks only for what is missing.
 *
 * Everything absent from this table resolves to HUMAN_REVIEW_REQUIRED, and the
 * notable absences are deliberate:
 *  - INVALID_PAYLOAD means the provider's contract moved. Re-requesting cannot
 *    help and a normalizer change is a code change.
 *  - PERSISTENCE_FAILED was, the one time it happened, a migration defect.
 *    Retrying wrote nothing 24 times before a person read the error.
 *  - PUBLICATION_MISMATCH means storage and surface disagree, which is a
 *    caching or query defect, not a collection gap.
 */
export const RECOVERY_RULES: readonly RecoveryRule[] = [
  {
    failureClass: "MISSED_RUN",
    action: "REDISPATCH_SAME_WORKFLOW",
    rationale: "the schedule was missed; re-running the unchanged workflow asks the same provider for the same window",
    maxAttempts: 3,
  },
  {
    failureClass: "STALE",
    action: "REQUEST_ONLY_MISSING_COVERAGE",
    rationale: "coverage exists but predates this cycle; the recovery planner reads D1 first and requests only the stale slice",
    maxAttempts: 3,
  },
  {
    failureClass: "PARTIAL_DATA",
    action: "REQUEST_ONLY_MISSING_COVERAGE",
    rationale: "the missing slice is identifiable from stored rows, so the repair is bounded to it",
    maxAttempts: 3,
  },
  {
    failureClass: "EXECUTION_ERROR",
    action: "REDISPATCH_SAME_WORKFLOW",
    rationale: "a transient provider or runner failure is repaired by a fresh runner; the attempt ceiling stops a real defect from looping",
    maxAttempts: 2,
  },
];

export interface RecoveryDecision {
  failureClass: FailureState;
  approved: boolean;
  action: RecoveryAction;
  stage: RecoveryStage | "HUMAN_REVIEW_REQUIRED";
  reason: string;
  /** Attempts already spent against the budget. */
  attemptsUsed: number;
  maxAttempts: number;
}

/**
 * Decides whether one detected failure may be repaired automatically.
 *
 * Budget exhaustion escalates to a person rather than stopping quietly. A
 * source that has burned its attempts is a repeat incident, and the one thing
 * that must not happen is for it to look calm.
 */
export function decideRecovery(
  failureClass: FailureState,
  attemptsUsed: number,
  rules: readonly RecoveryRule[] = RECOVERY_RULES,
): RecoveryDecision {
  const rule = rules.find((entry) => entry.failureClass === failureClass);
  if (!rule) {
    return {
      failureClass,
      approved: false,
      action: "NONE",
      stage: "HUMAN_REVIEW_REQUIRED",
      reason: `no pre-approved rule covers ${failureClass}`,
      attemptsUsed,
      maxAttempts: 0,
    };
  }
  if (attemptsUsed >= rule.maxAttempts) {
    return {
      failureClass,
      approved: false,
      action: "NONE",
      stage: "HUMAN_REVIEW_REQUIRED",
      reason: `attempt budget exhausted (${attemptsUsed}/${rule.maxAttempts}) for ${failureClass}`,
      attemptsUsed,
      maxAttempts: rule.maxAttempts,
    };
  }
  return {
    failureClass,
    approved: true,
    action: rule.action,
    stage: "RECOVERY_APPROVED_BY_RULE",
    reason: rule.rationale,
    attemptsUsed,
    maxAttempts: rule.maxAttempts,
  };
}

/**
 * The stable identity of one recovery attempt.
 *
 * Composed of source + target date + scheduled slot + operation, exactly as the
 * brief requires, because those four are what make two attempts "the same
 * attempt". A timestamp or a run id would make every retry unique and defeat
 * the idempotency it is supposed to provide.
 */
export function recoveryExecutionId(parts: {
  sourceId: string;
  targetDate: string;
  scheduledSlot: string;
  operation: string;
}): string {
  return [parts.sourceId, parts.targetDate, parts.scheduledSlot, parts.operation]
    .map((part) => part.trim().replace(/[^A-Za-z0-9:_-]+/g, "-"))
    .join("|");
}

export interface RecoveryLock {
  executionId: string;
  stage: RecoveryStage;
  startedAt: string;
  updatedAt: string;
}

export type AdmissionVerdict =
  | { admitted: true; reason: string }
  | { admitted: false; reason: string; state: "DUPLICATE" | "IN_PROGRESS" | "ALREADY_RECOVERED" };

/**
 * Whether a recovery attempt may start, given what is already in flight.
 *
 * A timeout alone never releases the lock. That rule is the difference between
 * "the previous attempt is slow" and "the previous attempt is gone", and only
 * the second justifies a second attempt: releasing on elapsed time lets two
 * runs hit the same provider for the same window, which is the double-recovery
 * the direction forbids. A stuck lock therefore becomes a human-review item,
 * which is visible, instead of a silent reset, which is not.
 */
export function admitRecovery(
  executionId: string,
  existing: RecoveryLock | null,
  options: { staleAfterMs: number; nowIso: string },
): AdmissionVerdict {
  if (!existing) return { admitted: true, reason: "no attempt in flight for this execution id" };
  if (existing.executionId !== executionId) return { admitted: true, reason: "different execution id" };
  if (existing.stage === "RECOVERED") {
    return { admitted: false, reason: "this execution id already reached RECOVERED", state: "ALREADY_RECOVERED" };
  }
  const age = Date.parse(options.nowIso) - Date.parse(existing.updatedAt);
  if (Number.isFinite(age) && age > options.staleAfterMs) {
    return {
      admitted: false,
      // Deliberately not admitted. See the note above: elapsed time is not
      // evidence the earlier attempt stopped.
      reason: `an attempt has been at ${existing.stage} for ${Math.round(age / 60_000)} min; escalate rather than start a second one`,
      state: "IN_PROGRESS",
    };
  }
  return { admitted: false, reason: `an attempt is already at ${existing.stage}`, state: "DUPLICATE" };
}

/** Re-verification inputs, one per layer the recovery claims to have fixed. */
export interface RecoveryVerification {
  dataValid: boolean | null;
  storageValid: boolean | null;
  publicValid: boolean | null;
}

export interface RecoveryOutcome {
  stage: RecoveryStage | "RECOVERY_FAILED" | "RECOVERY_PENDING";
  verified: boolean;
  reason: string;
}

/**
 * Grades a completed recovery run.
 *
 * `null` is not a pass. An unmeasured layer leaves the pipeline at
 * RECOVERY_PENDING — the recovery is neither confirmed nor declared failed —
 * because the alternative is to call a source fixed on the strength of a run
 * that exited zero.
 */
export function verifyRecovery(verification: RecoveryVerification): RecoveryOutcome {
  if (verification.dataValid === false) {
    return { stage: "RECOVERY_FAILED", verified: false, reason: "re-collected data is still invalid or stale" };
  }
  if (verification.dataValid === null) {
    return { stage: "RECOVERY_PENDING", verified: false, reason: "re-collected data was not re-validated" };
  }
  if (verification.storageValid === false) {
    return { stage: "RECOVERY_FAILED", verified: false, reason: "recovery ran but rows are still not readable" };
  }
  if (verification.storageValid === null) {
    return { stage: "RECOVERY_PENDING", verified: false, reason: "storage was not re-counted after recovery" };
  }
  if (verification.publicValid === false) {
    return { stage: "RECOVERY_FAILED", verified: false, reason: "rows were restored but the public surface still does not carry them" };
  }
  if (verification.publicValid === null) {
    return { stage: "RECOVERY_PENDING", verified: false, reason: "the public surface was not re-checked after recovery" };
  }
  return { stage: "RECOVERED", verified: true, reason: "data, storage and public surface each re-verified after recovery" };
}
