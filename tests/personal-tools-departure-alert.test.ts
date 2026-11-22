import assert from 'node:assert/strict';
import test from 'node:test';
import { activeDepartureShift, departureAlert } from '../lib/personal-tools/departure-alert';
import { applyPersonalCommand, emptyPersonalState, parsePersonalState, type PersonalState } from '../lib/personal-tools/model';

const observedAt = '2026-11-23T00:02:00+09:00';
const retrievedAt = '2026-11-23T00:04:00+09:00';
const now = Date.parse('2026-11-23T00:10:00+09:00');
const row = { terminal: 'T1', zone: 'DG2_E', observedAt, retrievedAt, waitTimeMinutes: 30,
  waitTimeRaw: '30', freshness: 'LIVE', collectionStatus: 'LIVE' as const };
const shift: PersonalState = {
  ...emptyPersonalState(),
  patterns: [{ id: 'test', label: '야간', terminal: 'T1', side: 'EAST', open: '23:00', close: '02:00' }],
  assignments: [{ date: '2026-11-22', patternId: 'test' }],
  notificationPreferences: { beforeShiftMinutes: 0, briefingChanges: false, guideChanges: false, departureWaitMinutes: 30 },
};
const summary = { mode: 'live-summary', dayRelation: 'TODAY', airport: { congestion: [row] } };

test('uses an overnight KST shift and only its proven terminal/side observations', () => {
  assert.equal(activeDepartureShift(shift, now)?.date, '2026-11-22');
  assert.equal(activeDepartureShift(shift, Date.parse('2026-11-23T02:00:00+09:00')), null);
  assert.equal(departureAlert(summary, shift, now)?.minutes, 30);
  assert.equal(departureAlert({ ...summary, airport: { congestion: [{ ...row, zone: 'DG2_W' }] } }, shift, now), null);
  assert.equal(departureAlert({ ...summary, airport: { congestion: [{ ...row, terminal: 'T2', zone: 'DG2_A' }] } }, shift, now), null);
});

test('does not notify on missing, stale, conflicting or uncertain evidence', () => {
  const withRows = (...rows: (typeof summary.airport.congestion)[number][]) => ({ ...summary, airport: { congestion: rows } });
  assert.equal(departureAlert({ ...summary, mode: 'degraded' }, shift, now), null);
  assert.equal(departureAlert({ ...summary, dayRelation: 'PAST' }, shift, now), null);
  assert.equal(departureAlert(summary, shift, now + 21 * 60_000), null);
  assert.equal(departureAlert(withRows({ ...row, retrievedAt: '2099-01-01T00:00:00Z' }), shift, now), null);
  assert.equal(departureAlert(withRows({ ...row, waitTimeRaw: '30+' }), shift, now), null);
  assert.equal(departureAlert(withRows(row, { ...row, waitTimeRaw: '50', waitTimeMinutes: 50 }), shift, now), null);
  assert.equal(departureAlert(withRows({ ...row, waitTimeRaw: '60+', waitTimeMinutes: 60 }), shift, now)?.lowerBound, true);
  assert.equal(departureAlert(summary, { ...shift, notificationPreferences: emptyPersonalState().notificationPreferences }, now), null);
});

test('saved settings accept the new optional threshold and keep old exports valid', () => {
  assert.equal(parsePersonalState(shift).notificationPreferences.departureWaitMinutes, 30);
  assert.equal(parsePersonalState(emptyPersonalState()).notificationPreferences.departureWaitMinutes, undefined);
  assert.throws(() => parsePersonalState({ ...shift, notificationPreferences: { ...shift.notificationPreferences, departureWaitMinutes: 27 } }));
});

test('saved customer guidance keeps only validated private fields and supports removal', () => {
  const clock = { now: observedAt, revision: 'saved-guide' };
  const snippet = { id: 'guide-a', label: '출국장 안내', body: '안내 문구\n두 번째 줄' };
  const saved = applyPersonalCommand(shift, { type: 'snippet.upsert', snippet }, clock);
  assert.deepEqual(saved.guideSnippets, [snippet]);
  const removed = applyPersonalCommand(saved, { type: 'snippet.remove', id: snippet.id }, { ...clock, revision: 'removed-guide' });
  assert.deepEqual(removed.guideSnippets, []);
  assert.equal(parsePersonalState(shift).guideSnippets, undefined);
});
