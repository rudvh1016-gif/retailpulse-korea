/**
 * The state `lib/quota-guard.ts` is missing: "I do not know".
 *
 * What the audit found
 * ────────────────────
 * `evaluateQuotaUsage` implements the 70/85/95 guardrails correctly and has
 * been correct since it was written. It also had, on 2026-09-11, ZERO callers
 * outside `tests/hybrid.test.ts` — so the thresholds were tested and never
 * consulted. It is not rebuilt here; it is wrapped.
 *
 * The wrapper exists because the guard's signature cannot express the situation
 * this project is actually in. `evaluateQuotaUsage(used, limit, evidence)`
 * throws on a non-finite `used`, which means a caller with no measurement has
 * two options: invent a number, or not call it. Both are wrong, and the first is
 * worse — passing 0 for "unmeasured" reports NORMAL at 0% for a resource that
 * might be at 99%.
 *
 * So UNKNOWN is a first-class level here, and a resource with no measurement
 * source is OBSERVE_ONLY: recorded, reported, and explicitly not used to gate
 * anything. No automatic paid upgrade is possible from any state.
 */
import { evaluateQuotaUsage, type GuardrailDecision, type GuardrailLevel, type UsageEvidence } from "./quota-guard";

export type QuotaLevel = GuardrailLevel | "UNKNOWN";
/**
 * `OBSERVED_LOWER_BOUND` is what `operational_usage_daily` actually holds.
 *
 * Those counters sum what THIS harness observed itself doing. They are not
 * account usage: anything the account spent outside a measured execution is
 * invisible to them. The asymmetry that follows is the whole point of the
 * basis, and it is one-way:
 *
 *   · A lower bound at or above 95% of the limit proves the real figure is at
 *     least that high, because the real figure can only be larger. EMERGENCY is
 *     therefore assertable from a lower bound.
 *   · A lower bound at 20% proves nothing about the real figure, which may be
 *     20% or 99%. NORMAL is NOT assertable, and saying it would be the same
 *     mistake as passing 0 for "unmeasured".
 *
 * So a low lower bound stays UNKNOWN and keeps the resource OBSERVE_ONLY.
 */
export type QuotaBasis = UsageEvidence | "OBSERVED_LOWER_BOUND" | "UNKNOWN";

export interface QuotaObservation {
  resource: string;
  /** null means NOT MEASURED. It is never treated as 0. */
  used: number | null;
  /** null means the ceiling itself is unknown. */
  limit: number | null;
  basis: QuotaBasis;
  /** Where the number came from, or why there is none. */
  measurementSource: string | null;
}

export interface QuotaVerdict {
  resource: string;
  level: QuotaLevel;
  basis: QuotaBasis;
  percent: number | null;
  /** True when nothing can be gated on this resource because nothing measures it. */
  observeOnly: boolean;
  decision: GuardrailDecision | null;
  detail: string;
}

/**
 * Grades one resource.
 *
 * The guard's own thresholds are reused verbatim rather than re-expressed, so
 * there is exactly one definition of 70/85/95 in the codebase and this wrapper
 * cannot drift from it.
 */
export function observeQuota(observation: QuotaObservation): QuotaVerdict {
  const { resource, used, limit, basis, measurementSource } = observation;
  if (used === null || limit === null || !measurementSource) {
    return {
      resource,
      level: "UNKNOWN",
      basis: "UNKNOWN",
      percent: null,
      observeOnly: true,
      decision: null,
      // Stated this explicitly because the tempting shortcut is to print 0%.
      detail: measurementSource
        ? `no usage figure available for ${resource}; UNKNOWN is not 0`
        : `no measurement source exists for ${resource}; OBSERVE_ONLY`,
    };
  }
  if (basis === "OBSERVED_LOWER_BOUND") {
    const percent = (used / limit) * 100;
    if (percent >= 95) {
      // Safe in one direction only: the true figure is at least this, so the
      // highest guardrail is earned even though the exact number is unknown.
      return {
        resource,
        level: "EMERGENCY",
        basis,
        percent,
        observeOnly: false,
        decision: evaluateQuotaUsage(used, limit, "INTERNAL_ESTIMATE"),
        detail: `at least ${used}/${limit} = ${percent.toFixed(1)}% observed for ${resource}; a lower bound this high proves EMERGENCY regardless of what is unmeasured`,
      };
    }
    return {
      resource,
      level: "UNKNOWN",
      basis,
      percent,
      observeOnly: true,
      decision: null,
      detail: `at least ${used}/${limit} = ${percent.toFixed(1)}% observed for ${resource}; a low lower bound cannot establish NORMAL, so the level stays UNKNOWN`,
    };
  }
  if (basis === "UNKNOWN") {
    return {
      resource,
      level: "UNKNOWN",
      basis: "UNKNOWN",
      percent: null,
      observeOnly: true,
      decision: null,
      detail: `a figure exists for ${resource} but its provenance is unknown, so it may not gate anything`,
    };
  }
  try {
    const decision = evaluateQuotaUsage(used, limit, basis);
    return {
      resource,
      level: decision.level,
      basis,
      percent: decision.percent,
      observeOnly: false,
      decision,
      detail: `${used}/${limit} = ${decision.percent.toFixed(1)}% (${basis}) via ${measurementSource}`,
    };
  } catch {
    return {
      resource,
      level: "UNKNOWN",
      basis: "UNKNOWN",
      percent: null,
      observeOnly: true,
      decision: null,
      detail: `usage figures for ${resource} were rejected as invalid, so the level is UNKNOWN rather than assumed`,
    };
  }
}

/** The single escalation ceiling. Nothing here can ever authorise spending. */
export const QUOTA_AUTOMATIC_ACTIONS_ALLOWED = [
  "REPORT_LEVEL",
  "WITHHOLD_OPTIONAL_WRITES",
  "WITHHOLD_BACKFILL",
] as const;

export const QUOTA_AUTOMATIC_ACTIONS_FORBIDDEN = [
  "UPGRADE_TO_PAID_PLAN",
  "RAISE_THE_LIMIT",
  "DISABLE_THE_GUARDRAIL",
] as const;
