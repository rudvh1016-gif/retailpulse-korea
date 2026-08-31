import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CloudflareD1RestDatabase } from "../lib/d1-rest";
import { PRODUCTION_SOURCE_NAMES } from "../lib/production-runner";
import { evaluateQuotaUsage } from "../lib/quota-guard";
import { normalizeAirportFlight } from "../lib/source-adapters";
import { readCloudflareConfig, validateCloudflareEnvironment } from "../scripts/validate-cloudflare-environment.mjs";

test("semantic flight hash ignores retrieval time and unknown volatile fields", async () => {
  const base = { flightId: "KE703", scheduleDateTime: "202608251430", terminalid: "2", gate: "231", remark: "정상" };
  const first = await normalizeAirportFlight({ ...base, upstreamRequestTime: "a" }, "departure", "2026-08-25T01:00:00Z");
  const second = await normalizeAirportFlight({ ...base, upstreamRequestTime: "b" }, "departure", "2026-08-25T01:30:00Z");
  const changed = await normalizeAirportFlight({ ...base, gate: "232" }, "departure", "2026-08-25T02:00:00Z");
  assert.equal(first.sourceHash, second.sourceHash);
  assert.notEqual(first.sourceHash, changed.sourceHash);
});

test("D1 REST adapter batches parameterized queries without exposing token in errors", async () => {
  let capturedAuthorization = "";
  let capturedBody = "";
  const mockFetch: typeof fetch = async (_input, init) => {
    capturedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
    capturedBody = String(init?.body);
    return Response.json({ success: true, result: [{ success: true, meta: { rows_written: 1, rows_read: 0 }, results: [] }] });
  };
  const db = new CloudflareD1RestDatabase("account", "database", "secret-token-value", mockFetch);
  const result = await db.prepare("INSERT INTO t (a) VALUES (?)").bind("value").run();
  assert.equal(result.meta?.rows_written, 1);
  assert.equal(capturedAuthorization, "Bearer secret-token-value");
  assert.doesNotMatch(capturedBody, /secret-token-value/);

  const failingFetch: typeof fetch = async () => new Response("secret-token-value", { status: 403 });
  const failingDb = new CloudflareD1RestDatabase("account", "database", "secret-token-value", failingFetch);
  await assert.rejects(failingDb.prepare("SELECT 1").run(), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "d1_http_403");
    assert.doesNotMatch(error.message, /secret-token-value/);
    return true;
  });
});

test("quota guardrails distinguish estimates and apply 70/85/95 levels", () => {
  assert.equal(evaluateQuotaUsage(69, 100, "INTERNAL_ESTIMATE").level, "NORMAL");
  assert.equal(evaluateQuotaUsage(70, 100, "INTERNAL_ESTIMATE").level, "NOTICE");
  assert.equal(evaluateQuotaUsage(85, 100, "OFFICIAL_USAGE").level, "PROTECT");
  const emergency = evaluateQuotaUsage(95, 100, "OFFICIAL_USAGE");
  assert.equal(emergency.level, "EMERGENCY");
  assert.equal(emergency.allowOptionalWrites, false);
  assert.equal(emergency.allowCriticalWrites, true);
  assert.equal(evaluateQuotaUsage(100, 100, "OFFICIAL_USAGE").allowCriticalWrites, false);
});

test("Wrangler environments isolate Worker names and D1 databases", async () => {
  const config = await readCloudflareConfig();
  assert.equal(config.account_id, "2848bf4ae7af3c6fde4e26b55b19d0c2");
  assert.match(config.account_id, /^[a-f0-9]{32}$/);
  assert.equal(config.env.staging.name, "retailpulse-korea-staging");
  assert.equal(config.env.production.name, "retailpulse-korea-production");
  assert.notEqual(config.env.staging.name, config.env.production.name);
  assert.equal(config.env.staging.account_id, undefined);
  assert.equal(config.env.production.account_id, undefined);

  const stagingDb = config.env.staging.d1_databases[0];
  const productionDb = config.env.production.d1_databases[0];
  assert.equal(stagingDb.binding, "DB");
  assert.equal(productionDb.binding, "DB");
  assert.notEqual(stagingDb.database_name, productionDb.database_name);
  assert.equal(config.triggers, undefined);
});

test("Cloudflare deploy gate accepts production and rejects unresolved staging D1", async () => {
  const config = await readCloudflareConfig();
  assert.throws(
    () => validateCloudflareEnvironment({ ...config, account_id: "invalid" }, "production"),
    /32-character hexadecimal account_id/i,
  );
  assert.throws(() => validateCloudflareEnvironment(config, "staging"), /Staging D1 is not created/i);
  assert.deepEqual(validateCloudflareEnvironment(config, "production"), {
    workerName: "retailpulse-korea-production",
    databaseName: "retailpulse-korea-production",
  });
});

test("deploy workflow maps one stage to matching GitHub and Wrangler environments", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url), "utf8");
  const deployScript = await readFile(new URL("../scripts/deploy-cloudflare.mjs", import.meta.url), "utf8");
  assert.match(workflow, /environment: \$\{\{ inputs\.stage \}\}/);
  assert.match(workflow, /RPK_DEPLOYMENT_STAGE: \$\{\{ inputs\.stage \}\}/);
  assert.match(workflow, /npm run deploy:cloudflare/);
  assert.match(deployScript, /CLOUDFLARE_ENV: stage/);
  assert.match(deployScript, /"--env", stage/);
});

test("production deployment applies D1 migrations before Worker deploy", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url), "utf8");
  const steps = workflow
    .split(/\r?\n(?=      - )/)
    .filter((block) => block.startsWith("      - "));
  const migrationIndex = steps.findIndex((step) => step.includes("run: npm run db:migrate:production"));
  const deployIndex = steps.findIndex((step) => step.includes("run: npm run deploy:cloudflare"));

  assert.notEqual(migrationIndex, -1);
  assert.notEqual(deployIndex, -1);
  assert.ok(migrationIndex < deployIndex);
  assert.match(steps[migrationIndex], /if: inputs\.stage == 'production'/);
  assert.match(steps[migrationIndex], /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_ACCOUNT_ID/);
});

test("production collector remains gated and Worker Cron remains absent", async () => {
  const workflow = await readFile(new URL("../.github/workflows/collect-production.yml", import.meta.url), "utf8");
  const config = await readCloudflareConfig();
  assert.match(workflow, /vars\.ENABLE_PRODUCTION_COLLECTOR == 'true'/);
  assert.equal(config.triggers, undefined);
  assert.equal(config.env.staging.triggers, undefined);
  assert.equal(config.env.production.triggers, undefined);
});

test("every cadence-group collector workflow is gated behind the same owner-approved switch and actually scheduled", async () => {
  const groupFiles = ["collect-production.yml", "collect-realtime.yml", "collect-weather.yml", "collect-sales.yml", "collect-forecast.yml"];
  for (const file of groupFiles) {
    const workflow = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    assert.match(workflow, /vars\.ENABLE_PRODUCTION_COLLECTOR == 'true'/, `${file} must reuse the single production-collector gate`);
    assert.match(workflow, /^\s*schedule:/m, `${file} must carry a real schedule, not workflow_dispatch-only`);
    assert.match(workflow, /RPK_PRODUCTION_SOURCES: /, `${file} must select sources explicitly`);
    assert.doesNotMatch(workflow, /CLOUDFLARE_ACCOUNT_ID/, `${file} must resolve the account id from wrangler.production.jsonc, never a secret`);
  }
});

test("A1 (airport_recent) is scheduled by exactly one collector workflow group", async () => {
  const groupFiles = ["collect-production.yml", "collect-realtime.yml", "collect-weather.yml", "collect-sales.yml", "collect-forecast.yml"];
  const owners: string[] = [];
  for (const file of groupFiles) {
    const workflow = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    const sourcesLine = workflow.match(/RPK_PRODUCTION_SOURCES: (.+)/)?.[1] ?? "";
    if (sourcesLine.split(",").map((value) => value.trim()).includes("airport_recent")) owners.push(file);
  }
  assert.deepEqual(owners, ["collect-production.yml"], "there must not be two competing scheduled A1 collectors");
});

test("every production source is scheduled by exactly one cadence-group workflow", async () => {
  const groupFiles = ["collect-production.yml", "collect-realtime.yml", "collect-weather.yml", "collect-sales.yml", "collect-forecast.yml"];
  const scheduledSources: string[] = [];
  for (const file of groupFiles) {
    const workflow = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    const sourcesLine = workflow.match(/RPK_PRODUCTION_SOURCES: (.+)/)?.[1] ?? "";
    scheduledSources.push(...sourcesLine.split(",").map((value) => value.trim()).filter(Boolean));
  }
  assert.deepEqual([...scheduledSources].sort(), [...PRODUCTION_SOURCE_NAMES].sort(), "every known source should be scheduled exactly once, with none forgotten or duplicated");
  assert.equal(new Set(scheduledSources).size, scheduledSources.length, "no source may be scheduled by two workflow groups at once");
});

// ---------------------------------------------------------------------------
// REALTIME Worker Cron migration guardrails (docs/ZERO_COST_HYBRID_AUDIT.md D.3/D.5)
// ---------------------------------------------------------------------------

test("no Cloudflare Cron Trigger is configured in any wrangler config", () => {
  for (const file of readdirSync(".").filter((name) => /^wrangler.*\.jsonc?$/.test(name))) {
    const config = readFileSync(file, "utf8");
    assert.equal(/"triggers"\s*:/.test(config), false, `${file} must not declare Cron triggers before owner activation approval`);
    assert.equal(/"crons"\s*:/.test(config), false, `${file} must not declare crons before owner activation approval`);
  }
});

/**
 * The owner approved the trigger-only design, so a scheduled() handler may
 * now exist — but it stays inert while no Cron Trigger is configured, and it
 * must never grow into Cron-executed collection work.
 */
test("any Worker scheduled handler stays trigger-only and inert", () => {
  const worker = readFileSync("worker/index.ts", "utf8");
  if (!/\bscheduled\s*[(:]/.test(worker)) return;
  assert.match(worker, /dispatchRealtimeCollection/, "the only permitted Cron work is the GitHub dispatch");
  for (const forbidden of ["collectAirport", "collectSeoul", "collectWeather", "collectTourism", "sha256", "env.DB", "runD1Batches"]) {
    assert.equal(worker.includes(forbidden), false, `Cron work must not include ${forbidden}`);
  }
});

test("GitHub remains the single authoritative REALTIME scheduler during preparation", () => {
  const realtime = readFileSync(".github/workflows/collect-realtime.yml", "utf8");
  // The GitHub schedule must stay present: removing it before Worker Cron is
  // approved would leave the realtime group with no scheduler at all.
  assert.match(realtime, /schedule:\s*\n\s*- cron: "7,22,37,52 \* \* \* \*"/);
  assert.match(realtime, /RPK_PRODUCTION_SOURCES: airport_congestion,airport_congestion_t2,seoul_realtime/);
});

test("the CPU benchmark measures the real collectors and makes no provider or D1 write call", () => {
  const benchmark = readFileSync("scripts/benchmark-realtime-collectors.ts", "utf8");
  // It must import the production collectors, not a reimplementation.
  assert.match(benchmark, /from "\.\.\/lib\/collector"/);
  for (const source of ["collectAirportCongestion", "collectAirportCongestionT2", "collectSeoulRealtime"]) {
    assert.ok(benchmark.includes(source), `benchmark must exercise ${source}`);
  }
  // Only the three approved realtime sources — never A1/A2/A3/A5/S2/S3/W1/T1.
  for (const forbidden of [
    "collectAirportFlightsToday", "collectAirportFlightEnrichment", "collectScheduledAirportFlights",
    "collectAirportPassengerForecast", "collectSeoulForeignPresence", "collectEstimatedSales",
    "collectWeatherForecasts", "collectTourismEvents",
  ]) {
    assert.equal(benchmark.includes(forbidden), false, `benchmark must never invoke ${forbidden}`);
  }
  // fetch is stubbed and the D1 double never writes.
  assert.match(benchmark, /globalThis\.fetch = /);
  assert.ok(benchmark.includes("CountingD1"), "benchmark must use the counting no-op D1");
});
