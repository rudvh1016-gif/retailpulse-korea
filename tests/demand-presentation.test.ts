import { test } from 'node:test';
import assert from 'node:assert/strict';
import { populationFlow, flowSegments, populationTicks, usableComparison } from '../lib/demand-presentation';
import { rangeChange } from '../lib/period-comparison';

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

test('mobile ticks use actual time, keep midnight and have enough rendered space', () => {
  const start = Date.parse('2026-09-12T17:10:00+09:00');
  const end = Date.parse('2026-09-13T09:00:00+09:00');
  const midnight = Date.parse('2026-09-13T00:00:00+09:00');
  for (const width of [266, 296, 540]) {
    const ticks = populationTicks(start, end, width);
    assert.ok(ticks.includes(midnight));
    assert.ok(ticks.length >= 3 && ticks.length <= (width < 300 ? 4 : 6));
    assert.deepEqual(ticks, populationTicks(start, end, width));
    ticks.forEach((time, i) => {
      assert.ok(time >= start && time <= end);
      if (i) assert.ok((time - ticks[i - 1]) / (end - start) * width >= 72);
    });
  }
  assert.deepEqual(populationTicks(start, start, 266), [start]);
  assert.deepEqual(populationTicks(NaN, end, 266), []);
});

test('a date boundary near the chart edge replaces a colliding label', () => {
  const start = Date.parse('2026-09-12T23:40:00+09:00'), end = Date.parse('2026-09-13T01:00:00+09:00');
  const ticks = populationTicks(start, end, 266);
  assert.ok(ticks.includes(Date.parse('2026-09-13T00:00:00+09:00')));
  assert.ok(!ticks.includes(start));
});
