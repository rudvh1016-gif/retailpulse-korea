/**
 * The audit, made permanent.
 *
 * On 2026-09-11 a read of this repository found the scheduler documentation and
 * the scheduler configuration saying opposite things. These tests run against the
 * REAL `.github/workflows/*`, the REAL `wrangler.production.jsonc` and the REAL
 * `lib/realtime-dispatch.ts`, so the next such divergence fails the build instead
 * of waiting to be noticed by a person reading prose.
 *
 * Every assertion here is about configuration, not intent. If the owner later
 * decides to move a collector, these tests fail and the failure is the reminder
 * to update the claim that went with it.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  SCHEDULER_DOC_CLAIMS,
  buildSchedulerTruth,
  classifyRuntimeEnablement,
  cronMaxIntervalMs,
  findDocDrift,
  readWorkflowFacts,
} from "../lib/scheduler-truth.ts";
import { PRODUCTION_CRONS, WORKERS_FREE_CRON_TRIGGER_LIMIT, workflowForCron } from "../lib/realtime-dispatch.ts";

const root = new URL("../", import.meta.url);

async function loadWorkflows() {
  const dir = new URL(".github/workflows/", root);
  const names = (await readdir(dir)).filter((name) => /\.ya?ml$/.test(name)).sort();
  return Promise.all(names.map(async (name) => readWorkflowFacts(name, await readFile(new URL(name, dir), "utf8"))));
}

async function loadTruth() {
  return buildSchedulerTruth({
    workflows: await loadWorkflows(),
    workerCrons: PRODUCTION_CRONS,
    cronRouting: (cron) => workflowForCron(cron),
  });
}

test("the Worker's configured crons are exactly the five the dispatcher routes", async () => {
  const wrangler = await readFile(new URL("wrangler.production.jsonc", root), "utf8");
  const configured = JSON.parse(wrangler).env.production.triggers.crons;
  assert.deepEqual(configured, [...PRODUCTION_CRONS],
    "wrangler.production.jsonc and lib/realtime-dispatch.ts must declare the same schedule");
  assert.equal(configured.length, WORKERS_FREE_CRON_TRIGGER_LIMIT,
    "a sixth expression is rejected outright by Cloudflare (code 10072) and fails the deploy");
});

test("every Worker cron routes to a workflow that exists and accepts workflow_dispatch", async () => {
  const truth = await loadTruth();
  assert.deepEqual(truth.unroutedWorkerCrons, [], "a Worker cron that routes to nothing is a silent dead alarm");
  assert.deepEqual(truth.missingRoutedWorkflows, []);
  assert.deepEqual(truth.undispatchableRoutes, [],
    "the Worker can only start a workflow that declares workflow_dispatch");
});

test("no collector workflow is fired by two independent timed schedulers", async () => {
  const truth = await loadTruth();
  assert.deepEqual(truth.duplicateSchedulers, [],
    "two live schedulers for one source double provider load and make row provenance unanswerable");
});

test("the Worker Cron is live, so any document claiming it was removed is wrong", async () => {
  const truth = await loadTruth();
  const workerDriven = truth.entries.filter((entry) => entry.driver === "WORKER_CRON");
  assert.equal(workerDriven.length, 5, "five Production Cron expressions each drive one collector");

  const documents = {
    "CLAUDE.md": await readFile(new URL("CLAUDE.md", root), "utf8"),
    "AGENTS.md": await readFile(new URL("AGENTS.md", root), "utf8"),
  };
  const drift = findDocDrift(documents, truth);
  assert.equal(drift.length, SCHEDULER_DOC_CLAIMS.length);
  const contradicted = drift.filter((entry) => entry.contradicted);
  assert.deepEqual(contradicted, [],
    `these instruction files claim something the configuration disproves: ${contradicted.map((entry) => `${entry.file}: ${entry.claim}`).join("; ")}`);
});

test("collect-production.yml has a live cron whose runtime enablement cannot be read from a checkout", async () => {
  const workflows = await loadWorkflows();
  const collector = workflows.find((facts) => facts.file === "collect-production.yml");
  assert.ok(collector, "the daily production collector must exist");
  assert.deepEqual(collector.crons, ["7 21 * * *"], "06:07 KST, expressed in UTC");
  assert.ok(collector.variableGates.some((gate) => /ENABLE_PRODUCTION_COLLECTOR/.test(gate)));

  // The Variable lives in GitHub, not in the repository, so the only honest
  // answer from a checkout is UNKNOWN — never "disabled", which is what the
  // documentation assumed for months while the cron was live.
  assert.equal(classifyRuntimeEnablement(collector), "RUNTIME_ENABLE_STATE_UNKNOWN");
  assert.equal(classifyRuntimeEnablement(collector, { ENABLE_PRODUCTION_COLLECTOR: "true" }), "RUNTIME_ENABLED");
  assert.equal(classifyRuntimeEnablement(collector, { ENABLE_PRODUCTION_COLLECTOR: "false" }), "RUNTIME_DISABLED");
  assert.equal(classifyRuntimeEnablement(collector, {}), "RUNTIME_ENABLE_STATE_UNKNOWN");
});

test("a workflow with no cron is SCHEDULE_DEFINED, whatever its gates say", async () => {
  const workflows = await loadWorkflows();
  const realtime = workflows.find((facts) => facts.file === "collect-realtime.yml");
  assert.ok(realtime);
  assert.deepEqual(realtime.crons, [],
    "realtime is driven by the Worker alarm; a GitHub cron here would be the second scheduler");
  assert.equal(classifyRuntimeEnablement(realtime), "SCHEDULE_DEFINED");
  assert.ok(realtime.triggers.includes("workflow_dispatch"));
});

test("the reusable attempt workflow is callable and is never independently scheduled", async () => {
  const workflows = await loadWorkflows();
  const attempt = workflows.find((facts) => facts.file === "collect-attempt.yml");
  assert.ok(attempt);
  assert.ok(attempt.triggers.includes("workflow_call"));
  assert.deepEqual(attempt.crons, []);
  const truth = await loadTruth();
  assert.ok(truth.entries.some((entry) => entry.workflow === "collect-attempt.yml" && entry.driver === "WORKFLOW_CALL"));
});

test("the operational inspection and the public smoke have no schedule at all", async () => {
  const truth = await loadTruth();
  for (const file of ["inspect-production-operations.yml", "site-smoke.yml", "smoke-public-apis.yml"]) {
    assert.ok(truth.manualOnly.includes(file),
      `${file} is manual-only, so nothing routinely verifies what it verifies`);
  }
  // A reusable workflow IS started — by its caller — so it must not appear here.
  assert.ok(!truth.manualOnly.includes("collect-attempt.yml"));
  for (const file of ["collect-production.yml", "collect-realtime.yml", "collect-weather.yml"]) {
    assert.ok(!truth.manualOnly.includes(file), `${file} has a scheduler and must not read as manual-only`);
  }
});

test("a commented-out schedule is not counted as a live one", () => {
  const facts = readWorkflowFacts("example.yml", [
    "name: Example",
    "on:",
    "  schedule:",
    '    # - cron: "0 * * * *"',
    '    - cron: "30 * * * *"',
    "  workflow_dispatch:",
  ].join("\n"));
  assert.deepEqual(facts.crons, ["30 * * * *"]);
  assert.deepEqual(facts.triggers, ["schedule", "workflow_dispatch"]);
});

test("workflow_run upstreams are read, so a chained workflow is not mistaken for unscheduled", async () => {
  const workflows = await loadWorkflows();
  const transfer = workflows.find((facts) => facts.file === "collect-transfer.yml");
  assert.ok(transfer);
  assert.ok(transfer.triggers.includes("workflow_run"));
  assert.ok(transfer.upstreamWorkflows.length > 0, "the upstream workflow names must be recoverable");
});

test("the cron cadence is the longest gap, because the longest gap is what overdue means", () => {
  const minute = 60_000;
  assert.equal(cronMaxIntervalMs("7,22,37,52 * * * *"), 15 * minute);
  assert.equal(cronMaxIntervalMs("42 * * * *"), 60 * minute);
  assert.equal(cronMaxIntervalMs("10 2,5,8,11,14,17,20,23 * * *"), 3 * 60 * minute);
  assert.equal(cronMaxIntervalMs("7 21 * * *"), 24 * 60 * minute);

  // Two firings 15 minutes apart, then nothing for 165. Judging this schedule by
  // the 15 would report a missed run eight times a day.
  assert.equal(cronMaxIntervalMs("25,40 2,5,8,11,14,17,20,23 * * *"), 165 * minute);

  // A weekly schedule measures its gap across the week, not the day.
  assert.equal(cronMaxIntervalMs("7 22 * * 6"), 7 * 24 * 60 * minute);

  // Unsupported shapes decline rather than guess, which surfaces as UNKNOWN.
  assert.equal(cronMaxIntervalMs("*/5 * * * *"), null);
  assert.equal(cronMaxIntervalMs("0 0 1 * *"), null);
  assert.equal(cronMaxIntervalMs("not a cron"), null);
});

test("every cron in the repository has a derivable cadence", async () => {
  const workflows = await loadWorkflows();
  for (const facts of workflows) {
    for (const cron of facts.crons) {
      assert.notEqual(cronMaxIntervalMs(cron), null,
        `${facts.file} uses a cron shape the harness cannot measure: ${cron}`);
    }
  }
  for (const cron of PRODUCTION_CRONS) {
    assert.notEqual(cronMaxIntervalMs(cron), null, `the Worker cron ${cron} must have a derivable cadence`);
  }
});

test("npm run health exists and is the single documented entry point", async () => {
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(pkg.scripts.health, "tsx scripts/health.ts");
});
