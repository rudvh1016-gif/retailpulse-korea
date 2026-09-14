/**
 * The deepest execution boundary for central controlled recovery.
 *
 * What the audit found (2026-09-14, main ca4a4cb)
 * ──────────────────────────────────────────────
 * `CENTRAL_RECOVERY_EXECUTION_ENABLED` and `recoveryActivation()` both said
 * dormant, and `scripts/operational-memory.ts --recover` printed that dormancy
 * honestly. But `executeControlledRecovery()` consulted NEITHER. It went
 * straight to `memory.admit(request)` and then to `executor.execute()`. The
 * only thing keeping provider traffic at zero was that no production caller
 * existed yet — a fact about the call graph, not a property of the code.
 *
 * A lock whose enforcement lives in the callers is not a lock. So the check
 * moved here, and `executeControlledRecovery` now refuses before admission:
 * before the D1 write, before the executor, before any provider request.
 *
 * Why a pure module
 * ─────────────────
 * No D1, no collector, no network. The gate is a function of four booleans and
 * a clock, so every bypass attempt is a unit test rather than an integration
 * story, and nothing about importing it can start work.
 *
 * Why the date is necessary and not sufficient
 * ────────────────────────────────────────────
 * The UI trial ending on 2026-09-27 KST removes ONE reason to stay off. It
 * supplies no evidence that a source can be recovered safely, that its
 * provider budget is known, or that anybody reviewed the decision. A gate that
 * opens when a date passes is a gate that opens while nobody is watching,
 * which is the one thing this must never do. All four conditions are required,
 * and `compiledEnabled` stays false in this repository until a separate,
 * owner-approved pull request changes it.
 */

/** Everything that must be true before one provider request may be made. */
export interface CentralRecoveryActivationInput {
  /** The reviewed constant in this repository. False on every shipped commit so far. */
  compiledEnabled: boolean;
  /** Production runtime opt-in, read from the environment at execution time. */
  runtimeEnabled: boolean;
  /** An explicit owner approval recorded for this activation, not inferred. */
  ownerApproved: boolean;
  nowIso: string;
  /** Exclusive end of the UI trial; before it, no additional provider execution at all. */
  trialEndExclusiveIso: string;
}

export type CentralRecoveryBlockReason =
  | "UI_TRIAL_LOCK"
  | "COMPILED_DISABLED"
  | "OWNER_APPROVAL_MISSING"
  | "RUNTIME_DISABLED"
  | "ACTIVATION_CLOCK_UNREADABLE";

export interface CentralRecoveryActivation {
  allowed: boolean;
  /** Every condition that is not yet satisfied, in a stable order. */
  blockedBy: readonly CentralRecoveryBlockReason[];
  reason: string;
  /** The four inputs, echoed so a report never has to guess what was evaluated. */
  evaluated: {
    trialOver: boolean;
    compiledEnabled: boolean;
    ownerApproved: boolean;
    runtimeEnabled: boolean;
  };
}

/**
 * Resolves whether central controlled recovery may execute.
 *
 * Fails closed on an unreadable clock: a timestamp that will not parse is not
 * evidence the trial is over, and treating it as such would make a malformed
 * string an activation path.
 */
export function resolveCentralRecoveryActivation(
  input: CentralRecoveryActivationInput,
): CentralRecoveryActivation {
  const now = Date.parse(input.nowIso);
  const trialEnd = Date.parse(input.trialEndExclusiveIso);
  const clockReadable = Number.isFinite(now) && Number.isFinite(trialEnd);
  const trialOver = clockReadable && now >= trialEnd;

  const blockedBy: CentralRecoveryBlockReason[] = [];
  if (!clockReadable) blockedBy.push("ACTIVATION_CLOCK_UNREADABLE");
  else if (!trialOver) blockedBy.push("UI_TRIAL_LOCK");
  if (!input.compiledEnabled) blockedBy.push("COMPILED_DISABLED");
  if (!input.ownerApproved) blockedBy.push("OWNER_APPROVAL_MISSING");
  if (!input.runtimeEnabled) blockedBy.push("RUNTIME_DISABLED");

  const evaluated = {
    trialOver,
    compiledEnabled: input.compiledEnabled,
    ownerApproved: input.ownerApproved,
    runtimeEnabled: input.runtimeEnabled,
  };
  if (blockedBy.length) {
    return {
      allowed: false,
      blockedBy,
      reason: `central controlled recovery is locked: ${blockedBy.join(", ")}`,
      evaluated,
    };
  }
  return {
    allowed: true,
    blockedBy: [],
    reason: "trial over, compiled enable reviewed, owner approved and runtime enabled",
    evaluated,
  };
}

/**
 * Reads the Production runtime opt-in.
 *
 * Absent means disabled, not unknown. Runtime enablement is the one condition a
 * deployment can flip without a code review, so the safe reading of "nothing is
 * set" is off — the opposite of `RUNTIME_ENABLE_STATE_UNKNOWN` for a *schedule*,
 * where an unread GitHub Variable genuinely is unknown and must say so.
 */
export function runtimeCentralRecoveryEnabled(env: Record<string, string | undefined>): boolean {
  return env.RPK_CENTRAL_RECOVERY_RUNTIME_ENABLED === "true";
}

/**
 * Reads the recorded owner approval.
 *
 * Deliberately a second, differently named variable rather than a second
 * meaning for the first: two separate acts, so neither one alone opens the gate.
 */
export function ownerApprovedCentralRecovery(env: Record<string, string | undefined>): boolean {
  return env.RPK_CENTRAL_RECOVERY_OWNER_APPROVED === "true";
}
