import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CloudflareD1RestDatabase } from "../lib/d1-rest";
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
