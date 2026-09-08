import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CloudflareD1RestDatabase } from "../lib/d1-rest";
import { PRODUCTION_SOURCE_NAMES } from "../lib/production-runner";
import { evaluateQuotaUsage } from "../lib/quota-guard";
import { normalizeAirportFlight } from "../lib/source-adapters";
import { readCloudflareConfig, validateCloudflareEnvironment } from "../scripts/validate-cloudflare-environment.mjs";
import { PRODUCTION_CRONS, WORKERS_FREE_CRON_TRIGGER_LIMIT } from "../lib/realtime-dispatch";

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

/**
 * A status code alone is not a diagnosis.
 *
 * Production hit `d1_http_400` twice in a row on 2026-09-06, forty seconds
 * after the same code had written to the same database successfully, and the
 * log said nothing about which of the many things that can 400 had happened.
 * Cloudflare puts a numeric code in the body for exactly this.
 */
test("a D1 failure carries Cloudflare's code and a reduced message", async () => {
  const d1 = (body: BodyInit, status = 400) =>
    new CloudflareD1RestDatabase("account", "database", "token", async () => new Response(body, { status }));
  const rejects = async (body: BodyInit, expected: string) => {
    await assert.rejects(d1(body).prepare("SELECT 1").run(), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, expected);
      return true;
    });
  };

  // The failure that actually happened: the code says "query error", and only
  // the message says which column.
  await rejects(
    JSON.stringify({ success: false, errors: [{ code: 7500, message: "NOT NULL constraint failed: airport_passenger_forecast.zone" }] }),
    "d1_http_400_7500_NOT_NULL_constraint_failed:_airport_passenger_forecast.z",
  );

  // Quotes, parens and commas are what a SQL fragment or a bound value needs.
  // They collapse, so nothing rides out of a message inside an identifier.
  await rejects(
    JSON.stringify({ success: false, errors: [{ code: 7500, message: "near \"INSERT INTO t VALUES ('secret-value')\": syntax error" }] }),
    "d1_http_400_7500_near_INSERT_INTO_t_VALUES_secret-value_:_syntax_error",
  );

  // The cause code the collectors log has a bounded shape; whatever comes back
  // from Cloudflare must still fit it (lib/source-adapters.ts).
  const longMessage = "x".repeat(400);
  await assert.rejects(
    d1(JSON.stringify({ success: false, errors: [{ code: 7500, message: longMessage }] })).prepare("SELECT 1").run(),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.length <= 79, `cause code must stay bounded, got ${error.message.length}`);
      assert.match(error.message, /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/);
      return true;
    },
  );

  // A code with no message still reports the code alone.
  await rejects(JSON.stringify({ success: false, errors: [{ code: 7500 }] }), "d1_http_400_7500");

  // A body that is not the documented shape must not replace what we do know.
  for (const body of ["<html>gateway</html>", JSON.stringify({ success: false }), ""]) {
    await assert.rejects(
      new CloudflareD1RestDatabase("account", "database", "token", async () => new Response(body, { status: 400 }))
        .prepare("SELECT 1").run(),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "d1_http_400");
        return true;
      },
    );
  }
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
  assert.match(workflow, /environment: \$\{\{ inputs\.stage \|\| 'production' \}\}/);
  assert.match(workflow, /RPK_DEPLOYMENT_STAGE: \$\{\{ inputs\.stage \|\| 'production' \}\}/);
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
  assert.match(steps[migrationIndex], /if: github\.event_name == 'workflow_run' \|\| inputs\.stage == 'production'/);
  assert.match(steps[migrationIndex], /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_ACCOUNT_ID/);
});

test("production collector remains gated and only production carries a Worker Cron", async () => {
  const workflow = await readFile(new URL("../.github/workflows/collect-production.yml", import.meta.url), "utf8");
  const config = await readCloudflareConfig();
  assert.match(workflow, /vars\.ENABLE_PRODUCTION_COLLECTOR == 'true'/);
  assert.equal(config.triggers, undefined, "the default environment must never carry a Cron Trigger");
  assert.equal(config.env.staging.triggers, undefined, "staging must never carry a Cron Trigger");
  assert.deepEqual(config.env.production.triggers?.crons, [
    "7,22,37,52 * * * *",
    "42 * * * *",
    "10 2,5,8,11,14,17,20,23 * * *",
    "53 * * * *",
    "25,40 2,5,8,11,14,17,20,23 * * *",
  ]);
});

/**
 * The sources a cadence-group workflow declares.
 *
 * A workflow either names them inline (`RPK_PRODUCTION_SOURCES:`) or delegates
 * each attempt to the reusable collect-attempt workflow (`sources:`). The
 * second form repeats the same name once per attempt on purpose — separate
 * jobs are how a failed collection gets a fresh runner, and therefore a fresh
 * egress address — so the DISTINCT names are what identifies an owner. A
 * retry is not a second scheduler.
 */
function declaredSources(workflow: string): string[] {
  const declarations = [...workflow.matchAll(/^\s*(?:RPK_PRODUCTION_SOURCES|sources): (.+)$/gm)]
    .flatMap((match) => match[1].split(",").map((value) => value.trim()))
    .filter(Boolean);
  return [...new Set(declarations)];
}

/**
 * REALTIME, FORECAST and WEATHER are the audited exceptions: their cadences are
 * owned by Cloudflare trigger-only Crons. Every other cadence group keeps a
 * native GitHub `schedule:`.
 */
test("every cadence-group collector workflow is gated behind the same owner-approved switch and actually scheduled", async () => {
  const groupFiles = ["collect-production.yml", "collect-realtime.yml", "collect-weather.yml", "collect-sales.yml", "collect-forecast.yml", "collect-forecast-recovery.yml", "collect-weather-recovery.yml"];
  const cloudflareScheduled = new Set(["collect-realtime.yml", "collect-forecast.yml", "collect-weather.yml", "collect-forecast-recovery.yml", "collect-weather-recovery.yml"]);
  for (const file of groupFiles) {
    const workflow = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    assert.match(workflow, /vars\.ENABLE_PRODUCTION_COLLECTOR == 'true'/, `${file} must reuse the single production-collector gate`);
    if (cloudflareScheduled.has(file)) {
      assert.doesNotMatch(workflow, /^\s*schedule:/m, `${file} is scheduled by the Cloudflare Cron; a GitHub schedule would duplicate it`);
      assert.match(workflow, /^\s*workflow_dispatch:/m, `${file} must stay dispatchable so the Cloudflare trigger can start it`);
    } else {
      assert.match(workflow, /^\s*schedule:/m, `${file} must carry a real schedule, not workflow_dispatch-only`);
    }
    assert.ok(declaredSources(workflow).length > 0, `${file} must select sources explicitly`);
    assert.doesNotMatch(workflow, /CLOUDFLARE_ACCOUNT_ID/, `${file} must resolve the account id from wrangler.production.jsonc, never a secret`);
  }
});

/**
 * A retry is a fresh runner, not a second scheduler.
 *
 * The collectors whose failure mode is UND_ERR_CONNECT_TIMEOUT chain up to
 * three attempts, each as its own job, because a retry inside one job reuses
 * the runner's egress address and so reuses whatever was refusing it. What
 * must never follow from that is a retry quietly collecting something the
 * workflow does not own, or a chain that keeps calling a provider that
 * already answered.
 */
test("a retry attempt repeats the workflow's own source and only after an outright failure", async () => {
  const chained = ["collect-forecast.yml", "collect-forecast-recovery.yml", "collect-weather-recovery.yml"];
  for (const file of chained) {
    const workflow = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    assert.deepEqual(declaredSources(workflow).length, 1,
      `${file} must name one source across every attempt — a retry may repeat it, never replace it`);

    const attempts = [...workflow.matchAll(/^\s*uses: \.\/\.github\/workflows\/collect-attempt\.yml$/gm)];
    assert.equal(attempts.length, 3, `${file} should chain exactly three attempts`);

    // Every attempt after the first is conditional on the previous FAILING, so
    // a healthy cycle makes exactly one and costs the provider nothing extra.
    const guards = [...workflow.matchAll(/needs\.(\w+)\.result == 'failure'/g)].map((match) => match[1]);
    assert.deepEqual(guards, ["collect", "retry_1"],
      `${file} must gate each retry on the previous attempt, in order`);
    assert.match(workflow, /vars\.ENABLE_PRODUCTION_COLLECTOR == 'true' && needs\.collect\.result/,
      `${file} retries must stay behind the same owner-approved switch as the first attempt`);
  }

  // The reusable attempt carries no schedule of its own: callers own cadence.
  const attempt = await readFile(new URL("../.github/workflows/collect-attempt.yml", import.meta.url), "utf8");
  assert.match(attempt, /^\s*workflow_call:/m, "collect-attempt must only ever be called by a cadence-group workflow");
  assert.doesNotMatch(attempt, /^\s*(?:schedule|workflow_dispatch):/m,
    "collect-attempt must not be independently schedulable or dispatchable");
});

test("A1 (airport_recent) is scheduled by exactly one collector workflow group", async () => {
  const groupFiles = ["collect-production.yml", "collect-realtime.yml", "collect-weather.yml", "collect-sales.yml", "collect-forecast.yml", "collect-forecast-recovery.yml", "collect-weather-recovery.yml"];
  const owners: string[] = [];
  for (const file of groupFiles) {
    const workflow = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    if (declaredSources(workflow).includes("airport_recent")) owners.push(file);
  }
  assert.deepEqual(owners, ["collect-production.yml"], "there must not be two competing scheduled A1 collectors");
});

test("Store Dynamics is owned only by the existing weekly slow workflow", async () => {
  const groupFiles = ["collect-production.yml", "collect-realtime.yml", "collect-weather.yml", "collect-sales.yml", "collect-forecast.yml", "collect-forecast-recovery.yml", "collect-weather-recovery.yml"];
  const owners: string[] = [];
  for (const file of groupFiles) {
    const workflow = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    if (declaredSources(workflow).includes("store_dynamics")) owners.push(file);
  }
  assert.deepEqual(owners, ["collect-sales.yml"]);
});

test("every production source is scheduled by exactly one cadence-group workflow", async () => {
  const groupFiles = ["collect-production.yml", "collect-realtime.yml", "collect-weather.yml", "collect-sales.yml", "collect-forecast.yml", "collect-forecast-recovery.yml", "collect-weather-recovery.yml"];
  const scheduledSources: string[] = [];
  for (const file of groupFiles) {
    const workflow = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    scheduledSources.push(...declaredSources(workflow));
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

/**
 * Exactly five authorized trigger-only Crons exist, on production only.
 *
 * Three are the primary cadences; two are the A5/weather recovery windows
 * added for temporal self-healing. A5 recovery is :53 rather than the :52
 * first proposed, because realtime already owns a trigger firing at :52 and
 * two expressions on the same minute is the routing ambiguity that must be
 * avoided — realtime cadence is the thing that may not change.
 *
 * Five is not a preference, it is the Workers Free ceiling. A 2026-09-01
 * production deploy configured six and the Cloudflare API rejected the whole
 * schedules update (code 10072) AFTER the Worker had uploaded, leaving the
 * new code live with the old schedule. Nothing in CI knew about that limit,
 * so the assertion below now encodes it.
 */
test("exactly five Cloudflare Cron Triggers exist, within the Workers Free per-account limit", () => {
  const files = readdirSync(".").filter((name) => /^wrangler.*\.jsonc?$/.test(name));
  assert.deepEqual(files, ["wrangler.production.jsonc"], "an unexpected wrangler config could hide a second Cron");
  const config = JSON.parse(readFileSync("wrangler.production.jsonc", "utf8"));
  assert.equal(config.triggers, undefined, "the default environment must stay Cron-free");
  assert.equal(config.env.staging.triggers, undefined, "staging must stay Cron-free");
  const crons = config.env.production.triggers?.crons;
  assert.deepEqual(crons, [
    "7,22,37,52 * * * *",
    "42 * * * *",
    "10 2,5,8,11,14,17,20,23 * * *",
    "53 * * * *",
    "25,40 2,5,8,11,14,17,20,23 * * *",
  ]);
  assert.equal(crons.length, 5, "only the audited trigger-only cadences and their recovery windows are authorized");
  // The hard platform ceiling. Exceeding it does not degrade gracefully — the
  // deploy fails with the Worker already uploaded and the schedule unchanged.
  assert.ok(crons.length <= WORKERS_FREE_CRON_TRIGGER_LIMIT,
    `Workers Free allows at most ${WORKERS_FREE_CRON_TRIGGER_LIMIT} Cron Triggers per account; a 6th fails the deploy (code 10072)`);
  assert.equal(WORKERS_FREE_CRON_TRIGGER_LIMIT, 5);
  assert.equal(new Set(crons).size, crons.length, "a duplicated expression would dispatch the same workflow twice");
  // The realtime cadence is non-negotiable and must survive every change here.
  assert.ok(crons.includes("7,22,37,52 * * * *"), "the realtime cadence must stay exactly as audited");
  assert.equal(crons.filter((cron: string) => cron.startsWith("7,22,37,52")).length, 1);

  // Weather recovery covers :25 and :40 from ONE expression. Splitting it into
  // two would be a sixth trigger, which the API rejects outright, so the shape
  // of this entry is what keeps the account on Workers Free.
  assert.ok(crons.includes("25,40 2,5,8,11,14,17,20,23 * * *"), "weather recovery must name both minutes in one expression");
  assert.equal(crons.filter((cron: string) => /^40[ ,]/.test(cron)).length, 0, "a standalone :40 expression would be a sixth trigger");
  assert.equal(crons.filter((cron: string) => /^25 /.test(cron)).length, 0, "the single-minute weather recovery expression must be gone");

  // The Wrangler config and the scheduler constant must not drift: the handler
  // routes by exact string, so a mismatch would leave the trigger firing into
  // an expression the code does not recognize, dispatching nothing.
  assert.deepEqual(crons, [...PRODUCTION_CRONS], "wrangler.production.jsonc and PRODUCTION_CRONS must stay identical");
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
  assert.deepEqual(declaredSources(forecast), ["airport_passenger_forecast"]);
});

test("Cloudflare is the single authoritative WEATHER scheduler and GitHub stays dispatchable", () => {
  const weather = readFileSync(".github/workflows/collect-weather.yml", "utf8");
  assert.doesNotMatch(weather, /^\s*schedule:/m);
  assert.doesNotMatch(weather, /- cron:/);
  assert.match(weather, /^\s*workflow_dispatch:/m);
  assert.match(weather, /RPK_PRODUCTION_SOURCES: weather/);
});

test("production smoke requires A5 picker dates whenever A5 reports LIVE", () => {
  const smoke = readFileSync(".github/workflows/site-smoke.yml", "utf8");
  assert.match(smoke, /source\.sourceId === "INCHEON_PASSENGER_FORECAST"/);
  assert.match(smoke, /a5Health\?\.status === "LIVE"/);
  assert.match(
    smoke,
    /date picker offers A5 forecast days when A5 is live/,
    "a silently empty A5 picker must fail smoke while the source claims LIVE",
  );
});

test("production smoke verifies Store Dynamics coverage, health, and one isolated cache key", () => {
  const smoke = readFileSync(".github/workflows/site-smoke.yml", "utf8");
  assert.match(smoke, /Store Dynamics covers all three exact areas/);
  assert.match(smoke, /row\.datasetId === "OA-15577"/);
  assert.match(smoke, /row\.mappingVersion === "oa-15577-standard-area-2026-09-03-v1"/);
  assert.match(smoke, /row\.tradeAreaCode === expected\.code/);
  assert.match(smoke, /row\.tradeAreaTypeCode === expected\.type/);
  assert.match(smoke, /storeDynamicsQuarters\.size === 1/);
  assert.match(smoke, /SEOUL_STORE_DYNAMICS/);
  assert.match(smoke, /OFFICIAL_HISTORICAL/);
  assert.match(smoke, /cacheProbe=\$\{cacheProbeKey\}/);
  assert.match(smoke, /summary Edge Cache moves from cold to HIT/);
  assert.match(smoke, /cfCacheStatus === "HIT"/);
});

test("read-budget evidence fails closed on missing indexes, scans, errors, or an incomplete run", () => {
  const measure = readFileSync("scripts/measure-production-read-budget.ts", "utf8");
  assert.match(measure, /airport_passenger_forecast_target_idx/);
  assert.match(measure, /const preflightPassed = missingIndexes\.length === 0/);
  assert.match(measure, /scanRegressions\.length === 0/);
  assert.match(measure, /const measurementComplete = preflightPassed/);
  assert.match(measure, /rowsReadPerUncachedRequest: summaryRowsRead/);
  assert.match(measure, /skipped: "unindexed_scan"/);
  assert.match(measure, /measuredSafeRowsRead: measuredSummaryRowsRead/);
  assert.match(measure, /if \(!preflightPassed \|\| !measurementComplete\) process\.exitCode = 1/);
  assert.match(measure, /requireRowsReadMetadata/);
  assert.doesNotMatch(measure, /!\/\\bUSING \(\?:COVERING \)\?INDEX/,
    "a full index SCAN is still proportional to a growing table");
  assert.doesNotMatch(measure, /rows_read \?\? 0/,
    "missing D1 measurement metadata must never be reported as zero");
  assert.doesNotMatch(measure, /SELECT COUNT\(\*\) AS rows FROM \$\{table\}/,
    "the diagnostic must not perform an unbounded baseline count");
});

/** The dispatch target and the live Cron must name the same workflow file. */
test("the production Cron and the dispatch target describe one scheduler path", () => {
  const config = JSON.parse(readFileSync("wrangler.production.jsonc", "utf8"));
  const dispatch = readFileSync("lib/realtime-dispatch.ts", "utf8");
  assert.deepEqual(config.env.production.triggers.crons, [
    "7,22,37,52 * * * *",
    "42 * * * *",
    "10 2,5,8,11,14,17,20,23 * * *",
    "53 * * * *",
    "25,40 2,5,8,11,14,17,20,23 * * *",
  ]);
  assert.match(dispatch, /REALTIME_WORKFLOW_FILE = "collect-realtime\.yml"/);
  assert.match(dispatch, /FORECAST_WORKFLOW_FILE = "collect-forecast\.yml"/);
  assert.match(dispatch, /WEATHER_WORKFLOW_FILE = "collect-weather\.yml"/);
  assert.match(dispatch, /FORECAST_RECOVERY_WORKFLOW_FILE = "collect-forecast-recovery\.yml"/);
  assert.match(dispatch, /WEATHER_RECOVERY_WORKFLOW_FILE = "collect-weather-recovery\.yml"/);
  assert.match(dispatch, /FORECAST_RECOVERY_CRON = "53 \* \* \* \*"/);
  assert.match(dispatch, /WEATHER_RECOVERY_CRON = "25,40 2,5,8,11,14,17,20,23 \* \* \*"/);
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

/**
 * A1's day, in numbers rather than in prose.
 *
 * The departures scan used to get one attempt at 06:07 KST and its next one
 * four hours later, so a single blocked runner cost the reader a whole morning
 * on the screen whose purpose is today's gate ranking. It now runs first at
 * 04:07 with two immediate fresh-runner retries, and 06:07 became the day's
 * refresh.
 *
 * More windows are only safe if the arithmetic holds, so the arithmetic is
 * asserted here: A1 documents 500 development calls a day and the worst case
 * must be exactly that, never above.
 */
test("the A1 windows cannot exceed the documented 500 calls a day", async () => {
  const early = await readFile(new URL("../.github/workflows/collect-airport-recovery.yml", import.meta.url), "utf8");
  const daily = await readFile(new URL("../.github/workflows/collect-production.yml", import.meta.url), "utf8");

  const ceilings = (workflow: string) => [...workflow.matchAll(/(?:a1_max_requests|RPK_A1_MAX_REQUESTS): "(\d+)"/g)]
    .map((match) => Number(match[1]));

  const earlyCeilings = ceilings(early);
  const dailyCeilings = ceilings(daily);
  assert.equal(earlyCeilings.length, 3, "the early window runs three attempts, one job apiece");
  assert.equal(dailyCeilings.length, 1, "the daily group runs one");

  const worstCase = [...earlyCeilings, ...dailyCeilings].reduce((sum, value) => sum + value, 0);
  assert.ok(worstCase <= 500, `A1 documents 500 calls/day; this day's worst case is ${worstCase}`);
  assert.equal(worstCase, 500, "the budget is spent deliberately, so a drift in either direction should be noticed");

  // Each ceiling has to clear the ~118 pages the D-3..today window needs, or a
  // scan would abort mid-way and the extra windows would buy nothing.
  for (const ceiling of [...earlyCeilings, ...dailyCeilings]) {
    assert.ok(ceiling >= 125, `a ceiling of ${ceiling} is below what one full scan needs`);
  }
});

test("A1 runs early, and the later window refreshes rather than skipping", async () => {
  const early = await readFile(new URL("../.github/workflows/collect-airport-recovery.yml", import.meta.url), "utf8");
  const daily = await readFile(new URL("../.github/workflows/collect-production.yml", import.meta.url), "utf8");

  // 04:07 KST is 19:07 UTC the previous day. Off-minute per ENGINEERING_DIRECTION.
  assert.match(early, /- cron: "7 19 \* \* \*"/, "the early window must run at 04:07 KST");
  assert.match(daily, /- cron: "7 21 \* \* \*"/, "the daily group stays at 06:07 KST");

  // Gate assignments firm up through the morning, so exactly one window a day
  // rescans. Two would double the day's cost; none would freeze the early,
  // gate-poor picture until tomorrow.
  assert.match(daily, /RPK_A1_RESCAN_TODAY: "true"/, "the 06:07 group refreshes the day");
  assert.doesNotMatch(early, /a1_rescan_today: true/, "the early window keeps the same-day guard");

  // Every attempt is a separate job, gated on the previous one failing.
  const guards = [...early.matchAll(/needs\.(\w+)\.result == 'failure'/g)].map((match) => match[1]);
  assert.deepEqual(guards, ["collect", "retry_1"]);
});
