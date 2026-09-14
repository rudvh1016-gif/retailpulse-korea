/**
 * Which SOURCE may be recovered automatically — separately from which FAILURE may be.
 *
 * The gap this closes
 * ───────────────────
 * `RECOVERY_RULES` in lib/recovery-orchestration.ts answers one question:
 * "is this KIND of failure the kind a machine may repair?" It is a closed table
 * keyed by failure class and it knows nothing about sources.
 *
 * `existingRecoveryAdapter` answers a different question: "is there a safe,
 * bounded way to re-request THIS source?" It returns an executor for exactly
 * two source ids and null for the other fourteen.
 *
 * Before this module the two answers were never intersected. `decideRecovery`
 * approving REDISPATCH_SAME_WORKFLOW for an EXECUTION_ERROR said nothing about
 * whether the source in question had an adapter, a known request budget, or any
 * way to prove the repair worked — and `executeControlledRecovery` accepted any
 * executor handed to it. A generic rule could therefore authorise a provider
 * call for a source nobody had cleared.
 *
 * So: approval now needs BOTH. The rule table is necessary; this matrix is also
 * necessary; neither is sufficient.
 *
 * How entries were decided
 * ────────────────────────
 * By reading the code that would have to do the work, not by reasoning about
 * what sounds recoverable:
 *
 *  · `existingRecoveryAdapter` (lib/operational-recovery-runner.ts) maps exactly
 *    INCHEON_PASSENGER_FORECAST → airport_passenger_forecast_recovery and
 *    KMA_VILAGE_FCST → weather_recovery. Every other id returns null, so for
 *    every other id "execute" has no implementation to call.
 *  · `lib/collection-recovery.ts` plans the bounded re-request for those same
 *    two — one selectdate, one grid — and reads D1 first, so a healthy source
 *    costs zero provider requests.
 *  · A4 congestion runs on REALTIME_CRON `7,22,37,52 * * * *`. The next normal
 *    cycle is at most fifteen minutes away and re-collects the same window, so
 *    it already IS the recovery. A central redispatch would add provider load
 *    to repair something that repairs itself.
 *  · A1 `airport_recent` documents 500 development calls/day and
 *    `.github/workflows/collect-airport-recovery.yml` budgets the day to exactly
 *    that: 3 × 125 in the early window plus 1 × 125 at 06:07. There is no
 *    headroom for a central path to spend, so a central path must not exist.
 *
 * UNKNOWN fails toward a person. A source that has not been proven safe is not
 * "probably fine"; it is HUMAN_REVIEW_ONLY until someone does the work.
 */
import { DIAGNOSTIC_SOURCE_IDS } from "./production-diagnostics";
import type { RecoveryAction, RecoveryDecision } from "./recovery-orchestration";
import { decideRecovery } from "./recovery-orchestration";
import type { FailureState } from "./operational-states";

/**
 * How a source may be repaired when something goes wrong.
 *
 * Ordered from most to least automation. Only the first permits a central
 * provider call.
 */
export type RecoveryClass =
  /** A bounded, same-contract re-request adapter exists and the result is re-verifiable. */
  | "CONTROLLED_ELIGIBLE"
  /** The source's own next scheduled cycle re-collects the window; adding a call would be pure extra load. */
  | "NEXT_SCHEDULED_SLOT_ONLY"
  /** No adapter and no self-healing cadence; the harness records and reports, nothing more. */
  | "OBSERVE_ONLY"
  /** Recovery would need a decision a rule cannot make, or a budget nobody has proven. */
  | "HUMAN_REVIEW_ONLY";

/** Whether a repair can be proven to have reached the reader. */
export type PublicVerification =
  /** The public summary carries this source, so `matchPublicBundle` can confirm or deny. */
  | "VERIFIABLE_ON_PUBLIC_SUMMARY"
  /** Stored rows are checkable but the public surface does not expose this source separately. */
  | "STORAGE_ONLY"
  /** Neither path is proven. A repair here can never be called RECOVERED. */
  | "UNKNOWN";

/** What is known about what a re-request would cost. */
export type ProviderBudgetPolicy =
  /** A bounded planner decides the request count from stored coverage before calling. */
  | "BOUNDED_BY_MISSING_COVERAGE"
  /** A fixed daily ceiling exists and is already fully allocated to scheduled runs. */
  | "DAILY_CEILING_FULLY_ALLOCATED"
  /** The next scheduled cycle pays for the repair; a central path adds nothing. */
  | "COVERED_BY_NEXT_SCHEDULED_RUN"
  /** Nobody has measured what a repair would cost. */
  | "UNMEASURED";

export interface SourceRecoveryCapability {
  sourceId: string;
  logicalJob: string;
  recoveryClass: RecoveryClass;
  /** Actions this source can actually perform. Empty unless CONTROLLED_ELIGIBLE. */
  supportedActions: readonly RecoveryAction[];
  /** The production runner selection an adapter would invoke, or null when none exists. */
  adapter: string | null;
  publicVerification: PublicVerification;
  providerBudgetPolicy: ProviderBudgetPolicy;
  /** What happens on its own if nothing intervenes. */
  nextScheduledSlotBehavior: string;
  controlledRecoveryEligible: boolean;
  /** The evidence, in one sentence, for anyone re-deciding this later. */
  reason: string;
}

const CONTROLLED: readonly RecoveryAction[] = ["REQUEST_ONLY_MISSING_COVERAGE"];

/**
 * The matrix.
 *
 * Every canonical source id from `DIAGNOSTIC_SOURCE_IDS` plus the
 * `SEOUL_CITYDATA_CMRCL` companion appears exactly once; a test asserts that,
 * so a new production source cannot be added without being classified — and an
 * unclassified source resolves to HUMAN_REVIEW_ONLY rather than to nothing.
 */
export const SOURCE_RECOVERY_CAPABILITIES: readonly SourceRecoveryCapability[] = [
  {
    sourceId: "INCHEON_PASSENGER_FORECAST",
    logicalJob: "collect-forecast.yml",
    recoveryClass: "CONTROLLED_ELIGIBLE",
    supportedActions: CONTROLLED,
    adapter: "airport_passenger_forecast_recovery",
    publicVerification: "VERIFIABLE_ON_PUBLIC_SUMMARY",
    providerBudgetPolicy: "BOUNDED_BY_MISSING_COVERAGE",
    nextScheduledSlotBehavior: "hourly at :42, with an existing :53 recovery window on the Worker Cron",
    controlledRecoveryEligible: true,
    reason: "existingRecoveryAdapter maps it to airport_passenger_forecast_recovery; lib/collection-recovery.ts reads D1 first and requests only the missing selectdate; the public summary carries the forecast so the repair is re-verifiable end to end",
  },
  {
    sourceId: "KMA_VILAGE_FCST",
    logicalJob: "collect-weather.yml",
    recoveryClass: "CONTROLLED_ELIGIBLE",
    supportedActions: CONTROLLED,
    adapter: "weather_recovery",
    publicVerification: "VERIFIABLE_ON_PUBLIC_SUMMARY",
    providerBudgetPolicy: "BOUNDED_BY_MISSING_COVERAGE",
    nextScheduledSlotBehavior: "per KMA issuance at :10, with existing :25 and :40 recovery windows",
    controlledRecoveryEligible: true,
    reason: "existingRecoveryAdapter maps it to weather_recovery; the planner requests only the missing grids; the public summary carries weather so the repair is re-verifiable end to end",
  },
  {
    sourceId: "INCHEON_DEPARTURE_CONGESTION",
    logicalJob: "collect-realtime.yml",
    recoveryClass: "NEXT_SCHEDULED_SLOT_ONLY",
    supportedActions: [],
    adapter: null,
    publicVerification: "VERIFIABLE_ON_PUBLIC_SUMMARY",
    providerBudgetPolicy: "COVERED_BY_NEXT_SCHEDULED_RUN",
    nextScheduledSlotBehavior: "every 15 minutes (REALTIME_CRON 7,22,37,52), re-collecting the same window",
    controlledRecoveryEligible: false,
    reason: "the next normal cycle is at most fifteen minutes away and re-collects the same window, so it already performs the repair; a central redispatch would add provider load to fix something that fixes itself",
  },
  {
    sourceId: "INCHEON_DEPARTURE_CONGESTION_T2",
    logicalJob: "collect-realtime.yml",
    recoveryClass: "NEXT_SCHEDULED_SLOT_ONLY",
    supportedActions: [],
    adapter: null,
    publicVerification: "VERIFIABLE_ON_PUBLIC_SUMMARY",
    providerBudgetPolicy: "COVERED_BY_NEXT_SCHEDULED_RUN",
    nextScheduledSlotBehavior: "every 15 minutes (REALTIME_CRON 7,22,37,52), re-collecting the same window",
    controlledRecoveryEligible: false,
    reason: "same fifteen-minute self-healing cadence as T1; the observed UND_ERR_CONNECT_TIMEOUT failures are repaired by the following cycle without any central action",
  },
  {
    sourceId: "SEOUL_CITYDATA_PPLTN",
    logicalJob: "collect-realtime.yml",
    recoveryClass: "NEXT_SCHEDULED_SLOT_ONLY",
    supportedActions: [],
    adapter: null,
    publicVerification: "VERIFIABLE_ON_PUBLIC_SUMMARY",
    providerBudgetPolicy: "COVERED_BY_NEXT_SCHEDULED_RUN",
    nextScheduledSlotBehavior: "every 15 minutes (REALTIME_CRON 7,22,37,52)",
    controlledRecoveryEligible: false,
    reason: "a live population reading is only meaningful for the moment it was taken; re-requesting a missed 15-minute slot cannot recover that moment, and the next cycle supplies the current one",
  },
  {
    sourceId: "SEOUL_CITYDATA_CMRCL",
    logicalJob: "collect-realtime.yml",
    recoveryClass: "NEXT_SCHEDULED_SLOT_ONLY",
    supportedActions: [],
    adapter: null,
    publicVerification: "VERIFIABLE_ON_PUBLIC_SUMMARY",
    providerBudgetPolicy: "COVERED_BY_NEXT_SCHEDULED_RUN",
    nextScheduledSlotBehavior: "every 15 minutes, written by the same integrated seoul_realtime request",
    controlledRecoveryEligible: false,
    reason: "written by the same single request as SEOUL_CITYDATA_PPLTN, so it cannot be recovered independently and shares that source's self-healing cadence",
  },
  {
    sourceId: "INCHEON_FLIGHT_DETAIL",
    logicalJob: "collect-production.yml",
    recoveryClass: "HUMAN_REVIEW_ONLY",
    supportedActions: [],
    adapter: null,
    publicVerification: "VERIFIABLE_ON_PUBLIC_SUMMARY",
    providerBudgetPolicy: "DAILY_CEILING_FULLY_ALLOCATED",
    nextScheduledSlotBehavior: "04:07 KST early window with two fresh-runner retries, then a 06:07 KST rescan",
    controlledRecoveryEligible: false,
    reason: "A1 documents 500 provider calls a day and collect-airport-recovery.yml already allocates the entire ceiling (3x125 early + 1x125 at 06:07); a central path has no headroom to spend and must not invent any",
  },
  {
    sourceId: "INCHEON_DUTY_FREE_ACTUAL",
    logicalJob: "collect-production.yml",
    recoveryClass: "OBSERVE_ONLY",
    supportedActions: [],
    adapter: null,
    publicVerification: "STORAGE_ONLY",
    providerBudgetPolicy: "UNMEASURED",
    nextScheduledSlotBehavior: "daily group at 06:07 KST",
    controlledRecoveryEligible: false,
    reason: "no recovery adapter exists and the cost of a re-request has never been measured; the daily group re-collects tomorrow, so the harness records and reports rather than acting",
  },
  {
    sourceId: "INCHEON_FACILITY_DIRECTORY",
    logicalJob: "collect-production.yml",
    recoveryClass: "OBSERVE_ONLY",
    supportedActions: [],
    adapter: null,
    publicVerification: "STORAGE_ONLY",
    providerBudgetPolicy: "UNMEASURED",
    nextScheduledSlotBehavior: "daily group at 06:07 KST",
    controlledRecoveryEligible: false,
    reason: "a slow-moving directory with no adapter and no measured re-request cost; a missed day changes almost nothing and the next daily run repairs it",
  },
  {
    sourceId: "INCHEON_SCHEDULED_DUTY_FREE",
    logicalJob: "collect-production.yml",
    recoveryClass: "OBSERVE_ONLY",
    supportedActions: [],
    adapter: null,
    publicVerification: "STORAGE_ONLY",
    providerBudgetPolicy: "UNMEASURED",
    nextScheduledSlotBehavior: "daily group at 06:07 KST",
    controlledRecoveryEligible: false,
    reason: "seasonal schedule data with no adapter and no measured re-request cost",
  },
  {
    sourceId: "SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION",
    logicalJob: "collect-production.yml",
    recoveryClass: "OBSERVE_ONLY",
    supportedActions: [],
    adapter: null,
    publicVerification: "STORAGE_ONLY",
    providerBudgetPolicy: "UNMEASURED",
    nextScheduledSlotBehavior: "daily group at 06:07 KST",
    controlledRecoveryEligible: false,
    reason: "a monthly-published statistic collected daily; no adapter, and re-requesting within the same publication period cannot produce newer data",
  },
  {
    sourceId: "SEOUL_FOREIGN_PURPOSE_MOBILITY",
    logicalJob: "collect-production.yml",
    recoveryClass: "OBSERVE_ONLY",
    supportedActions: [],
    adapter: null,
    publicVerification: "STORAGE_ONLY",
    providerBudgetPolicy: "UNMEASURED",
    nextScheduledSlotBehavior: "daily group at 06:07 KST",
    controlledRecoveryEligible: false,
    reason: "periodically published mobility data with no adapter and no measured re-request cost",
  },
  {
    sourceId: "SEOUL_SUBWAY_RIDERSHIP",
    logicalJob: "collect-production.yml",
    recoveryClass: "OBSERVE_ONLY",
    supportedActions: [],
    adapter: null,
    publicVerification: "STORAGE_ONLY",
    providerBudgetPolicy: "UNMEASURED",
    nextScheduledSlotBehavior: "daily group at 06:07 KST",
    controlledRecoveryEligible: false,
    reason: "ridership is published on a lag; a same-day re-request returns the same rows, so there is nothing for a repair to fetch",
  },
  {
    sourceId: "SEOUL_ESTIMATED_SALES",
    logicalJob: "collect-sales.yml",
    recoveryClass: "OBSERVE_ONLY",
    supportedActions: [],
    adapter: null,
    publicVerification: "STORAGE_ONLY",
    providerBudgetPolicy: "UNMEASURED",
    nextScheduledSlotBehavior: "weekly",
    controlledRecoveryEligible: false,
    reason: "quarterly-published estimates collected weekly; no adapter, and a missed week cannot change what the provider has published",
  },
  {
    sourceId: "SEOUL_STORE_DYNAMICS",
    logicalJob: "collect-sales.yml",
    recoveryClass: "OBSERVE_ONLY",
    supportedActions: [],
    adapter: null,
    publicVerification: "STORAGE_ONLY",
    providerBudgetPolicy: "UNMEASURED",
    nextScheduledSlotBehavior: "weekly",
    controlledRecoveryEligible: false,
    reason: "quarterly-published store dynamics collected weekly; same reasoning as estimated sales",
  },
  {
    sourceId: "KTO_TOURAPI_EVENT",
    logicalJob: "collect-production.yml",
    recoveryClass: "OBSERVE_ONLY",
    supportedActions: [],
    adapter: null,
    publicVerification: "STORAGE_ONLY",
    providerBudgetPolicy: "UNMEASURED",
    nextScheduledSlotBehavior: "daily group at 06:07 KST",
    controlledRecoveryEligible: false,
    reason: "event listings change slowly and have no adapter; the next daily run repairs a missed day at no extra cost",
  },
];

/** The source ids this harness knows about, companion included. */
export const CLASSIFIED_SOURCE_IDS: readonly string[] = SOURCE_RECOVERY_CAPABILITIES.map((entry) => entry.sourceId);

/** Every canonical id a production collector writes, companion included. */
export const PRODUCTION_SOURCE_IDS: readonly string[] = [
  ...Object.values(DIAGNOSTIC_SOURCE_IDS),
  "SEOUL_CITYDATA_CMRCL",
];

/**
 * The capability for one source.
 *
 * An id nobody classified is not an error and is not permission. It becomes a
 * HUMAN_REVIEW_ONLY entry with `UNKNOWN` verification and `UNMEASURED` budget,
 * which is exactly what an unclassified source deserves and which no caller can
 * mistake for approval.
 */
export function capabilityFor(sourceId: string): SourceRecoveryCapability {
  const known = SOURCE_RECOVERY_CAPABILITIES.find((entry) => entry.sourceId === sourceId);
  if (known) return known;
  return {
    sourceId,
    logicalJob: "UNKNOWN",
    recoveryClass: "HUMAN_REVIEW_ONLY",
    supportedActions: [],
    adapter: null,
    publicVerification: "UNKNOWN",
    providerBudgetPolicy: "UNMEASURED",
    nextScheduledSlotBehavior: "UNKNOWN",
    controlledRecoveryEligible: false,
    reason: `${sourceId} is not in the capability matrix; an unclassified source is reviewed by a person, never recovered automatically`,
  };
}

/** Where a decision stopped. One value, chosen by the first failing condition. */
export type FinalDisposition =
  | "WOULD_CONTROLLED_RECOVER"
  | "WAIT_FOR_NEXT_SCHEDULED_SLOT"
  | "BLOCKED_CENTRAL_RECOVERY_DORMANT"
  | "BLOCKED_UNSUPPORTED_SOURCE"
  | "BLOCKED_UNSUPPORTED_ACTION_FOR_SOURCE"
  | "BLOCKED_UNKNOWN_CONTRACT"
  | "BLOCKED_NO_PUBLIC_VERIFICATION"
  | "BLOCKED_BUDGET"
  | "BLOCKED_IN_FLIGHT"
  | "ALREADY_RECOVERED"
  | "HUMAN_REVIEW_REQUIRED";

export interface DispositionInput {
  sourceId: string;
  failureClass: FailureState;
  contractVersion: string;
  attemptsUsed: number;
  /** A controlled attempt for this source and job that has not completed. */
  inFlight: boolean;
  /** The incident is already resolved. */
  alreadyRecovered: boolean;
  /** Whether the hard execution gate currently permits any provider call at all. */
  centralGateAllowed: boolean;
}

export interface DispositionResult {
  finalDisposition: FinalDisposition;
  /** The failure-class half of the decision, unchanged from the closed rule table. */
  ruleDecision: RecoveryDecision;
  capability: SourceRecoveryCapability;
  recommendedAction: RecoveryAction;
  blockReason: string;
}

/**
 * Intersects the closed rule table with the source's own capability.
 *
 * Order matters and is deliberate. Cheapest, most certain facts first — already
 * resolved, then in flight, then contract — so an incident that needs no action
 * never reaches the questions about budgets and adapters. The central gate is
 * checked before anything that could be read as approval, so a dormant system
 * never produces a plan entry that says it would call a provider.
 *
 * Every branch that is not WOULD_CONTROLLED_RECOVER means zero provider calls.
 */
export function resolveRecoveryDisposition(input: DispositionInput): DispositionResult {
  const capability = capabilityFor(input.sourceId);
  const ruleDecision = decideRecovery(input.failureClass, input.attemptsUsed);
  const finish = (finalDisposition: FinalDisposition, blockReason: string): DispositionResult => ({
    finalDisposition,
    ruleDecision,
    capability,
    recommendedAction: finalDisposition === "WOULD_CONTROLLED_RECOVER" ? ruleDecision.action : "NONE",
    blockReason,
  });

  if (input.alreadyRecovered) return finish("ALREADY_RECOVERED", "the incident is already resolved");
  if (input.inFlight) {
    return finish("BLOCKED_IN_FLIGHT", "a controlled attempt for this source and logical job has not completed; elapsed time never unlocks it");
  }
  if (input.contractVersion === "UNKNOWN_CONTRACT") {
    return finish("BLOCKED_UNKNOWN_CONTRACT", "the provider contract could not be identified, so a re-request cannot be proven to ask for the same thing");
  }
  if (!ruleDecision.approved) {
    const budget = ruleDecision.reason.startsWith("attempt budget exhausted");
    return finish(budget ? "BLOCKED_BUDGET" : "HUMAN_REVIEW_REQUIRED", ruleDecision.reason);
  }
  if (capability.recoveryClass === "NEXT_SCHEDULED_SLOT_ONLY") {
    return finish("WAIT_FOR_NEXT_SCHEDULED_SLOT", `${capability.nextScheduledSlotBehavior}; a central call would add provider load without adding coverage`);
  }
  if (!capability.controlledRecoveryEligible) {
    return finish("BLOCKED_UNSUPPORTED_SOURCE", capability.reason);
  }
  if (!capability.supportedActions.includes(ruleDecision.action)) {
    return finish(
      "BLOCKED_UNSUPPORTED_ACTION_FOR_SOURCE",
      `the rule approves ${ruleDecision.action} but ${capability.sourceId} supports only ${capability.supportedActions.join(", ") || "no action"}`,
    );
  }
  if (capability.publicVerification === "UNKNOWN") {
    return finish("BLOCKED_NO_PUBLIC_VERIFICATION", "a repair here could be executed but never proven to have reached the reader, so it could not be called RECOVERED");
  }
  if (capability.providerBudgetPolicy === "UNMEASURED" || capability.providerBudgetPolicy === "DAILY_CEILING_FULLY_ALLOCATED") {
    return finish("BLOCKED_BUDGET", `provider budget policy is ${capability.providerBudgetPolicy}; a central path may not spend what nobody has measured or what is already allocated`);
  }
  if (!input.centralGateAllowed) {
    return finish("BLOCKED_CENTRAL_RECOVERY_DORMANT", "every source-level condition is satisfied, but the central execution gate is locked");
  }
  return finish("WOULD_CONTROLLED_RECOVER", capability.reason);
}
