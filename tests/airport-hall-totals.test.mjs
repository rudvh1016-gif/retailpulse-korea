import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {airportSides, AIRPORT_HALL_SIDES_PUBLIC, withOfficialHallTotals} from '../lib/airport-sides-summary.ts';
import {summarizeHallSides} from '../lib/airport-sides.ts';
import {summarizeLiveSummary} from '../app/api/live/summary/route.ts';
import {normalizeAirportPassengerForecastRow} from '../lib/source-adapters.ts';
import {kstDayBounds, shiftKstDay} from '../lib/kst.ts';

const DATE = '2026-10-04';
function band(hour, terminal = 'T1') {
  const values = terminal === 'T1'
    ? {t1dg1: 10, t1dg2: 20, t1dg3: 30, t1dg4: 40, t1dg5: 50, t1dg6: 0, t1dgsum1: 150}
    : {t2dg1: 70, t2dg2: 30, t2dgsum2: 100};
  return Object.entries(values).map(([zone, expectedPassengers]) => ({
    terminal, direction: 'departure', zone, isAggregate: zone.includes('sum') ? 1 : 0,
    targetDate: DATE, timeBandRaw: `${String(hour).padStart(2, '0')}_${String(hour + 1).padStart(2, '0')}`,
    targetStartAt: `${DATE}T${String(hour).padStart(2, '0')}:00:00+09:00`,
    targetEndAt: hour === 23 ? `${shiftKstDay(DATE, 1)}T00:00:00+09:00` : `${DATE}T${String(hour + 1).padStart(2, '0')}:00:00+09:00`,
    expectedPassengers, retrievedAt: '2026-10-03T21:42:00Z',
  }));
}
const split = rows => [rows.filter(row => row.isAggregate === 0), rows.filter(row => row.isAggregate === 1)];

test('already-read departure totals reconcile hall components without counting totals twice', () => {
  const [components, totals] = split([...band(9), ...band(9, 'T2')]);
  const rows = withOfficialHallTotals(components, totals);
  assert.equal(rows.length, components.length + totals.length);
  assert.deepEqual(summarizeHallSides(rows, 'T1', DATE).confirmed, {total: 150, east: 60, west: 90, bands: 1});
  assert.deepEqual(summarizeHallSides(rows, 'T2', DATE).confirmed, {total: 100, east: 30, west: 70, bands: 1});
  const projectedTotals = totals.map(row => {const projected = {...row}; delete projected.zone; return projected;});
  assert.deepEqual(summarizeHallSides(withOfficialHallTotals(components, projectedTotals), 'T1', DATE).confirmed, {total: 150, east: 60, west: 90, bands: 1});
});

test('arrival totals, another date and observed queue people do not become departure forecasts', () => {
  const [components, totals] = split(band(9));
  const arrival = {...totals[0], direction: 'arrival', zone: 't1egsum1', expectedPassengers: 999};
  const observation = {terminal: 'T1', zone: 'DG1_A', waitingCount: 999, observedAt: `${DATE}T09:00:00+09:00`};
  const foreignDate = {...totals[0], targetDate: '2026-10-03', expectedPassengers: 999};
  const rows = withOfficialHallTotals([...components, observation], [...totals, arrival, observation, foreignDate]);
  assert.equal(summarizeHallSides(rows, 'T1', DATE).confirmed.total, 150);
  assert.equal(rows.includes(arrival), false);
  assert.equal(rows.includes(observation), false);
  assert.equal(summarizeHallSides([arrival, observation], 'T1', DATE).coverage, 'UNAVAILABLE');
});

test('official total mismatch never produces a side figure', () => {
  const rows = band(9).map(row => row.isAggregate ? {...row, expectedPassengers: 151} : row);
  const result = summarizeHallSides(rows, 'T1', DATE);
  assert.equal(result.bands[0].total, 151);
  assert.equal(result.bands[0].east, null);
  assert.equal(result.bands[0].west, null);
  assert.equal(result.confirmed.bands, 0);
  assert.equal(result.day, null);
});

test('missing, blank, negative and non-finite hall counts stay unavailable, while an explicit zero survives', () => {
  for (const value of [null, undefined, '', -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = summarizeHallSides(band(9).map(row => row.zone === 't1dg6' ? {...row, expectedPassengers: value} : row), 'T1', DATE);
    assert.equal(result.bands[0].west, null, `invalid count ${String(value)}`);
    assert.equal(result.confirmed.bands, 0);
  }
  assert.equal(summarizeHallSides(band(9), 'T1', DATE).bands[0].west, 90);
});

test('T1 hall6 zero retains the official expected-congestion exclusion limitation', () => {
  const day = summarizeHallSides(band(9), 'T1', DATE);
  assert.deepEqual(day.limitations, ['T1_HALL_6_OUTSIDE_EXPECTED_CONGESTION']);
  assert.equal(day.confirmed.west, 90);
  assert.deepEqual(summarizeHallSides(band(9, 'T2'), 'T2', DATE).limitations, []);
});

test('duplicate components or totals fail closed instead of choosing the first version', () => {
  const original = band(9);
  for (const duplicate of [original[0], {...original[0], expectedPassengers: 999}, original.at(-1)]) {
    const result = summarizeHallSides([...original, duplicate], 'T1', DATE);
    assert.equal(result.bands.length, 1);
    assert.equal(result.bands[0].sidesConsistent, false);
    assert.equal(result.confirmed.bands, 0);
  }
});

test('midnight aliases are the same hour and cannot inflate a day', () => {
  const rows = Array.from({length: 24}, (_, hour) => band(hour)).flat();
  const alias = band(23).map(row => ({...row, timeBandRaw: '23_00'}));
  const result = summarizeHallSides([...rows, ...alias], 'T1', DATE);
  assert.equal(result.bands.length, 24);
  assert.equal(result.confirmed.bands, 23);
  assert.equal(result.coverage, 'PARTIAL');
  assert.equal(result.day, null);
});

test('TOTAL rows do not form a 25th hourly forecast or get summed again', async () => {
  const rows = Array.from({length: 24}, (_, hour) => band(hour)).flat();
  const result = summarizeHallSides([...rows, {...rows.at(-1), timeBandRaw: 'TOTAL', expectedPassengers: 999999}], 'T1', DATE);
  assert.equal(result.coverage, 'COMPLETE');
  assert.equal(result.day.total, 24 * 150);
  assert.equal(result.bands.length, 24);
  await assert.rejects(normalizeAirportPassengerForecastRow({adate: '합계', atime: 'TOTAL', t1dgsum1: '999999'}, '2026-10-03T21:42:00Z'), /A5_ADATE_FORMAT/);
});

test('a missing or overlapping hour cannot establish a complete day', () => {
  const rows = Array.from({length: 24}, (_, hour) => band(hour)).flat();
  for (const invalid of [rows.filter(row => !row.timeBandRaw.startsWith('11_')), rows.map(row => row.timeBandRaw.startsWith('11_') ? {...row, targetEndAt: `${DATE}T13:00:00+09:00`} : row)]) {
    const result = summarizeHallSides(invalid, 'T1', DATE);
    assert.equal(result.coverage, 'PARTIAL');
    assert.equal(result.day, null);
    assert.equal(result.confirmed.bands, 23);
  }
});

test('prepared private hall values remain absent from the withheld public block', () => {
  const [components, totals] = split(band(9));
  const rows = withOfficialHallTotals(components, totals);
  const result = airportSides(DATE, 'TODAY', rows, [], [], false, false);
  assert.equal(result.halls, null);
  assert.equal(result.hallsWithheld, true);
  assert.doesNotMatch(JSON.stringify(result), /expectedPassengers|T1_HALL_6|"east":/);
});

test('the actual disabled summary route keeps one 30-statement batch and returns no hall data', async () => {
  assert.equal(AIRPORT_HALL_SIDES_PUBLIC, false, 'this draft must not enable the public policy flag');
  const db = new DatabaseSync(':memory:');
  try {
    for (const name of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) db.exec(readFileSync(`drizzle/${name}`, 'utf8').replaceAll('--> statement-breakpoint', ''));
    const seed = db.prepare(`INSERT INTO airport_passenger_forecast (id,source_id,record_origin,terminal,direction,zone,is_aggregate,target_date,time_band_raw,target_start_at,target_end_at,expected_passengers,retrieved_at,schema_version,quality_status,source_hash) VALUES (?, 'INCHEON_PASSENGER_FORECAST','FORECAST',?,?,?,?,?,?,?,?,?,?,'v1','VALID',?)`);
    const records = Array.from({length: 24}, (_, hour) => [...band(hour), ...band(hour, 'T2')]).flat();
    for (const row of records) seed.run(`${row.terminal}:${row.zone}:${row.timeBandRaw}`, row.terminal,row.direction,row.zone,row.isAggregate,row.targetDate,row.timeBandRaw,row.targetStartAt,row.targetEndAt,row.expectedPassengers,row.retrievedAt,row.zone);
    const statements = [];
    let batches = 0;
    const client = {prepare(sql) { const statement = {sql, values: [], bind(...values) {this.values = values; return this;}}; statements.push(statement); return statement; }, async batch(items) {batches++; return items.map(item => ({success:true,results:db.prepare(item.sql).all(...item.values),meta:{}}));}};
    const response = await summarizeLiveSummary(client, {generatedAt:'2026-10-03T22:00:00Z',now:Date.parse('2026-10-03T22:00:00Z'),kstToday:DATE,kstNowIso:`${DATE}T07:00:00+09:00`,kstHourStart:`${DATE}T07:00:00+09:00`,serviceDate:DATE,dayRelation:'TODAY',dayStartAt:kstDayBounds(DATE).startAt});
    const body = await response.json();
    assert.equal(batches, 1);
    assert.equal(statements.length, 30);
    assert.equal(body.airport.sides.halls, null);
    assert.equal(body.airport.sides.hallsWithheld, true);
    assert.equal(body.airport.forecastCoverage.all, 'COMPLETE');
    const hallQuery = statements.find(item => item.sql.includes('is_aggregate = 0 AND target_date'));
    assert.equal(db.prepare(hallQuery.sql).all(...hallQuery.values).length, 0, 'OFF still reads no component rows');
    const beforeSql = hallQuery.sql.replace('SELECT terminal, direction, zone,', 'SELECT terminal, zone,');
    const enabledBindings = [DATE, 'true']; // Local SQLite only; never changes the public policy flag.
    const plan = sql => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...enabledBindings).map(row => row.detail);
    assert.deepEqual(plan(hallQuery.sql), plan(beforeSql), 'projection-only change keeps the SQLite access plan');
    assert.equal(db.prepare(hallQuery.sql).all(...enabledBindings).length, 192);
    assert.equal(db.prepare(hallQuery.sql).all(...enabledBindings).length, db.prepare(beforeSql).all(...enabledBindings).length);
    const oldProjectionClient = {prepare(sql) {return {sql:sql.replace('SELECT terminal, direction, zone,', 'SELECT terminal, zone,'),values:[],bind(...values){this.values=values;return this;}};},async batch(items){return items.map(item=>({success:true,results:db.prepare(item.sql).all(...item.values),meta:{}}));}};
    const before = await summarizeLiveSummary(oldProjectionClient, {generatedAt:'2026-10-03T22:00:00Z',now:Date.parse('2026-10-03T22:00:00Z'),kstToday:DATE,kstNowIso:`${DATE}T07:00:00+09:00`,kstHourStart:`${DATE}T07:00:00+09:00`,serviceDate:DATE,dayRelation:'TODAY',dayStartAt:kstDayBounds(DATE).startAt});
    assert.deepEqual(body, await before.json(), 'the withheld public response is identical before/after the projection change');
  } finally {db.close();}
});
