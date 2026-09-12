/**
 * The repeat-problem ledger.
 *
 * Why fingerprints
 * ────────────────
 * A harness that emits one record per failed run answers "what broke" but never
 * "what keeps breaking" — and the second question is the one that changes what
 * gets built. The KMA timeout that recurred for days and the A5 archive-trigger
 * abort that failed 24 times in a row both looked, run by run, like isolated
 * incidents. Counting them needs a stable identity for "the same problem".
 *
 * The fingerprint is source + failure class + contract version + logical job.
 * Those four and no more:
 *  - a timestamp or run id would make every occurrence a new incident;
 *  - the error message would split one incident across every varying detail
 *    (a different host, a different row count) — and provider messages vary;
 *  - omitting the contract version would merge a failure before a provider
 *    schema change with one after it, which are genuinely different problems.
 *
 * This is a pure reducer over events. It does no I/O, so the counting rules are
 * testable without a database, and the same rules apply whether the ledger is
 * persisted in D1 or held for one run.
 */
import type { FailureState } from "./operational-states";

export type IncidentState = "OPEN" | "RECOVERING" | "DEGRADED" | "RESOLVED" | "HUMAN_REVIEW_REQUIRED";

export interface IncidentFingerprintParts {
  sourceId: string;
  failureClass: FailureState;
  /** The provider contract the failure occurred against, e.g. a schema_version. */
  contractVersion: string;
  /** The logical job, e.g. `collect-forecast.yml`. */
  logicalJob: string;
}

/**
 * Stable, readable fingerprint.
 *
 * Readable on purpose: this string appears in the health report and in the
 * ledger, and an operator comparing two reports should be able to see at a
 * glance that they are the same incident.
 */
export function incidentFingerprint(parts: IncidentFingerprintParts): string {
  return [parts.sourceId, parts.failureClass, parts.contractVersion || "UNKNOWN_CONTRACT", parts.logicalJob]
    .map((part) => String(part).trim().replace(/[^A-Za-z0-9._:-]+/g, "-"))
    .join("::");
}

export interface Incident {
  incidentId: string;
  fingerprint: string;
  sourceId: string;
  failureClass: FailureState;
  logicalJob: string;
  contractVersion: string;
  firstSeen: string;
  lastSeen: string;
  occurrenceCount: number;
  /** Distinct run identities that carried this failure. */
  affectedRuns: string[];
  severity: "LOW" | "MEDIUM" | "HIGH";
  currentState: IncidentState;
  /** Last moment this source was known good, for honest blast-radius reporting. */
  lastGoodAt: string | null;
  recoveryAttempts: number;
  lastRecoveryResult: string | null;
  resolvedAt: string | null
  ;
  /** Short, secret-free evidence lines. Never a provider URL or a token. */
  evidence: string[];
}

/** One thing that happened to one fingerprint. */
export type IncidentEvent =
  | {
      kind: "FAILURE";
      at: string;
      parts: IncidentFingerprintParts;
      runId: string;
      evidence: string;
      lastGoodAt: string | null;
    }
  | { kind: "RECOVERY_STARTED"; at: string; fingerprint: string }
  | { kind: "RECOVERY_RESULT"; at: string; fingerprint: string; result: string; verified: boolean }
  | { kind: "HUMAN_REVIEW"; at: string; fingerprint: string; reason: string }
  | { kind: "HEALTHY"; at: string; fingerprint: string };

/**
 * Severity from repetition, not from opinion.
 *
 * Three occurrences is the threshold because two can be one provider outage
 * seen twice; three across separate runs is a pattern. There is no LLM and no
 * scoring model here on purpose — the number is the evidence.
 */
export function severityFromOccurrences(occurrenceCount: number, failureClass: FailureState): Incident["severity"] {
  const structural: FailureState[] = ["PERSISTENCE_FAILED", "PUBLICATION_MISMATCH", "INVALID_PAYLOAD", "HUMAN_REVIEW_REQUIRED"];
  if (structural.includes(failureClass)) return "HIGH";
  if (occurrenceCount >= 3) return "HIGH";
  if (occurrenceCount >= 2) return "MEDIUM";
  return "LOW";
}

const MAX_EVIDENCE_LINES = 10;
const MAX_AFFECTED_RUNS = 50;

/**
 * Folds events into the ledger.
 *
 * The rule the brief insists on — "같은 실패는 count만 증가" — is implemented by
 * looking the fingerprint up before creating anything. A resolved incident that
 * recurs is REOPENED rather than duplicated, so the occurrence count across the
 * whole history stays intact; a new incident row each time would reset the one
 * number that proves a problem is chronic.
 */
export function applyIncidentEvents(
  existing: readonly Incident[],
  events: readonly IncidentEvent[],
): Incident[] {
  const byFingerprint = new Map<string, Incident>(existing.map((incident) => [incident.fingerprint, { ...incident }]));

  for (const event of events) {
    if (event.kind === "FAILURE") {
      const fingerprint = incidentFingerprint(event.parts);
      const found = byFingerprint.get(fingerprint);
      if (!found) {
        byFingerprint.set(fingerprint, {
          incidentId: fingerprint,
          fingerprint,
          sourceId: event.parts.sourceId,
          failureClass: event.parts.failureClass,
          logicalJob: event.parts.logicalJob,
          contractVersion: event.parts.contractVersion,
          firstSeen: event.at,
          lastSeen: event.at,
          occurrenceCount: 1,
          affectedRuns: [event.runId],
          severity: severityFromOccurrences(1, event.parts.failureClass),
          currentState: "OPEN",
          lastGoodAt: event.lastGoodAt,
          recoveryAttempts: 0,
          lastRecoveryResult: null,
          resolvedAt: null,
          evidence: [event.evidence],
        });
        continue;
      }
      found.occurrenceCount += 1;
      found.lastSeen = event.at;
      // A recurrence after resolution is the SAME problem coming back. Keeping
      // one row is what makes occurrenceCount mean "times this has ever
      // happened" instead of "times since someone last closed it".
      found.resolvedAt = null;
      found.currentState = found.currentState === "HUMAN_REVIEW_REQUIRED" ? "HUMAN_REVIEW_REQUIRED" : "OPEN";
      if (!found.affectedRuns.includes(event.runId) && found.affectedRuns.length < MAX_AFFECTED_RUNS) {
        found.affectedRuns.push(event.runId);
      }
      if (event.lastGoodAt) found.lastGoodAt = event.lastGoodAt;
      if (!found.evidence.includes(event.evidence)) {
        found.evidence = [...found.evidence, event.evidence].slice(-MAX_EVIDENCE_LINES);
      }
      found.severity = severityFromOccurrences(found.occurrenceCount, found.failureClass);
      continue;
    }

    const found = byFingerprint.get(event.fingerprint);
    if (!found) continue;

    if (event.kind === "RECOVERY_STARTED") {
      found.recoveryAttempts += 1;
      found.currentState = "RECOVERING";
      found.lastSeen = event.at;
      continue;
    }
    if (event.kind === "RECOVERY_RESULT") {
      found.lastRecoveryResult = event.result;
      found.lastSeen = event.at;
      // A recovery that reported success but was not re-verified leaves the
      // incident DEGRADED, never RESOLVED. Closing on an unverified claim is
      // the exact failure the recovery re-verification exists to prevent.
      found.currentState = event.verified ? "RESOLVED" : "DEGRADED";
      found.resolvedAt = event.verified ? event.at : null;
      continue;
    }
    if (event.kind === "HUMAN_REVIEW") {
      found.currentState = "HUMAN_REVIEW_REQUIRED";
      found.lastRecoveryResult = event.reason;
      found.lastSeen = event.at;
      continue;
    }
    // HEALTHY: the source is good again on its own, with no recovery claim.
    found.currentState = "RESOLVED";
    found.resolvedAt = event.at;
    found.lastGoodAt = event.at;
    found.lastSeen = event.at;
  }

  return [...byFingerprint.values()].sort((a, b) => {
    const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    if (a.occurrenceCount !== b.occurrenceCount) return b.occurrenceCount - a.occurrenceCount;
    return a.fingerprint.localeCompare(b.fingerprint);
  });
}

/** Incidents that still need attention, for the report's top block. */
export function unresolvedIncidents(ledger: readonly Incident[]): Incident[] {
  return ledger.filter((incident) => incident.currentState !== "RESOLVED");
}

/**
 * Repeat offenders: the same fingerprint at least `threshold` times.
 *
 * This is the input to improvement ranking. It is a count, not a judgement —
 * no summary is generated from it and no model reads it.
 */
export function repeatIncidents(ledger: readonly Incident[], threshold = 3): Incident[] {
  return ledger.filter((incident) => incident.occurrenceCount >= threshold);
}
