/**
 * The single central health answer.
 *
 * One function assembles every check in this directory into one verdict and one
 * human-readable summary. It is the thing `npm run health` prints and the thing
 * a level-4 daily rollup would post.
 *
 * The composition rule, and why it is not an average
 * ──────────────────────────────────────────────────
 * `rollUp` from lib/operational-states.ts puts UNKNOWN ABOVE DEGRADED, so an
 * unmeasured signal cannot be diluted by nine healthy ones. That is the opposite
 * of how a score would behave and it is the behaviour the project needs: a
 * report that reads HEALTHY while an important check silently did not run is the
 * failure mode every other rule here exists to prevent.
 *
 * There is no LLM in this path. No summary is generated, no text is inferred;
 * every sentence the summary prints is assembled from a measured value by the
 * code below. See `runtimeLlmCalls` on the report.
 */
import { rollUp, type OverallStatus } from "./operational-states";
import type { SourceVerdict } from "./source-lifecycle";
import type { SchedulerTruth, DocDrift, RuntimeEnablement } from "./scheduler-truth";
import type { Incident } from "./incident-ledger";
import { unresolvedIncidents, repeatIncidents } from "./incident-ledger";
import type { WatchdogReport } from "./watchdog";
import type { QuotaVerdict } from "./quota-observation";
import type { ForecastVerdict } from "./forecast-pipeline-state";
import { rankImprovements, type ImprovementCandidate } from "./improvement-priorities";

/** Severity of the scheduler graph itself, independent of any single source. */
export function schedulerSeverity(truth: SchedulerTruth): OverallStatus {
  if (truth.duplicateSchedulers.length) return "ERROR";
  if (truth.missingRoutedWorkflows.length || truth.undispatchableRoutes.length) return "ERROR";
  if (truth.unroutedWorkerCrons.length) return "ERROR";
  const unknown: RuntimeEnablement = "RUNTIME_ENABLE_STATE_UNKNOWN";
  if (truth.entries.some((entry) => entry.enablement === unknown)) return "UNKNOWN";
  return "HEALTHY";
}

export function incidentSeverity(ledger: readonly Incident[]): OverallStatus {
  const open = unresolvedIncidents(ledger);
  if (!open.length) return "HEALTHY";
  if (open.some((incident) => incident.currentState === "HUMAN_REVIEW_REQUIRED" || incident.severity === "HIGH")) return "ERROR";
  return "DEGRADED";
}

export function quotaSeverity(verdicts: readonly QuotaVerdict[]): OverallStatus {
  if (verdicts.some((verdict) => verdict.level === "EMERGENCY")) return "ERROR";
  if (verdicts.some((verdict) => verdict.level === "UNKNOWN")) return "UNKNOWN";
  if (verdicts.some((verdict) => verdict.level === "PROTECT" || verdict.level === "NOTICE")) return "DEGRADED";
  return "HEALTHY";
}

/**
 * Forecast/outcome severity.
 *
 * `OUTCOME_NOT_AVAILABLE_YET` is HEALTHY, not pending: a prediction for a time
 * that has not arrived is working exactly as designed, and treating it as a gap
 * would make the report permanently yellow for no reason.
 */
export function forecastSeverity(verdicts: readonly ForecastVerdict[]): OverallStatus {
  if (!verdicts.length) return "UNKNOWN";
  const benign = new Set(["PIPELINE_HEALTHY", "OUTCOME_NOT_AVAILABLE_YET"]);
  if (verdicts.some((verdict) => verdict.state === "UNKNOWN")) return "UNKNOWN";
  if (verdicts.every((verdict) => benign.has(verdict.state))) return "HEALTHY";
  return "DEGRADED";
}

export interface RuntimeLlmEvidence {
  /** Dependency names that would permit a runtime model call. Must be empty. */
  offendingDependencies: string[];
  /** Source files containing a runtime model endpoint or binding. Must be empty. */
  offendingFiles: string[];
  /** Files actually scanned, so an empty result is distinguishable from no scan. */
  scannedFileCount: number;
  /** Declared exemptions, printed with the verdict so a skip is never invisible. */
  exemptedPaths?: string[];
}

export interface HealthInputs {
  nowIso: string;
  scheduler: SchedulerTruth;
  docDrift: readonly DocDrift[];
  sources: readonly SourceVerdict[];
  incidents: readonly Incident[];
  watchdog: WatchdogReport;
  quota: readonly QuotaVerdict[];
  forecast: readonly ForecastVerdict[];
  runtimeLlm: RuntimeLlmEvidence;
  unwiredDefences: readonly { module: string; detail: string }[];
}

export interface HealthReport {
  checkedAt: string;
  overall: OverallStatus;
  /** Per-area severities, so a reader can see WHICH area forced the overall. */
  areas: Record<"scheduler" | "sources" | "incidents" | "watchdog" | "quota" | "forecast" | "runtimeLlm", OverallStatus>;
  scheduler: {
    severity: OverallStatus;
    entries: SchedulerTruth["entries"];
    duplicateSchedulers: string[];
    unroutedWorkerCrons: string[];
    missingRoutedWorkflows: string[];
    undispatchableRoutes: string[];
    manualOnly: string[];
  };
  docDrift: DocDrift[];
  sources: SourceVerdict[];
  incidents: { total: number; unresolved: number; repeat: number; rows: Incident[] };
  watchdog: WatchdogReport;
  quota: QuotaVerdict[];
  forecast: ForecastVerdict[];
  improvements: ImprovementCandidate[];
  runtimeLlm: RuntimeLlmEvidence & { verdict: "RUNTIME_LLM_CALLS = 0 VERIFIED" | "RUNTIME_LLM_CALLS != 0" | "RUNTIME_LLM_CALLS = UNKNOWN" };
}

/**
 * The runtime-LLM verdict is evidence-gated in both directions.
 *
 * An empty offender list from a scan that examined zero files proves nothing, so
 * that case is UNKNOWN rather than VERIFIED. This is the same rule the rest of
 * the harness applies to every other measurement, applied to itself.
 */
export function runtimeLlmVerdict(evidence: RuntimeLlmEvidence): HealthReport["runtimeLlm"]["verdict"] {
  if (evidence.offendingDependencies.length || evidence.offendingFiles.length) return "RUNTIME_LLM_CALLS != 0";
  if (evidence.scannedFileCount <= 0) return "RUNTIME_LLM_CALLS = UNKNOWN";
  return "RUNTIME_LLM_CALLS = 0 VERIFIED";
}

export function buildHealthReport(inputs: HealthInputs): HealthReport {
  const llmVerdict = runtimeLlmVerdict(inputs.runtimeLlm);
  const areas: HealthReport["areas"] = {
    scheduler: schedulerSeverity(inputs.scheduler),
    // An empty source list is UNKNOWN: zero sources checked is not zero problems.
    sources: inputs.sources.length ? rollUp(inputs.sources.map((source) => source.severity)) : "UNKNOWN",
    incidents: incidentSeverity(inputs.incidents),
    watchdog: inputs.watchdog.severity,
    quota: quotaSeverity(inputs.quota),
    forecast: forecastSeverity(inputs.forecast),
    runtimeLlm: llmVerdict === "RUNTIME_LLM_CALLS = 0 VERIFIED" ? "HEALTHY" : llmVerdict === "RUNTIME_LLM_CALLS != 0" ? "ERROR" : "UNKNOWN",
  };

  return {
    checkedAt: inputs.nowIso,
    overall: rollUp(Object.values(areas)),
    areas,
    scheduler: {
      severity: areas.scheduler,
      entries: inputs.scheduler.entries,
      duplicateSchedulers: inputs.scheduler.duplicateSchedulers,
      unroutedWorkerCrons: inputs.scheduler.unroutedWorkerCrons,
      missingRoutedWorkflows: inputs.scheduler.missingRoutedWorkflows,
      undispatchableRoutes: inputs.scheduler.undispatchableRoutes,
      manualOnly: inputs.scheduler.manualOnly,
    },
    docDrift: [...inputs.docDrift],
    sources: [...inputs.sources],
    incidents: {
      total: inputs.incidents.length,
      unresolved: unresolvedIncidents(inputs.incidents).length,
      repeat: repeatIncidents(inputs.incidents).length,
      rows: [...inputs.incidents],
    },
    watchdog: inputs.watchdog,
    quota: [...inputs.quota],
    forecast: [...inputs.forecast],
    improvements: rankImprovements({
      incidents: inputs.incidents,
      scheduler: inputs.scheduler,
      watchdog: inputs.watchdog,
      docDrift: inputs.docDrift,
      unwiredDefences: inputs.unwiredDefences,
    }),
    runtimeLlm: { ...inputs.runtimeLlm, verdict: llmVerdict },
  };
}

/**
 * Human-readable summary.
 *
 * Assembled from measured values only — there is no template that could print a
 * claim the report does not contain, and nothing generates prose. The first line
 * is the overall verdict plus the area that forced it, because that is the one
 * thing a reader scanning a CI log needs.
 */
export function summarizeHealthReport(report: HealthReport): string {
  const lines: string[] = [];
  const blame = Object.entries(report.areas)
    .filter(([, severity]) => severity === report.overall)
    .map(([area]) => area);
  lines.push(`KORETAIL operational health: ${report.overall}${report.overall === "HEALTHY" ? "" : ` (${blame.join(", ")})`}`);
  lines.push(`checked at ${report.checkedAt}`);
  lines.push("");

  lines.push("AREAS");
  for (const [area, severity] of Object.entries(report.areas)) lines.push(`  ${area.padEnd(11)} ${severity}`);
  lines.push("");

  lines.push(`SCHEDULER (${report.scheduler.severity})`);
  for (const entry of report.scheduler.entries) {
    const cron = entry.cron ? ` cron=${entry.cron}` : "";
    const notes = entry.notes.length ? ` [${entry.notes.join("; ")}]` : "";
    lines.push(`  ${entry.driver.padEnd(13)} ${entry.workflow.padEnd(34)} ${entry.enablement}${cron}${notes}`);
  }
  for (const cron of report.scheduler.unroutedWorkerCrons) lines.push(`  ! Worker cron routes to nothing: ${cron}`);
  for (const file of report.scheduler.missingRoutedWorkflows) lines.push(`  ! Worker routes to a missing workflow: ${file}`);
  for (const file of report.scheduler.undispatchableRoutes) lines.push(`  ! Worker routes to a workflow without workflow_dispatch: ${file}`);
  lines.push("");

  if (report.docDrift.length) {
    lines.push("DOC DRIFT");
    for (const drift of report.docDrift) {
      lines.push(`  ${drift.contradicted ? "CONTRADICTED" : drift.present ? "consistent  " : "absent      "} ${drift.file}: ${drift.claim}`);
    }
    lines.push("");
  }

  lines.push(`SOURCES (${report.areas.sources})`);
  if (!report.sources.length) lines.push("  no source was checked, so nothing about the collectors is known");
  for (const source of report.sources) {
    lines.push(`  ${source.severity.padEnd(8)} ${source.sourceId.padEnd(44)} reached=${source.walk.reached} state=${source.walk.state}`);
    const last = source.walk.trail[source.walk.trail.length - 1];
    if (source.walk.state !== "HEALTHY" && last) lines.push(`           └ ${last.stage}: ${last.evidence}`);
  }
  lines.push("");

  lines.push(`INCIDENTS (${report.areas.incidents}) total=${report.incidents.total} unresolved=${report.incidents.unresolved} repeat=${report.incidents.repeat}`);
  for (const incident of report.incidents.rows.filter((row) => row.currentState !== "RESOLVED")) {
    lines.push(`  ${incident.severity.padEnd(6)} ${incident.currentState.padEnd(22)} x${incident.occurrenceCount} ${incident.fingerprint}`);
  }
  lines.push("");

  lines.push(`WATCHDOG (${report.watchdog.severity})`);
  for (const beat of report.watchdog.beats) lines.push(`  ${beat.state.padEnd(11)} ${beat.name.padEnd(34)} ${beat.detail}`);
  for (const scope of report.watchdog.unobservableScope) lines.push(`  WATCHDOG_COVERAGE_GAP: ${scope}`);
  lines.push("");

  lines.push(`QUOTA (${report.areas.quota})`);
  for (const verdict of report.quota) lines.push(`  ${verdict.level.padEnd(10)} ${verdict.resource.padEnd(28)} ${verdict.detail}`);
  lines.push("");

  lines.push(`FORECAST / OUTCOME (${report.areas.forecast})`);
  for (const verdict of report.forecast) {
    lines.push(`  ${verdict.state.padEnd(36)} ${verdict.targetDate} claim_allowed=${verdict.performanceClaimAllowed}`);
  }
  lines.push("");

  lines.push("IMPROVEMENT CANDIDATES (deterministic ranking, no automatic code change)");
  if (!report.improvements.length) lines.push("  none");
  for (const candidate of report.improvements) lines.push(`  ${candidate.priority} ${candidate.title}`);
  lines.push("");

  lines.push(report.runtimeLlm.verdict);
  lines.push(`  scanned ${report.runtimeLlm.scannedFileCount} files; offending dependencies ${report.runtimeLlm.offendingDependencies.length}; offending files ${report.runtimeLlm.offendingFiles.length}`);
  for (const path of report.runtimeLlm.exemptedPaths ?? []) lines.push(`  declared exemption (holds the pattern table itself): ${path}`);
  for (const finding of report.runtimeLlm.offendingFiles) lines.push(`  ! runtime model use in ${finding}`);
  return lines.join("\n");
}
