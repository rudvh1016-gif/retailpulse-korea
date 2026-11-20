import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { selectA4WriteTarget, selectA4Generation } from '../lib/a4-overflow-routing.ts';

const cutoff = '2026-11-19T08:00:00.000Z';
const source = { T1: 'INCHEON_DEPARTURE_CONGESTION', T2: 'INCHEON_DEPARTURE_CONGESTION_T2' };
const row = (terminal, zone, observedAt = cutoff) => ({ terminal, zone, observedAt, sourceId: source[terminal] });

test('single write destination defaults to primary; invalid enabled inputs cannot write anywhere', () => {
  const rows = [row('T1', '1')];
  assert.equal(selectA4WriteTarget({ mode: undefined }, 'T1', rows), 'primary');
  assert.equal(selectA4WriteTarget({ mode: 'disabled' }, 'T1', rows), 'primary');
  assert.throws(() => selectA4WriteTarget({ mode: 'enabled', cutoverAt: cutoff }, 'T1', rows), /not_ready/);
  assert.throws(() => selectA4WriteTarget({ mode: 'typo' }, 'T1', rows), /invalid_mode/);
  const opts = { mode: 'enabled', schemaReady: true, cutoverAt: cutoff };
  assert.equal(selectA4WriteTarget(opts, 'T1', rows), 'overflow');
  assert.throws(() => selectA4WriteTarget(opts, 'T1', [row('T2', '1')]), /wrong_source/);
  assert.throws(() => selectA4WriteTarget(opts, 'T1', [row('T1', '1', '2026-11-19T16:59:00+09:00')]), /before_cutover/);
  assert.throws(() => selectA4WriteTarget(opts, 'T1', [row('T1', '1', '2026-11-19T17:00:00')]), /invalid_timestamp/);
});

test('read chooses independent whole generations; failed overflow is observable even when primary has data', () => {
  const a = [row('T1','a'), row('T1','b')];
  const b = [row('T1','new','2026-11-19T17:05:00+09:00')];
  assert.deepEqual(selectA4Generation('T1', a, { state: 'ok', rows: b }), { source:'overflow', rows:b, degraded:false });
  assert.deepEqual(selectA4Generation('T1', a, { state: 'ok', rows: [row('T1','tie','2026-11-19T17:00:00+09:00')] }), { source:'primary', rows:a, degraded:false });
  assert.deepEqual(selectA4Generation('T1', a, { state: 'error' }), { source:'primary', rows:a, degraded:true });
  assert.deepEqual(selectA4Generation('T2', [], { state: 'ok', rows: [] }), { source:'none', rows:[], degraded:false });
  assert.deepEqual(selectA4Generation('T1', a, { state: 'ok', rows: [...a, ...b] }), { source:'primary', rows:a, degraded:true });
  assert.deepEqual(selectA4Generation('T1', a, { state: 'ok', rows: [row('T2','new','2026-11-19T17:05:00+09:00')] }), { source:'primary', rows:a, degraded:true });
});

test('the production migration leaves both terminals off until individually enabled', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync('drizzle/0036_airport_congestion_cutover.sql','utf8'));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM a4_cutover").get().n,0);
    const enable=db.prepare("INSERT INTO a4_cutover VALUES(?,?)");
    assert.throws(()=>enable.run('T3',cutoff),/CHECK constraint/);
    enable.run('T1',cutoff);
    enable.run('T2',null);
    assert.throws(()=>enable.run('T1',cutoff),/UNIQUE constraint/);
    assert.equal(db.prepare("SELECT terminal FROM a4_cutover WHERE cutover_at IS NOT NULL").get().terminal,'T1');
  } finally {db.close();}
});
