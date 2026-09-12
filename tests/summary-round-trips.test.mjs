import assert from "node:assert/strict";
import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { summarizeLiveSummary } from "../app/api/live/summary/route.ts";
import { SUMMARY_CACHE_CONTROL, SUMMARY_NO_STORE } from "../lib/summary-cache-policy.ts";
import { kstDayBounds, kstDayOf, kstHourStartIsoOf, kstNowIsoOf, relateKstDay, shiftKstDay } from "../lib/kst.ts";

/**
 * Production, 2026-09-04: an uncached /api/live/summary took 3.5–4.2 s
 * (site-smoke run 33836136846) while a cache HIT took ~65 ms and the whole
 * path read ~2,500 indexed rows. The route was awaiting 18 D1 calls one
 * after another; each is a Worker → D1 round trip. This test pins the read
 * path to ONE round trip against a real SQLite schema, and proves the
 * isolation the old chain gave — a broken statement becomes an empty block,
 * never a degraded page — survives the batching.
 */

/** A D1 double over node:sqlite that counts Worker → D1 requests. */
class LocalD1Statement {
  values = [];
  constructor(database, sql, trips) { this.database = database; this.sql = sql; this.trips = trips; }
  bind(...values) { this.values = values; return this; }
  execute() { return this.database.prepare(this.sql).all(...this.values); }
  async all() {
    this.trips.push({ kind: "all", sql: this.sql.slice(0, 40) });
    return { success: true, results: this.execute(), meta: {} };
  }
}

class LocalD1Database {
  trips = [];
  constructor(database) { this.database = database; }
  prepare(sql) { return new LocalD1Statement(this.database, sql, this.trips); }
  async batch(statements) {
    this.trips.push({ kind: "batch", count: statements.length });
    // A D1 batch is atomic: any failing statement rejects the whole batch.
    const results = statements.map((statement) => statement.execute());
    return results.map((rows) => ({ success: true, results: rows, meta: {} }));
  }
}

const migrations = readdirSync("drizzle").filter((file) => file.endsWith(".sql")).sort().map((file) => join("drizzle", file));

function openDatabase(name) {
  const databasePath = join(tmpdir(), `rpk-summary-trips-${name}-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);
  for (const file of migrations) database.exec(readFileSync(file, "utf8").replaceAll("--> statement-breakpoint", ""));
  return { database, databasePath };
}

const GENERATED_AT = "2026-09-04T04:15:34.979Z";

function clockFor(generatedAt = GENERATED_AT) {
  const kstToday = kstDayOf(generatedAt);
  return {
    generatedAt,
    now: Date.parse(generatedAt),
    kstNowIso: kstNowIsoOf(generatedAt),
    kstToday,
    kstHourStart: kstHourStartIsoOf(generatedAt),
    serviceDate: kstToday,
    dayRelation: relateKstDay(kstToday, kstToday),
    dayStartAt: kstDayBounds(kstToday).startAt,
  };
}

function seed(database) {
  database.prepare(`INSERT INTO source_health (source_id, status, last_event_at, last_retrieved_at, schema_version, detail)
    VALUES ('SEOUL_CITYDATA_PPLTN', 'LIVE', '2026-09-04T12:40:00+09:00', '2026-09-04T04:11:05.638Z', 'v1', 'areas ok 3/3')`).run();
  database.prepare(`INSERT INTO seoul_realtime_area (id, source_id, record_origin, area, area_code, area_name, congestion_level,
    congestion_label, population_min, population_max, observed_at, retrieved_at, freshness, schema_version, quality_status, source_hash)
    VALUES ('r1', 'SEOUL_CITYDATA_PPLTN', 'LIVE', 'myeongdong', 'POI001', '명동', 3, '약간 붐빔', 23000, 25000,
      '2026-09-04T13:10:00+09:00', '2026-09-04T04:11:05.638Z', 'LIVE', 'v1', 'VALID', 'h1')`).run();

  const subwayInsert = database.prepare(`INSERT INTO seoul_subway_ridership (
    id, source_id, dataset_id, record_origin, area, reference_date,
    station_code, station_number, station_name, line_name,
    boarding_count, alighting_count, mapping_version, retrieved_at,
    schema_version, quality_status, source_hash
  ) VALUES (?, 'SEOUL_SUBWAY_RIDERSHIP', 'OA-22723', 'OFFICIAL_DAILY', 'myeongdong', ?,
    '0424', '424', '명동', '4호선', ?, ?, 'oa-22723-area-stations-2026-09-02-v1',
    '2026-09-04T00:00:00.000Z', 'seoul-subway-ridership-v1', 'VALID', ?)`);
  Array.from({ length: 29 }, (_, delta) => {
    const date = shiftKstDay("2026-09-03", -delta);
    const alighting = delta === 0 ? 1_124 : 1_000;
    subwayInsert.run(`subway-${date}`, date, alighting - 100, alighting, `hash-${date}`);
  });
}

test("the whole summary read path is one D1 round trip, and the payload is a cacheable live summary", async () => {
  const { database, databasePath } = openDatabase("one-trip");
  try {
    seed(database);
    const client = new LocalD1Database(database);
    const response = await summarizeLiveSummary(client, clockFor());
    const body = await response.json();

    assert.equal(body.mode, "live-summary");
    assert.equal(client.trips.length, 1, `expected one D1 request, saw ${JSON.stringify(client.trips)}`);
    assert.equal(client.trips[0].kind, "batch");
    // 23 block statements + 3 × 21 date-picker probes, all in the one request.
    assert.equal(client.trips[0].count, 23 + 3 * 21);

    assert.equal(body.areas.myeongdong.realtime.congestionLabel, "약간 붐빔");
    assert.equal(body.areas.myeongdong.realtime.freshness, "LIVE");
    assert.equal(body.areas.myeongdong.subwayRidership.referenceDate, "2026-09-03");
    assert.equal(body.areas.myeongdong.subwayRidership.alightingCount, 1_124);
    assert.equal(body.areas.myeongdong.subwayRidership.trend.previousDay.changeTenthsPercent, 124);
    assert.equal(body.areas.myeongdong.subwayRidership.trend.sameWeekdayLastWeek.changeTenthsPercent, 124);
    assert.equal(body.areas.myeongdong.subwayRidership.trend.recentSevenDayAverage.changeTenthsPercent, 124);
    assert.equal(body.areas.myeongdong.subwayRidership.trend.fourWeekSameWeekdayAverage.changeTenthsPercent, 124);
    assert.deepEqual(body.dateAvailability.seoulObserved, ["2026-09-04"], "the per-day probes still feed the picker");
    assert.deepEqual(body.dateAvailability.airportFlights, []);
    assert.equal(response.headers.get("cache-control"), SUMMARY_CACHE_CONTROL,
      "real area data from the batched path is admitted to the edge cache exactly as before");
  } finally {
    database.close();
    unlinkSync(databasePath);
  }
});

test("a broken statement still isolates to its own block: the page stays live, the cache decision unchanged", async () => {
  const { database, databasePath } = openDatabase("isolated");
  try {
    seed(database);
    // Simulate one table the migration set no longer matches. The batch is
    // atomic, so it rejects as a whole; the fallback must recover every other
    // block on its own rather than answering degraded.
    database.exec("DROP TABLE tourism_events");
    const client = new LocalD1Database(database);
    const response = await summarizeLiveSummary(client, clockFor());
    const body = await response.json();

    assert.equal(body.mode, "live-summary", "one broken statement must never take the page down");
    assert.deepEqual(body.areas.myeongdong.events, []);
    assert.equal(body.areas.myeongdong.realtime.congestionLabel, "약간 붐빔");
    assert.equal(response.headers.get("cache-control"), SUMMARY_CACHE_CONTROL);
    assert.equal(client.trips[0].kind, "batch", "the single batch is tried first");
    // Then one concurrent wave: one request per group, not the old serial chain.
    assert.equal(client.trips.length, 1 + 25);
  } finally {
    database.close();
    unlinkSync(databasePath);
  }
});

test("an empty database is still a well-formed live summary that the cache refuses", async () => {
  const { database, databasePath } = openDatabase("empty");
  try {
    const client = new LocalD1Database(database);
    const response = await summarizeLiveSummary(client, clockFor());
    const body = await response.json();
    assert.equal(body.mode, "live-summary");
    assert.deepEqual(body.sources, []);
    assert.equal(response.headers.get("cache-control"), SUMMARY_NO_STORE,
      "no evidence of data means no-store, exactly as before the batching");
    assert.equal(client.trips.length, 1);
  } finally {
    database.close();
    unlinkSync(databasePath);
  }
});


test("population comparisons require exact local time, source, schema and valid quality", async () => {
  const { database, databasePath } = openDatabase("comparisons");
  try {
    seed(database);
    database.exec(`INSERT INTO seoul_realtime_area SELECT 'baseline', source_id, record_origin, area, area_code, area_name, congestion_level, congestion_label, 10000, 10000, '2026-08-28T13:10:00+09:00', retrieved_at, freshness, schema_version, quality_status, 'baseline-hash' FROM seoul_realtime_area WHERE id='r1'`);
    const read = async () => (await (await summarizeLiveSummary(new LocalD1Database(database), clockFor())).json()).areas.myeongdong.realtime.comparisons;
    let changes = await read();
    assert.ok(Math.abs(changes[7].minPercent - 130) < 0.0001);
    assert.equal(changes[28], null);
    for (const [column, value, original] of [["schema_version", "different", "v1"], ["source_id", "other", "SEOUL_CITYDATA_PPLTN"], ["quality_status", "INVALID", "VALID"], ["observed_at", "2026-08-28T13:15:00+09:00", "2026-08-28T13:10:00+09:00"]]) {
      database.prepare(`UPDATE seoul_realtime_area SET ${column}=? WHERE id='baseline'`).run(value);
      assert.equal((await read())[7], null, column);
      database.prepare(`UPDATE seoul_realtime_area SET ${column}=? WHERE id='baseline'`).run(original);
    }
  } finally { database.close(); unlinkSync(databasePath); }
});

test('selected dates never reuse the latest Seoul realtime population as yesterday or tomorrow', async () => {
  const {database,databasePath}=openDatabase('selected-seoul');
  try {
    seed(database);
    for(const serviceDate of ['2026-09-03','2026-09-05']) {
      const clock={...clockFor(),serviceDate,dayRelation:serviceDate<'2026-09-04'?'PAST':'FUTURE',dayStartAt:`${serviceDate}T00:00:00+09:00`};
      const body=await (await summarizeLiveSummary(new LocalD1Database(database),clock)).json();
      for(const area of ['myeongdong','hongdae','seongsu']) {
        assert.equal(body.areas[area].realtime,null);
        assert.deepEqual(body.areas[area].observedSeries,[]);
      }
    }
  } finally {database.close();unlinkSync(databasePath);}
});

test('stored recent observations reach the existing chart with their original ranges and times', async () => {
  const {database,databasePath}=openDatabase('observed-series');
  try {
    seed(database);
    database.exec(`INSERT INTO seoul_realtime_area SELECT 'earlier', source_id, record_origin, area, area_code, area_name, congestion_level, congestion_label, 21000, 24000, '2026-09-04T12:55:00+09:00', retrieved_at, freshness, schema_version, quality_status, 'earlier-hash' FROM seoul_realtime_area WHERE id='r1'`);
    for(const [id,column,value,at] of [
      ['wrong-schema','schema_version','other','12:56'],
      ['wrong-zone','area_code','other','12:57'],
      ['invalid','quality_status','INVALID','12:58'],
      ['wrong-source','source_id','other','12:59'],
      ['forecast-row','record_origin','FORECAST','13:00'],
      ['old-day','observed_at','2026-09-03T13:10:00+09:00','13:01'],
    ]) {
      database.exec(`INSERT INTO seoul_realtime_area SELECT '${id}', source_id, record_origin, area, area_code, area_name, congestion_level, congestion_label, 1, 2, '2026-09-04T${at}:00+09:00', retrieved_at, freshness, schema_version, quality_status, '${id}' FROM seoul_realtime_area WHERE id='r1'`);
      database.prepare(`UPDATE seoul_realtime_area SET ${column}=? WHERE id=?`).run(value,id);
    }
    const body=await (await summarizeLiveSummary(new LocalD1Database(database),clockFor())).json();
    assert.deepEqual(body.areas.myeongdong.observedSeries.map(row=>[row.observedAt,row.populationMin,row.populationMax]),[
      ['2026-09-04T12:55:00+09:00',21000,24000],
      ['2026-09-04T13:10:00+09:00',23000,25000],
    ]);
  } finally {database.close();unlinkSync(databasePath);}
});

test('observation history uses indexed six-hour bounds, caps rows, and never adds a D1 round trip', async () => {
  const {database,databasePath}=openDatabase('observed-cap');
  try {
    seed(database);
    const insert=database.prepare(`INSERT INTO seoul_realtime_area SELECT ?, source_id, record_origin, area, area_code, area_name, congestion_level, congestion_label, population_min, population_max, ?, retrieved_at, freshness, schema_version, quality_status, ? FROM seoul_realtime_area WHERE id='r1'`);
    for(let i=1;i<=90;i++) insert.run(`history-${i}`,kstNowIsoOf(new Date(Date.parse('2026-09-04T04:10:00Z')-i*300000).toISOString()),`h-${i}`);
    insert.run('future','2026-09-04T13:20:00+09:00','future-hash');
    const client=new LocalD1Database(database), prepared=[];
    const prepare=client.prepare.bind(client);
    client.prepare=sql=>{const statement=prepare(sql);prepared.push(statement);return statement;};
    const body=await (await summarizeLiveSummary(client,clockFor('2026-09-04T04:10:00Z'))).json();
    const rows=body.areas.myeongdong.observedSeries;
    assert.equal(rows.length,73);
    assert.equal(rows[0].observedAt,'2026-09-04T07:10:00+09:00');
    assert.equal(rows.at(-1).observedAt,'2026-09-04T13:10:00+09:00');
    assert.equal(client.trips.length,1);
    const history=prepared.find(statement=>statement.sql.includes('ORDER BY observed_at DESC LIMIT 73'));
    const plan=database.prepare(`EXPLAIN QUERY PLAN ${history.sql}`).all(...history.values).map(row=>row.detail).join('\n');
    assert.equal((plan.match(/SEARCH seoul_realtime_area USING INDEX seoul_realtime_area_(?:area_observed_idx|observed_unique)/g)??[]).length,3,plan);
    assert.doesNotMatch(plan,/SCAN seoul_realtime_area/);
  } finally {database.close();unlinkSync(databasePath);}
});
