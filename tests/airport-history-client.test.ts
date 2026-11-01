import test from 'node:test';
import assert from 'node:assert/strict';
import { airportHistoryPayload, loadAirportHistory } from '../app/airport-history-client';

test('history response identity is exact and malformed profiles never reach consumers', () => {
  const empty = { mode: 'airport-days', date: '2026-11-01', history: [] };
  assert.ok(airportHistoryPayload(empty, '2026-11-01'));
  assert.equal(airportHistoryPayload(empty, '2026-11-02'), null);
  assert.equal(airportHistoryPayload({ ...empty, mode: 'degraded' }, '2026-11-01'), null);
  const malformed = airportHistoryPayload({ ...empty, history: [{ T1: {}, T2: {} }] }, '2026-11-01');
  assert.deepEqual(malformed?.history, []);
  assert.equal(malformed?.discardedRows, 1);
});

test('a malformed row does not discard valid incomplete or older-version history', () => {
  const part = { day: '2026-10-31', complete: false, sidesVersion: 'airport-sides.v0', total: 0,
    hours: Array(24).fill(0), sides: [0, 0, 0, 0], groups: {} };
  const valid = { T1: part, T2: part };
  const body = airportHistoryPayload({ mode: 'airport-days', date: '2026-11-01', history: [valid, { T1: {}, T2: {} }] }, '2026-11-01');
  assert.deepEqual(body?.history, [valid]);
  assert.equal(body?.discardedRows, 1);
});

test('home and radar share one in-flight read and its matching-date cache', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ mode: 'airport-days', date: '2026-11-03', history: [] }); };
  try {
    const [first, second] = await Promise.all([loadAirportHistory('2026-11-03'), loadAirportHistory('2026-11-03')]);
    assert.equal(first.status, 'OK'); assert.equal(second.status, 'OK'); assert.equal(calls, 1);
    assert.equal((await loadAirportHistory('2026-11-03')).status, 'OK'); assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('wrong-date responses fail and are not cached as a successful empty history', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ mode: 'airport-days', date: calls === 1 ? '2026-11-03' : '2026-11-04', history: [] }); };
  try {
    assert.equal((await loadAirportHistory('2026-11-04')).status, 'FAILED');
    assert.equal((await loadAirportHistory('2026-11-04')).status, 'OK');
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});
