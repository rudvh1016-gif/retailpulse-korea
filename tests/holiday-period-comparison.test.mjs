import test from 'node:test';
import assert from 'node:assert/strict';
import { compareHolidayPeriod, describeHolidayPeriod } from '../lib/holiday-period-comparison.mjs';
// Synthetic daily observations only. No actual passenger data or holiday claims.
const holiday = { start: '2026-10-01', end: '2026-10-07' };
const query = changes => ({ country: 'CN', metric: 'route_departure_passengers', scope: 'ICN-all-terminals', month: '2026-10', start: '2026-10-01', end: '2026-10-10', asOf: '2026-10-20', holiday, ...changes });
const row = (date, value, changes) => ({ country: 'CN', date, value, complete: true, metric: 'route_departure_passengers', scope: 'ICN-all-terminals', ...changes });
const run = (rows, changes) => compareHolidayPeriod(rows, query(changes));
test('no daily data means unavailable; monthly/calendar information cannot invent a comparison', () => {
  const result = run([]);
  assert.equal(result.status, 'unavailable'); assert.equal(result.reason, 'no_complete_daily_data');
  assert.equal(result.holiday.mean, null); assert.equal(result.nonHoliday.mean, null);
  assert.equal(result.holiday.expectedDays, 7); assert.equal(result.nonHoliday.expectedDays, 3);
  assert.equal(result.holiday.coverage, 0); assert.equal(result.ratio, null);
});
test('only complete finite observations enter means; zero is data and null is missing', () => {
  const result = run([row('2026-10-01', 0), row('2026-10-02', 20), row('2026-10-03', 999, { complete: false }), row('2026-10-04', null), row('2026-10-05', NaN), row('2026-10-08', 5), row('2026-10-09', 15)]);
  assert.equal(result.status, 'available'); assert.equal(result.holiday.mean, 10); assert.equal(result.nonHoliday.mean, 10);
  assert.equal(result.holiday.sampleDays, 2); assert.equal(result.holiday.coverage, 2 / 7);
  assert.equal(result.nonHoliday.coverage, 2 / 3); assert.equal(result.ratio, 1); assert.equal(result.percentDifference, 0);
  assert.deepEqual(result.holiday.missingDates, ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']);
});
test('future observations and dates outside selected same-month window are excluded', () => {
  const result = run([row('2026-10-07', 20), row('2026-10-08', 10), row('2026-10-09', 5000), row('2026-09-30', 5000), row('2026-11-01', 5000)], { start: '2026-10-07', asOf: '2026-10-08' });
  assert.equal(result.holiday.mean, 20); assert.equal(result.nonHoliday.mean, 10);
  assert.equal(result.nonHoliday.expectedDays, 1); assert.equal(result.window.effectiveEnd, '2026-10-08');
  assert.equal(result.ratio, 2); assert.equal(result.percentDifference, 100);
  assert.equal(run([], { asOf: '2026-09-30' }).reason, 'no_elapsed_days');
});
test('mixed metrics and scope are refused, other countries do not contaminate selection', () => {
  for (const change of [{ metric: 'nationality_arrivals' }, { scope: 'GMP-all-terminals' }]) {
    const result = run([row('2026-10-01', 10), row('2026-10-08', 20, change)]);
    assert.equal(result.status, 'unavailable'); assert.equal(result.reason, 'mixed_metric_or_scope'); assert.equal(result.ratio, null);
  }
  assert.equal(run([row('2026-10-01', 10), row('2026-10-08', 20), row('2026-10-08', 999, { country: 'JP', metric: 'other' })]).ratio, .5);
});
test('zero denominator yields null ratio, not infinity; zero numerator remains a measured zero', () => {
  const zero = run([row('2026-10-01', 5), row('2026-10-08', 0)]);
  assert.equal(zero.status, 'available'); assert.equal(zero.nonHoliday.mean, 0); assert.equal(zero.ratio, null); assert.equal(zero.percentDifference, null);
  assert.equal(run([row('2026-10-01', 0), row('2026-10-08', 5)]).ratio, 0);
  assert.equal(run([row('2026-10-01', null), row('2026-10-08', 5)]).reason, 'insufficient_comparison_days');
});
test('duplicate observations are refused and invalid dates never normalize into a sample', () => {
  assert.equal(run([row('2026-10-01', 10), row('2026-10-01', 15)]).reason, 'duplicate_date');
  assert.equal(run([row('2026-10-32', 10), row('2026-10-1', 15)]).reason, 'no_complete_daily_data');
  assert.throws(() => run([], { start: '2026-09-30' }), RangeError);
  assert.throws(() => run([], { month: '2026-1' }), RangeError);
  assert.throws(() => run([], { asOf: '2026-02-30' }), RangeError);
  assert.throws(() => run([], { end: '2026-10-00' }), RangeError);
});
test('leap-year selected windows and inclusive holiday boundaries are exact', () => {
  const result = run([row('2024-02-28', 10), row('2024-02-29', 20)], { month: '2024-02', start: '2024-02-28', end: '2024-02-29', asOf: '2024-03-01', holiday: { start: '2024-02-29', end: '2024-02-29' } });
  assert.equal(result.ratio, 2); assert.equal(result.holiday.expectedDays, 1); assert.equal(result.nonHoliday.expectedDays, 1);
});
test('calendar tense uses only explicit reference date, never inferred return peaks', () => {
  assert.equal(describeHolidayPeriod(holiday, '2026-09-30').phase, 'upcoming');
  for (const date of ['2026-10-01', '2026-10-07']) assert.equal(describeHolidayPeriod(holiday, date).phase, 'ongoing');
  const ended = describeHolidayPeriod(holiday, '2026-10-08');
  assert.equal(ended.phase, 'ended'); assert.match(ended.text, /2026-10-07에 종료되었습니다/);
  for (const date of ['2026-09-30', '2026-10-03', '2026-10-20']) assert.doesNotMatch(describeHolidayPeriod(holiday, date).text, /귀국|피크|예상/);
});
test('no mutation and deterministic outputs', () => {
  const rows = [row('2026-10-01', 10), row('2026-10-08', 20)];
  const before = JSON.stringify(rows);
  assert.deepEqual(run(rows), run([...rows].reverse())); assert.equal(JSON.stringify(rows), before);
});

test('other supplied holidays are excluded from both comparison values and expected coverage', () => {
  const result = run([row('2026-10-01', 10), row('2026-10-08', 20), row('2026-10-09', 1000)], { excludedHolidayIntervals: [{ start: '2026-10-09', end: '2026-10-09' }] });
  assert.equal(result.nonHoliday.mean, 20); assert.equal(result.nonHoliday.expectedDays, 2);
  assert.deepEqual(result.excludedDates, ['2026-10-09']);
  assert.match(result.comparisonLabel, /해당 휴일 외 완료일/);
});
