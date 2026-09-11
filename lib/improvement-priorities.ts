/**
 * Deterministic improvement ranking.
 *
 * No model writes anything here. The rank of a candidate is a function of facts
 * already in the ledger — how many times it happened, whether a person is
 * required, whether the public surface is affected — and running this twice on
 * the same ledger produces byte-identical output. That is the property that
 * makes it trustworthy as an operational artifact: a ranking that can change
 * without the evidence changing is an opinion.
 *
 * Every candidate carries `automaticCodeChangeAllowed: false`. The harness may
 * find and rank work. It may not do it.
 */
import type { Incident } from "./incident-ledger";
import type { DocDrift, SchedulerTruth } from "./scheduler-truth";
import type { WatchdogReport } from "./watchdog";

export type Priority = "P0" | "P1" | "P2" | "P3";

export interface ImprovementCandidate {
  priority: Priority;
  /** Stable identity so the same candidate in two runs is recognisably the same. */
  key: string;
  title: string;
  /** The facts that produced this ranking. Never a generated summary. */
  evidence: string[];
  automaticCodeChangeAllowed: false;
}

/**
 * Priority rules, in the order they are applied.
 *
 * P0 — a visitor is currently being shown something wrong or nothing.
 * P1 — a failure repeats, so the next occurrence is predictable.
 * P2 — a defence exists but is not wired to anything.
 * P3 — a documented claim contradicts the configuration.
 *
 * Doc drift ranks last despite being embarrassing, because it misleads the next
 * agent rather than the visitor. That ordering is a deliberate product call.
 */
export function rankImprovements(inputs: {
  incidents: readonly Incident[];
  scheduler: SchedulerTruth;
  watchdog: WatchdogReport;
  docDrift: readonly DocDrift[];
  /** Modules with no production caller: a defence that is tested but not used. */
  unwiredDefences: readonly { module: string; detail: string }[];
}): ImprovementCandidate[] {
  const candidates: ImprovementCandidate[] = [];

  for (const incident of inputs.incidents) {
    const publicFacing = incident.failureClass === "PUBLICATION_MISMATCH" || incident.failureClass === "PERSISTENCE_FAILED";
    const needsPerson = incident.currentState === "HUMAN_REVIEW_REQUIRED";
    const priority: Priority = publicFacing || needsPerson ? "P0" : incident.occurrenceCount >= 3 ? "P1" : "P2";
    candidates.push({
      priority,
      key: `incident:${incident.fingerprint}`,
      title: `${incident.sourceId}: ${incident.failureClass} (${incident.occurrenceCount}x)`,
      evidence: [
        `first seen ${incident.firstSeen}, last seen ${incident.lastSeen}`,
        `state ${incident.currentState}, recovery attempts ${incident.recoveryAttempts}`,
        ...incident.evidence.slice(-2),
      ],
      automaticCodeChangeAllowed: false,
    });
  }

  for (const workflow of inputs.scheduler.duplicateSchedulers) {
    candidates.push({
      priority: "P0",
      key: `duplicate-scheduler:${workflow}`,
      title: `${workflow} is fired by two independent schedulers`,
      evidence: ["two live timed schedulers for one source double provider load and make row provenance unanswerable"],
      automaticCodeChangeAllowed: false,
    });
  }

  for (const entry of inputs.scheduler.entries) {
    if (entry.enablement !== "RUNTIME_ENABLE_STATE_UNKNOWN") continue;
    candidates.push({
      priority: "P1",
      key: `enablement-unknown:${entry.workflow}:${entry.cron ?? "none"}`,
      title: `${entry.workflow} has a live schedule whose enablement cannot be read`,
      evidence: [`cron ${entry.cron ?? "none"} is gated by an Actions Variable that is not in the repository`],
      automaticCodeChangeAllowed: false,
    });
  }

  for (const name of inputs.watchdog.coverageGaps) {
    candidates.push({
      priority: "P2",
      key: `watchdog-gap:${name}`,
      title: `${name} is self-observed only`,
      evidence: ["no independent platform can confirm this job ran, so its silence is undetectable from inside"],
      automaticCodeChangeAllowed: false,
    });
  }

  for (const defence of inputs.unwiredDefences) {
    candidates.push({
      priority: "P2",
      key: `unwired:${defence.module}`,
      title: `${defence.module} has no production caller`,
      evidence: [defence.detail, "코드 존재 ≠ 프로덕션에 연결됨"],
      automaticCodeChangeAllowed: false,
    });
  }

  for (const drift of inputs.docDrift) {
    if (!drift.contradicted) continue;
    candidates.push({
      priority: "P3",
      key: `doc-drift:${drift.file}:${drift.claim}`,
      title: `${drift.file} asserts "${drift.claim}" and the configuration disagrees`,
      evidence: ["a false claim in an instruction file misleads every later agent that reads it"],
      automaticCodeChangeAllowed: false,
    });
  }

  const rank: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return candidates.sort((a, b) => rank[a.priority] - rank[b.priority] || a.key.localeCompare(b.key));
}
