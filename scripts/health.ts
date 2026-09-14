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
 * `source_health`, bounded canonical data and persisted operational memory — SELECT only — and evaluates each source through the
 * lifecycle. It performs ZERO provider calls, ZERO writes and ZERO deploys, so
 * it is safe to run against production at any time.
 *
 * Usage:
 *   npm run health              human-readable summary
 *   npm run health -- --json    the same report as JSON
 *   npm run health:production  also compare two read-only KORETAIL public summaries
 */
import { readFile, readdir } from "node:fs/promises";

import { CloudflareD1RestDatabase } from "../lib/d1-rest";
import { DIAGNOSTIC_SOURCE_IDS } from "../lib/production-diagnostics";
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
import { OperationalMemory } from '../lib/operational-memory';
import { measureSource, sourceObservation, canonicalOperationalJob, verifyPublicMeasurement, readPublicEvidence, type SourceMeasurement } from '../lib/operational-evidence';
import { readForecastEvidence } from '../lib/operational-forecast-evidence';
import { observedUsage, scoreRecoveryAttempts, regressionCandidates, evaluateShadowPolicy, currentActionFor, shadowCandidatesFor } from '../lib/recovery-scorecard';
import { capabilityFor, SOURCE_RECOVERY_CAPABILITIES, PRODUCTION_SOURCE_IDS } from '../lib/recovery-capability';
import { centralRecoveryActivation } from '../lib/operational-recovery-runner';
import { provesIndependentPlatform, classifyTriggerEvidence } from '../lib/trigger-evidence';
import { evaluateSource, type SourceVerdict } from "../lib/source-lifecycle";
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

async function readLiveState() {
  let config: ReturnType<typeof resolveProductionDatabaseConfig>;
  try { config=resolveProductionDatabaseConfig('production'); } catch { return null; }
  const database=new CloudflareD1RestDatabase(config.accountId,config.databaseId,config.apiToken);
  const db=database as unknown as D1Database;
  const health=await database.prepare('SELECT source_id FROM source_health ORDER BY source_id LIMIT 100').all<{source_id:string}>();
  const ids=[...new Set([...Object.values(DIAGNOSTIC_SOURCE_IDS),'SEOUL_CITYDATA_CMRCL',...health.results.map(row=>row.source_id)])];
  const measurements:SourceMeasurement[]=[];
  for(const id of ids)measurements.push(await measureSource(db,id,new Date().toISOString()));
  if(process.argv.includes('--production')) {
    try {const publicBody=await readPublicEvidence(new Date().toISOString());for(const item of measurements)verifyPublicMeasurement(item,publicBody);}
    catch { /* unavailable public measurement remains null; never a false pass */ }
  }
  const memory=new OperationalMemory(db), available=await memory.available();
  const incidents=available?await memory.incidents():[];
  const attempts=available?(await Promise.all(ids.map(id=>memory.attempts(id,new Date(Date.now()-30*86400000).toISOString().slice(0,10))))).flat():[];
  const usage=available?(await database.prepare('SELECT * FROM operational_usage_daily WHERE day=? ORDER BY source_id').bind(new Date().toISOString().slice(0,10)).all()).results:[];
  const states=available?(await database.prepare('SELECT source_id,logical_job,checked_at,last_good_at,execution_platform,trigger_evidence FROM operational_source_state ORDER BY source_id LIMIT 100').all()).results:[];
  const stuck=available?await memory.stuckControlledAttempts(new Date().toISOString()):[];
  const inFlight=available?await memory.inFlightControlled():[];
  let forecast: Awaited<ReturnType<typeof readForecastEvidence>>=[];
  try {forecast=await readForecastEvidence(db,new Date().toISOString());}catch {forecast=[{targetDate:new Date().toISOString().slice(0,10),state:'UNKNOWN',performanceClaimAllowed:false,detail:'forecast evidence query unavailable'}];}
  return {measurements,incidents,attempts,usage,states,forecast,stuck,inFlight,memoryState:available?'PERSISTED_READ':'DORMANT_MIGRATION_UNAVAILABLE'};
}

const nowIso = new Date().toISOString();
const workflows = await loadWorkflows();
const rawYaml = new Map<string, string>(
  await Promise.all(workflows.map(async (facts) => [facts.file, await readText(`.github/workflows/${facts.file}`)] as const)),
);

/**
 * Actions Variables this run genuinely knows the value of.
 *
 * `classifyRuntimeEnablement` has always accepted `knownVariables`; nothing ever
 * passed them, so every gated schedule reported RUNTIME_ENABLE_STATE_UNKNOWN
 * even inside the Production environment that can read the Variable. A workflow
 * step echoes the one Variable that gates a schedule into
 * `RPK_KNOWN_ENABLE_PRODUCTION_COLLECTOR`, and only that name is read here —
 * arbitrary repository Variables are never harvested, and no secret is involved.
 *
 * The purpose is NOT to remove UNKNOWN. A local checkout and an ordinary CI run
 * still pass nothing and still report UNKNOWN, which remains the correct answer
 * there. The purpose is to stop reporting UNKNOWN in the one environment that
 * actually knows.
 */
const knownVariables = Object.fromEntries(
  ([["ENABLE_PRODUCTION_COLLECTOR", process.env.RPK_KNOWN_ENABLE_PRODUCTION_COLLECTOR]] as const)
    .flatMap(([name, value]) => (value === "true" || value === "false" ? [[name, value] as const] : [])),
);

const truth = buildSchedulerTruth({
  workflows,
  workerCrons: PRODUCTION_CRONS,
  cronRouting: (cron) => workflowForCron(cron),
  knownVariables: Object.keys(knownVariables).length ? knownVariables : undefined,
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
 * Independence is DERIVED from the trigger evidence rather than written as a
 * literal `false`, so the answer arrives with its reason attached. It is still
 * false everywhere, and that is the honest result: a Worker Cron reaches Actions
 * as a `workflow_dispatch`, which GitHub renders identically to a person
 * clicking Run workflow, so an Actions record proves only that Actions ran. The
 * coverage gap stays open until a receipt the Worker itself signs exists.
 */
const triggerEvidence = classifyTriggerEvidence(process.env);
const independence = provesIndependentPlatform(triggerEvidence);
const heartbeats: Heartbeat[] = truth.entries
  .filter((entry) => entry.cron)
  .map((entry) => ({
    name: `${entry.driver}:${entry.workflow}`,
    lastSeenAt: null,
    expectedIntervalMs: entry.cron ? cronMaxIntervalMs(entry.cron) : null,
    observedByIndependentPlatform: independence.independent,
  }));

const cadence = cadenceByWorkflow(truth);
const jobBySource = sourceToWorkflow(workflows, rawYaml);
const live = await readLiveState();
const sources:SourceVerdict[] = live ? live.measurements.map(item=> {
  const job=canonicalOperationalJob(item.sourceId);
  return evaluateSource(sourceObservation(item,job,cadence.get(job)??null),nowIso);
}) : [];

if (live) {
  // A heartbeat is only real when something recorded an execution. With live
  // state, each group's most recent run supplies it.
  const latestByWorkflow = new Map<string, string>();
  for (const measured of live.measurements) {
    const row=measured.run; if(!row)continue;
    const job = jobBySource.get(measured.sourceId) ?? canonicalOperationalJob(measured.sourceId);
    if (!job) continue;
    const existing = latestByWorkflow.get(job);
    if (!existing || Date.parse(String(row.started_at)) > Date.parse(existing)) latestByWorkflow.set(job, String(row.started_at));
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

// Read-only health never resets/re-writes recurrence. Completion bookkeeping owns writes.
const inputs: HealthInputs = {
  nowIso,
  scheduler: truth,
  docDrift,
  sources,
  incidents: live?.incidents ?? [],
  incidentMemoryAvailable: live?.memoryState === 'PERSISTED_READ',
  watchdog: buildWatchdogReport(heartbeats, nowIso),
  quota,
  forecast: live?.forecast ?? [],
  runtimeLlm,
  unwiredDefences: unwiredDefences.map((entry) => ({ module: entry.module, detail: entry.detail })),
};

/**
 * Shadow evaluation against the rule table, not against a hardcoded string.
 *
 * The previous version passed 'REDISPATCH_SAME_WORKFLOW' as the CURRENT action
 * for every incident. For STALE and PARTIAL_DATA the rule in force is actually
 * REQUEST_ONLY_MISSING_COVERAGE, so it compared a policy that is not in force
 * against a candidate identical to the one that is. Both halves are now derived:
 * the current action from `decideRecovery`, and the candidates from what this
 * SOURCE can actually perform. A source with no adapter yields no candidates and
 * is reported as such rather than accumulating evidence for a change that could
 * never be applied to it.
 */
const shadow = (live?.incidents ?? []).flatMap((incident) => {
  const scope = { sourceId: incident.sourceId, failureClass: incident.failureClass,
    contractVersion: incident.contractVersion, logicalJob: incident.logicalJob };
  const current = currentActionFor(incident.failureClass);
  const candidates = shadowCandidatesFor(incident.sourceId, incident.failureClass,
    (sourceId) => capabilityFor(sourceId).supportedActions);
  if (!candidates.length) {
    return [{ scope, currentAction: current, candidateAction: null as string | null,
      state: 'NO_SUPPORTED_ALTERNATIVE' as string, automaticPolicyChangeAllowed: false as const,
      scorecard: [] as ReturnType<typeof scoreRecoveryAttempts>,
      reason: `${incident.sourceId} supports no action other than the one already in force; there is nothing to shadow` }];
  }
  return candidates.map((candidate) => {
    const evaluated = evaluateShadowPolicy(live?.attempts ?? [], scope, current, candidate);
    return { scope, currentAction: current, candidateAction: candidate as string | null,
      state: evaluated.state as string, automaticPolicyChangeAllowed: evaluated.automaticPolicyChangeAllowed,
      scorecard: evaluated.scorecard, reason: evaluated.reason };
  });
});

/**
 * Whether central recovery could responsibly be switched on — as its own answer.
 *
 * "The code exists" and "activation is safe" are different claims, and the
 * second one is what an owner is actually deciding. Every condition below is
 * derived from measured state, and `readyForOwnerReview` is the conjunction, so
 * a single unclassified source or one stuck attempt withholds it. The gate stays
 * LOCKED regardless: readiness is a recommendation, never an activation.
 */
const activation = centralRecoveryActivation(nowIso);
// Over the union of the static table AND every source the ledger actually
// mentions. A table-only count reported full coverage on 2026-09-14 while
// KASI_PUBLIC_HOLIDAYS was live and unclassified — a false green is exactly
// what withholds readiness, so it must be able to see one.
const observedSourceIds = [...new Set([...PRODUCTION_SOURCE_IDS,
  ...(live?.incidents ?? []).map((incident) => incident.sourceId),
  ...(live?.measurements ?? []).map((measured) => measured.sourceId)])].sort();
const unclassified = observedSourceIds.filter((id) => capabilityFor(id).logicalJob === 'UNKNOWN');
const stuckAttempts = live?.stuck ?? [];
const centralRecoveryReadiness = {
  executionGate: activation.allowed ? 'OPEN' : 'LOCKED',
  executionGateBlockedBy: activation.blockedBy,
  executionGateEvaluated: activation.evaluated,
  sourceCapabilityCoverage: `${observedSourceIds.length - unclassified.length}/${observedSourceIds.length}`,
  unsupportedSources: SOURCE_RECOVERY_CAPABILITIES.filter((entry) => !entry.controlledRecoveryEligible).map((entry) => entry.sourceId),
  controlledEligibleSources: SOURCE_RECOVERY_CAPABILITIES.filter((entry) => entry.controlledRecoveryEligible).map((entry) => entry.sourceId),
  unclassifiedSources: unclassified,
  stuckAttempts,
  unresolvedIncidents: (live?.incidents ?? []).filter((incident) => incident.currentState !== 'RESOLVED').length,
  shadowEvidence: shadow.map((entry) => entry.state),
  runtimeEnablementEvidence: Object.keys(knownVariables).length
    ? knownVariables
    : 'RUNTIME_ENABLE_STATE_UNKNOWN: no Actions Variable value was supplied to this run',
  triggerEvidence,
  watchdogLimitations: independence.reason,
  automaticPolicyChangeAllowed: false as const,
  automaticCodeChangeAllowed: false as const,
  // Deliberately a conjunction of measured facts. Anything unmeasured withholds it.
  readyForOwnerReview: unclassified.length === 0 && stuckAttempts.length === 0
    && live?.memoryState === 'PERSISTED_READ' && runtimeLlm.offendingFiles.length === 0,
};

const report = {...buildHealthReport(inputs),phase2:{
  memory:live?.memoryState??'UNKNOWN_NO_DATABASE',sourceEvidence:live?.measurements.map(({sample,run,health,...facts})=>({...facts,sampleRows:sample.length,collectorStatus:run?.status??null,sourceStatus:health?.status??null}))??[],
  lastGood:live?.states??[],scorecard:scoreRecoveryAttempts(live?.attempts??[]),usage:observedUsage(live?.usage??[]),
  regressionCandidates:regressionCandidates(live?.incidents??[]),automaticPolicyChangeAllowed:false,automaticCodeChangeAllowed:false,
  centralRecovery:'DORMANT',shadow,
},phase3:{centralRecoveryReadiness,sourceCapabilities:SOURCE_RECOVERY_CAPABILITIES,
  stuckControlledAttempts:stuckAttempts,inFlightControlledAttempts:live?.inFlight??[]}};
console.log(wantsJson ? JSON.stringify(report, null, 2) : summarizeHealthReport(report)+
  `\nPERSISTENT MEMORY: ${report.phase2.memory}\nRECOVERY SCORECARD: ${report.phase2.scorecard.length} groups\nCENTRAL RECOVERY: DORMANT; AUTOMATIC POLICY PROMOTION: false`+
  `\nCENTRAL RECOVERY GATE: ${centralRecoveryReadiness.executionGate} (${activation.blockedBy.join(', ') || 'no blockers'})`+
  `\nSOURCE CAPABILITY COVERAGE: ${centralRecoveryReadiness.sourceCapabilityCoverage}`+
  `; controlled-eligible ${centralRecoveryReadiness.controlledEligibleSources.length}`+
  `\nSTUCK CONTROLLED ATTEMPTS: ${stuckAttempts.length}`+
  (stuckAttempts.length?stuckAttempts.map(row=>`\n  HUMAN_REVIEW_REQUIRED ${row.attemptId} ${row.sourceId} age ${Math.round(row.ageMs/60000)} min`).join(''):'')+
  `\nREADY FOR OWNER REVIEW: ${centralRecoveryReadiness.readyForOwnerReview}`);

// ERROR is the only exit-code failure. UNKNOWN must not fail the command,
// because an offline run is legitimately UNKNOWN and a health command that
// always exits non-zero locally stops being run at all.
if (report.overall === "ERROR") process.exitCode = 1;
