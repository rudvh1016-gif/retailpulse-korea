import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteD1 } from './helpers/operational-sqlite.mjs';
import { compositionHash, prepareAirportMonths, MONTH_RAW_LIMIT } from '../lib/airport-monthly-store.ts';
import { dailyFlightProfile } from '../lib/airport-day-profile.ts';
import { AIRPORT_MONTH_VERSION } from '../lib/airport-monthly-flights.ts';
import { AIRPORT_SIDES_VERSION } from '../lib/airport-sides.ts';
import { DESTINATIONS_VERSION } from '../lib/airport-destinations.ts';

const TODAY = '2026-11-03';
const AREAS = ['T1', 'T2', 'CONCOURSE'];
const scans = [{ from: '2026-10-01', to: '2026-11-02', startedAt: '2026-11-03T00:00:00Z' }];
function flight(day, id, time = '10:30', extra = {}) {
  return { physicalFlightId: id, terminal: 'T2', gate: '291', operatingFlight: 'KE703', airportCode: 'NRT',
    scheduledAt: `${day}T${time}:00+09:00`, retrievedAt: '2026-11-03T00:00:00Z', status: 'scheduled', ...extra };
}
function legacy(rows, day, complete = true) {
  const profile = dailyFlightProfile(rows, day, complete);
  for (const area of AREAS) delete profile[area].halfHours;
  return profile;
}
function oldRollups() {
  return { version: AIRPORT_MONTH_VERSION, asOf: TODAY, preparedAt: '2026-11-03T00:00:00Z',
    sidesVersion: AIRPORT_SIDES_VERSION, destinationsVersion: DESTINATIONS_VERSION, months: [] };
}
function fixture(t) {
  const db = new SqliteD1();
  t.after(() => db.raw.close());
  const records = () => db.raw.prepare('SELECT day,payload,source_hash AS sourceHash FROM airport_daily_composition ORDER BY day').all();
  const payload = day => JSON.parse(records().find(record => record.day === day).payload);
  const insertFlights = rows => rows.forEach((row, index) => {
    db.raw.prepare(`INSERT INTO airport_flights(id,source_id,record_origin,direction,flight_number,terminal,gate,status,
      scheduled_at,event_at,retrieved_at,freshness,schema_version,quality_status,source_hash,physical_flight_id,airport_code)
      VALUES(?,'INCHEON_FLIGHT_DETAIL','LIVE','departure',?,?,?,?,?,?,?,'LIVE','v1','VALID',?,?,?)`)
      .run(`${row.scheduledAt}-${row.physicalFlightId}-${index}`, row.operatingFlight, row.terminal, row.gate, row.status,
        row.scheduledAt, row.scheduledAt, row.retrievedAt, `raw-${index}`, row.physicalFlightId, row.airportCode);
  });
  const insert = async (day, profile, extra = {}) => {
    const data = { all: { totalFlights: 91, retrievedAt: 'summary-clock', extension: 'keep' },
      byTerminal: { T2: { totalFlights: 37, retrievedAt: 'terminal-clock' } },
      arbitraryExtension: { nested: [1, 'unchanged', { safe: true }] }, ...(profile ? { profile } : {}), ...extra };
    db.raw.prepare('INSERT INTO airport_daily_composition VALUES(?,?,?,?)')
      .run(day, JSON.stringify(data), await compositionHash(data), 'original-clock');
    return data;
  };
  return { db, records, payload, insertFlights, insert,
    run: (evidence = scans, snapshot = records()) => prepareAirportMonths(db, TODAY, snapshot, evidence) };
}
function assertPreserved(before, after) {
  const strip = data => {
    const copy = structuredClone(data);
    delete copy.monthlyRollups;
    if (copy.profile) for (const area of AREAS) delete copy.profile[area].halfHours;
    return copy;
  };
  assert.deepEqual(strip(after), strip(before), 'only precision and monthly rollups may change');
}
function assertLegacy(profile) {
  for (const area of AREAS) assert.equal(profile[area].halfHours, undefined);
}
function rawReadCount(db) { return db.calls.filter(sql => sql.includes('FROM airport_flights')).length; }
function assertQueryBudget(db, reads, writes) {
  assert.equal(rawReadCount(db), reads);
  assert.equal(db.calls.filter(sql => sql.startsWith('UPDATE airport_daily_composition')).length, writes);
  assert.ok(db.calls.every(sql => sql.includes('FROM airport_flights') || sql.startsWith('UPDATE airport_daily_composition')),
    'upgrade must reuse the existing raw query and daily-row updates only');
  for (const sql of db.calls.filter(sql => sql.includes('FROM airport_flights'))) {
    assert.match(sql, /scheduled_at>=\? AND scheduled_at<\?/);
    assert.match(sql, /LIMIT 40001/);
  }
}

test('October 1 outside the 28-day rebuild gains exact deduplicated half hours without altering summaries', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw Error('Provider calls are forbidden'); });
  const f = fixture(t), day = '2026-10-01';
  const rows = [flight(day, 'same', '10:05', { retrievedAt: '2026-10-01T00:00:00Z' }),
    flight(day, 'same', '10:35'), flight(day, 'cancelled', '11:05', { status: 'cancelled' }),
    flight(day, 'concourse', '23:59', { terminal: 'CONCOURSE', gate: '101' })];
  // Canonical storage already enforces one row per physical flight. The legacy
  // profile was built from the earlier duplicate feed plus its newest row.
  f.insertFlights(rows.slice(1));
  const before = await f.insert(day, legacy(rows, day));
  await f.insert('2026-11-02', null);
  const result = await f.run();
  assert.deepEqual(result, { status: 'PREPARED', records: 2, rawRows: 3 });
  const after = f.payload(day);
  assertPreserved(before, after);
  assert.deepEqual(after.profile, dailyFlightProfile(rows, day, true));
  assert.equal(after.profile.T2.halfHours[20], 0);
  assert.equal(after.profile.T2.halfHours[21], 1);
  assert.equal(after.profile.CONCOURSE.halfHours[47], 1);
  assert.equal(after.profile.cancelled, 1);
  assert.equal(f.payload('2026-11-02').monthlyRollups.shiftProfileVersion, 1);
  assert.equal(f.records()[0].sourceHash, await compositionHash(after));
  assertQueryBudget(f.db, 1, 2);
  assert.equal(fetch.mock.callCount(), 0, 'precision upgrade must not call providers');
});

test('same-day monthly rollups without marker upgrade the anchor once, then read and write nothing', async t => {
  const f = fixture(t), day = '2026-10-01', rows = [flight(day, 'anchor')];
  f.insertFlights(rows);
  const before = await f.insert(day, legacy(rows, day), { monthlyRollups: oldRollups() });
  assert.equal((await f.run()).records, 2, 'profile CAS must update in-memory anchor hash before marker CAS');
  assertPreserved(before, f.payload(day));
  assert.equal(f.payload(day).monthlyRollups.shiftProfileVersion, 1);
  const saved = f.records();
  assert.deepEqual(await f.run(), { status: 'UNCHANGED', records: 0, rawRows: 0 });
  assert.deepEqual(f.records(), saved);
  assertQueryBudget(f.db, 1, 2);
});

test('missing raw, missing records, absent profiles and missing completion witness never gain precision', async t => {
  const f = fixture(t);
  const missingRaw = '2026-10-01', absentProfile = '2026-10-02', incomplete = '2026-10-03', missingRecord = '2026-10-04';
  await f.insert(missingRaw, legacy([flight(missingRaw, 'gone')], missingRaw));
  await f.insert(absentProfile, null);
  const rows = [flight(absentProfile, 'absent'), flight(incomplete, 'incomplete'), flight(missingRecord, 'missing')];
  f.insertFlights(rows);
  await f.insert(incomplete, legacy(rows, incomplete, false));
  await f.insert('2026-11-02', null);
  const before = f.records().slice(0, 3);
  assert.equal((await f.run([])).records, 1);
  assert.deepEqual(f.records().slice(0, 3), before);
  assert.equal(f.records().some(record => record.day === missingRecord), false);
  assert.equal(f.payload(absentProfile).profile, undefined);
  assertLegacy(f.payload(incomplete).profile);
  // Even a later scan cannot turn an incomplete legacy profile into a complete one.
  const anchor = f.payload('2026-11-02');
  delete anchor.monthlyRollups.shiftProfileVersion;
  f.db.raw.prepare('UPDATE airport_daily_composition SET payload=?,source_hash=? WHERE day=?')
    .run(JSON.stringify(anchor), await compositionHash(anchor), '2026-11-02');
  await f.run(scans);
  assert.deepEqual(f.records().slice(0, 3), before);
});

test('a witnessed complete empty profile upgrades to genuine zero, while incomplete and absent empty days remain unsupported', async t => {
  const f = fixture(t);
  await f.insert('2026-10-01', legacy([], '2026-10-01'));
  await f.insert('2026-10-02', legacy([], '2026-10-02', false));
  await f.insert('2026-10-03', null);
  await f.insert('2026-11-02', null);
  assert.equal((await f.run([])).records, 2);
  for (const area of AREAS) assert.deepEqual(f.payload('2026-10-01').profile[area].halfHours, Array(48).fill(0));
  assertLegacy(f.payload('2026-10-02').profile);
  assert.equal(f.payload('2026-10-03').profile, undefined);
  assert.equal(f.records().some(record => record.day === '2026-10-04'), false);
});

test('raw cap is rejected before any profile or marker write', async t => {
  const f = fixture(t), day = '2026-10-01';
  await f.insert(day, legacy([], day));
  const before = f.records(), prepare = f.db.prepare.bind(f.db);
  f.db.prepare = sql => {
    const stmt = prepare(sql);
    if (sql.includes('FROM airport_flights')) stmt.all = async () => ({ success: true, results: Array(MONTH_RAW_LIMIT + 1).fill({}) });
    return stmt;
  };
  assert.deepEqual(await f.run(), { status: 'LIMIT', records: 0, rawRows: MONTH_RAW_LIMIT + 1 });
  assert.deepEqual(f.records(), before);
  assert.equal(f.db.calls.length, 0, 'intercepted capped SELECT must not be followed by writes');
});

test('failed source SELECT preserves every row and cannot publish zero precision', async t => {
  const f = fixture(t), day = '2026-10-01';
  await f.insert(day, legacy([], day));
  const before = f.records(), prepare = f.db.prepare.bind(f.db);
  f.db.prepare = sql => {
    const stmt = prepare(sql);
    if (sql.includes('FROM airport_flights')) stmt.all = async () => ({ success: false, results: [] });
    return stmt;
  };
  await assert.rejects(f.run(), /AIRPORT_MONTH_SOURCE_READ_FAILED/);
  assert.deepEqual(f.records(), before);
  assert.equal(f.db.calls.length, 0);
});

for (const target of ['non-anchor', 'anchor']) {
  test(`${target} profile CAS conflict leaves concurrent data intact and marker absent`, async t => {
    const f = fixture(t), day = '2026-10-01', rows = [flight(day, 'conflict')];
    f.insertFlights(rows);
    await f.insert(day, legacy(rows, day));
    if (target === 'non-anchor') await f.insert('2026-11-02', null);
    const snapshot = f.records();
    const concurrent = { ...f.payload(day), concurrentExtension: 'newer writer' };
    f.db.raw.prepare('UPDATE airport_daily_composition SET payload=?,source_hash=? WHERE day=?')
      .run(JSON.stringify(concurrent), await compositionHash(concurrent), day);
    assert.deepEqual(await f.run(scans, snapshot), { status: 'CONFLICT', records: 0, rawRows: 1 });
    assert.deepEqual(f.payload(day), concurrent);
    for (const record of f.records()) assert.equal(JSON.parse(record.payload).monthlyRollups, undefined);
    assertQueryBudget(f.db, 1, 1);
    assert.equal((await f.run()).status, 'PREPARED', 'fresh snapshot can safely retry');
    assert.equal(f.payload(day).concurrentExtension, 'newer writer');
  });
}

test('final anchor CAS conflict reports completed profile writes and safe retry finishes marker', async t => {
  const f = fixture(t), day = '2026-10-01', rows = [flight(day, 'profile')];
  f.insertFlights(rows);
  await f.insert(day, legacy(rows, day));
  await f.insert('2026-11-02', null);
  const stale = f.records();
  f.db.raw.prepare('UPDATE airport_daily_composition SET source_hash=? WHERE day=?').run('concurrent-anchor-hash', '2026-11-02');
  assert.deepEqual(await f.run(scans, stale), { status: 'CONFLICT', records: 1, rawRows: 1 });
  assert.equal(f.payload(day).profile.T2.halfHours[21], 1);
  assert.equal(f.payload('2026-11-02').monthlyRollups, undefined);
  assert.equal((await f.run()).records, 1, 'retry must not rewrite an already precise profile');
  assert.equal(f.payload('2026-11-02').monthlyRollups.shiftProfileVersion, 1);
});

for (const failure of ['second-profile', 'final-marker']) {
  test(`${failure} failure after one successful update reports count and retries without recertifying unfinished work`, async t => {
    const f = fixture(t), a = '2026-10-01', b = '2026-10-02';
    const rows = [flight(a, 'a'), ...(failure === 'second-profile' ? [flight(b, 'b')] : [])];
    f.insertFlights(rows);
    await f.insert(a, legacy(rows, a));
    if (failure === 'second-profile') await f.insert(b, legacy(rows, b));
    await f.insert('2026-11-02', null);
    const prepare = f.db.prepare.bind(f.db);
    let attempts = 0;
    f.db.prepare = sql => {
      const stmt = prepare(sql);
      if (sql.startsWith('UPDATE airport_daily_composition') && ++attempts === 2)
        stmt.run = async () => ({ success: false, meta: { changes: 0 } });
      return stmt;
    };
    await assert.rejects(f.run(), failure === 'second-profile' ? /AIRPORT_SHIFT_PROFILE_WRITE_FAILED_AFTER_1/ : /AIRPORT_MONTH_WRITE_FAILED_AFTER_1/);
    assert.equal(f.payload(a).profile.T2.halfHours[21], 1);
    if (failure === 'second-profile') assertLegacy(f.payload(b).profile);
    assert.equal(f.payload('2026-11-02').monthlyRollups, undefined);
    const completed = f.records()[0];
    f.db.prepare = prepare;
    const retry = await f.run();
    assert.equal(retry.status, 'PREPARED');
    assert.equal(retry.records, failure === 'second-profile' ? 2 : 1);
    assert.deepEqual(f.records()[0], completed, 'already successful profile must not be rewritten on retry');
    assert.equal(f.payload('2026-11-02').monthlyRollups.shiftProfileVersion, 1);
  });
}

for (const failure of ['second-profile', 'final-marker']) {
  for (const committed of [false, true]) {
    test(`${failure} rejection ${committed ? 'after' : 'before'} commit reports only confirmed writes and retries from stored state`, async t => {
      const f = fixture(t), a = '2026-10-01', b = '2026-10-02';
      const rows = [flight(a, 'a'), ...(failure === 'second-profile' ? [flight(b, 'b')] : [])];
      f.insertFlights(rows);
      await f.insert(a, legacy(rows, a));
      if (failure === 'second-profile') await f.insert(b, legacy(rows, b));
      await f.insert('2026-11-02', null);
      const prepare = f.db.prepare.bind(f.db);
      const unsafeResponse = 'untrusted response containing private credential details';
      let attempts = 0;
      f.db.prepare = sql => {
        const stmt = prepare(sql);
        if (sql.startsWith('UPDATE airport_daily_composition') && ++attempts === 2) {
          const run = stmt.run.bind(stmt);
          stmt.run = async () => {
            if (committed) await run();
            throw new Error(unsafeResponse, { cause: new Error(unsafeResponse) });
          };
        }
        return stmt;
      };
      await assert.rejects(f.run(), error => {
        const scope = failure === 'second-profile' ? 'SHIFT_PROFILE' : 'MONTH';
        assert.equal(error.message, `AIRPORT_${scope}_WRITE_FAILED_AFTER_1_OUTCOME_UNKNOWN`);
        assert.equal(error.cause, undefined, 'untrusted adapter causes must not be retained');
        assert.equal(String(error.stack).includes(unsafeResponse), false);
        return true;
      });
      assert.equal(attempts, 2, 'an uncertain write must stop this preparation attempt');
      assert.equal(f.payload(a).profile.T2.halfHours[21], 1);
      if (failure === 'second-profile') {
        if (committed) assert.equal(f.payload(b).profile.T2.halfHours[21], 1);
        else assertLegacy(f.payload(b).profile);
      }
      assert.equal(f.payload('2026-11-02').monthlyRollups?.shiftProfileVersion,
        failure === 'final-marker' && committed ? 1 : undefined);
      const completed = f.records()[0];
      f.db.prepare = prepare;
      const retry = await f.run();
      assert.equal(retry.status, failure === 'final-marker' && committed ? 'UNCHANGED' : 'PREPARED');
      assert.equal(retry.records, (failure === 'second-profile' ? 2 : 1) - Number(committed));
      assert.deepEqual(f.records()[0], completed, 'retry must not rewrite already confirmed precision');
      assert.equal(f.payload('2026-11-02').monthlyRollups.shiftProfileVersion, 1);
    });
  }
}

for (const correction of ['destination', 'side', 'unknown-building', 'cancelled']) {
  test(`${correction} correction with unchanged terminal/hour counts withholds legacy precision`, async t => {
    const f = fixture(t), day = '2026-10-01';
    const original = [flight(day, 'retained')];
    const rows = correction === 'destination' ? [flight(day, 'retained', '10:30', { airportCode: 'LAX' })]
      : correction === 'side' ? [flight(day, 'retained', '10:30', { gate: '231' })]
        : [...original, flight(day, 'additional', '10:30', correction === 'cancelled'
          ? { operatingFlight: 'KE705', status: 'cancelled' } : { operatingFlight: 'KE705', terminal: 'UNKNOWN', gate: null })];
    const profile = legacy(original, day), reconstructed = dailyFlightProfile(rows, day, true);
    for (const area of AREAS) {
      assert.equal(profile[area].total, reconstructed[area].total);
      assert.deepEqual(profile[area].hours, reconstructed[area].hours);
    }
    assert.notDeepEqual(profile, legacy(rows, day), 'fixture must change a non-hour profile field');
    f.insertFlights(rows);
    await f.insert(day, profile);
    await f.insert('2026-11-02', null);
    const before = f.records()[0];
    assert.equal((await f.run()).records, 1);
    assert.deepEqual(f.records()[0], before, 'full-profile disagreement must preserve the legacy row byte-for-byte');
    assertLegacy(f.payload(day).profile);
    assertQueryBudget(f.db, 1, 1);
  });
}

test('a hash-damaged anchor gains no precision even when its reconstructed profile matches', async t => {
  const f = fixture(t), day = '2026-10-01', rows = [flight(day, 'anchor')];
  f.insertFlights(rows);
  const before = await f.insert(day, legacy(rows, day));
  f.db.raw.prepare('UPDATE airport_daily_composition SET source_hash=? WHERE day=?').run('damaged', day);
  assert.equal((await f.run()).records, 1, 'only the existing monthly marker write is allowed');
  const after = f.payload(day);
  assertLegacy(after.profile);
  assert.deepEqual(after.profile, before.profile);
  assertPreserved(before, after);
  assert.equal(after.monthlyRollups.shiftProfileVersion, 1, 'retain existing monthly-anchor behavior');
  assertQueryBudget(f.db, 1, 1);
});

test('contradictory counts, wrong day/version/classification and damaged source hashes stay byte-for-byte untouched', async t => {
  const f = fixture(t);
  const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'];
  const rows = days.map((day, i) => flight(day, `bad-${i}`));
  f.insertFlights(rows);
  for (const [i, day] of days.entries()) {
    const profile = legacy(rows, day);
    if (i === 0) { profile.T2.total = 2; profile.T2.hours[10] = 2; }
    if (i === 1) profile.day = '2026-09-30';
    if (i === 2) profile.v = 999;
    if (i === 3) profile.sidesVersion = 'old-classification';
    await f.insert(day, profile);
    if (i === 4) f.db.raw.prepare('UPDATE airport_daily_composition SET source_hash=? WHERE day=?').run('damaged', day);
  }
  await f.insert('2026-11-02', null);
  const before = f.records().slice(0, 5);
  assert.equal((await f.run()).records, 1);
  assert.deepEqual(f.records().slice(0, 5), before);
  assert.equal(f.payload('2026-10-01').profile.T2.total, 2, 'raw count must not be mixed into stale hourly history');
  assertQueryBudget(f.db, 1, 1);
});
