/**
 * Prepared-not-active Incheon Airport services (15095071 / 15095070 / 15114085).
 *
 * Every fixture here is SYNTHETIC: "Synthetic Country A", flight "ZZ1001",
 * airport "ZZZ". The real field contract has never been observed (every call
 * so far returned HTTP 403 / resultCode 30), so these tests pin behaviour —
 * classification, fail-closed parsing, bounds, redaction — not provider data.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  INCHEON_TRUTH_LABELS,
  MAX_SCHEDULE_PAGES,
  SCHEDULE_PAGE_SIZE,
  buildMonthlyStatsRequest,
  buildScheduledDeparturesRequest,
  describeRequest,
  documentedFieldsOf,
  emptyResultFor,
  inspectIncheonResponse,
  kstMonth,
  latestCompleteMonth,
  parseHourBand,
  parseMonthlyStats,
  parseScheduledDepartures,
  sanitizeProviderMessage,
  shiftMonth,
} from "../lib/incheon-airport-stats.mjs";
import type { ParsedMonthlyStats, ParsedSchedulePage } from "../lib/incheon-airport-stats.mjs";
import {
  MAX_ATTEMPTS_CEILING,
  readServiceKey,
  requestAllScheduledDeparturePages,
  requestIncheonOperation,
} from "../lib/incheon-airport-stats-client.mjs";
import {
  PROBE_LINE_PREFIX,
  buildProbePlans,
  formatProbeLine,
  renderStepSummary,
  runIncheonStatsProbe,
} from "../scripts/probe-incheon-airport-stats.mjs";

const NOW = new Date("2026-10-14T03:00:00Z");
// Synthetic, and deliberately full of characters that change under encoding.
const KEY = "SYNTHETIC+test/key==";
const ENV = { DATA_GO_KR_SERVICE_KEY: KEY };

type Reply = { status: number; body: string; contentType?: string } | Error;

function scriptedFetch(replies: Reply[]) {
  const calls: URL[] = [];
  const fetchImpl = async (input: URL, init: RequestInit): Promise<Response> => {
    calls.push(input);
    assert.equal(init.redirect, "manual", "a keyed URL must never follow a redirect");
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected extra request");
    if (reply instanceof Error) throw reply;
    return new Response(reply.body, {
      status: reply.status,
      headers: { "content-type": reply.contentType ?? "application/json;charset=UTF-8" },
    });
  };
  return { fetchImpl, calls };
}

const header = (resultCode: string, resultMsg = "NORMAL SERVICE.", body?: unknown) =>
  JSON.stringify({ response: { header: { resultCode, resultMsg }, ...(body === undefined ? {} : { body }) } });
const okBody = (items: unknown[], totalCount: number | string = items.length) =>
  header("00", "NORMAL SERVICE.", { items: { item: items }, numOfRows: 10, pageNo: 1, totalCount });
const json = (status: number, body: string) => ({ status, body });

const countryRow = (country: string, arr: unknown, dep: unknown, total: unknown, region: unknown = "Synthetic Region 1") =>
  ({ region, country, arrPassenger: arr, depPassenger: dep, passenger: total });
const timeRow = (time: unknown, arr: unknown, dep: unknown, total: unknown) =>
  ({ time, arrPassenger: arr, depPassenger: dep, passenger: total });
const scheduleRow = (overrides: Record<string, unknown> = {}) => ({
  airline: "Synthetic Air",
  airport: "Synthetic Airport",
  airportcode: "ZZZ",
  flightid: "ZZ1001",
  masterflightid: "",
  codeshare: "Master",
  season: "S26",
  firstdate: "20261001",
  lastdate: "20261024",
  st: "0830",
  monday: "Y",
  tuesday: "N",
  wednesday: "Y",
  thursday: "N",
  friday: "Y",
  saturday: "N",
  sunday: "N",
  ...overrides,
});

const countryPlan = () => buildMonthlyStatsRequest("ROUTE_COUNTRY_PASSENGERS", { fromMonth: "202608", toMonth: "202608", now: NOW });
const flightsPlan = () => buildMonthlyStatsRequest("ROUTE_COUNTRY_FLIGHTS", { fromMonth: "202608", toMonth: "202608", now: NOW });
const timePlan = () => buildMonthlyStatsRequest("TIME_BAND_PASSENGERS", { fromMonth: "202608", toMonth: "202608", now: NOW });
const schedulePlan = (pageNo = 1, numOfRows = SCHEDULE_PAGE_SIZE) => buildScheduledDeparturesRequest({ pageNo, numOfRows });

function monthly(parsed: ParsedMonthlyStats | ParsedSchedulePage | null): ParsedMonthlyStats {
  assert.ok(parsed && parsed.shape === "MONTHLY_STATS");
  return parsed;
}
const parsePayload = (body: string) => JSON.parse(body) as unknown;
const noSleep = async () => {};

// ── Requests ────────────────────────────────────────────────────────────────

test("endpoints, dataset ids and parameters are exactly the ones PR #369 sent", () => {
  const country = countryPlan();
  assert.equal(country.endpoint, "https://apis.data.go.kr/B551177/AviationStatsByCountry/getTotalNumberOfPassenger");
  assert.equal(country.datasetId, "15095071");
  assert.deepEqual(Object.entries(country.params), [["from_month", "202608"], ["to_month", "202608"], ["type", "json"]]);
  assert.equal(flightsPlan().endpoint, "https://apis.data.go.kr/B551177/AviationStatsByCountry/getTotalNumberOfFlight");
  assert.equal(flightsPlan().datasetId, "15095071");
  const time = timePlan();
  assert.equal(time.endpoint, "https://apis.data.go.kr/B551177/AviationStatsByTimeline/getTotalNumberOfPassenger");
  assert.equal(time.datasetId, "15095070");
  const regular = schedulePlan();
  assert.equal(regular.endpoint, "https://apis.data.go.kr/B551177/StatusOfPaxFltSched/getPaxFltSchedDeparturesDeOdp");
  assert.equal(regular.datasetId, "15114085");
  assert.deepEqual(Object.entries(regular.params), [["pageNo", "1"], ["numOfRows", "1000"], ["type", "json"], ["airport", ""], ["lang", "K"]]);
});

test("requests ask only for complete KST months and bounded pages", () => {
  const ask = (fromMonth: string, toMonth: string) => () =>
    buildMonthlyStatsRequest("ROUTE_COUNTRY_PASSENGERS", { fromMonth, toMonth, now: NOW });
  assert.doesNotThrow(ask("202609", "202609"), "the last fully ended month is allowed");
  assert.throws(ask("202610", "202610"), /month_not_yet_complete/);
  assert.throws(ask("202609", "202608"), /month_range_reversed/);
  assert.throws(ask("202508", "202608"), /month_range_too_long/);
  assert.doesNotThrow(ask("202509", "202608"));
  for (const bad of ["2026-08", "202613", "202600", "20268", ""]) assert.throws(ask(bad, "202608"), /month_must_be_yyyymm/);

  for (const pageNo of [0, MAX_SCHEDULE_PAGES + 1, 1.5]) assert.throws(() => buildScheduledDeparturesRequest({ pageNo }), /page_out_of_bounds/);
  for (const numOfRows of [0, SCHEDULE_PAGE_SIZE + 1]) assert.throws(() => buildScheduledDeparturesRequest({ numOfRows }), /page_size_out_of_bounds/);
  for (const airport of ["nrt", "NRTX", "N1T"]) assert.throws(() => buildScheduledDeparturesRequest({ airport }), /airport_must_be_blank_or_iata/);
  assert.equal(buildScheduledDeparturesRequest({ airport: "ZZZ" }).params.airport, "ZZZ");
});

test("month arithmetic follows the KST calendar", () => {
  assert.equal(kstMonth(new Date("2026-09-30T14:59:59Z")), "202609");
  assert.equal(kstMonth(new Date("2026-09-30T15:00:00Z")), "202610");
  assert.equal(shiftMonth("202601", -1), "202512");
  assert.equal(shiftMonth("202612", 1), "202701");
  assert.equal(latestCompleteMonth(NOW), "202609");
});

test("a request description never holds the key; only the fetched URL does", async () => {
  const plan = countryPlan();
  const described = JSON.stringify(describeRequest(plan));
  assert.ok(!described.includes("serviceKey"));
  assert.deepEqual(describeRequest(plan).endpointPath, "/B551177/AviationStatsByCountry/getTotalNumberOfPassenger");

  const { fetchImpl, calls } = scriptedFetch([json(403, header("30", "등록되지 않은 서비스키"))]);
  const result = await requestIncheonOperation(plan, { env: ENV, fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get("serviceKey"), KEY);
  assert.equal(calls[0].searchParams.get("from_month"), "202608");
  const serialized = JSON.stringify(result);
  for (const leak of [KEY, encodeURIComponent(KEY), "serviceKey", "apis.data.go.kr"]) assert.ok(!serialized.includes(leak), `result leaked ${leak.length} chars`);
});

test("the key is read from DATA_GO_KR_SERVICE_KEY and nowhere else", async () => {
  assert.equal(readServiceKey({ DATA_GO_KR_SERVICE_KEY: `  ${KEY}  ` }), KEY);
  assert.equal(readServiceKey({ SERVICE_KEY: KEY, DATA_GO_KR_KEY: KEY }), null);
  assert.equal(readServiceKey({ DATA_GO_KR_SERVICE_KEY: "   " }), null);
  for (const env of [{}, { DATA_GO_KR_SERVICE_KEY: " " }]) {
    const { fetchImpl, calls } = scriptedFetch([]);
    const result = await requestIncheonOperation(countryPlan(), { env, fetchImpl });
    assert.equal(result.classification.kind, "KEY_NOT_CONFIGURED");
    assert.equal(result.attempts, 0);
    assert.equal(calls.length, 0, "no key means no request");
  }
});

// ── Classification ──────────────────────────────────────────────────────────

const xml30 = "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
const gateway = (code: string, message: string) =>
  JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: "SERVICE ERROR", returnAuthMsg: message, returnReasonCode: code } } });
const html = (title: string) => `<!DOCTYPE html><html><head><title>${title}</title></head><body>${title}</body></html>`;

const CLASSIFICATION_CASES: Array<[string, { status: number; body: string; contentType?: string }, string, boolean]> = [
  ["HTTP 403 + JSON code 30, the shape run 38402837925 received", json(403, header("30", "등록되지 않은 서비스키")), "NOT_REGISTERED", false],
  ["gateway XML code 30 on HTTP 200", { status: 200, body: xml30, contentType: "text/xml" }, "NOT_REGISTERED", false],
  ["plain-text gateway constant without a code", { status: 403, body: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR", contentType: "text/plain" }, "NOT_REGISTERED", false],
  ["gateway JSON code 31", json(200, gateway("31", "DEADLINE_HAS_EXPIRED_ERROR")), "EXPIRED", false],
  ["daily quota code 22", json(200, header("22", "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR")), "LIMIT_EXCEEDED", false],
  ["quota code 22 decides even on HTTP 429", json(429, header("22")), "LIMIT_EXCEEDED", false],
  ["per-second limit code 23", json(200, header("23")), "RATE_LIMITED", false],
  ["plain HTTP 429", { status: 429, body: "Too Many Requests", contentType: "text/plain" }, "RATE_LIMITED", false],
  ["HTTP 401 plain text", { status: 401, body: "Unauthorized", contentType: "text/plain" }, "AUTH_REJECTED", false],
  ["HTTP 403 JSON without a code", json(403, JSON.stringify({ message: "Forbidden" })), "AUTH_REJECTED", false],
  ["access denied code 20", json(200, header("20")), "AUTH_REJECTED", false],
  ["unregistered IP code 32", json(200, gateway("32", "UNREGISTERED_IP_ERROR")), "AUTH_REJECTED", false],
  ["no-data code 03", json(200, header("03", "NODATA_ERROR")), "NO_DATA", false],
  ["success with an empty item list", json(200, header("00", "NORMAL SERVICE.", { items: "", numOfRows: 10, pageNo: 1, totalCount: 0 })), "NO_DATA", false],
  ["XML no-data", { status: 200, body: "<response><header><resultCode>03</resultCode><resultMsg>NODATA_ERROR</resultMsg></header></response>", contentType: "text/xml" }, "NO_DATA", false],
  ["HTTP 502 HTML gateway page", { status: 502, body: html("502 Bad Gateway"), contentType: "text/html" }, "GATEWAY_HTML", true],
  ["HTTP 200 HTML maintenance page", { status: 200, body: html("Maintenance"), contentType: "text/html" }, "GATEWAY_HTML", false],
  ["HTTP 403 HTML block page", { status: 403, body: html("Request Blocked"), contentType: "text/html" }, "GATEWAY_HTML", false],
  ["HTML served with a JSON content type", { status: 504, body: html("Gateway Timeout") }, "GATEWAY_HTML", true],
  ["HTTP 503 JSON", json(503, "{}"), "SERVER_ERROR", true],
  ["HTTP 500 plain text", { status: 500, body: "Internal Server Error", contentType: "text/plain" }, "SERVER_ERROR", true],
  ["HTTP 301 redirect", { status: 301, body: "", contentType: "text/plain" }, "REQUEST_REJECTED", false],
  ["HTTP 404 plain text", { status: 404, body: "API not found", contentType: "text/plain" }, "REQUEST_REJECTED", false],
  ["invalid parameter code 10", json(200, header("10", "INVALID_REQUEST_PARAMETER_ERROR")), "REQUEST_REJECTED", false],
  ["missing parameter code 11", json(200, header("11")), "REQUEST_REJECTED", false],
  ["provider timeout code 05", json(200, header("05")), "PROVIDER_ERROR", false],
  ["unknown code 77", json(200, header("77")), "PROVIDER_ERROR", false],
  ["malformed JSON", json(200, "{\"response\": {\"header\""), "SCHEMA_ERROR", false],
  ["unknown JSON envelope", json(200, JSON.stringify({ data: [] })), "SCHEMA_ERROR", false],
  ["XML success body although JSON was requested", { status: 200, body: "<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body></body></response>", contentType: "text/xml" }, "SCHEMA_ERROR", false],
  ["empty HTTP 200 body", json(200, ""), "SCHEMA_ERROR", false],
  ["success without a body", json(200, header("00")), "SCHEMA_ERROR", false],
  ["items that are not a list", json(200, header("00", "OK", { items: 5, totalCount: 1 })), "SCHEMA_ERROR", false],
  ["an item that is not an object", json(200, header("00", "OK", { items: { item: ["x"] }, totalCount: 1 })), "SCHEMA_ERROR", false],
  ["empty items but a positive total", json(200, header("00", "OK", { items: "", totalCount: 4 })), "SCHEMA_ERROR", false],
  ["invalid totalCount", json(200, header("00", "OK", { items: { item: [countryRow("Synthetic Country A", 1, 1, 2)] }, totalCount: "many" })), "SCHEMA_ERROR", false],
  ["success with rows", json(200, okBody([countryRow("Synthetic Country A", 1, 1, 2)])), "OK", false],
  ["a single row as an object, items as a bare array", json(200, header("00", "OK", { items: [countryRow("Synthetic Country A", 1, 1, 2)], totalCount: 1 })), "OK", false],
];

for (const [name, response, kind, retryable] of CLASSIFICATION_CASES) {
  test(`classification: ${name} → ${kind}`, () => {
    const { classification, payload } = inspectIncheonResponse({
      status: response.status,
      contentType: response.contentType ?? "application/json",
      bodyText: response.body,
      serviceKey: KEY,
    });
    assert.equal(classification.kind, kind);
    assert.equal(classification.retryable, retryable);
    assert.equal(classification.authFailure, ["NOT_REGISTERED", "EXPIRED", "AUTH_REJECTED"].includes(kind));
    assert.equal(classification.httpStatus, response.status);
    assert.equal(payload === null, kind !== "OK", "only an OK response hands its payload on");
  });
}

test("the observed 403/30 keeps its official code and message, and blocks without retry", () => {
  const { classification } = inspectIncheonResponse({ status: 403, bodyText: header("30", "등록되지 않은 서비스키"), serviceKey: KEY });
  assert.deepEqual(
    { kind: classification.kind, resultCode: classification.resultCode, resultMsg: classification.resultMsg, retryable: classification.retryable },
    { kind: "NOT_REGISTERED", resultCode: "30", resultMsg: "등록되지 않은 서비스키", retryable: false },
  );
  const numeric = inspectIncheonResponse({ status: 200, bodyText: JSON.stringify({ response: { header: { resultCode: 3, resultMsg: "NODATA_ERROR" } } }) });
  assert.equal(numeric.classification.resultCode, "03");
  assert.equal(numeric.classification.kind, "NO_DATA");
});

test("provider messages are redacted and reduced; bodies of HTML and text pages are never echoed", () => {
  const leaky = `bad key ${KEY} at https://apis.data.go.kr/x?serviceKey=${encodeURIComponent(KEY)}&pageNo=1`;
  const message = sanitizeProviderMessage(leaky, KEY);
  assert.ok(message !== null);
  for (const leak of [KEY, encodeURIComponent(KEY), "http", "apis.data.go.kr", "serviceKey", "?", "&", "="]) assert.ok(!message.includes(leak));
  assert.ok((sanitizeProviderMessage("x".repeat(500), KEY) ?? "").length <= 120);
  const xml = inspectIncheonResponse({ status: 200, contentType: "text/xml", bodyText: xml30, serviceKey: KEY });
  assert.equal(xml.classification.resultMsg, "SERVICE_KEY_IS_NOT_REGISTERED_ERROR", "the specific gateway message wins over the generic errMsg");

  const page = inspectIncheonResponse({ status: 502, contentType: "text/html", bodyText: html(`secret ${KEY}`), serviceKey: KEY });
  assert.equal(page.classification.resultMsg, null);
  const text = inspectIncheonResponse({ status: 401, contentType: "text/plain", bodyText: `Unauthorized ${KEY}`, serviceKey: KEY });
  assert.equal(text.classification.resultMsg, null);
  const constant = inspectIncheonResponse({ status: 403, contentType: "text/plain", bodyText: `x SERVICE_KEY_IS_NOT_REGISTERED_ERROR ${KEY}`, serviceKey: KEY });
  assert.equal(constant.classification.resultMsg, "SERVICE_KEY_IS_NOT_REGISTERED_ERROR");
});

// ── Bounded retry ───────────────────────────────────────────────────────────

const hangUntilAborted = (_input: URL, init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });

test("a client timeout retries once within the bound, then succeeds", async () => {
  const { fetchImpl: answer } = scriptedFetch([json(200, okBody([countryRow("Synthetic Country A", 1, 2, 3)]))]);
  let calls = 0;
  const delays: number[] = [];
  const result = await requestIncheonOperation(countryPlan(), {
    env: ENV,
    timeoutMs: 5,
    maxAttempts: 2,
    sleep: async (delayMs) => { delays.push(delayMs); },
    fetchImpl: (input, init) => (++calls === 1 ? hangUntilAborted(input, init) : answer(input, init)),
  });
  assert.equal(calls, 2);
  assert.equal(result.attempts, 2);
  assert.equal(result.classification.kind, "OK");
  assert.deepEqual(delays, [2_000]);
});

test("5xx and connection failures stop at the attempt bound and say so", async () => {
  const server = scriptedFetch([json(503, "{}"), json(503, "{}")]);
  const failed = await requestIncheonOperation(countryPlan(), { env: ENV, fetchImpl: server.fetchImpl, maxAttempts: 2, sleep: noSleep });
  assert.equal(server.calls.length, 2);
  assert.equal(failed.classification.kind, "SERVER_ERROR");
  assert.equal(failed.retryExhausted, true);

  const reset = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("socket"), { code: "ECONNRESET" }) });
  const network = scriptedFetch([reset, reset]);
  const dropped = await requestIncheonOperation(countryPlan(), { env: ENV, fetchImpl: network.fetchImpl, maxAttempts: 2, sleep: noSleep });
  assert.equal(network.calls.length, 2);
  assert.equal(dropped.classification.kind, "NETWORK");
  assert.equal(dropped.classification.issue, "ECONNRESET");

  const many = scriptedFetch(Array.from({ length: 10 }, () => json(500, "{}")));
  await requestIncheonOperation(countryPlan(), { env: ENV, fetchImpl: many.fetchImpl, maxAttempts: 10, sleep: noSleep });
  assert.equal(many.calls.length, MAX_ATTEMPTS_CEILING, "maxAttempts is capped");
});

test("auth, quota, request, no-data and schema outcomes are final on the first answer", async () => {
  const finals: Array<[Reply, string]> = [
    [json(403, header("30", "등록되지 않은 서비스키")), "NOT_REGISTERED"],
    [json(200, gateway("31", "DEADLINE_HAS_EXPIRED_ERROR")), "EXPIRED"],
    [json(200, header("22")), "LIMIT_EXCEEDED"],
    [{ status: 429, body: "slow down", contentType: "text/plain" }, "RATE_LIMITED"],
    [{ status: 401, body: "Unauthorized", contentType: "text/plain" }, "AUTH_REJECTED"],
    [json(200, header("10")), "REQUEST_REJECTED"],
    [json(200, header("03")), "NO_DATA"],
    [json(200, "{oops"), "SCHEMA_ERROR"],
    [{ status: 200, body: html("Maintenance"), contentType: "text/html" }, "GATEWAY_HTML"],
  ];
  for (const [reply, kind] of finals) {
    const { fetchImpl, calls } = scriptedFetch([reply, reply, reply]);
    const result = await requestIncheonOperation(countryPlan(), { env: ENV, fetchImpl, maxAttempts: 3, sleep: noSleep });
    assert.equal(result.classification.kind, kind);
    assert.equal(calls.length, 1, `${kind} must not be retried`);
  }
});

// ── Monthly statistics parsing ──────────────────────────────────────────────

test("route-country rows keep provider labels and counts; absent stays null, never zero", () => {
  const body = okBody([
    countryRow("Synthetic Country A", "1,200", 800, "2000"),
    countryRow("Synthetic Country B", "0", "706.0", 706),
    countryRow("Synthetic Country C", "", 5, null),
    countryRow("합계", 1200, 1511, 2711, ""),
  ]);
  const parsed = parseMonthlyStats(countryPlan(), parsePayload(body));
  assert.equal(parsed.status, "VALID");
  assert.equal(parsed.contract.status, "MATCH");
  assert.deepEqual(parsed.contract.observedFieldNames, ["arrPassenger", "country", "depPassenger", "passenger", "region"]);
  assert.deepEqual(parsed.rows.map(({ label, arrivals, departures, total }) => [label, arrivals, departures, total]), [
    ["Synthetic Country A", 1200, 800, 2000],
    ["Synthetic Country B", 0, 706, 706],
    ["Synthetic Country C", null, 5, null],
    ["합계", 1200, 1511, 2711],
  ]);
  assert.equal(parsed.rows[0].region, "Synthetic Region 1");
  assert.equal(parsed.rows[3].region, null);
  assert.equal(parsed.rows[3].isProviderAggregate, true, "the provider's own total row is marked, never summed again");
  assert.equal(parsed.aggregateRowCount, 1);
  assert.equal(parsed.complete, true);
  assert.deepEqual(parsed.basis, { fromMonth: "202608", toMonth: "202608", source: "REQUEST_PARAMETERS" });
  assert.equal(parsed.truth.groupedBy, "ROUTE_COUNTRY_AS_DEFINED_BY_PROVIDER");
  assert.equal(parsed.truth.terminalScope, "AIRPORT_WIDE");
  for (const row of parsed.rows) assert.ok(!("terminal" in row), "an airport-wide total is never split by terminal");
});

test("undocumented, missing, duplicated and inconsistent fields mark the contract DRIFT and stay out of rows", () => {
  const extra = parseMonthlyStats(countryPlan(), parsePayload(okBody([{ ...countryRow("Synthetic Country A", 1, 1, 2), terminalid: "P01" }])));
  assert.equal(extra.status, "VALID");
  assert.equal(extra.contract.status, "DRIFT");
  assert.deepEqual(extra.contract.unknownFieldNames, ["terminalid"]);
  assert.ok(extra.contract.issues.includes("PROVIDER_TERMINAL_FIELD_UNREVIEWED"));
  assert.ok(!JSON.stringify(extra.rows).includes("P01"), "unknown values never reach a row");

  const noRegion = parseMonthlyStats(countryPlan(), parsePayload(okBody([{ country: "Synthetic Country A", arrPassenger: 1, depPassenger: 1, passenger: 2 }])));
  assert.deepEqual(noRegion.contract.missingDocumentedFieldNames, ["region"]);
  assert.equal(noRegion.contract.status, "DRIFT");

  const duplicate = parseMonthlyStats(countryPlan(), parsePayload(okBody([countryRow("Synthetic Country A", 1, 1, 2), countryRow("Synthetic Country A", 3, 3, 6)])));
  assert.equal(duplicate.duplicateKeyCount, 1);
  assert.ok(duplicate.contract.issues.includes("DUPLICATE_ROW_KEYS"));

  const mismatch = parseMonthlyStats(countryPlan(), parsePayload(okBody([countryRow("Synthetic Country A", 1, 1, 5)])));
  assert.ok(mismatch.contract.issues.includes("PROVIDER_TOTAL_DIFFERS_FROM_ARRIVALS_PLUS_DEPARTURES"));
  assert.equal(mismatch.rows[0].total, 5, "the provider total is kept as published, not recomputed");

  const partial = parseMonthlyStats(countryPlan(), parsePayload(okBody([countryRow("Synthetic Country A", 1, 1, 2)], 25)));
  assert.equal(partial.complete, false);
  assert.ok(partial.contract.issues.includes("TOTAL_COUNT_DIFFERS_FROM_ITEMS"));
});

test("an unreadable value fails the whole response closed instead of producing partial rows", () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [countryRow("Synthetic Country A", "-5", 1, 2), "arrPassenger:INVALID"],
    [countryRow("Synthetic Country A", "12.5", 1, 2), "arrPassenger:INVALID"],
    [countryRow("Synthetic Country A", "-", 1, 2), "arrPassenger:INVALID"],
    [countryRow("Synthetic Country A", 1, { n: 1 }, 2), "depPassenger:INVALID"],
    [countryRow("", 1, 1, 2), "country:MISSING"],
    [countryRow("Synthetic Country A", null, "", undefined), "COUNTS_ALL_ABSENT"],
    [countryRow("Synthetic Country A", 1, 1, 2, ["x"]), "region:INVALID"],
  ];
  for (const [bad, issue] of cases) {
    const parsed = parseMonthlyStats(countryPlan(), parsePayload(okBody([countryRow("Synthetic Country B", 1, 1, 2), bad])));
    assert.equal(parsed.status, "SCHEMA_ERROR");
    assert.deepEqual(parsed.rows, []);
    assert.ok(parsed.schemaIssues.includes(issue), `${issue} expected, got ${parsed.schemaIssues.join(",")}`);
    assert.equal(parsed.itemCount, 2);
  }
});

test("the flight operation reads flight fields and is labelled as flights", () => {
  const parsed = parseMonthlyStats(flightsPlan(), parsePayload(okBody([{ region: "Synthetic Region 1", country: "Synthetic Country A", arrFlight: 30, depFlight: 31, flights: 61 }])));
  assert.equal(parsed.status, "VALID");
  assert.equal(parsed.contract.status, "MATCH");
  assert.deepEqual([parsed.rows[0].arrivals, parsed.rows[0].departures, parsed.rows[0].total], [30, 31, 61]);
  assert.equal(parsed.truth.metricDefinition, "route_country_flights");
  assert.deepEqual([...documentedFieldsOf("ROUTE_COUNTRY_FLIGHTS")], ["country", "region", "arrFlight", "depFlight", "flights"]);
});

test("time bands are read only when unambiguous; anything else stays raw and flags review", () => {
  const bands: Array<[string, [number, number] | null]> = [
    ["00~01", [0, 1]], ["0-1", [0, 1]], ["00시~01시", [0, 1]], ["00:00~01:00", [0, 1]], ["0000~0100", [0, 1]],
    ["00:00~00:59", [0, 1]], ["23~24", [23, 24]], ["23~00", [23, 24]], ["7", [7, 8]], ["07시", [7, 8]], ["06~09", [6, 9]],
    ["새벽", null], ["25~26", null], ["05~03", null], ["1200", null], ["", null],
  ];
  for (const [label, expected] of bands) {
    const band = parseHourBand(label);
    assert.deepEqual(band === null ? null : [band.startHour, band.endHour], expected, label);
  }

  const parsed = parseMonthlyStats(timePlan(), parsePayload(okBody([
    timeRow("00~01", 10, 20, 30),
    timeRow("새벽", 1, 1, 2),
    timeRow("합계", 11, 21, 32),
  ])));
  assert.equal(parsed.status, "VALID");
  assert.deepEqual(parsed.rows.map((row) => [row.label, row.hourBand && [row.hourBand.startHour, row.hourBand.endHour], row.isProviderAggregate]), [
    ["00~01", [0, 1], false],
    ["새벽", null, false],
    ["합계", null, true],
  ]);
  assert.ok(parsed.contract.issues.includes("TIME_BAND_UNRECOGNIZED"));
  assert.equal(parsed.contract.status, "DRIFT");
  assert.equal(parsed.truth.terminalScope, "AIRPORT_WIDE");
});

test("NO_DATA is a valid empty answer: no rows and no total, never a zero", async () => {
  for (const plan of [countryPlan(), timePlan(), schedulePlan()]) {
    const empty = emptyResultFor(plan);
    assert.equal(empty.status, "EMPTY");
    assert.deepEqual(empty.rows, []);
    assert.equal(empty.totalCount, null);
    assert.equal(empty.contract.status, "UNOBSERVED");
  }
  const { fetchImpl } = scriptedFetch([json(200, header("03", "NODATA_ERROR"))]);
  const result = await requestIncheonOperation(countryPlan(), { env: ENV, fetchImpl });
  assert.equal(result.classification.kind, "NO_DATA");
  assert.equal(monthly(result.parsed).status, "EMPTY");
});

// ── Schedule parsing ────────────────────────────────────────────────────────

test("scheduled departures keep the provider's calendar dates and time, with no terminal inferred", () => {
  const parsed = parseScheduledDepartures(schedulePlan(), parsePayload(okBody([
    scheduleRow(),
    scheduleRow({ flightid: "ZZ1002", masterflightid: "ZZ1001", codeshare: "Slave", st: "830", firstdate: "20260929", lastdate: "20261025", monday: "N", sunday: "Y", season: "2026 하계" }),
  ])));
  assert.equal(parsed.status, "VALID");
  assert.equal(parsed.contract.status, "MATCH");
  assert.deepEqual(parsed.rows[0], {
    flightId: "ZZ1001",
    masterFlightId: null,
    codeshare: "Master",
    airline: "Synthetic Air",
    airport: "Synthetic Airport",
    airportCode: "ZZZ",
    season: "S26",
    validFrom: "2026-10-01",
    validTo: "2026-10-24",
    scheduledTime: "08:30",
    weekdays: ["MON", "WED", "FRI"],
  });
  assert.equal(parsed.rows[1].masterFlightId, "ZZ1001");
  assert.deepEqual(parsed.rows[1].weekdays, ["WED", "FRI", "SUN"]);
  assert.deepEqual(parsed.basis, { validFromMin: "2026-09-29", validToMax: "2026-10-25", seasons: ["2026 하계", "S26"], source: "PROVIDER_ROWS" });
  assert.equal(parsed.pagesNeeded, 1);
  assert.equal(parsed.withinPagingBound, true);
  assert.equal(parsed.complete, true);
  assert.equal(parsed.truth.nature, "OFFICIAL_SCHEDULE");
  for (const row of parsed.rows) assert.ok(!("terminal" in row));
});

test("an unreadable schedule row fails the page closed and names only the field", () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ monday: "월" }, "monday:UNRECOGNIZED_VALUE"],
    [{ friday: "" }, "friday:UNRECOGNIZED_VALUE"],
    [{ firstdate: "20261030", lastdate: "20261001" }, "firstdate:AFTER_LASTDATE"],
    [{ firstdate: "20260231" }, "firstdate:INVALID"],
    [{ st: "2460" }, "st:INVALID"],
    [{ st: "" }, "st:MISSING"],
    [{ flightid: undefined }, "flightid:MISSING"],
    [{ flightid: "ZZ 1001" }, "flightid:INVALID"],
    [{ airportcode: "Z" }, "airportcode:INVALID"],
  ];
  for (const [overrides, issue] of cases) {
    const parsed = parseScheduledDepartures(schedulePlan(), parsePayload(okBody([scheduleRow(), scheduleRow(overrides)])));
    assert.equal(parsed.status, "SCHEMA_ERROR");
    assert.deepEqual(parsed.rows, []);
    assert.ok(parsed.schemaIssues.includes(issue), `${issue} expected, got ${parsed.schemaIssues.join(",")}`);
    assert.ok(!JSON.stringify(parsed.schemaIssues).includes("ZZ"), "issues name fields, never values");
  }
});

test("schedule page arithmetic reports what one bounded scan can cover", () => {
  const two = [scheduleRow(), scheduleRow({ flightid: "ZZ1002" })];
  const fits = parseScheduledDepartures(schedulePlan(1, 2), parsePayload(okBody(two, 5)));
  assert.deepEqual([fits.pagesNeeded, fits.withinPagingBound, fits.complete, fits.contract.status], [3, true, false, "MATCH"]);
  const tooMany = parseScheduledDepartures(schedulePlan(1, 2), parsePayload(okBody(two, 7)));
  assert.deepEqual([tooMany.pagesNeeded, tooMany.withinPagingBound], [4, false]);
  const short = parseScheduledDepartures(schedulePlan(1, 2), parsePayload(okBody([scheduleRow()], 5)));
  assert.ok(short.contract.issues.includes("PAGE_ITEM_COUNT_MISMATCH"), "a provider that caps the page size is caught");
  const duplicate = parseScheduledDepartures(schedulePlan(), parsePayload(okBody([scheduleRow(), scheduleRow()])));
  assert.equal(duplicate.duplicateKeyCount, 1);
  assert.equal(duplicate.contract.status, "DRIFT");
});

const syntheticSchedule = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) => scheduleRow({ flightid: `ZZ${String(offset + index + 1).padStart(4, "0")}` }));
const schedulePage = (rows: unknown[], totalCount: number) => json(200, okBody(rows, totalCount));

test("the schedule pager collects every page within three requests, or refuses", async () => {
  const full = scriptedFetch([
    schedulePage(syntheticSchedule(1000), 2500),
    schedulePage(syntheticSchedule(1000, 1000), 2500),
    schedulePage(syntheticSchedule(500, 2000), 2500),
  ]);
  const complete = await requestAllScheduledDeparturePages({ env: ENV, fetchImpl: full.fetchImpl, maxAttempts: 1 });
  assert.equal(complete.status, "COMPLETE");
  assert.equal(complete.rows.length, 2500);
  assert.deepEqual(full.calls.map((url) => url.searchParams.get("pageNo")), ["1", "2", "3"]);
  assert.equal(complete.requestCount, 3);

  const huge = scriptedFetch([schedulePage(syntheticSchedule(1000), 3001)]);
  const refused = await requestAllScheduledDeparturePages({ env: ENV, fetchImpl: huge.fetchImpl, maxAttempts: 1 });
  assert.deepEqual([refused.status, refused.issue, huge.calls.length, refused.rows.length], ["INCOMPLETE", "PAGING_BOUND_EXCEEDED", 1, 0]);

  const broken = scriptedFetch([schedulePage(syntheticSchedule(1000), 1500), json(503, "{}")]);
  const partial = await requestAllScheduledDeparturePages({ env: ENV, fetchImpl: broken.fetchImpl, maxAttempts: 1 });
  assert.deepEqual([partial.status, partial.issue, partial.rows.length], ["INCOMPLETE", "PAGE_2_SERVER_ERROR", 0]);

  const denied = scriptedFetch([json(403, header("30", "등록되지 않은 서비스키"))]);
  const blocked = await requestAllScheduledDeparturePages({ env: ENV, fetchImpl: denied.fetchImpl });
  assert.deepEqual([blocked.status, blocked.lastClassification.kind, denied.calls.length], ["FAILED", "NOT_REGISTERED", 1]);

  const nothing = scriptedFetch([json(200, header("03"))]);
  assert.equal((await requestAllScheduledDeparturePages({ env: ENV, fetchImpl: nothing.fetchImpl })).status, "EMPTY");
});

// ── Probe ───────────────────────────────────────────────────────────────────

const ALLOWED_LINE_KEYS = new Set([
  "service", "operation", "verdict", "kind", "httpStatus", "resultCode", "resultMsg", "issue", "requests", "basis",
  "itemCount", "totalCount", "complete", "providerAggregateRows", "duplicateRowKeys", "pagesNeeded", "withinPagingBound",
  "contractStatus", "fieldNames", "unknownFieldNames", "missingDocumentedFieldNames", "contractIssues", "schemaIssues",
]);

async function probeWith(replies: Reply[], env: Record<string, string> = ENV, now = NOW) {
  const { fetchImpl, calls } = scriptedFetch(replies);
  const printed: string[] = [];
  const run = await runIncheonStatsProbe({ env, fetchImpl, now, write: (record) => printed.push(formatProbeLine(record, KEY)) });
  return { ...run, calls, printed: printed.join("\n") };
}

function assertSafeOutput(printed: string) {
  for (const leak of [KEY, encodeURIComponent(KEY), "serviceKey", "://", "apis.data.go.kr", "B551177"]) {
    assert.ok(!printed.includes(leak), `probe output must not contain a ${leak.length}-character secret or URL fragment`);
  }
  for (const line of printed.split("\n")) {
    assert.ok(line.startsWith(PROBE_LINE_PREFIX));
    const record = JSON.parse(line.slice(PROBE_LINE_PREFIX.length)) as Record<string, unknown>;
    if (record.summary === true) continue;
    for (const key of Object.keys(record)) assert.ok(ALLOWED_LINE_KEYS.has(key), `unexpected output field ${key}`);
  }
}

test("today's state: one request per service, all WAITING_FOR_APPROVAL, nothing secret printed", async () => {
  const denied = json(403, header("30", "등록되지 않은 서비스키"));
  const { lines, summary, calls, printed } = await probeWith([denied, denied, denied]);
  assert.deepEqual(calls.map((url) => url.pathname), [
    "/B551177/AviationStatsByCountry/getTotalNumberOfPassenger",
    "/B551177/AviationStatsByTimeline/getTotalNumberOfPassenger",
    "/B551177/StatusOfPaxFltSched/getPaxFltSchedDeparturesDeOdp",
  ]);
  for (const url of calls) assert.equal(url.searchParams.get("serviceKey"), KEY);
  assert.deepEqual(lines.map((line) => [line.service, line.verdict, line.httpStatus, line.resultCode, line.resultMsg, line.requests]), [
    ["15095071", "WAITING_FOR_APPROVAL", 403, "30", "등록되지 않은 서비스키", 1],
    ["15095070", "WAITING_FOR_APPROVAL", 403, "30", "등록되지 않은 서비스키", 1],
    ["15114085", "WAITING_FOR_APPROVAL", 403, "30", "등록되지 않은 서비스키", 1],
  ]);
  assert.deepEqual([summary.requestCount, summary.maximumRequests, summary.allReady, summary.persisted], [3, 3, false, false]);
  assertSafeOutput(printed);
});

test("an approved run is READY with field names and basis dates, and prints no row value", async () => {
  const { lines, summary, printed } = await probeWith([
    json(200, okBody([countryRow("Synthetic Country A", 101, 202, 303), countryRow("합계", 101, 202, 303, "")])),
    json(200, okBody([timeRow("00~01", 11, 22, 33)])),
    json(200, okBody([scheduleRow()])),
  ]);
  assert.deepEqual(lines.map((line) => line.verdict), ["READY", "READY", "READY"]);
  assert.equal(summary.allReady, true);
  assert.deepEqual(lines[0].basis, { fromMonth: "2026-08", toMonth: "2026-08", source: "REQUEST_PARAMETERS" });
  assert.deepEqual(lines[0].fieldNames, ["arrPassenger", "country", "depPassenger", "passenger", "region"]);
  assert.equal(lines[0].providerAggregateRows, 1);
  assert.equal(lines[2].basis.validFromMin, "2026-10-01");
  assert.equal(lines[2].basis.validToMax, "2026-10-24");
  for (const value of ["Synthetic Country A", "Synthetic Region", "Synthetic Air", "Synthetic Airport", "ZZ1001", "ZZZ", "303", "08:30"]) {
    assert.ok(!printed.includes(value), `row value ${value} must not be printed`);
  }
  assertSafeOutput(printed);
});

test("the probe never retries, and reports drift, no-data and gateway pages truthfully", async () => {
  const outage = await probeWith([json(503, "{}"), json(503, "{}"), json(503, "{}")]);
  assert.equal(outage.calls.length, 3, "one request per service even when every one fails transiently");
  assert.deepEqual(outage.lines.map((line) => line.verdict), ["UNREACHABLE", "UNREACHABLE", "UNREACHABLE"]);

  const mixed = await probeWith([
    json(200, okBody([{ ...countryRow("Synthetic Country A", 1, 1, 2), extraField: "x" }])),
    json(200, header("03", "NODATA_ERROR")),
    { status: 502, body: html("Bad Gateway"), contentType: "text/html" },
  ]);
  assert.deepEqual(mixed.lines.map((line) => [line.verdict, line.kind]), [["REVIEW", "OK"], ["REVIEW", "NO_DATA"], ["UNREACHABLE", "GATEWAY_HTML"]]);
  assert.deepEqual(mixed.lines[0].unknownFieldNames, ["extraField"]);
  assert.equal(mixed.lines[1].itemCount, 0);
  assert.equal(mixed.lines[1].totalCount, null, "no data is not reported as a zero total");
  assert.equal(mixed.summary.allReady, false);
  assertSafeOutput(mixed.printed);

  const quota = await probeWith([json(200, header("22")), json(200, gateway("31", "DEADLINE_HAS_EXPIRED_ERROR")), json(200, okBody([scheduleRow({ monday: "월" })]))]);
  assert.deepEqual(quota.lines.map((line) => [line.verdict, line.kind]), [["BLOCKED", "LIMIT_EXCEEDED"], ["BLOCKED", "EXPIRED"], ["REVIEW", "SCHEMA_ERROR"]]);
  assert.deepEqual(quota.lines[2].schemaIssues, ["monday:UNRECOGNIZED_VALUE"]);
});

test("without a key the probe makes no request at all", async () => {
  const { calls, summary, lines } = await probeWith([], {});
  assert.equal(calls.length, 0);
  assert.equal(summary.requestCount, 0);
  assert.equal(summary.keyConfigured, false);
  assert.deepEqual(lines.map((line) => line.kind), ["KEY_NOT_CONFIGURED", "KEY_NOT_CONFIGURED", "KEY_NOT_CONFIGURED"]);
});

test("the probe asks for the month before last in KST, a month certainly published", () => {
  const months = (now: Date) => buildProbePlans(now).flatMap((plan) => (plan.monthRange ? [plan.monthRange.fromMonth] : []));
  assert.deepEqual(months(NOW), ["202608", "202608"]);
  assert.deepEqual(months(new Date("2026-10-31T14:59:00Z")), ["202608", "202608"]);
  assert.deepEqual(months(new Date("2026-10-31T15:30:00Z")), ["202609", "202609"], "00:30 KST on 1 November");
  assert.equal(buildProbePlans(NOW).length, 3);
});

test("the step summary is Korean, carries the same safe fields, and the line formatter redacts", async () => {
  const denied = json(403, header("30", "등록되지 않은 서비스키"));
  const { lines, summary } = await probeWith([denied, denied, denied]);
  const markdown = renderStepSummary(lines, summary);
  assert.match(markdown, /15095071 국가별 여객 \(노선 국가 기준\)/);
  assert.match(markdown, /미등록 키\(30\)/);
  assert.match(markdown, /요청 3회 \(상한 3회\)/);
  assert.ok(!markdown.includes(KEY));
  assert.ok(!formatProbeLine({ ...lines[0], resultMsg: KEY }, KEY).includes(KEY));
});

// ── Truth and wiring guards ─────────────────────────────────────────────────

const NEW_FILES = ["lib/incheon-airport-stats.mjs", "lib/incheon-airport-stats-client.mjs", "scripts/probe-incheon-airport-stats.mjs"];

test("truth labels: route country as the provider defines it, airport-wide, and no traveller-attribute wording", () => {
  for (const id of ["ROUTE_COUNTRY_PASSENGERS", "ROUTE_COUNTRY_FLIGHTS"] as const) {
    assert.equal(INCHEON_TRUTH_LABELS[id].groupedBy, "ROUTE_COUNTRY_AS_DEFINED_BY_PROVIDER");
  }
  for (const label of Object.values(INCHEON_TRUTH_LABELS)) assert.equal(label.terminalScope, "AIRPORT_WIDE");
  // Spelled in parts so this guard never matches a search for the words it forbids.
  const forbidden = new RegExp(["nation", "ality", "|", "국", "적"].join(""), "i");
  for (const file of NEW_FILES) assert.ok(!forbidden.test(readFileSync(file, "utf8")), `${file} uses wording reserved for traveller attributes`);
  assert.ok(!forbidden.test(JSON.stringify(INCHEON_TRUTH_LABELS)));
});

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.(?:ts|tsx|mts|mjs|js|cjs|json|jsonc|sql|ya?ml)$/.test(entry.name)) out.push(path);
  }
  return out;
}

/**
 * Activated 2026-10-15 for the two statistics operations only, after Smoke
 * Public APIs run 38671372057 answered READY for 15095071 and 15095070 (15114085
 * is still unregistered and stays prepared). The one collector below is the
 * only file allowed to import these modules; a page or a Worker never does.
 */
const ACTIVATED_CONSUMERS = ["lib/airport-monthly-stats.ts"];

test("activated through one daily collector only: no other collector, workflow, schema, Worker or page references these modules", () => {
  const files = [
    ...["app", "lib", "worker", "scripts", "db", "drizzle", "config"].flatMap((dir) => walk(dir)),
    ...walk(".github/workflows"),
    "wrangler.production.jsonc",
    "package.json",
  ];
  const offenders = files.filter((file) => !NEW_FILES.includes(file) && !ACTIVATED_CONSUMERS.includes(file) && /incheon-airport-stats/.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
});
