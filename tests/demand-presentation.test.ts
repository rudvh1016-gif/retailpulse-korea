import { test } from 'node:test';
import assert from 'node:assert/strict';
import { populationFlow, flowSegments, usableComparison } from '../lib/demand-presentation.ts';
import { rangeChange } from '../lib/period-comparison.ts';

const now = Date.parse('2026-09-12T23:20:00+09:00');
const observedAt = '2026-09-12T23:10:00+09:00';
const range = { populationMin: 90000, populationMax: 98000 };
test('no fabricated history, midpoint, missing zeros or cross-day observation', () => {
  const points = populationFlow({ realtime: { ...range, observedAt }, serviceDate: '2026-09-12', isToday: true, now,
    realtimeForecast: ['2026-09-13T00:00:00+09:00', '2026-09-13T02:00:00+09:00'].map(targetAt => ({ ...range, targetAt })) });
  assert.equal(points.length, 3);
  assert.equal(flowSegments(points).length, 3);
  assert.deepEqual(points.map(p => [p.populationMin, p.populationMax]), [[90000,98000],[90000,98000],[90000,98000]]);
  assert.equal(populationFlow({ realtime: { ...range, observedAt }, serviceDate: '2026-09-13', isToday: false, now }).length, 0);
});
test('forecast-only and fully missing remain distinguishable, invalid ranges are excluded', () => {
  const input = { serviceDate: '2026-09-13', isToday: false, now };
  assert.deepEqual(populationFlow(input), []);
  const points = populationFlow({ ...input, realtimeForecast: [
    { ...range, targetAt: '2026-09-13T01:00:00+09:00' },
    { populationMin: 100, populationMax: 50, targetAt: '2026-09-13T02:00:00+09:00' },
    { ...range, targetAt: '2026-09-12T23:00:00+09:00' },
  ] });
  assert.equal(points.length, 1);
  assert.equal(points[0].kind, 'forecast');
});
test('exact same weekday/time comparison retains a range crossing zero', () => {
  const change = rangeChange(90000, 98000, 92000, 97000, '2026-09-05T23:10:00+09:00')!;
  const row = { ...range, observedAt, comparisons: { 7: change } };
  assert.equal(usableComparison(row, 7), change);
  assert.ok(change.minPercent < 0 && change.maxPercent > 0);
  assert.equal(usableComparison({ ...row, observedAt: '2026-09-12T23:15:00+09:00' }, 7), null);
  assert.equal(usableComparison(row, 28), null);
});
