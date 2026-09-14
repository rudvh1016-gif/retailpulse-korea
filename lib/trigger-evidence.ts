/**
 * What actually started a collector run — and, more importantly, what did not.
 *
 * `operational_source_state.trigger_evidence` has existed since migration 0020
 * with `NOT NULL DEFAULT 'UNKNOWN'`, and `saveMeasurement` never wrote it. Every
 * row in Production therefore carries the default. That is not harmful, but it
 * wastes a column that could answer a question the harness genuinely needs:
 * did the scheduler fire, or did a person?
 *
 * The honest ceiling
 * ──────────────────
 * The five Production Worker Crons each make ONE allowlisted
 * `workflow_dispatch` call (lib/realtime-dispatch.ts). From inside the resulting
 * Actions run, `GITHUB_EVENT_NAME` is `workflow_dispatch` — which is exactly
 * what a human clicking "Run workflow" also produces. GitHub exposes no field
 * that distinguishes the two, so a run that says `workflow_dispatch` is NOT
 * evidence the Worker Cron fired.
 *
 * Recording it as such would convert an unproven assumption into a stored fact
 * and, worse, into a watchdog signal — the exact thing the coverage gap exists
 * to avoid. So the dispatch case is labelled
 * `GITHUB_WORKFLOW_DISPATCH_ORIGIN_UNVERIFIED` and is never treated as
 * independent observation of the Worker platform.
 *
 * `schedule` is different and is worth recording: GitHub's own scheduler set
 * that event name, and no user action produces it.
 */

export type TriggerEvidence =
  /** GitHub Actions' own cron fired this run. Proven by the event name. */
  | "GITHUB_SCHEDULE"
  /** A workflow_dispatch. Could be the Worker Cron or a person; GitHub does not say which. */
  | "GITHUB_WORKFLOW_DISPATCH_ORIGIN_UNVERIFIED"
  /** One workflow started another via workflow_run. */
  | "GITHUB_WORKFLOW_RUN"
  /** A push or pull_request build, not a scheduled collection. */
  | "GITHUB_CODE_EVENT"
  /** Someone ran the inspection tooling by hand. */
  | "MANUAL_INSPECTION"
  /** Not running under Actions at all, or the event name was not readable. */
  | "UNKNOWN";

/** Platforms a heartbeat can be attributed to, and the honest "cannot tell". */
export type ExecutionPlatform = "GITHUB_ACTIONS" | "MANUAL_INSPECTION" | "UNKNOWN";

/**
 * Classifies the trigger from the execution environment.
 *
 * Reads only `GITHUB_ACTIONS` and `GITHUB_EVENT_NAME`; no token, no API call and
 * nothing that could leak a secret into a stored row.
 */
export function classifyTriggerEvidence(
  env: Record<string, string | undefined>,
  executionPlatform: ExecutionPlatform = "GITHUB_ACTIONS",
): TriggerEvidence {
  if (executionPlatform === "MANUAL_INSPECTION") return "MANUAL_INSPECTION";
  if (env.GITHUB_ACTIONS !== "true") return "UNKNOWN";
  switch (env.GITHUB_EVENT_NAME) {
    case "schedule":
      return "GITHUB_SCHEDULE";
    case "workflow_dispatch":
      // Deliberately not GITHUB_WORKER_CRON. See the note above: the Worker's
      // dispatch and a person's click are the same event to GitHub.
      return "GITHUB_WORKFLOW_DISPATCH_ORIGIN_UNVERIFIED";
    case "workflow_run":
      return "GITHUB_WORKFLOW_RUN";
    case "push":
    case "pull_request":
      return "GITHUB_CODE_EVENT";
    default:
      return "UNKNOWN";
  }
}

/**
 * Whether a trigger record proves a DIFFERENT platform observed this execution.
 *
 * Always false today, and derived rather than hardcoded so the reason travels
 * with the answer. A collector completion recorded by GitHub Actions is
 * evidence that GitHub Actions ran; it is evidence about the Worker Cron only
 * if the dispatch origin were verifiable, and it is not. When a receipt the
 * Worker itself signs ever exists, this function is where it goes — and until
 * then the watchdog keeps reporting the gap instead of a green light nobody
 * earned.
 */
export function provesIndependentPlatform(evidence: TriggerEvidence): {
  independent: false;
  reason: string;
} {
  if (evidence === "GITHUB_SCHEDULE") {
    return {
      independent: false,
      reason: "GitHub's own scheduler fired this run, which is the same platform that records it; a platform cannot observe its own outage",
    };
  }
  if (evidence === "GITHUB_WORKFLOW_DISPATCH_ORIGIN_UNVERIFIED") {
    return {
      independent: false,
      reason: "a workflow_dispatch is indistinguishable from a person clicking Run workflow, so it does not prove the Worker Cron fired",
    };
  }
  return { independent: false, reason: `${evidence} carries no cross-platform trigger receipt` };
}
