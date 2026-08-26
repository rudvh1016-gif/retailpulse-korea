import assert from "node:assert/strict";
import test from "node:test";
import { CloudflareD1RestDatabase } from "../lib/d1-rest";
import { evaluateQuotaUsage } from "../lib/quota-guard";
import { normalizeAirportFlight } from "../lib/source-adapters";

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
