/**
 * "If central recovery were on right now, what would it do?" — answered by reading only.
 *
 * Why this exists before any execution
 * ────────────────────────────────────
 * The dangerous thing about an orchestrator is not that it acts; it is that
 * nobody can see what it would have decided until it has already decided it.
 * This module produces that decision list from stored evidence alone, so the
 * owner can read a full round of judgements — including every refusal and the
 * reason for it — while the execution gate is still locked.
 *
 * Hard property: PURE. It takes already-read rows and returns a value. No D1
 * handle, no fetch, no clock of its own. A planner that cannot perform a
 * provider call or a write does not need to be trusted not to.
 *
 * Determinism is part of the contract. Entries are keyed by incident
 * fingerprint and sorted by it, and every field is derived from the inputs, so
 * the same stored rows produce byte-identical JSON however many times it runs.
 * That is what makes the plan diffable between runs and therefore reviewable.
 */
import type { Incident } from "./incident-ledger";
import type { StoredAttempt } from "./operational-memory";
import type { CentralRecoveryActivation } from "./central-recovery-gate";
import {
  PRODUCTION_SOURCE_IDS,
  SOURCE_RECOVERY_CAPABILITIES,
  capabilityFor,
  resolveRecoveryDisposition,
  type FinalDisposition,
} from "./recovery-capability";

export interface StuckAttempt {
  attemptId: string;
  sourceId: string;
  logicalJob: string;
  executionId: string;
  startedAt: string;
  ageMs: number;
}

export interface OrchestrationPlanInput {
  nowIso: string;
  incidents: readonly Incident[];
  attempts: readonly StoredAttempt[];
  /** Controlled attempts holding a lock right now, from OperationalMemory.inFlightControlled(). */
  inFlight: readonly { sourceId: string; logicalJob: string }[];
  /** Orphans from OperationalMemory.stuckControlledAttempts(). */
  stuck: readonly StuckAttempt[];
  activation: CentralRecoveryActivation;
}

export interface OrchestrationPlanEntry {
  fingerprint: string;
  sourceId: string;
  failureClass: string;
  contractVersion: string;
  logicalJob: string;
  currentState: string;
  occurrenceCount: number;
  lastSeen: string;
  lastGoodAt: string | null;
  ruleDecision: { approved: boolean; action: string; stage: string; reason: string };
  sourceCapability: {
    recoveryClass: string;
    controlledRecoveryEligible: boolean;
    supportedActions: readonly string[];
    adapter: string | null;
    publicVerification: string;
    providerBudgetPolicy: string;
    nextScheduledSlotBehavior: string;
  };
  /** Controlled repairs spent today. This is what the budget measures. */
  attemptsUsed: number;
  maxAttempts: number;
  /** Ordinary scheduled collections today. Never spends the recovery budget. */
  normalRunsToday: number;
  inFlightAttempt: boolean;
  recommendedAction: string;
  finalDisposition: FinalDisposition;
  blockReason: string;
}

export interface OrchestrationPlan {
  generatedAt: string;
  /**
   * Did the PLANNER run correctly — separately from whether Production is well.
   *
   * These are different questions and conflating them is how a working
   * diagnostic gets mistaken for a broken one. A planner that correctly
   * identifies fifteen live failures has SUCCEEDED; the system it examined is
   * the thing that is DEGRADED. Reporting one number for both would mean a
   * harness that finds problems looks exactly like a harness that is itself
   * broken, and the natural response to that is to stop trusting the harness.
   */
  executionStatus: "PASS";
  /** What the examined system looks like, which is a wholly separate verdict. */
  productionVerdict: "NO_UNRESOLVED_INCIDENTS" | "DEGRADED" | "UNKNOWN";
  /** Proof, in the artifact itself, that producing it cost nothing. */
  providerCalls: 0;
  d1Writes: 0;
  deploys: 0;
  dispatches: 0;
  centralRecovery: {
    executionGate: "LOCKED" | "OPEN";
    blockedBy: readonly string[];
    reason: string;
    evaluated: CentralRecoveryActivation["evaluated"];
  };
  incidentsExamined: number;
  dispositionCounts: Record<string, number>;
  entries: readonly OrchestrationPlanEntry[];
  stuckControlledAttempts: readonly (StuckAttempt & { disposition: "HUMAN_REVIEW_REQUIRED" })[];
  capabilityCoverage: {
    productionSources: number;
    classified: number;
    /**
     * Sources that are live but unclassified.
     *
     * Computed over the union of the static production table AND every source
     * id actually seen in the ledger — not the table alone. The first
     * Production rehearsal (2026-09-14) found exactly why that matters:
     * `KASI_PUBLIC_HOLIDAYS` carries incidents but is absent from
     * `DIAGNOSTIC_SOURCE_IDS`, so a table-only count reported 16/16 and full
     * coverage while an unclassified source was live. The disposition itself
     * was safe — it refused — but the COVERAGE CLAIM was false, and a false
     * green is the failure this phase exists to prevent.
     */
    unclassified: readonly string[];
    controlledEligible: readonly string[];
    nextSlotOnly: readonly string[];
    observeOnly: readonly string[];
    humanReviewOnly: readonly string[];
  };
}

/**
 * Attempts already spent against today's RECOVERY budget for one incident.
 *
 * Counted exactly the way `OperationalMemory.admit` counts them — by source,
 * logical job, target date and `mode='CONTROLLED'` — because that is the budget
 * the admission statement enforces. A plan that counted differently would
 * predict an admission the database would refuse, or vice versa.
 *
 * The mode filter matters and was missing on both sides until 2026-09-15:
 * `recordExistingCompletion` writes an EXISTING_RUN row for every ordinary
 * scheduled collection, so counting all rows made a source that merely ran on
 * schedule look like one that had exhausted its repairs.
 */
function attemptsUsedFor(
  incident: Incident,
  attempts: readonly StoredAttempt[],
  targetDate: string,
): number {
  return attempts.filter(
    (row) => row.sourceId === incident.sourceId && row.logicalJob === incident.logicalJob
      && row.targetDate === targetDate && row.mode === "CONTROLLED",
  ).length;
}

/**
 * How many of today's rows are normal collection rather than repair.
 *
 * Reported alongside the budget so a reader can see the two are separate. They
 * were conflated once; showing both is what keeps them from quietly merging
 * again.
 */
function normalRunsFor(
  incident: Incident,
  attempts: readonly StoredAttempt[],
  targetDate: string,
): number {
  return attempts.filter(
    (row) => row.sourceId === incident.sourceId && row.logicalJob === incident.logicalJob
      && row.targetDate === targetDate && row.mode === "EXISTING_RUN",
  ).length;
}

/** KST civil date, which is the date the admission budget is keyed by. */
export function kstDate(nowIso: string): string {
  const time = Date.parse(nowIso);
  if (!Number.isFinite(time)) throw new Error("invalid_plan_timestamp");
  return new Date(time + 9 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Builds the plan.
 *
 * Resolved incidents are included rather than filtered out, carrying
 * ALREADY_RECOVERED. A plan that silently drops them cannot be read as "these
 * are all the open items" — the reader would have to trust that the omission
 * was deliberate rather than a query that missed rows.
 */
export function buildOrchestrationPlan(input: OrchestrationPlanInput): OrchestrationPlan {
  const targetDate = kstDate(input.nowIso);
  const inFlightKeys = new Set(input.inFlight.map((row) => `${row.sourceId}::${row.logicalJob}`));

  const entries = [...input.incidents]
    .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint))
    .map((incident): OrchestrationPlanEntry => {
      const attemptsUsed = attemptsUsedFor(incident, input.attempts, targetDate);
      const inFlightAttempt = inFlightKeys.has(`${incident.sourceId}::${incident.logicalJob}`);
      const resolved = resolveRecoveryDisposition({
        sourceId: incident.sourceId,
        failureClass: incident.failureClass,
        contractVersion: incident.contractVersion,
        attemptsUsed,
        inFlight: inFlightAttempt,
        alreadyRecovered: incident.currentState === "RESOLVED",
        centralGateAllowed: input.activation.allowed,
      });
      const capability = resolved.capability;
      return {
        fingerprint: incident.fingerprint,
        sourceId: incident.sourceId,
        failureClass: incident.failureClass,
        contractVersion: incident.contractVersion,
        logicalJob: incident.logicalJob,
        currentState: incident.currentState,
        occurrenceCount: incident.occurrenceCount,
        lastSeen: incident.lastSeen,
        lastGoodAt: incident.lastGoodAt,
        ruleDecision: {
          approved: resolved.ruleDecision.approved,
          action: resolved.ruleDecision.action,
          stage: resolved.ruleDecision.stage,
          reason: resolved.ruleDecision.reason,
        },
        sourceCapability: {
          recoveryClass: capability.recoveryClass,
          controlledRecoveryEligible: capability.controlledRecoveryEligible,
          supportedActions: capability.supportedActions,
          adapter: capability.adapter,
          publicVerification: capability.publicVerification,
          providerBudgetPolicy: capability.providerBudgetPolicy,
          nextScheduledSlotBehavior: capability.nextScheduledSlotBehavior,
        },
        attemptsUsed,
        maxAttempts: resolved.ruleDecision.maxAttempts,
        normalRunsToday: normalRunsFor(incident, input.attempts, targetDate),
        inFlightAttempt,
        recommendedAction: resolved.recommendedAction,
        finalDisposition: resolved.finalDisposition,
        blockReason: resolved.blockReason,
      };
    });

  const dispositionCounts: Record<string, number> = {};
  for (const entry of entries) {
    dispositionCounts[entry.finalDisposition] = (dispositionCounts[entry.finalDisposition] ?? 0) + 1;
  }

  // Every source the ledger actually mentions, whether or not the static table
  // knows about it. A source can reach D1 without being in DIAGNOSTIC_SOURCE_IDS.
  const observedSourceIds = [...new Set([
    ...PRODUCTION_SOURCE_IDS,
    ...input.incidents.map((incident) => incident.sourceId),
    ...input.attempts.map((attempt) => attempt.sourceId),
    ...input.inFlight.map((row) => row.sourceId),
    ...input.stuck.map((row) => row.sourceId),
  ])].sort();

  const byClass = (recoveryClass: string) =>
    SOURCE_RECOVERY_CAPABILITIES.filter((entry) => entry.recoveryClass === recoveryClass)
      .map((entry) => entry.sourceId)
      .sort();

  const unresolved = entries.filter((entry) => entry.finalDisposition !== "ALREADY_RECOVERED").length;
  return {
    generatedAt: input.nowIso,
    // The planner reached the end of its work. Whether what it found is good
    // news is the next field, deliberately.
    executionStatus: "PASS",
    productionVerdict: input.incidents.length === 0
      ? "UNKNOWN"
      : unresolved > 0 ? "DEGRADED" : "NO_UNRESOLVED_INCIDENTS",
    providerCalls: 0,
    d1Writes: 0,
    deploys: 0,
    dispatches: 0,
    centralRecovery: {
      executionGate: input.activation.allowed ? "OPEN" : "LOCKED",
      blockedBy: input.activation.blockedBy,
      reason: input.activation.reason,
      evaluated: input.activation.evaluated,
    },
    incidentsExamined: entries.length,
    // Sorted so the same counts serialise in the same order every run.
    dispositionCounts: Object.fromEntries(Object.entries(dispositionCounts).sort(([a], [b]) => a.localeCompare(b))),
    entries,
    stuckControlledAttempts: [...input.stuck]
      .sort((a, b) => a.attemptId.localeCompare(b.attemptId))
      .map((row) => ({ ...row, disposition: "HUMAN_REVIEW_REQUIRED" as const })),
    capabilityCoverage: {
      productionSources: observedSourceIds.length,
      classified: observedSourceIds.filter((id) => capabilityFor(id).logicalJob !== "UNKNOWN").length,
      unclassified: observedSourceIds.filter((id) => capabilityFor(id).logicalJob === "UNKNOWN"),
      controlledEligible: byClass("CONTROLLED_ELIGIBLE"),
      nextSlotOnly: byClass("NEXT_SCHEDULED_SLOT_ONLY"),
      observeOnly: byClass("OBSERVE_ONLY"),
      humanReviewOnly: byClass("HUMAN_REVIEW_ONLY"),
    },
  };
}
