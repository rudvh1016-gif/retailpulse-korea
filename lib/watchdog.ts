/**
 * Level 5: who watches the watcher.
 *
 * The uncomfortable fact this module states rather than hides
 * ─────────────────────────────────────────────────────────
 * A watchdog that runs on the same infrastructure as the thing it watches
 * cannot detect that infrastructure stopping. If GitHub Actions is not running
 * this repository's scheduled workflows, a scheduled workflow cannot notice. If
 * the production Worker's Cron triggers stop firing, the Worker cannot notice
 * either, because nothing invokes it.
 *
 * On free infrastructure, with no paid monitor and no second provider, there is
 * no honest way to close that hole. So it is NOT closed and NOT papered over:
 * the harness reports `WATCHDOG_COVERAGE_GAP` with the exact scope of what is
 * unobserved. A green dashboard produced by the dead system itself is worse than
 * an explicit gap, because it converts an outage into silence.
 *
 * What IS achievable is heartbeat staleness: each scheduler leaves a timestamp,
 * and any OTHER scheduler that does run can see that a sibling has gone quiet.
 * That covers the common case — one collector group broken — and is useless for
 * the rare case — the whole platform stopped. Both facts are reported.
 */
import type { OverallStatus } from "./operational-states";

export type WatchdogCoverage = "OBSERVED" | "WATCHDOG_COVERAGE_GAP" | "UNKNOWN";

export interface Heartbeat {
  /** The scheduler or logical job that wrote it. */
  name: string;
  /** Last time this job is known to have executed. null = never seen. */
  lastSeenAt: string | null;
  /** How often it is expected to execute. null = cadence not derivable. */
  expectedIntervalMs: number | null;
  /**
   * Whether a DIFFERENT execution platform can observe this one.
   * The Worker Cron group and the Actions cron group watch each other; a job
   * that only the same platform can see is self-observed, which is the gap.
   */
  observedByIndependentPlatform: boolean;
}

export interface HeartbeatVerdict {
  name: string;
  state: "ALIVE" | "SILENT" | "NEVER_SEEN" | "UNKNOWN";
  coverage: WatchdogCoverage;
  ageMs: number | null;
  detail: string;
  severity: OverallStatus;
}

/**
 * Grace before a silent heartbeat is called silent.
 *
 * Three intervals, not one. Two would fire on a single late GitHub schedule
 * (explicitly best-effort and routinely minutes late under load), and a
 * watchdog that cries wolf on normal lateness stops being read.
 */
export function heartbeatSilenceThresholdMs(expectedIntervalMs: number): number {
  return expectedIntervalMs * 3 + 5 * 60_000;
}

export function evaluateHeartbeat(beat: Heartbeat, nowIso: string): HeartbeatVerdict {
  const coverage: WatchdogCoverage = beat.observedByIndependentPlatform ? "OBSERVED" : "WATCHDOG_COVERAGE_GAP";
  const now = Date.parse(nowIso);

  if (!beat.lastSeenAt) {
    return {
      name: beat.name,
      state: "NEVER_SEEN",
      coverage,
      ageMs: null,
      detail: "no execution has ever been recorded for this job",
      severity: "UNKNOWN",
    };
  }
  const seen = Date.parse(beat.lastSeenAt);
  if (!Number.isFinite(seen) || !Number.isFinite(now)) {
    return { name: beat.name, state: "UNKNOWN", coverage, ageMs: null, detail: "heartbeat timestamp unparseable", severity: "UNKNOWN" };
  }
  const ageMs = now - seen;
  if (beat.expectedIntervalMs === null) {
    // Without a cadence, an old timestamp proves nothing. Saying so is the only
    // honest answer; calling it alive would be a guess in the dangerous direction.
    return {
      name: beat.name,
      state: "UNKNOWN",
      coverage,
      ageMs,
      detail: `last seen ${Math.round(ageMs / 60_000)} min ago but no expected cadence is derivable`,
      severity: "UNKNOWN",
    };
  }
  const threshold = heartbeatSilenceThresholdMs(beat.expectedIntervalMs);
  if (ageMs > threshold) {
    return {
      name: beat.name,
      state: "SILENT",
      coverage,
      ageMs,
      detail: `last seen ${Math.round(ageMs / 60_000)} min ago, silence threshold ${Math.round(threshold / 60_000)} min`,
      severity: "ERROR",
    };
  }
  return {
    name: beat.name,
    state: "ALIVE",
    coverage,
    ageMs,
    // An ALIVE heartbeat nobody independent can see is still only self-reported.
    detail: coverage === "OBSERVED"
      ? `last seen ${Math.round(ageMs / 60_000)} min ago, observed from another platform`
      : `last seen ${Math.round(ageMs / 60_000)} min ago, self-reported only`,
    severity: coverage === "OBSERVED" ? "HEALTHY" : "UNKNOWN",
  };
}

export interface WatchdogReport {
  beats: HeartbeatVerdict[];
  /** Jobs nothing independent can observe. Never empty on free infrastructure. */
  coverageGaps: string[];
  /** The platform-level hole, stated plainly. */
  unobservableScope: string[];
  severity: OverallStatus;
}

/**
 * The platform-level gaps this project cannot close without paid monitoring.
 *
 * Listed explicitly so the report names them every time rather than leaving the
 * reader to infer that a green board means total coverage.
 */
export const UNOBSERVABLE_SCOPE = [
  "GitHub Actions itself not dispatching scheduled workflows — detectable only from outside GitHub",
  "Cloudflare Worker Cron triggers not firing at all — detectable only from outside Cloudflare",
  "both platforms down simultaneously — no in-repository check can observe this",
] as const;

export function buildWatchdogReport(beats: readonly Heartbeat[], nowIso: string): WatchdogReport {
  const verdicts = beats.map((beat) => evaluateHeartbeat(beat, nowIso));
  const coverageGaps = verdicts.filter((verdict) => verdict.coverage === "WATCHDOG_COVERAGE_GAP").map((verdict) => verdict.name);
  // UNOBSERVABLE_SCOPE is permanently non-empty, so the watchdog's own status
  // can never be HEALTHY — there is always something it cannot see. A silent
  // heartbeat is worse than that and becomes ERROR; everything else is UNKNOWN,
  // which is the honest ceiling for self-observation and, per
  // lib/operational-states.ts, is enough to keep the whole report off HEALTHY.
  const severity: OverallStatus = verdicts.some((verdict) => verdict.severity === "ERROR") ? "ERROR" : "UNKNOWN";
  return { beats: verdicts, coverageGaps, unobservableScope: [...UNOBSERVABLE_SCOPE], severity };
}
