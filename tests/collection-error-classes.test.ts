/**
 * Two Production collection failures, kept apart (2026-10-14).
 *
 * 1. KASI 특일 정보 (data.go.kr 15012690, SpcdeInfoService/getRestDeInfo)
 *    answered HTTP 403 within ~1.5 s to every inspected attempt since
 *    2026-09-06 KST (runs 33996957467, 38464257754, 38489053016) while
 *    A1/A2/A3 succeeded with the same DATA_GO_KR_SERVICE_KEY in the same job.
 *    The refusal kept the 00:07 and 06:07 airport runs red and was repeated
 *    in both windows daily.
 * 2. KMA getVilageFcst answered resultCode 03 (NODATA_ERROR) for most requests
 *    from 2026-10-13 ~20:30 KST (runs 38391976274 … 38516560664), for current
 *    and previous issuances alike; the same base/grid answered 00 45 seconds
 *    later (38500936988). It was recorded as failureClass=VALIDATION, failed the
 *    weather runs, and the recovery ladder spent fresh runners on it.
 *
 * Authentication, "provider has no data" and "connection timeout" must stay
 * three different answers. Synthetic fixtures only: no provider is called.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { uniqueKmaGrids } from "../lib/areas";
import { collectWeatherForecasts, writeSourceHealth } from "../lib/collector";
import { shouldRetryWeather } from "../lib/congestion-retry";
import {
  collectHolidays,
  HOLIDAY_AUTH_COOLDOWN_MS,
  holidayAuthCooldownActive,
  holidayHealthUpdate,
} from "../lib/holidays";
import { attentionNotices, hasProductionSourceFailure } from "../lib/production-runner";
import {
  classifyProviderBody,
  fetchOfficialJson,
  safeSourceFailureDetail,
  sourceFailureClass,
  SourceFetchError,
} from "../lib/source-adapters";
import { publicFailureReason } from "../lib/source-status";
import { SqliteD1 } from "./helpers/operational-sqlite.mjs";

const SECRET = "FIXTURE-SECRET-KEY-0123456789abcdef";
const URL_FIXTURE = new URL(`https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${SECRET}`);

/** The legacy data.go.kr gateway refusal, echoing the keyed request URL. */
const gatewayXml = (code: string, message: string) => `<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>`
  + `<returnAuthMsg>${message}</returnAuthMsg><returnReasonCode>${code}</returnReasonCode>`
  + `<requestUrl>${URL_FIXTURE}</requestUrl></cmmMsgHeader></OpenAPI_ServiceResponse>`;

function fetchSequence(responses: Array<() => Response | Promise<Response>>) {
  let calls = 0;
  const fetchImpl = (async () => {
    const next = responses[Math.min(calls, responses.length - 1)];
    calls += 1;
    return next();
  }) as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

const noSleep = { sleep: async () => {}, random: () => 0, nowMs: () => 0 };

// ---------------------------------------------------------------------------
// Shared vocabulary
// ---------------------------------------------------------------------------

test("a provider error body becomes one fixed token and never provider text", () => {
  assert.equal(classifyProviderBody(gatewayXml("30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR")), "RESULT_30");
  assert.equal(classifyProviderBody(gatewayXml("31", "DEADLINE_HAS_EXPIRED_ERROR")), "RESULT_31");
  assert.equal(classifyProviderBody(`{"response":{"header":{"resultCode":"03","resultMsg":"NO_DATA"}}}`), "RESULT_03");
  assert.equal(classifyProviderBody("<response><header><resultCode>22</resultCode></header></response>"), "RESULT_22");
  assert.equal(classifyProviderBody("Forbidden"), "FORBIDDEN");
  assert.equal(classifyProviderBody("Unauthorized"), "UNAUTHORIZED");
  assert.equal(classifyProviderBody("API not found"), "API_NOT_FOUND");
  assert.equal(classifyProviderBody("API token quota exceeded"), "QUOTA_EXCEEDED");
  assert.equal(classifyProviderBody("<!DOCTYPE html><html><body>blocked</body></html>"), "HTML_PAGE");
  assert.equal(classifyProviderBody("   "), "EMPTY_BODY");
  for (const body of [`denied ${SECRET}`, URL_FIXTURE.toString(), "x".repeat(500)]) {
    const signal = classifyProviderBody(body);
    assert.equal(signal, "UNRECOGNIZED_BODY");
    assert.equal(signal.includes(SECRET), false);
  }
});

test("HTTP 403 is AUTH, asked once, and its body is named without leaking the key", async () => {
  const sequence = fetchSequence([() => new Response(gatewayXml("30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"), { status: 403 })]);
  await assert.rejects(fetchOfficialJson(URL_FIXTURE, { maxAttempts: 4, fetchImpl: sequence.fetchImpl, ...noSleep }), (error: unknown) => {
    assert.ok(error instanceof SourceFetchError);
    assert.equal(error.code, "HTTP");
    assert.equal(error.status, 403);
    assert.equal(error.providerSignal, "RESULT_30");
    const detail = safeSourceFailureDetail(error);
    assert.equal(detail, "failureClass=AUTH httpStatus=403 attempts=1 elapsedMs=0 retryExhausted=false providerSignal=RESULT_30");
    assert.equal(detail.includes(SECRET), false);
    assert.equal(publicFailureReason(detail), "AUTH");
    return true;
  });
  assert.equal(sequence.calls(), 1, "an auth refusal is never re-requested");
});

test("an auth or quota code inside a 5xx or a 200 body is not retried either", async () => {
  for (const [status, body, expectedClass] of [
    [500, gatewayXml("22", "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR"), "QUOTA"],
    [429, "API token quota exceeded", "QUOTA"],
    [502, gatewayXml("31", "DEADLINE_HAS_EXPIRED_ERROR"), "AUTH"],
    [200, gatewayXml("30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"), "AUTH"],
  ] as const) {
    const sequence = fetchSequence([() => new Response(body, { status })]);
    await assert.rejects(fetchOfficialJson(URL_FIXTURE, { maxAttempts: 4, fetchImpl: sequence.fetchImpl, ...noSleep }), (error: unknown) => {
      assert.equal(sourceFailureClass(error), expectedClass, `${status}`);
      assert.equal(safeSourceFailureDetail(error).includes(SECRET), false);
      return true;
    });
    assert.equal(sequence.calls(), 1, `${status} ${expectedClass} must not be retried`);
  }
});

test("timeouts and plain 5xx stay the retried classes, bounded", async () => {
  const timeouts = fetchSequence([() => { throw new DOMException("aborted", "AbortError"); }]);
  await assert.rejects(fetchOfficialJson(URL_FIXTURE, { maxAttempts: 3, fetchImpl: timeouts.fetchImpl, ...noSleep }), (error: unknown) => {
    assert.match(safeSourceFailureDetail(error), /^failureClass=TIMEOUT attempts=3 .*retryExhausted=true$/);
    return true;
  });
  assert.equal(timeouts.calls(), 3);

  const unavailable = fetchSequence([() => new Response("<html><body>maintenance</body></html>", { status: 503 })]);
  await assert.rejects(fetchOfficialJson(URL_FIXTURE, { maxAttempts: 2, fetchImpl: unavailable.fetchImpl, ...noSleep }), (error: unknown) => {
    assert.equal(safeSourceFailureDetail(error), "failureClass=HTTP httpStatus=503 attempts=2 elapsedMs=0 retryExhausted=true providerSignal=HTML_PAGE");
    return true;
  });
  assert.equal(unavailable.calls(), 2);
});

test("provider result codes in collector messages map to AUTH, QUOTA and NO_DATA", () => {
  const detail = (message: string) => safeSourceFailureDetail(new Error(message));
  assert.match(detail("kma_result_03"), /^failureClass=NO_DATA causeCode=KMA_RESULT_03 /);
  assert.match(detail("kma_result_22"), /^failureClass=QUOTA /);
  assert.match(detail("kma_result_31"), /^failureClass=AUTH /);
  assert.match(detail("holiday_result_30"), /^failureClass=AUTH causeCode=HOLIDAY_RESULT_30 /);
  assert.match(detail("a1_today_result_30_page_2"), /^failureClass=AUTH /);
  // TourAPI uses four-digit codes; unknown codes keep the old class.
  assert.match(detail("tourapi_result_0000"), /^failureClass=VALIDATION /);
  assert.match(detail("kma_result_missing"), /^failureClass=VALIDATION /);
  assert.match(detail("kma_result_99"), /^failureClass=VALIDATION /);
  // A provider's "no rows" is not a data-format problem on the public page; since
  // 2026-10-15 (owner-approved wording) it is shown as "not released yet", apart from
  // a connection failure.
  assert.equal(publicFailureReason("failureClass=NO_DATA causeCode=KMA_RESULT_03"), "NO_DATA");
  assert.equal(publicFailureReason("failureClass=AUTH httpStatus=403"), "AUTH");
});

// ---------------------------------------------------------------------------
// KMA W1: resultCode 03
// ---------------------------------------------------------------------------

/** 2026-10-14 14:11 KST — run 38515221329 asked for base 1100 and got 03 on all four grids. */
const KMA_NOW = new Date("2026-10-14T05:11:00.000Z");
const PREVIOUS_ISSUE = "2026-10-14T08:00:00+09:00";
const PREVIOUS_RETRIEVED = "2026-10-13T23:41:04.000Z";

function seedWeather(db: SqliteD1) {
  for (const grid of uniqueKmaGrids()) for (const area of grid.areas) {
    db.raw.prepare(`INSERT INTO weather_forecast (
      id, source_id, area, issued_at, target_at, retrieved_at,
      precipitation_probability, temperature_tenth_c, condition_code,
      schema_version, quality_status, source_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      `${area}-${PREVIOUS_ISSUE}`, "KMA_VILAGE_FCST", area, PREVIOUS_ISSUE, "2026-10-14T18:00:00+09:00", PREVIOUS_RETRIEVED,
      20, 181, "clear", "kma-vilage-fcst-v2", "VALID", `hash-${area}`,
    );
  }
  db.raw.prepare(`INSERT INTO source_health (source_id, status, last_retrieved_at, consecutive_failures, schema_version, detail, updated_at)
    VALUES ('KMA_VILAGE_FCST', 'LIVE', ?, 0, 'kma-vilage-fcst-v2', 'fixture', ?)`).run(PREVIOUS_RETRIEVED, PREVIOUS_RETRIEVED);
}

const weatherRows = (db: SqliteD1) => db.raw.prepare(
  "SELECT id, issued_at, retrieved_at, precipitation_probability, temperature_tenth_c FROM weather_forecast ORDER BY id").all();
const kmaNoData = () => Response.json({ response: { header: { resultCode: "03", resultMsg: "NO_DATA" } } });
const kmaPage = () => Response.json({ response: { header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" }, body: { items: { item: [
  { baseDate: "20261014", baseTime: "1100", fcstDate: "20261014", fcstTime: "1800", category: "TMP", fcstValue: "17", nx: 60, ny: 127 },
  { baseDate: "20261014", baseTime: "1100", fcstDate: "20261014", fcstTime: "1800", category: "POP", fcstValue: "30", nx: 60, ny: 127 },
] } } } });

async function withFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await run(); } finally { globalThis.fetch = original; }
}

test("KMA 03 on every grid is NO_DATA: not a run ERROR, STALE health, last-good rows and times untouched", async () => {
  const db = new SqliteD1();
  seedWeather(db);
  const before = weatherRows(db);
  let calls = 0;
  const result = await withFetch((async () => { calls += 1; return kmaNoData(); }) as typeof fetch,
    () => collectWeatherForecasts({ DB: db as unknown as D1Database, DATA_GO_KR_SERVICE_KEY: SECRET }, KMA_NOW));

  assert.equal(result.status, "NO_DATA");
  assert.equal(result.sourceHealth, "STALE");
  assert.equal(result.lastGoodPreserved, true);
  assert.equal(calls, uniqueKmaGrids().length, "NO_DATA is never retried in the same run");
  assert.doesNotMatch(result.detail ?? "", /recheck=1/);
  assert.equal(result.providerRequests, calls);
  assert.match(result.detail ?? "", /base 202610141100/);
  assert.equal((result.detail ?? "").match(/failureClass=NO_DATA causeCode=KMA_RESULT_03/g)?.length, uniqueKmaGrids().length);
  assert.doesNotMatch(result.detail ?? "", /VALIDATION|SECRET/);
  assert.equal(hasProductionSourceFailure([{ source: "weather", ...result }]), false, "NO_DATA does not fail the job");
  assert.deepEqual(weatherRows(db), before, "no stored value is nulled, zeroed or re-dated");
  const health = db.raw.prepare("SELECT status, last_retrieved_at FROM source_health WHERE source_id = 'KMA_VILAGE_FCST'").get() as Record<string, unknown>;
  assert.equal(health.status, "STALE");
  assert.equal(health.last_retrieved_at, PREVIOUS_RETRIEVED, "the real time of the last good collection is kept");
  const [notice] = attentionNotices([{ source: "weather", ...result }]);
  assert.equal(notice.level, "warning", "a green NO_DATA run is still announced");
  assert.match(notice.message, /weather: NO_DATA; sourceHealth=STALE; lastGoodPreserved=true; failures NO_DATAx4/);
});

test("KMA 03 on some grids is PARTIAL with the issuance that did arrive", async () => {
  const db = new SqliteD1();
  seedWeather(db);
  let calls = 0;
  const result = await withFetch((async () => { calls += 1; return calls === 1 ? kmaPage() : kmaNoData(); }) as typeof fetch,
    () => collectWeatherForecasts({ DB: db as unknown as D1Database, DATA_GO_KR_SERVICE_KEY: SECRET }, KMA_NOW));
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.sourceHealth, "STALE");
  const issued = db.raw.prepare("SELECT DISTINCT issued_at FROM weather_forecast WHERE area = 'myeongdong' ORDER BY issued_at").all()
    .map((row) => (row as { issued_at: string }).issued_at);
  assert.deepEqual(issued, [PREVIOUS_ISSUE, "2026-10-14T11:00:00+09:00"], "each row keeps the issuance KMA actually published");
  assert.equal(attentionNotices([{ source: "weather", ...result }])[0].level, "warning");
});

// 2026-10-13..15: the same base/grid answered 03 and then 00 about 40 s later.
test("a KMA 03 grid stays missing without an automatic same-run recheck", async () => {
  const db = new SqliteD1();
  seedWeather(db);
  const asked: string[] = [];
  let first = true;
  const result = await withFetch((async (input: RequestInfo | URL) => {
    const url = new URL(String(input)); asked.push(`${url.searchParams.get("nx")},${url.searchParams.get("ny")}`);
    if (first) { first = false; return kmaNoData(); }
    return kmaPage();
  }) as typeof fetch, () => collectWeatherForecasts({ DB: db as unknown as D1Database, DATA_GO_KR_SERVICE_KEY: SECRET }, KMA_NOW));
  assert.equal(result.status, "PARTIAL");
  assert.equal(asked.length, uniqueKmaGrids().length, "each grid is asked once only");
  assert.equal(asked.filter(grid=>grid===asked[0]).length,1);
});

test("a KMA auth refusal is ERROR/AUTH, asked once per grid, and never earns a fresh runner", async () => {
  const db = new SqliteD1();
  seedWeather(db);
  let calls = 0;
  const result = await withFetch((async () => { calls += 1; return new Response("Forbidden", { status: 403 }); }) as typeof fetch,
    () => collectWeatherForecasts({ DB: db as unknown as D1Database, DATA_GO_KR_SERVICE_KEY: SECRET }, KMA_NOW));
  assert.equal(result.status, "ERROR");
  assert.equal(calls, uniqueKmaGrids().length);
  assert.match(result.detail ?? "", /failureClass=AUTH httpStatus=403 attempts=1 .*providerSignal=FORBIDDEN/);
  const log = JSON.stringify({ source: "weather_recovery", mode: "RECOVERY", status: result.status, detail: result.detail });
  assert.equal(shouldRetryWeather(log), false);
  assert.equal(attentionNotices([{ source: "weather", ...result }])[0].level, "error");
});

test("the weather ladder retries only a classified transient failure", () => {
  const line = (status: string, detail: string, source = "weather_recovery") => JSON.stringify({ source, mode: "RECOVERY", status, detail });
  // Verbatim shapes: 38221949099 (four TIMEOUT grids) and 38516560664 attempt 3.
  assert.equal(shouldRetryWeather(line("ERROR", "mode=PRIMARY; grids ok 0/4; requests 12; base 202610121400; changed rows 0; storage writes 0; failed grid 60,127: failureClass=TIMEOUT attempts=3 elapsedMs=65189 retryExhausted=true | grid 59,126: failureClass=TIMEOUT attempts=3 elapsedMs=65457 retryExhausted=true", "weather")), true);
  assert.equal(shouldRetryWeather(line("ERROR", "issuance=202610141100; missingGrids=60,127; mode=RECOVERY; grids ok 0/1; requests 3; failed grid 60,127: failureClass=HTTP httpStatus=503 attempts=3 elapsedMs=9000 retryExhausted=true")), true);
  for (const [status, detail] of [
    // 38516560664 attempt 1, before this change: 03 recorded as VALIDATION.
    ["ERROR", "issuance=202610141100; missingGrids=60,127 61,126 60,126; mode=RECOVERY; grids ok 0/3; requests 3; base 202610141100; changed rows 0; storage writes 0; failed grid 60,127: failureClass=VALIDATION causeCode=KMA_RESULT_03 attempts=1 elapsedMs=0 retryExhausted=false"],
    ["NO_DATA", "failed grid 60,127: failureClass=NO_DATA causeCode=KMA_RESULT_03 attempts=1 elapsedMs=0 retryExhausted=false"],
    ["ERROR", "failed grid 60,127: failureClass=NO_DATA causeCode=KMA_RESULT_03 | grid 59,126: failureClass=TIMEOUT attempts=3 retryExhausted=true"],
    ["ERROR", "failed grid 60,127: failureClass=AUTH httpStatus=403 attempts=1 retryExhausted=false"],
    ["ERROR", "failed grid 60,127: failureClass=HTTP httpStatus=429 attempts=1 retryExhausted=false"],
    ["PARTIAL", "grids ok 3/4; failed grid 60,127: failureClass=TIMEOUT attempts=3 retryExhausted=true"],
    ["SKIPPED_ALREADY_HEALTHY", "mode=RECOVERY; issuance=202610131400; missingGrids=none"],
  ]) assert.equal(shouldRetryWeather(line(status, detail)), false, `${status}: ${detail}`);
  assert.equal(shouldRetryWeather(""), false);
});

test("the weather recovery workflow consumes that classification for both extra jobs", async () => {
  const recovery = await readFile(new URL("../.github/workflows/collect-weather-recovery.yml", import.meta.url), "utf8");
  assert.match(recovery, /needs\.collect\.result == 'failure' && needs\.collect\.outputs\.retry_weather == 'true'/);
  assert.match(recovery, /needs\.retry_1\.result == 'failure' && needs\.retry_1\.outputs\.retry_weather == 'true'/);
  const attempt = await readFile(new URL("../.github/workflows/collect-attempt.yml", import.meta.url), "utf8");
  assert.match(attempt, /retry_weather:\n\s+description: [^\n]+\n\s+value: \$\{\{ jobs\.collect\.outputs\.retry_weather \}\}/);
  assert.match(attempt, /retry_weather: \$\{\{ steps\.weather_retry_decision\.outputs\.retry_weather \}\}/);
  assert.match(attempt, /scripts\/decide-congestion-retry\.ts "\$RUNNER_TEMP\/collector\.log" --weather/);
});

// ---------------------------------------------------------------------------
// KASI holidays: HTTP 403
// ---------------------------------------------------------------------------

/** 2026-10-14 09:19 KST — run 38489053016's holiday attempt. */
const KASI_NOW = new Date("2026-10-14T00:19:29.000Z");
const kasiForbidden = () => new Response(gatewayXml("30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"), { status: 403 });
const kasiMonth = (month: string, rows: Array<{ locdate: number; dateName: string }>) => Response.json({ response: {
  header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
  body: { totalCount: rows.length, items: rows.length ? { item: rows.map((row) => ({ ...row, isHoliday: "Y" })) } : "" },
} });

/** The runner's source_health write, stamped at a fixed `at` instead of the wall clock. */
async function recordHealth(db: SqliteD1, result: Awaited<ReturnType<typeof collectHolidays>>, at: Date) {
  const update = holidayHealthUpdate(result);
  if (!update) return;
  await writeSourceHealth(db as unknown as D1Database, "KASI_PUBLIC_HOLIDAYS", update.status, update.detail, update.record);
  db.raw.prepare("UPDATE source_health SET updated_at = ? WHERE source_id = 'KASI_PUBLIC_HOLIDAYS'").run(at.toISOString());
}

test("KASI 403 is AUTH_BLOCKED: one request, no retry, nothing stored, honest last-good", async () => {
  const db = new SqliteD1();
  const sequence = fetchSequence([kasiForbidden]);
  const result = await collectHolidays(db as unknown as D1Database, SECRET, KASI_NOW, { fetchImpl: sequence.fetchImpl });
  assert.equal(result.status, "AUTH_BLOCKED");
  assert.equal(sequence.calls(), 1, "neither the next month nor a retry is requested after an auth refusal");
  assert.equal(result.providerRequests, 1);
  assert.equal(result.lastGoodPreserved, false, "nothing was ever stored, so nothing is claimed as preserved");
  assert.match(result.detail ?? "", /^failureClass=AUTH httpStatus=403 attempts=1 elapsedMs=\d+ retryExhausted=false providerSignal=RESULT_30$/);
  assert.equal(JSON.stringify(result).includes(SECRET), false);
  assert.equal((db.raw.prepare("SELECT COUNT(*) AS n FROM holiday_months").get() as { n: number }).n, 0);
  const update = holidayHealthUpdate(result);
  assert.deepEqual(update, { status: "ERROR", detail: result.detail });
});

test("a recorded KASI auth refusal is not asked again within the cooldown; a person-started run checks once", async () => {
  const db = new SqliteD1();
  const first = fetchSequence([kasiForbidden]);
  const blocked = await collectHolidays(db as unknown as D1Database, SECRET, KASI_NOW, { fetchImpl: first.fetchImpl });
  await recordHealth(db, blocked, KASI_NOW);

  const later = new Date(KASI_NOW.getTime() + 6 * 3_600_000);
  const skipped = fetchSequence([kasiForbidden]);
  const cooled = await collectHolidays(db as unknown as D1Database, SECRET, later, { fetchImpl: skipped.fetchImpl });
  assert.equal(cooled.status, "SKIPPED_AUTH_COOLDOWN");
  assert.equal(cooled.providerRequests, 0);
  assert.equal(skipped.calls(), 0);
  assert.match(cooled.detail ?? "", /^failureClass=AUTH httpStatus=403 .* authCooldownUntil=2026-10-14T20:19:29\.000Z$/);
  assert.equal(holidayHealthUpdate(cooled), null, "a skip leaves the observed refusal and its time untouched");

  const manual = fetchSequence([kasiForbidden]);
  const rechecked = await collectHolidays(db as unknown as D1Database, SECRET, later, { fetchImpl: manual.fetchImpl, ignoreAuthCooldown: true });
  assert.equal(rechecked.status, "AUTH_BLOCKED");
  assert.equal(manual.calls(), 1);

  const nextDay = new Date(KASI_NOW.getTime() + HOLIDAY_AUTH_COOLDOWN_MS + 60_000);
  const daily = fetchSequence([() => kasiMonth("2026-10", [{ locdate: 20261003, dateName: "개천절" }, { locdate: 20261009, dateName: "한글날" }]),
    () => kasiMonth("2026-11", [])]);
  const fixed = await collectHolidays(db as unknown as D1Database, SECRET, nextDay, { fetchImpl: daily.fetchImpl });
  assert.equal(fixed.status, "SUCCESS", "once the owner's fix lands, the next window collects without a code change");
  assert.equal(daily.calls(), 2);
  assert.equal(fixed.records, 2);
});

test("only an explicit AUTH record starts the cooldown", () => {
  const at = "2026-10-14T00:19:29.000Z";
  const now = new Date(Date.parse(at) + 3_600_000);
  assert.equal(holidayAuthCooldownActive({ status: "ERROR", detail: "failureClass=AUTH httpStatus=403", updated_at: at }, now), true);
  // The pre-change row lets the first run after deployment record the provider signal.
  assert.equal(holidayAuthCooldownActive({ status: "ERROR", detail: "failureClass=HTTP httpStatus=403 attempts=1", updated_at: at }, now), false);
  assert.equal(holidayAuthCooldownActive({ status: "ERROR", detail: "failureClass=TIMEOUT attempts=2", updated_at: at }, now), false);
  assert.equal(holidayAuthCooldownActive({ status: "LIVE", detail: "SUCCESS", updated_at: at }, now), false);
  assert.equal(holidayAuthCooldownActive({ status: "ERROR", detail: "failureClass=AUTH", updated_at: "2026-10-15T00:00:00.000Z" }, now), false);
  assert.equal(holidayAuthCooldownActive({ status: "ERROR", detail: "failureClass=AUTH", updated_at: at },
    new Date(Date.parse(at) + HOLIDAY_AUTH_COOLDOWN_MS)), false);
  assert.equal(holidayAuthCooldownActive(null, now), false);
});

test("a KASI timeout is retried once, stays ERROR, and keeps stored months with their real time", async () => {
  const db = new SqliteD1();
  db.raw.prepare("INSERT INTO holiday_months(month,payload,retrieved_at,source_hash) VALUES(?,?,?,?)")
    .run("2026-10", JSON.stringify([{ date: "2026-10-03", name: "개천절" }]), "2026-10-12T21:30:00.000Z", "hash");
  const sequence = fetchSequence([() => { throw new DOMException("aborted", "AbortError"); }]);
  const result = await collectHolidays(db as unknown as D1Database, SECRET, KASI_NOW, { fetchImpl: sequence.fetchImpl });
  assert.equal(result.status, "ERROR");
  assert.equal(sequence.calls(), 2, "one bounded retry for a timeout");
  assert.match(result.detail ?? "", /^failureClass=TIMEOUT attempts=2 .*retryExhausted=true$/);
  assert.equal(result.lastGoodPreserved, true);
  const stored = db.raw.prepare("SELECT retrieved_at FROM holiday_months WHERE month = '2026-10'").get() as { retrieved_at: string };
  assert.equal(stored.retrieved_at, "2026-10-12T21:30:00.000Z");
});

test("a cached KASI success reports when the months were really received", async () => {
  const db = new SqliteD1();
  const first = fetchSequence([() => kasiMonth("2026-10", [{ locdate: 20261009, dateName: "한글날" }]), () => kasiMonth("2026-11", [])]);
  const collected = await collectHolidays(db as unknown as D1Database, SECRET, KASI_NOW, { fetchImpl: first.fetchImpl });
  assert.equal(collected.retrievedAt, KASI_NOW.toISOString());

  const sixHoursLater = new Date(KASI_NOW.getTime() + 6 * 3_600_000);
  const second = fetchSequence([kasiForbidden]);
  const cached = await collectHolidays(db as unknown as D1Database, SECRET, sixHoursLater, { fetchImpl: second.fetchImpl });
  assert.equal(cached.status, "SUCCESS");
  assert.equal(second.calls(), 0);
  assert.equal(cached.retrievedAt, KASI_NOW.toISOString(), "a cache hit never re-dates the stored months");
  assert.deepEqual(holidayHealthUpdate(cached), {
    status: "LIVE", detail: "SUCCESS", record: { retrievedAt: KASI_NOW.toISOString(), schemaVersion: "kasi-holidays-v1" },
  });
});
