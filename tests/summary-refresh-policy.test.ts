import assert from 'node:assert/strict';
import test from 'node:test';
import {isValidSummaryRefreshPayload, summaryFailureDelay, summaryRefreshDelay} from '../lib/summary-refresh-policy';

const NOW = Date.parse('2026-11-04T11:01:00+09:00');
const iso = (age: number) => new Date(NOW - age).toISOString();
const summary = () => ({mode: 'live-summary', generatedAt: iso(0), todayKst: '2026-11-04', serviceDateKst: '2026-11-04',
  dayRelation: 'TODAY', areas: {}, sources: [], airport: {congestion: []}});
const checkpoint = (age: number, extra: Record<string, unknown> = {}) => ({terminal: 'T2', zone: 'DG1_A', observedAt: iso(age),
  freshness: 'LIVE', collectionStatus: 'LIVE', waitTimeMinutes: 0, ...extra});
const withRows = (...rows: Record<string, unknown>[]) => ({...summary(), airport: {congestion: rows}});

test('minimum summary and absent optional arrays remain valid without mutation', () => {
  const value = summary();
  const original = structuredClone(value);
  assert.equal(isValidSummaryRefreshPayload(value, null), true);
  assert.equal(isValidSummaryRefreshPayload({...value, sources: undefined, airport: {}}, null), true);
  assert.deepEqual(value, original);
});

test('malformed HTTP successes cannot poison recheck evaluation', () => {
  for (const patch of [
    {areas: []}, {areas: null}, {areas: 'areas'}, {areas: {a: []}}, {areas: {a: {weather: {}}}},
    {airport: []}, {airport: null}, {airport: {congestion: {}}}, {airport: {congestion: [null]}},
    {airport: {scheduled: 'rows'}}, {airport: {arrivalForecast: []}},
    {airport: {arrivalForecast: {passengerForecastTimeline: {}}}}, {airport: {forecastCoverage: []}},
    {sources: {}}, {sources: [null]}, {sources: [{}]}, {sources: [{sourceId: 'A4', status: 1}]},
    {generatedAt: ''}, {generatedAt: 'not-a-date'}, {generatedAt: '1'}, {generatedAt: Infinity},
    {generatedAt: '2026-11-04T11:01:00'}, {generatedAt: '2026-02-30T11:01:00+09:00'}, {mode: 'error'},
  ]) assert.equal(isValidSummaryRefreshPayload({...summary(), ...patch}, null), false, JSON.stringify(patch));
});

test('dates use the server today for undated reads and exact requested selection', () => {
  assert.equal(isValidSummaryRefreshPayload({...summary(), serviceDateKst: '2026-11-03'}, null), false);
  assert.equal(isValidSummaryRefreshPayload({...summary(), serviceDateKst: '2026-11-03'}, '2026-11-03'), true);
  assert.equal(isValidSummaryRefreshPayload(summary(), '2026-11-03'), false);
  assert.equal(isValidSummaryRefreshPayload({...summary(), todayKst: '2026-02-30'}, null), false);
  assert.equal(isValidSummaryRefreshPayload({...summary(), serviceDateKst: '2026-02-30'}, '2026-02-30'), false);
  const midnight = {...summary(), generatedAt: '2026-11-03T15:00:00Z'};
  assert.equal(isValidSummaryRefreshPayload(midnight, null), true);
});

test('healthy polling is capped by snapshot age rather than renewed by a cache hit', () => {
  assert.equal(summaryRefreshDelay(summary(), NOW, 300_000), 300_000);
  assert.equal(summaryRefreshDelay({...summary(), generatedAt: iso(120_000)}, NOW, 300_000), 180_000);
  for (const age of [240_000, 300_000, 480_000]) {
    assert.equal(summaryRefreshDelay({...summary(), generatedAt: iso(age)}, NOW, 300_000), 60_000);
  }
  assert.equal(summaryRefreshDelay({...summary(), generatedAt: iso(-1)}, NOW, 300_000), 60_000);
  assert.equal(summaryRefreshDelay({...summary(), generatedAt: 'bad'}, NOW, 300_000), 60_000);
});

test('fresh checkpoint deadlines approach twenty minutes with a one-minute floor', () => {
  assert.equal(summaryRefreshDelay(withRows(checkpoint(10 * 60_000)), NOW, 300_000), 300_000);
  assert.equal(summaryRefreshDelay(withRows(checkpoint(18 * 60_000)), NOW, 300_000), 120_000);
  assert.equal(summaryRefreshDelay(withRows(checkpoint(19.5 * 60_000)), NOW, 300_000), 60_000);
  assert.equal(summaryRefreshDelay(withRows(checkpoint(20 * 60_000)), NOW, 300_000), 120_000);
  assert.equal(summaryRefreshDelay(withRows(checkpoint(24 * 60_000)), NOW, 300_000), 120_000);
  assert.equal(summaryRefreshDelay(withRows(checkpoint(5 * 60_000), checkpoint(19 * 60_000)), NOW, 300_000), 60_000);
});

test('failed, stale, future and malformed checkpoint clocks retry without changing source truth', () => {
  for (const row of [checkpoint(0, {freshness: 'STALE'}), checkpoint(0, {collectionStatus: 'FAILED'}),
    checkpoint(0, {collectionStatus: 'UNKNOWN'}), checkpoint(-60_000), checkpoint(0, {observedAt: 'bad'})]) {
    const value = withRows(row), original = structuredClone(value);
    assert.equal(summaryRefreshDelay(value, NOW, 300_000), 120_000);
    assert.deepEqual(value, original);
  }
  const oldHealthy = {...withRows(checkpoint(24 * 60_000)), generatedAt: iso(8 * 60_000)};
  assert.equal(summaryRefreshDelay(oldHealthy, NOW, 300_000), 60_000);
});

test('past and future selected dates never chase current checkpoint observations', () => {
  for (const dayRelation of ['PAST', 'FUTURE']) {
    assert.equal(summaryRefreshDelay({...withRows(checkpoint(24 * 60_000)), dayRelation}, NOW, 300_000), 300_000);
  }
});

test('delay and failure backoff are finite and bounded', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 99].map(summaryFailureDelay), [60_000, 120_000, 240_000, 300_000, 300_000, 300_000]);
  assert.equal(summaryFailureDelay(0), 60_000);
  assert.equal(summaryFailureDelay(1), 60_000, 'a caller resetting after success starts at the first step');
  for (const count of [NaN, Infinity, -Infinity]) assert.equal(summaryFailureDelay(count), 300_000);
  assert.equal(summaryRefreshDelay(summary(), NaN, 300_000), 60_000);
  for (const delay of [NaN, -1, 0]) assert.equal(summaryRefreshDelay(summary(), NOW, delay), 60_000);
  assert.equal(summaryRefreshDelay(summary(), NOW, 999_999), 300_000);
});
