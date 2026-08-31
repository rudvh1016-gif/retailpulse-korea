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

test("production collector remains gated and only production carries a Worker Cron", async () => {
  const workflow = await readFile(new URL("../.github/workflows/collect-production.yml", import.meta.url), "utf8");
  const config = await readCloudflareConfig();
  assert.match(workflow, /vars\.ENABLE_PRODUCTION_COLLECTOR == 'true'/);
  assert.equal(config.triggers, undefined, "the default environment must never carry a Cron Trigger");
  assert.equal(config.env.staging.triggers, undefined, "staging must never carry a Cron Trigger");
  assert.deepEqual(config.env.production.triggers?.crons, ["7,22,37,52 * * * *", "42 * * * *"]);
});

/**
 * REALTIME and FORECAST are the two audited exceptions: their cadences are
 * owned by Cloudflare trigger-only Crons. Every other cadence group keeps a
 * native GitHub `schedule:`.
 */
test("every cadence-group collector workflow is gated behind the same owner-approved switch and actually scheduled", async () => {
  const groupFiles = ["collect-production.yml", "collect-realtime.yml", "collect-weather.yml", "collect-sales.yml", "collect-forecast.yml"];
  const cloudflareScheduled = new Set(["collect-realtime.yml", "collect-forecast.yml"]);
  for (const file of groupFiles) {
    const workflow = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    assert.match(workflow, /vars\.ENABLE_PRODUCTION_COLLECTOR == 'true'/, `${file} must reuse the single production-collector gate`);
    if (cloudflareScheduled.has(file)) {
      assert.doesNotMatch(workflow, /^\s*schedule:/m, `${file} is scheduled by the Cloudflare Cron; a GitHub schedule would duplicate it`);
      assert.match(workflow, /^\s*workflow_dispatch:/m, `${file} must stay dispatchable so the Cloudflare trigger can start it`);
    } else {
      assert.match(workflow, /^\s*schedule:/m, `${file} must carry a real schedule, not workflow_dispatch-only`);
    }
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
// REALTIME trigger-only scheduler guardrails, POST-ACTIVATION
// (docs/ZERO_COST_HYBRID_AUDIT.md D.3/D.5, docs/REALTIME_SCHEDULER_AUDIT.md)
//
// Activated state: Cloudflare Production Cron is the single authoritative
// realtime scheduler and only rings the alarm; GitHub Actions still performs
// every provider call, hash and D1 write.
// ---------------------------------------------------------------------------

/** Exactly two authorized trigger-only Crons exist, on production only. */
test("exactly two Cloudflare Cron Triggers exist for realtime and forecast", () => {
  const files = readdirSync(".").filter((name) => /^wrangler.*\.jsonc?$/.test(name));
  assert.deepEqual(files, ["wrangler.production.jsonc"], "an unexpected wrangler config could hide a second Cron");
  const config = JSON.parse(readFileSync("wrangler.production.jsonc", "utf8"));
  assert.equal(config.triggers, undefined, "the default environment must stay Cron-free");
  assert.equal(config.env.staging.triggers, undefined, "staging must stay Cron-free");
  const crons = config.env.production.triggers?.crons;
  assert.deepEqual(crons, ["7,22,37,52 * * * *", "42 * * * *"]);
  assert.equal(crons.length, 2, "only the two audited trigger-only cadences are authorized");
});

/**
 * The Cron is now live, so this guardrail is what keeps it an alarm clock:
 * the handler may only dispatch, never grow into Cron-executed collection.
 * docs/REALTIME_SCHEDULER_AUDIT.md measured that design at 414% of the Free
 * 10 ms Cron CPU budget.
 */
test("the live Worker scheduled handler stays trigger-only", () => {
  const worker = readFileSync("worker/index.ts", "utf8");
  assert.match(worker, /\bscheduled\s*\(/, "the Cron Trigger requires a scheduled handler to reach");
  assert.match(worker, /dispatchScheduledCollection/, "the only permitted Cron work is the GitHub dispatch");
  for (const forbidden of ["collectAirport", "collectSeoul", "collectWeather", "collectTourism", "sha256", "env.DB", "runD1Batches"]) {
    assert.equal(worker.includes(forbidden), false, `Cron work must not include ${forbidden}`);
  }
  // No provider endpoint may ever be called from the Worker's Cron path.
  for (const forbidden of ["apis.data.go.kr", "openapi.seoul.go.kr", "apihub.kma.go.kr"]) {
    assert.equal(worker.includes(forbidden), false, `Cron work must not call the provider ${forbidden}`);
  }
});

test("Cloudflare is the single authoritative REALTIME scheduler and GitHub stays dispatchable", () => {
  const realtime = readFileSync(".github/workflows/collect-realtime.yml", "utf8");
  // A GitHub schedule here would run alongside the live Cloudflare Cron and
  // double the realtime provider call budget. It returns only via rollback,
  // together with removing the Worker Cron.
  assert.doesNotMatch(realtime, /^\s*schedule:/m, "the GitHub realtime schedule must stay off while the Worker Cron is live");
  assert.doesNotMatch(realtime, /- cron:/, "no GitHub cron expression may remain in the realtime workflow");
  assert.match(realtime, /^\s*workflow_dispatch:/m, "the Cloudflare trigger dispatches this workflow, so it must stay dispatchable");
  // Collection semantics are untouched by activation: same three sources.
  assert.match(realtime, /RPK_PRODUCTION_SOURCES: airport_congestion,airport_congestion_t2,seoul_realtime/);
});

test("Cloudflare is the single authoritative FORECAST scheduler and GitHub stays dispatchable", () => {
  const forecast = readFileSync(".github/workflows/collect-forecast.yml", "utf8");
  assert.doesNotMatch(forecast, /^\s*schedule:/m);
  assert.doesNotMatch(forecast, /- cron:/);
  assert.match(forecast, /^\s*workflow_dispatch:/m);
  assert.match(forecast, /RPK_PRODUCTION_SOURCES: airport_passenger_forecast/);
});

/** The dispatch target and the live Cron must name the same workflow file. */
test("the production Cron and the dispatch target describe one scheduler path", () => {
  const config = JSON.parse(readFileSync("wrangler.production.jsonc", "utf8"));
  const dispatch = readFileSync("lib/realtime-dispatch.ts", "utf8");
  assert.deepEqual(config.env.production.triggers.crons, ["7,22,37,52 * * * *", "42 * * * *"]);
  assert.match(dispatch, /REALTIME_WORKFLOW_FILE = "collect-realtime\.yml"/);
  assert.match(dispatch, /FORECAST_WORKFLOW_FILE = "collect-forecast\.yml"/);
  assert.match(dispatch, /DISPATCH_REF = "main"/);
  assert.equal(config.env.production.name, "retailpulse-korea-production");
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
