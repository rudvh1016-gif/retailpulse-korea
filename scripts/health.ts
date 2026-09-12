/**
 * `npm run health` — the single operational entry point.
 *
 * What it does with no credentials (the normal case)
 * ─────────────────────────────────────────────────
 * Everything derivable from a checkout: the real scheduler graph, the drift
 * between that graph and what the instruction files claim, the runtime-LLM
 * scan, the watchdog's own coverage gaps, and the unwired-defence inventory.
 * Live collector state is NOT derivable from a checkout, so `sources` is empty
 * and the overall verdict is UNKNOWN. That is the correct answer: a checkout
 * cannot know whether production collected anything this morning, and printing
 * HEALTHY from one would be exactly the lie the harness exists to prevent.
 *
 * With Production D1 credentials (`CLOUDFLARE_D1_WRITE_TOKEN` or
 * `CLOUDFLARE_API_TOKEN`) it additionally reads `collector_runs` and
 * `source_health` — SELECT only — and evaluates each source through the
 * lifecycle. It performs ZERO provider calls, ZERO writes and ZERO deploys, so
 * it is safe to run against production at any time.
 *
 * Usage:
 *   npm run health              human-readable summary
 *   npm run health -- --json    the same report as JSON
 */
import { readFile, readdir } from "node:fs/promises";

import { CloudflareD1RestDatabase } from "../lib/d1-rest";
import { DIAGNOSTIC_SOURCE_IDS, sanitizeProductionDetail } from "../lib/production-diagnostics";
import { PRODUCTION_CRONS, workflowForCron } from "../lib/realtime-dispatch";
import {
  buildSchedulerTruth,
  cronMaxIntervalMs,
  findDocDrift,
  readWorkflowFacts,
  type SchedulerTruth,
  type WorkflowFacts,
} from "../lib/scheduler-truth";
import { buildHealthReport, summarizeHealthReport, type HealthInputs } from "../lib/operational-health";
import { applyIncidentEvents, type IncidentEvent } from "../lib/incident-ledger";
import { evaluateSource, type SourceObservation, type SourceVerdict } from "../lib/source-lifecycle";
import { buildWatchdogReport, type Heartbeat } from "../lib/watchdog";
import { observeQuota, type QuotaObservation, type QuotaVerdict } from "../lib/quota-observation";
import { scanForRuntimeLlm, isScannableProductionPath } from "../lib/runtime-llm-scan";
import { resolveProductionDatabaseConfig } from "./production-database";

const repoRoot = new URL("../", import.meta.url);
const wantsJson = process.argv.includes("--json");

async function readText(relative: string): Promise<string> {
  return readFile(new URL(relative, repoRoot), "utf8");
}

async function loadWorkflows(): Promise<WorkflowFacts[]> {
  const dir = new URL(".github/workflows/", repoRoot);
  const names = (await readdir(dir)).filter((name) => /\.ya?ml$/.test(name)).sort();
  return Promise.all(names.map(async (name) => readWorkflowFacts(name, await readFile(new URL(name, dir), "utf8"))));
}

/** Every source file a runtime-LLM scan must see, walked once. */
async function loadProductionSources(): Promise<Array<{ path: string; content: string }>> {
  const collected: Array<{ path: string; content: string }> = [];
  const skip = /^(node_modules|dist|\.next|\.git|\.wrangler|\.playwright-browsers|coverage|tests|e2e)$/;
  async function walk(relative: string): Promise<void> {
    const entries = await readdir(new URL(relative, repoRoot), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (skip.test(entry.name)) continue;
        await walk(`${relative}${entry.name}/`);
        continue;
      }
      const path = `${relative}${entry.name}`;
      if (!isScannableProductionPath(path)) continue;
      collected.push({ path, content: await readFile(new URL(path, repoRoot), "utf8") });
    }
  }
  await walk("");
  return collected;
}

/**
 * Cadence per source, derived from the scheduler graph rather than declared.
 *
 * A source driven by two entries takes the tighter cadence, because the product
 * expects data at the faster rate. A source with no timed driver has no cadence,
 * which stays null and surfaces as UNKNOWN instead of as a threshold someone
 * made up.
 */
function cadenceByWorkflow(truth: SchedulerTruth): Map<string, number> {
  const cadence = new Map<string, number>();
  for (const entry of truth.entries) {
    if (!entry.cron) continue;
    const interval = cronMaxIntervalMs(entry.cron);
    if (interval === null) continue;
    const existing = cadence.get(entry.workflow);
    cadence.set(entry.workflow, existing === undefined ? interval : Math.min(existing, interval));
  }
  return cadence;
}

/**
 * Which workflow collects which canonical source id.
 *
 * Read from the workflows' own `RPK_PRODUCTION_SOURCES` / `RPK_REALTIME_SOURCES`
 * environment lines and mapped through `DIAGNOSTIC_SOURCE_IDS`, so this table
 * cannot drift from what the collectors are actually told to collect. A source
 * no workflow names is reported with no job rather than silently dropped.
 */
function sourceToWorkflow(workflows: readonly WorkflowFacts[], rawYaml: Map<string, string>): Map<string, string> {
  const mapping = new Map<string, string>();
  for (const facts of workflows) {
    const yaml = rawYaml.get(facts.file) ?? "";
    for (const match of yaml.matchAll(/RPK_(?:PRODUCTION|REALTIME)_SOURCES:\s*(.+)/g)) {
      const names = match[1].replace(/^['"]|['"]$/g, "").split(",").map((value) => value.trim()).filter(Boolean);
      for (const name of names) {
        const sourceId = (DIAGNOSTIC_SOURCE_IDS as Record<string, string>)[name];
        if (sourceId && !mapping.has(sourceId)) mapping.set(sourceId, facts.file);
      }
    }
  }
  return mapping;
}

interface RunRow {
  source_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  records_read: number;
  records_written: number;
  detail: string | null;
}

interface HealthRow {
  source_id: string;
  status: string;
  last_retrieved_at: string | null;
  consecutive_failures: number;
}

/**
 * Reads live collector state, or returns null when no credentials are present.
 *
 * Returning null rather than throwing is deliberate: a developer running
 * `npm run health` locally should get the offline half of the report, not an
 * error, and the report then says plainly that source state is UNKNOWN.
 */
async function readLiveState(): Promise<{ runs: RunRow[]; health: HealthRow[] } | null> {
  let config: ReturnType<typeof resolveProductionDatabaseConfig>;
  try {
    config = resolveProductionDatabaseConfig("production");
  } catch {
    return null;
  }
  const database = new CloudflareD1RestDatabase(config.accountId, config.databaseId, config.apiToken);
  // Bounded, SELECT-only, and ordered so one row per source is the latest run.
  const runs = await database
    .prepare(`SELECT source_id, status, started_at, finished_at, records_read, records_written, detail
      FROM collector_runs ORDER BY started_at DESC LIMIT 400`)
    .all<RunRow>();
  const health = await database
    .prepare(`SELECT source_id, status, last_retrieved_at, consecutive_failures FROM source_health ORDER BY source_id`)
    .all<HealthRow>();
  return { runs: runs.results ?? [], health: health.results ?? [] };
}

function buildSourceVerdicts(
  live: { runs: RunRow[]; health: HealthRow[] },
  jobBySource: Map<string, string>,
  cadence: Map<string, number>,
  truth: SchedulerTruth,
  nowIso: string,
): SourceVerdict[] {
  const latestRun = new Map<string, RunRow>();
  for (const row of live.runs) if (!latestRun.has(row.source_id)) latestRun.set(row.source_id, row);
  const healthById = new Map(live.health.map((row) => [row.source_id, row]));
  const enablementByWorkflow = new Map(truth.entries.filter((entry) => entry.cron).map((entry) => [entry.workflow, entry.enablement]));

  const sourceIds = [...new Set([...healthById.keys(), ...latestRun.keys()])].sort();
  return sourceIds.map((sourceId) => {
    const job = jobBySource.get(sourceId) ?? "unmapped";
    const run = latestRun.get(sourceId);
    const health = healthById.get(sourceId);
    const observation: SourceObservation = {
      sourceId,
      job,
      enablement: enablementByWorkflow.get(job) ?? "SCHEDULE_DEFINED",
      expectedIntervalMs: cadence.get(job) ?? null,
      lastRun: run
        ? {
            status: run.status,
            startedAt: run.started_at,
            finishedAt: run.finished_at,
            recordsRead: Number(run.records_read ?? 0),
            recordsWritten: Number(run.records_written ?? 0),
            detail: run.detail ? sanitizeProductionDetail(run.detail) : null,
          }
        : null,
      health: health
        ? {
            status: health.status,
            lastRetrievedAt: health.last_retrieved_at,
            consecutiveFailures: Number(health.consecutive_failures ?? 0),
          }
        : null,
      // Storage and publication are measured by the coverage probes and the
      // public smoke, neither of which this entry point runs. Left unmeasured on
      // purpose so the verdict stops at UNKNOWN rather than claiming PUBLISHED.
      storedRows: null,
      storageReadFailed: false,
      published: null,
    };
    return evaluateSource(observation, nowIso);
  });
}

const nowIso = new Date().toISOString();
const workflows = await loadWorkflows();
const rawYaml = new Map<string, string>(
  await Promise.all(workflows.map(async (facts) => [facts.file, await readText(`.github/workflows/${facts.file}`)] as const)),
);

const truth = buildSchedulerTruth({
  workflows,
  workerCrons: PRODUCTION_CRONS,
  cronRouting: (cron) => workflowForCron(cron),
});

const docDrift = findDocDrift(
  { "CLAUDE.md": await readText("CLAUDE.md"), "AGENTS.md": await readText("AGENTS.md") },
  truth,
);

const packageJson = JSON.parse(await readText("package.json")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const runtimeLlm = scanForRuntimeLlm(await loadProductionSources(), [
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {}),
]);

/**
 * Heartbeats, one per timed scheduler group.
 *
 * `observedByIndependentPlatform` is true only where a job on the OTHER platform
 * can see this one: the Worker-dispatched collectors leave Actions runs that an
 * Actions job can read, and the Actions cron group leaves D1 rows a Worker could
 * read. Nothing observes the platforms themselves, which is why
 * lib/watchdog.ts reports a permanent coverage gap regardless of these values.
 */
const heartbeats: Heartbeat[] = truth.entries
  .filter((entry) => entry.cron)
  .map((entry) => ({
    name: `${entry.driver}:${entry.workflow}`,
    lastSeenAt: null,
    expectedIntervalMs: entry.cron ? cronMaxIntervalMs(entry.cron) : null,
    observedByIndependentPlatform: entry.driver === "WORKER_CRON",
  }));

const cadence = cadenceByWorkflow(truth);
const jobBySource = sourceToWorkflow(workflows, rawYaml);
const live = await readLiveState();
const sources = live ? buildSourceVerdicts(live, jobBySource, cadence, truth, nowIso) : [];

if (live) {
  // A heartbeat is only real when something recorded an execution. With live
  // state, each group's most recent run supplies it.
  const latestByWorkflow = new Map<string, string>();
  for (const row of live.runs) {
    const job = jobBySource.get(row.source_id);
    if (!job) continue;
    const existing = latestByWorkflow.get(job);
    if (!existing || Date.parse(row.started_at) > Date.parse(existing)) latestByWorkflow.set(job, row.started_at);
  }
  for (const beat of heartbeats) {
    const workflow = beat.name.split(":")[1];
    beat.lastSeenAt = latestByWorkflow.get(workflow) ?? null;
  }
}

/**
 * Quota resources this project is actually bound by.
 *
 * Every one is OBSERVE_ONLY today: there is no free, authenticated usage API
 * that this harness may call for Workers requests, D1 rows read/written or the
 * data.go.kr daily call ceiling. `observeQuota` therefore reports UNKNOWN, which
 * keeps the overall verdict off HEALTHY — the honest consequence of having
 * guardrail thresholds with nothing measuring them.
 */
const quota: QuotaVerdict[] = ([
  { resource: "cloudflare_workers_requests", used: null, limit: 100_000, basis: "UNKNOWN", measurementSource: null },
  { resource: "cloudflare_d1_rows_read", used: null, limit: 5_000_000, basis: "UNKNOWN", measurementSource: null },
  { resource: "cloudflare_d1_rows_written", used: null, limit: 100_000, basis: "UNKNOWN", measurementSource: null },
  { resource: "data_go_kr_daily_calls", used: null, limit: 500, basis: "UNKNOWN", measurementSource: null },
] satisfies QuotaObservation[]).map(observeQuota);

/**
 * Defences that exist in code and are wired to nothing.
 *
 * Derived, not asserted: a module with no importer outside `tests/` is reported,
 * so a future wiring of `lib/quota-guard.ts` removes this entry by itself rather
 * than needing someone to remember to delete it.
 */
const allSources = await loadProductionSources();
const unwiredDefences = (
  [
    { module: "lib/quota-guard.ts", symbol: "quota-guard", detail: "the 70/85/95 guardrail thresholds are implemented and tested but consulted by no production code path" },
  ] as const
).filter((candidate) => !allSources.some((file) => file.path !== candidate.module && file.content.includes(candidate.symbol)));

/**
 * The ledger for this run.
 *
 * Folded from the source verdicts rather than stored, because nothing persists
 * it yet: a single run can therefore only ever report `occurrenceCount: 1`, and
 * the repeat counters stay at zero until the ledger is given a D1 table. That
 * limitation is stated here rather than hidden behind a number that looks like a
 * count but is really "this run". The fingerprinting and the counting rules are
 * the part that is finished and tested.
 */
const incidentEvents: IncidentEvent[] = sources
  .filter((source) => source.failureClass !== null)
  .map((source) => ({
    kind: "FAILURE" as const,
    at: nowIso,
    parts: {
      sourceId: source.sourceId,
      failureClass: source.failureClass!,
      contractVersion: "UNKNOWN_CONTRACT",
      logicalJob: source.job,
    },
    runId: `${source.sourceId}@${nowIso}`,
    evidence: source.walk.trail[source.walk.trail.length - 1]?.evidence ?? "no evidence recorded",
    lastGoodAt: null,
  }));

const inputs: HealthInputs = {
  nowIso,
  scheduler: truth,
  docDrift,
  sources,
  incidents: applyIncidentEvents([], incidentEvents),
  watchdog: buildWatchdogReport(heartbeats, nowIso),
  quota,
  forecast: [],
  runtimeLlm,
  unwiredDefences: unwiredDefences.map((entry) => ({ module: entry.module, detail: entry.detail })),
};

const report = buildHealthReport(inputs);
console.log(wantsJson ? JSON.stringify(report, null, 2) : summarizeHealthReport(report));

// ERROR is the only exit-code failure. UNKNOWN must not fail the command,
// because an offline run is legitimately UNKNOWN and a health command that
// always exits non-zero locally stops being run at all.
if (report.overall === "ERROR") process.exitCode = 1;
