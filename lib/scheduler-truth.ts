/**
 * What is ACTUALLY scheduled — derived from configuration, never from prose.
 *
 * The problem this solves
 * ──────────────────────
 * On 2026-09-11 an audit of this repository found `CLAUDE.md` and `AGENTS.md`
 * both asserting "Worker Cron has been removed" and "the prepared scheduler is
 * disabled-by-default", while `wrangler.production.jsonc` carried five live
 * Production Cron expressions and `collect-production.yml` carried an active
 * `schedule:` block. Five collectors were being driven by the very mechanism
 * the instruction files said no longer existed.
 *
 * Nothing in the codebase could have caught that, because every statement
 * about the schedule lived in prose. This module replaces prose with a
 * derivation: the scheduler graph is computed from the workflow files and the
 * Wrangler config, so a document that disagrees is provably wrong rather than
 * merely old.
 *
 * 문서 존재 ≠ 구현됨, 코드 존재 ≠ 연결됨, 워크플로 존재 ≠ 실제 예약됨.
 *
 * Deliberately narrow parsing
 * ───────────────────────────
 * This reads the workflow YAML with targeted line scans rather than a YAML
 * parser, because adding a parser dependency to satisfy an audit tool is the
 * wrong trade for a zero-cost project. The scan is restricted to shapes this
 * repository actually uses and every shape it recognises is asserted in
 * tests/scheduler-truth.test.mjs against the real workflow files — so a future
 * workflow written in a shape this cannot read shows up as UNKNOWN, not as
 * "no schedule".
 */

/**
 * Whether a declared schedule will actually start work.
 *
 * The four-way split exists because `collect-production.yml` has a real cron
 * AND `if: vars.ENABLE_PRODUCTION_COLLECTOR == 'true'`. GitHub Actions
 * Variables are account/repository state that is not in the repository, so a
 * checkout cannot tell enabled from disabled. Reporting either one would be a
 * guess; `RUNTIME_ENABLE_STATE_UNKNOWN` is the honest answer and, per
 * lib/operational-states.ts, it blocks HEALTHY instead of passing silently.
 */
export type RuntimeEnablement =
  | "SCHEDULE_DEFINED"
  | "RUNTIME_ENABLED"
  | "RUNTIME_DISABLED"
  | "RUNTIME_ENABLE_STATE_UNKNOWN";

/** How a workflow can be started. */
export type TriggerKind = "schedule" | "workflow_dispatch" | "workflow_call" | "workflow_run" | "push" | "pull_request";

export interface WorkflowFacts {
  /** File name as it appears in .github/workflows. */
  file: string;
  name: string;
  triggers: TriggerKind[];
  /** Cron expressions in active (non-commented) `- cron:` entries. */
  crons: string[];
  /** `if:` gate expressions referencing repository/environment Variables. */
  variableGates: string[];
  /** Workflows named in a `workflow_run.workflows` list, if any. */
  upstreamWorkflows: string[];
}

const COMMENT_ONLY = /^\s*#/;

function activeLines(yaml: string): string[] {
  return yaml.split(/\r?\n/).filter((line) => !COMMENT_ONLY.test(line));
}

/**
 * Extracts the scheduling facts of one workflow file.
 *
 * `crons` only counts `- cron:` entries on lines that are not comments, so a
 * schedule commented out at activation (the REALTIME group, per
 * docs/REALTIME_SCHEDULER_AUDIT.md) correctly reads as unscheduled rather than
 * as a duplicate of the Worker trigger.
 */
export function readWorkflowFacts(file: string, yaml: string): WorkflowFacts {
  const lines = activeLines(yaml);
  const body = lines.join("\n");
  const crons: string[] = [];
  for (const line of lines) {
    const match = /^\s*-\s*cron:\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    crons.push(match[1].replace(/^['"]|['"]$/g, "").trim());
  }

  const triggers: TriggerKind[] = [];
  const candidates: TriggerKind[] = ["schedule", "workflow_dispatch", "workflow_call", "workflow_run", "push", "pull_request"];
  for (const candidate of candidates) {
    // Trigger keys sit at one or two spaces of indentation directly under `on:`.
    if (new RegExp(`^\\s{1,4}${candidate}:`, "m").test(body)) triggers.push(candidate);
  }

  const variableGates: string[] = [];
  for (const line of lines) {
    if (!/^\s*if:/.test(line)) continue;
    if (!/\bvars\./.test(line)) continue;
    variableGates.push(line.replace(/^\s*if:\s*/, "").trim());
  }

  const upstreamWorkflows: string[] = [];
  const runBlock = /workflow_run:[\s\S]*?workflows:\s*(\[[^\]]*\]|(?:\n\s*-\s*.+)+)/.exec(body);
  if (runBlock) {
    const raw = runBlock[1].trim();
    if (raw.startsWith("[")) {
      // A YAML flow sequence, whose items may be unquoted and may contain spaces:
      // `workflows: [Deploy Cloudflare]` is how both chained workflows in this
      // repository are written, so splitting on commas is the only reading that
      // recovers the name.
      for (const item of raw.slice(1, -1).split(",")) {
        const name = item.trim().replace(/^['"]|['"]$/g, "");
        if (name) upstreamWorkflows.push(name);
      }
    } else {
      for (const match of raw.matchAll(/^\s*-\s*(.+)$/gm)) {
        const name = match[1].trim().replace(/^['"]|['"]$/g, "");
        if (name) upstreamWorkflows.push(name);
      }
    }
  }

  const nameMatch = /^name:\s*(.+)$/m.exec(body);
  return {
    file,
    name: (nameMatch?.[1] ?? file).replace(/^['"]|['"]$/g, "").trim(),
    triggers,
    crons,
    variableGates,
    upstreamWorkflows: [...new Set(upstreamWorkflows)],
  };
}

/**
 * Classifies whether a declared schedule actually runs.
 *
 * `knownVariables` is for a caller that genuinely has the Actions Variable
 * values — a workflow step can echo them into the harness. A checkout cannot,
 * and passing `undefined` is the normal case, so the default answer for a
 * gated schedule is UNKNOWN.
 */
export function classifyRuntimeEnablement(
  facts: WorkflowFacts,
  knownVariables?: Readonly<Record<string, string>>,
): RuntimeEnablement {
  if (!facts.crons.length) return "SCHEDULE_DEFINED";
  if (!facts.variableGates.length) return "RUNTIME_ENABLED";

  const referenced = new Set<string>();
  for (const gate of facts.variableGates) {
    for (const match of gate.matchAll(/\bvars\.([A-Za-z_][A-Za-z0-9_]*)/g)) referenced.add(match[1]);
  }
  if (!knownVariables) return "RUNTIME_ENABLE_STATE_UNKNOWN";

  let sawAll = true;
  for (const name of referenced) {
    const value = knownVariables[name];
    if (value === undefined) {
      sawAll = false;
      continue;
    }
    // Every gate in this repository is `== 'true'`; anything else is disabled.
    if (value !== "true") return "RUNTIME_DISABLED";
  }
  return sawAll ? "RUNTIME_ENABLED" : "RUNTIME_ENABLE_STATE_UNKNOWN";
}

export interface SchedulerEntry {
  /** The logical job: the workflow that does the work. */
  workflow: string;
  /** Who fires it. */
  driver: "WORKER_CRON" | "GITHUB_CRON" | "WORKFLOW_RUN" | "WORKFLOW_CALL" | "MANUAL_ONLY";
  /** Cron expression when there is one. */
  cron: string | null;
  enablement: RuntimeEnablement;
  /** Non-empty when this workflow is started by more than one scheduler. */
  notes: string[];
}

export interface SchedulerTruth {
  entries: SchedulerEntry[];
  /** A workflow fired by two independent schedulers — the duplicate-live-scheduler ban. */
  duplicateSchedulers: string[];
  /** A Worker Cron expression that routes to nothing. */
  unroutedWorkerCrons: string[];
  /** A routed workflow the Worker names that does not exist in the repository. */
  missingRoutedWorkflows: string[];
  /** A Worker route whose target workflow lacks `workflow_dispatch`. */
  undispatchableRoutes: string[];
  /** Every workflow that nothing can start on a schedule. */
  manualOnly: string[];
}

export interface SchedulerInputs {
  workflows: readonly WorkflowFacts[];
  /** Cron expressions configured on the production Worker. */
  workerCrons: readonly string[];
  /** Worker cron → workflow file, from lib/realtime-dispatch.ts. */
  cronRouting: (cron: string) => string | null;
  knownVariables?: Readonly<Record<string, string>>;
}

/**
 * Builds the real scheduler graph.
 *
 * The graph answers the three questions a status page cannot answer from
 * prose: what fires each collector, whether that firing is actually live, and
 * whether any collector is fired twice (which the engineering direction
 * forbids, because two live schedulers for one source double provider load
 * and make "who wrote this row" unanswerable).
 */
export function buildSchedulerTruth(inputs: SchedulerInputs): SchedulerTruth {
  const byFile = new Map(inputs.workflows.map((facts) => [facts.file, facts]));
  const entries: SchedulerEntry[] = [];
  const unroutedWorkerCrons: string[] = [];
  const missingRoutedWorkflows: string[] = [];
  const undispatchableRoutes: string[] = [];

  for (const cron of inputs.workerCrons) {
    const target = inputs.cronRouting(cron);
    if (!target) {
      unroutedWorkerCrons.push(cron);
      continue;
    }
    const facts = byFile.get(target);
    if (!facts) {
      missingRoutedWorkflows.push(target);
      continue;
    }
    // A Worker route can only start a workflow that accepts workflow_dispatch.
    if (!facts.triggers.includes("workflow_dispatch")) undispatchableRoutes.push(target);
    entries.push({
      workflow: target,
      driver: "WORKER_CRON",
      cron,
      // The Worker dispatch itself is not gated by an Actions Variable, but the
      // JOB it starts is. A dispatch that lands on a skipped job is a run that
      // did not happen, so the workflow's own gate decides the enablement.
      enablement: facts.variableGates.length
        ? classifyRuntimeEnablement({ ...facts, crons: [cron] }, inputs.knownVariables)
        : "RUNTIME_ENABLED",
      notes: [],
    });
  }

  for (const facts of inputs.workflows) {
    for (const cron of facts.crons) {
      entries.push({
        workflow: facts.file,
        driver: "GITHUB_CRON",
        cron,
        enablement: classifyRuntimeEnablement({ ...facts, crons: [cron] }, inputs.knownVariables),
        notes: [],
      });
    }
    if (facts.upstreamWorkflows.length) {
      entries.push({
        workflow: facts.file,
        driver: "WORKFLOW_RUN",
        cron: null,
        enablement: "SCHEDULE_DEFINED",
        notes: [`started after: ${facts.upstreamWorkflows.join(", ")}`],
      });
    }
    if (facts.triggers.includes("workflow_call")) {
      entries.push({ workflow: facts.file, driver: "WORKFLOW_CALL", cron: null, enablement: "SCHEDULE_DEFINED", notes: [] });
    }
  }

  // A workflow is duplicately scheduled only when two TIMED schedulers fire it.
  // workflow_run and workflow_call are consequences of another run, not
  // independent alarm clocks, so they never count as a duplicate.
  const timedDrivers = new Set(["WORKER_CRON", "GITHUB_CRON"]);
  const timedByWorkflow = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (!timedDrivers.has(entry.driver)) continue;
    const seen = timedByWorkflow.get(entry.workflow) ?? new Set<string>();
    seen.add(entry.driver);
    timedByWorkflow.set(entry.workflow, seen);
  }
  const duplicateSchedulers = [...timedByWorkflow.entries()]
    .filter(([, drivers]) => drivers.size > 1)
    .map(([workflow]) => workflow);
  for (const entry of entries) {
    if (duplicateSchedulers.includes(entry.workflow) && timedDrivers.has(entry.driver)) {
      entry.notes.push("DUPLICATE_LIVE_SCHEDULER");
    }
  }

  // A reusable `workflow_call` workflow IS started by something — its caller —
  // so listing it as manual-only would read as "nothing runs this", which is the
  // opposite of true for collect-attempt.yml.
  const scheduled = new Set(entries.map((entry) => entry.workflow));
  const manualOnly = inputs.workflows
    .filter((facts) => !scheduled.has(facts.file))
    .map((facts) => facts.file);
  for (const file of manualOnly) {
    entries.push({ workflow: file, driver: "MANUAL_ONLY", cron: null, enablement: "SCHEDULE_DEFINED", notes: [] });
  }

  return {
    entries,
    duplicateSchedulers,
    unroutedWorkerCrons,
    missingRoutedWorkflows,
    undispatchableRoutes,
    manualOnly,
  };
}

/**
 * Drift between a claim written in a document and the derived graph.
 *
 * Only claims that can be mechanically checked are listed. "Worker Cron has
 * been removed" is checkable — there either are configured expressions or
 * there are not. A claim like "the hybrid model is safe" is not, and
 * docs/ZERO_COST_HYBRID_AUDIT.md owns that one.
 */
export interface DocClaim {
  file: string;
  /** Text that, if present, asserts the claim. */
  pattern: RegExp;
  claim: string;
  /** Returns true when the derived graph contradicts the claim. */
  contradictedBy: (truth: SchedulerTruth) => boolean;
}

export const SCHEDULER_DOC_CLAIMS: DocClaim[] = [
  {
    file: "CLAUDE.md",
    pattern: /Worker Cron has been removed/i,
    claim: "Worker Cron has been removed",
    contradictedBy: (truth) => truth.entries.some((entry) => entry.driver === "WORKER_CRON"),
  },
  {
    file: "AGENTS.md",
    pattern: /Do not restore Worker Cron in parallel/i,
    claim: "Worker Cron is not in use",
    contradictedBy: (truth) => truth.entries.some((entry) => entry.driver === "WORKER_CRON"),
  },
];

export interface DocDrift {
  file: string;
  claim: string;
  present: boolean;
  contradicted: boolean;
}

export function findDocDrift(
  documents: Readonly<Record<string, string>>,
  truth: SchedulerTruth,
  claims: readonly DocClaim[] = SCHEDULER_DOC_CLAIMS,
): DocDrift[] {
  return claims.map((entry) => {
    const present = entry.pattern.test(documents[entry.file] ?? "");
    return { file: entry.file, claim: entry.claim, present, contradicted: present && entry.contradictedBy(truth) };
  });
}

/**
 * Longest gap between two firings of a cron expression, in milliseconds.
 *
 * The MAXIMUM gap, not the average, because the gap is used to decide when a run
 * is overdue. `25,40 2,5,8,11,14,17,20,23 * * *` fires twice 15 minutes apart and
 * then not for 165; judging it by the 15 would report a missed run eight times a
 * day. Averaging would be worse still — it would invent a cadence the schedule
 * never has.
 *
 * Supports the field shapes this repository uses: `*`, a comma list, and a
 * single value, in the minute, hour and day-of-week positions. Anything else
 * returns null, which propagates as "cadence not derivable" and therefore as
 * UNKNOWN rather than as a guessed threshold.
 */
export function cronMaxIntervalMs(expression: string): number | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minuteField, hourField, domField, monthField, dowField] = fields;

  const parseList = (field: string, min: number, max: number): number[] | null => {
    if (field === "*") return Array.from({ length: max - min + 1 }, (_, index) => min + index);
    if (!/^\d+(,\d+)*$/.test(field)) return null;
    const values = [...new Set(field.split(",").map(Number))].sort((a, b) => a - b);
    return values.every((value) => value >= min && value <= max) ? values : null;
  };

  const minutes = parseList(minuteField, 0, 59);
  const hours = parseList(hourField, 0, 23);
  if (!minutes || !hours) return null;
  // Day-of-month and month restrictions make the cadence monthly or rarer; this
  // repository has none, and guessing one would be worse than declining.
  if (domField !== "*" || monthField !== "*") return null;
  const days = parseList(dowField, 0, 6);
  if (!days) return null;

  const firings: number[] = [];
  for (const day of days) for (const hour of hours) for (const minute of minutes) {
    firings.push(day * 1_440 + hour * 60 + minute);
  }
  if (firings.length < 1) return null;
  firings.sort((a, b) => a - b);
  // The cycle is a week when day-of-week is restricted, otherwise a day. The
  // wrap-around gap (last firing to the first of the next cycle) is a real gap
  // and is the largest one for a once-a-day schedule, so it must be included.
  const cycleMinutes = days.length === 7 ? 1_440 : 7 * 1_440;
  const normalized = days.length === 7 ? firings.map((value) => value % 1_440) : firings;
  const unique = [...new Set(normalized)].sort((a, b) => a - b);
  let longest = cycleMinutes - unique[unique.length - 1] + unique[0];
  for (let index = 1; index < unique.length; index += 1) {
    longest = Math.max(longest, unique[index] - unique[index - 1]);
  }
  return longest * 60_000;
}
