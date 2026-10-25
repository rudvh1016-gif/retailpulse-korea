/**
 * A6 — 15095071 / 15095070 monthly passenger statistics: request plan, changed-only
 * storage, fail-closed outcomes and the public read. Fixtures are synthetic
 * ("Synthetic Country A"); the field names are the ones the 2026-10-15 probe
 * (run 38671372057) observed for 2026-08.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  AIRPORT_STATS_WINDOW_MONTHS,
  collectAirportMonthlyStats,
  planAirportStatsMonths,
} from "../lib/airport-monthly-stats";
import { readAirportMonthlyStats } from "../lib/airport-monthly-stats-read";
import type { CollectorEnv } from "../lib/collector";

const NOW = new Date("2026-10-15T21:07:00Z"); // 06:07 KST 10-16: latest complete month is 2026-09.
const KEY = "SYNTHETIC+test/key==";

function database() {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) sql.exec(statement);
    }
  }
  const prepare = (text: string) => {
    let params: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) { params = values; return statement; },
      async all() { return { success: true, results: sql.prepare(text).all(...(params as never[])) }; },
      async first() { return sql.prepare(text).get(...(params as never[])) ?? null; },
      async run() { const result = sql.prepare(text).run(...(params as never[])); return { success: true, meta: { changes: Number(result.changes) } }; },
    };
    return statement;
  };
  return { sql, db: { prepare } as unknown as D1Database };
}

const header = (resultCode: string, resultMsg = "NORMAL SERVICE.", body?: unknown) =>
  JSON.stringify({ response: { header: { resultCode, resultMsg }, ...(body === undefined ? {} : { body }) } });
const okBody = (items: unknown[]) => header("00", "NORMAL SERVICE.", { items: { item: items }, numOfRows: 10, pageNo: 1 });
const countries = (scale = 1) => [
  { region: "Synthetic Region 1", country: "Synthetic Country A", arrPassenger: "1,000", depPassenger: String(900 * scale), passenger: String(1000 + 900 * scale) },
  { region: "Synthetic Region 1", country: "Synthetic Country B", arrPassenger: "20", depPassenger: "", passenger: "20" },
];
const bands = () => Array.from({ length: 24 }, (_, hour) => ({
  time: `${String(hour).padStart(2, "0")}~${String(hour + 1).padStart(2, "0")}`, arrPassenger: "10", depPassenger: String(hour * 3), passenger: String(10 + hour * 3),
}));

/** Answers by operation and month; anything unplanned fails the test. */
function provider(answer: (operation: string, month: string) => { status: number; body: string }) {
  const calls: string[] = [];
  const fetchImpl = (async (input: URL) => {
    const url = new URL(String(input));
    const operation = url.pathname.includes("AviationStatsByCountry") ? "country" : "time";
    const month = url.searchParams.get("from_month")!;
    assert.equal(url.searchParams.get("to_month"), month, "one month per request: a range would be summed by the provider");
    calls.push(`${operation}:${month}`);
    const reply = answer(operation, month);
    return new Response(reply.body, { status: reply.status, headers: { "content-type": "application/json;charset=UTF-8" } });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

test("a run asks for the latest complete month and at most three missing older ones per operation", () => {
  assert.deepEqual(planAirportStatsMonths(NOW, new Set()), ["202609", "202608", "202607", "202606"]);
  assert.deepEqual(planAirportStatsMonths(NOW, new Set(["2026-08", "2026-07", "2026-06", "2026-05"])), ["202609", "202604", "202603", "202602"]);
  const full = new Set(Array.from({ length: AIRPORT_STATS_WINDOW_MONTHS }, (_, back) => {
    const date = new Date(Date.UTC(2026, 8 - back, 1));
    return date.toISOString().slice(0, 7);
  }));
  assert.deepEqual(planAirportStatsMonths(NOW, full), ["202609"], "a full window costs one request per operation");
});

test("stores each month once, keeps a missing count null, and an unchanged month writes nothing", async () => {
  const { sql, db } = database();
  const env: CollectorEnv = { DB: db, DATA_GO_KR_SERVICE_KEY: KEY };
  // 2026-09 is not published yet (03); 2026-06..08 are.
  const answer = (operation: string, month: string) => month === "202609"
    ? { status: 200, body: header("03", "NO_DATA") }
    : { status: 200, body: okBody(operation === "country" ? countries() : bands()) };
  const first = provider(answer);
  const result = await collectAirportMonthlyStats(env, NOW, { fetchImpl: first.fetchImpl });
  assert.equal(first.calls.length, 8);
  assert.equal(result.status, "SUCCESS");
  assert.equal(result.records, 6);
  assert.equal(result.sourceHealth, "OFFICIAL_HISTORICAL");
  const stored = sql.prepare("SELECT operation_id, month, payload FROM airport_monthly_stats ORDER BY month, operation_id").all() as { operation_id: string; month: string; payload: string }[];
  assert.deepEqual(stored.map((row) => `${row.operation_id}:${row.month}`), [
    "ROUTE_COUNTRY_PASSENGERS:2026-06", "TIME_BAND_PASSENGERS:2026-06",
    "ROUTE_COUNTRY_PASSENGERS:2026-07", "TIME_BAND_PASSENGERS:2026-07",
    "ROUTE_COUNTRY_PASSENGERS:2026-08", "TIME_BAND_PASSENGERS:2026-08",
  ]);
  const countryRows = JSON.parse(stored[4].payload).rows;
  assert.deepEqual(countryRows[0], { label: "Synthetic Country A", region: "Synthetic Region 1", arrivals: 1000, departures: 900, total: 1900, aggregate: false, startHour: null, endHour: null });
  assert.equal(countryRows[1].departures, null, "an empty count is not a zero");
  const bandRows = JSON.parse(stored[5].payload).rows;
  assert.deepEqual([bandRows[7].startHour, bandRows[7].endHour, bandRows[7].departures], [7, 8, 21]);
  const health = sql.prepare("SELECT source_id, status FROM source_health ORDER BY source_id").all();
  assert.deepEqual(health.map((row) => `${row.source_id}:${row.status}`), ["INCHEON_ROUTE_COUNTRY_PASSENGERS:OFFICIAL_HISTORICAL", "INCHEON_TIME_BAND_PASSENGERS:OFFICIAL_HISTORICAL"]);

  // Next day: same answers. Only 2026-09 plus the three next-older missing months are asked, and
  // nothing already stored is rewritten.
  const before = sql.prepare("SELECT month, operation_id, retrieved_at FROM airport_monthly_stats ORDER BY month, operation_id").all();
  const second = provider(answer);
  const again = await collectAirportMonthlyStats(env, new Date(NOW.getTime() + 86_400_000), { fetchImpl: second.fetchImpl });
  assert.deepEqual(second.calls, ["country:202609", "country:202605", "country:202604", "country:202603", "time:202609", "time:202605", "time:202604", "time:202603"]);
  assert.equal(again.records, 6);
  const kept = sql.prepare("SELECT month, operation_id, retrieved_at FROM airport_monthly_stats WHERE month >= '2026-06' ORDER BY month, operation_id").all();
  assert.deepEqual(kept, before, "unchanged months keep their first retrieval time");
});

test("a revised month is rewritten once; the same revision again is not", async () => {
  const { sql, db } = database();
  const env: CollectorEnv = { DB: db, DATA_GO_KR_SERVICE_KEY: KEY };
  let scale = 1;
  const answer = (operation: string) => ({ status: 200, body: okBody(operation === "country" ? countries(scale) : bands()) });
  await collectAirportMonthlyStats(env, NOW, { fetchImpl: provider(answer).fetchImpl });
  scale = 2;
  const revised = await collectAirportMonthlyStats(env, NOW, { fetchImpl: provider(answer).fetchImpl });
  assert.equal(revised.records, 1 + 3 + 3, "the revised latest month plus newly backfilled months");
  const payload = sql.prepare("SELECT payload FROM airport_monthly_stats WHERE operation_id = 'ROUTE_COUNTRY_PASSENGERS' AND month = '2026-09'").get() as { payload: string };
  assert.equal(JSON.parse(payload.payload).rows[0].departures, 1800);
});

test("an unregistered key stops every remaining request, is never retried, and keeps stored months", async () => {
  const { sql, db } = database();
  const env: CollectorEnv = { DB: db, DATA_GO_KR_SERVICE_KEY: KEY };
  await collectAirportMonthlyStats(env, NOW, { fetchImpl: provider((operation) => ({ status: 200, body: okBody(operation === "country" ? countries() : bands()) })).fetchImpl });
  const denied = provider(() => ({ status: 403, body: header("30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR") }));
  const result = await collectAirportMonthlyStats(env, new Date(NOW.getTime() + 86_400_000), { fetchImpl: denied.fetchImpl });
  assert.deepEqual(denied.calls, ["country:202609"], "one refused request, then nothing");
  assert.equal(result.status, "ERROR");
  assert.equal(result.sourceHealth, "STALE");
  assert.equal(result.lastGoodPreserved, true);
  assert.equal((sql.prepare("SELECT COUNT(*) AS n FROM airport_monthly_stats").get() as { n: number }).n, 8);
  assert.match(result.detail ?? "", /NOT_REGISTERED code=30/);
  assert.ok(!(result.detail ?? "").includes(KEY));
});

test("a drifted field list is reported by name and not stored", async () => {
  const { sql, db } = database();
  const drifted = provider((operation) => ({ status: 200, body: okBody(operation === "country"
    ? countries().map((row) => ({ ...row, terminalId: "P01" }))
    : bands()) }));
  const result = await collectAirportMonthlyStats({ DB: db, DATA_GO_KR_SERVICE_KEY: KEY }, NOW, { fetchImpl: drifted.fetchImpl });
  assert.equal(result.status, "ERROR");
  assert.match(result.detail ?? "", /DRIFT \+terminalId/);
  assert.equal((sql.prepare("SELECT COUNT(*) AS n FROM airport_monthly_stats WHERE operation_id = 'ROUTE_COUNTRY_PASSENGERS'").get() as { n: number }).n, 0);
  assert.equal((sql.prepare("SELECT COUNT(*) AS n FROM airport_monthly_stats WHERE operation_id = 'TIME_BAND_PASSENGERS'").get() as { n: number }).n, 4);
});

test("the public read returns the newest stored month at or before the request and only its calendar predecessor", async () => {
  const { sql, db } = database();
  const insert = sql.prepare("INSERT INTO airport_monthly_stats (operation_id, month, payload, source_hash, retrieved_at) VALUES (?, ?, ?, ?, ?)");
  const payload = JSON.stringify({ schemaVersion: "incheon-airport-stats-v1", rows: [{ label: "Synthetic Country A", region: null, arrivals: 1, departures: 2, total: 3, aggregate: false, startHour: null, endHour: null }] });
  for (const month of ["2026-06", "2026-08", "2026-09"]) for (const operation of ["ROUTE_COUNTRY_PASSENGERS", "TIME_BAND_PASSENGERS"]) insert.run(operation, month, payload, month, "2026-10-15T21:07:00Z");
  const latest = await readAirportMonthlyStats(db, "2026-10");
  assert.equal(latest.month, "2026-09");
  assert.equal(latest.previousMonth, "2026-08");
  assert.equal(latest.current.ROUTE_COUNTRY_PASSENGERS?.rows[0].departures, 2);
  assert.ok(latest.rowsRead <= 4);
  const gap = await readAirportMonthlyStats(db, "2026-08");
  assert.equal(gap.month, "2026-08");
  assert.equal(gap.previousMonth, null, "2026-07 is missing, so 2026-06 is never shown as the month before");
  const none = await readAirportMonthlyStats(db, "2026-05");
  assert.equal(none.month, null);
  // Month-first primary key: the read is a key range, never a table scan.
  const plan = sql.prepare("EXPLAIN QUERY PLAN SELECT operation_id, month, payload, retrieved_at FROM airport_monthly_stats WHERE operation_id=? AND month<=? ORDER BY month DESC LIMIT 2").all("ROUTE_COUNTRY_PASSENGERS","2026-10") as { detail: string }[];
  assert.ok(plan.every((row) => !/^SCAN airport_monthly_stats\b/.test(row.detail) || /USING/.test(row.detail)), JSON.stringify(plan));
});

// Exact comparison reads only two payloads; metadata contains actual stored months.
test('independent exact months never fall back and operations retain their own latest month',async()=>{
 const {sql,db}=database();
 const insert=sql.prepare('INSERT INTO airport_monthly_stats (operation_id,month,payload,source_hash,retrieved_at) VALUES (?,?,?,?,?)');
 const payload=JSON.stringify({rows:[{label:'Japan',region:null,arrivals:1,departures:3100,total:null,aggregate:false,startHour:null,endHour:null}]});
 for(const value of ['2026-01','2026-03','2026-08','2026-09'])insert.run('ROUTE_COUNTRY_PASSENGERS',value,payload,value,'2026-10-25T00:00:00Z');
 for(const value of ['2026-07','2026-08'])insert.run('TIME_BAND_PASSENGERS',value,payload,value,'2026-10-25T00:00:00Z');
 const {readAirportPassengerComparison}=await import('../lib/airport-monthly-stats-read');
 const comparison=await readAirportPassengerComparison(db,'2026-09','2026-03');
 assert.equal(comparison.selected?.month,'2026-09');assert.equal(comparison.baseline?.month,'2026-03');
 assert.deepEqual(comparison.availableMonths,['2026-01','2026-03','2026-08','2026-09']);
 const missing=await readAirportPassengerComparison(db,'2026-10','2026-03');assert.equal(missing.selected,null);assert.equal(missing.baseline?.month,'2026-03');
 const same=await readAirportPassengerComparison(db,'2026-03','2026-03');assert.deepEqual(same.selected,same.baseline);
 const latest=await readAirportMonthlyStats(db,'2026-10');assert.equal(latest.current.ROUTE_COUNTRY_PASSENGERS?.month,'2026-09');assert.equal(latest.current.TIME_BAND_PASSENGERS?.month,'2026-08');assert.equal(latest.previous.TIME_BAND_PASSENGERS?.month,'2026-07');
 sql.prepare("UPDATE airport_monthly_stats SET payload='broken' WHERE month='2026-03'").run();await assert.rejects(readAirportPassengerComparison(db,'2026-09','2026-03'));
});
test('November daily plan checks October without increasing the bounded backfill budget',()=>{
 assert.deepEqual(planAirportStatsMonths(new Date('2026-11-01T21:07:00Z'),new Set()),['202610','202609','202608','202607']);
});
test('known partial provider response preserves last-good; absent totalCount stays accepted',async()=>{
 const {sql,db}=database();const env:CollectorEnv={DB:db,DATA_GO_KR_SERVICE_KEY:KEY};
 await collectAirportMonthlyStats(env,NOW,{fetchImpl:provider(operation=>({status:200,body:okBody(operation==='country'?countries():bands())})).fetchImpl});
 const before=sql.prepare("SELECT payload FROM airport_monthly_stats WHERE operation_id='ROUTE_COUNTRY_PASSENGERS' AND month='2026-09'").get();
 assert.ok(before);
 const result=await collectAirportMonthlyStats(env,NOW,{fetchImpl:provider(()=>({status:200,body:header('00','NORMAL SERVICE.',{items:{item:countries(2)},totalCount:999,numOfRows:10,pageNo:1})})).fetchImpl});
 assert.equal(result.status,'ERROR');assert.deepEqual(sql.prepare("SELECT payload FROM airport_monthly_stats WHERE operation_id='ROUTE_COUNTRY_PASSENGERS' AND month='2026-09'").get(),before);
});

test('corrupt latest or predecessor fails the whole read and preserves the same-key last-good',async()=>{
 const {sql,db}=database();const insert=sql.prepare('INSERT INTO airport_monthly_stats (operation_id,month,payload,source_hash,retrieved_at) VALUES (?,?,?,?,?)');
 const payload=JSON.stringify({rows:[{label:'Japan',region:null,arrivals:null,departures:3100,total:null,aggregate:false,startHour:null,endHour:null}]});
 for(const operation of ['ROUTE_COUNTRY_PASSENGERS','TIME_BAND_PASSENGERS'])for(const month of ['2026-08','2026-09'])insert.run(operation,month,payload,month,'2026-10-25T00:00:00Z');
 const {createStoredReadCache}=await import('../lib/stored-read-cache');let now=0;
 const cache=createStoredReadCache(()=>readAirportMonthlyStats(db,'2026-10'),()=>now,300);
 const good=await cache.read('2026-10');assert.equal(good.failed,false);
 sql.prepare("UPDATE airport_monthly_stats SET payload='broken' WHERE operation_id='ROUTE_COUNTRY_PASSENGERS' AND month='2026-09'").run();
 await assert.rejects(readAirportMonthlyStats(db,'2026-10'),/PAYLOAD_INVALID/);now=301;
 const stale=await cache.read('2026-10');assert.equal(stale.failed,true);assert.deepEqual(stale.value,good.value);
 sql.prepare("UPDATE airport_monthly_stats SET payload=? WHERE month='2026-09'").run(payload);
 sql.prepare("UPDATE airport_monthly_stats SET payload='broken' WHERE operation_id='TIME_BAND_PASSENGERS' AND month='2026-08'").run();
 await assert.rejects(readAirportMonthlyStats(db,'2026-10'),/PAYLOAD_INVALID/);
});
test('2026 stored catalog survives a 2027 latest selection without mixing pair payloads',async()=>{
 const {sql,db}=database();const insert=sql.prepare('INSERT INTO airport_monthly_stats (operation_id,month,payload,source_hash,retrieved_at) VALUES (?,?,?,?,?)');
 const payload=JSON.stringify({rows:[{label:'Japan',region:null,arrivals:null,departures:1,total:null,aggregate:false,startHour:null,endHour:null}]});
 for(const month of ['2026-03','2026-09','2026-12','2027-01'])insert.run('ROUTE_COUNTRY_PASSENGERS',month,payload,month,'2027-02-01T00:00:00Z');
 const {readAirportPassengerComparison}=await import('../lib/airport-monthly-stats-read');
 const result=await readAirportPassengerComparison(db,'2027-01','2026-12');
 assert.deepEqual(result.availableMonths,['2026-03','2026-09','2026-12']);assert.equal(result.selected?.month,'2027-01');assert.equal(result.baseline?.month,'2026-12');
 const chosen=await readAirportPassengerComparison(db,'2026-09','2026-03');assert.equal(chosen.selected?.month,'2026-09');assert.equal(chosen.baseline?.month,'2026-03');
});
