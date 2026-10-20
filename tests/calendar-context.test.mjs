import test from 'node:test';
import assert from 'node:assert/strict';
import { isExactDate, isExactMonth, previousMonth, matchCalendarContext } from '../lib/calendar-context.mjs';
// SYNTHETIC TEST FIXTURES ONLY. Dates are not researched calendar facts.
const fixture = changes => ({ id: 'synthetic-cn', country: 'CN', scope: 'national', name: '테스트 일정', kind: 'public_holiday', start: '2026-09-25', end: '2026-09-27', status: 'verified', sourceURL: 'https://example.invalid/official-fixture', verifiedAt: '2026-10-20', ...changes });
const query = changes => ({ country: 'CN', selectedMonth: '2026-09', actualDataMonths: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'], asOf: '2026-10-20', ...changes });
const run = (events, changes) => matchCalendarContext(events, query(changes));
test('exact month and civil-date validation rejects normalization, timezone suffixes and impossible dates', () => {
  for (const month of ['2026-1', '2026-00', '2026-13', '2026-01-01', '0000-01']) assert.equal(isExactMonth(month), false);
  for (const date of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-1-01', '2026-09-01T00:00:00Z', '0000-01-01']) assert.equal(isExactDate(date), false);
  for (const date of ['2000-02-29', '2024-02-29', '2026-09-30']) assert.equal(isExactDate(date), true);
  assert.throws(() => run([], { selectedMonth: '2026-9' }), RangeError);
  assert.throws(() => run([], { asOf: '2026-02-30' }), RangeError);
  assert.throws(() => run([], { actualDataMonths: ['2026-99'] }), RangeError);
});
test('adjacent months handle year rollover without local-time conversion', () => {
  assert.equal(previousMonth('2026-01'), '2025-12');
  assert.equal(previousMonth('2026-10'), '2026-09');
  assert.equal(previousMonth('0001-01'), null);
  assert.equal(previousMonth('0100-01'), '0099-12');
});
test('a verified historical event remains valid after its end date', () => {
  assert.equal(run([fixture()]).summary.length, 1);
  assert.equal(run([fixture()]).summary[0].verifiedAt, '2026-10-20');
});
test('inclusive interval overlap includes month boundaries and intervals spanning an entire month', () => {
  for (const interval of [{ start: '2026-08-20', end: '2026-09-01' }, { start: '2026-09-30', end: '2026-10-07' }, { start: '2026-08-01', end: '2026-10-31' }]) assert.equal(run([fixture(interval)]).details.length, 1);
  for (const interval of [{ start: '2026-08-01', end: '2026-08-31' }, { start: '2026-10-01', end: '2026-10-07' }, { start: '2026-09-27', end: '2026-09-25' }]) assert.equal(run([fixture(interval)]).details.length, 0);
});
test('future October-January seed never explains April-September chart', () => {
  const future = [fixture({ start: '2026-10-01', end: '2027-01-31' })];
  for (const selectedMonth of query().actualDataMonths) assert.equal(run(future, { selectedMonth }).details.length, 0);
  assert.equal(run(future, { selectedMonth: '2026-10' }).details.length, 0);
});
test('previous-month context is explicit, adjacent, and backed by actual data', () => {
  const events = [fixture({ start: '2026-08-01', end: '2026-08-02' })];
  assert.equal(run(events).details.length, 0);
  const result = run(events, { includePreviousMonth: true });
  assert.match(result.details[0].text, /^직전 월 2026-08/);
  assert.equal(result.details[0].relation, 'previous');
  assert.equal(run(events, { includePreviousMonth: true, actualDataMonths: ['2026-09'] }).details.length, 0);
  const rollover = run([fixture({ start: '2025-12-31', end: '2025-12-31' })], { selectedMonth: '2026-01', actualDataMonths: ['2025-12', '2026-01'], includePreviousMonth: true });
  assert.equal(rollover.details[0].month, '2025-12');
});
test('review states, official evidence dates and source links are mandatory, collection is not verification', () => {
  for (const changes of [{ status: 'expired' }, { status: 'unverified' }, { status: 'superseded' }, { verifiedAt: undefined, observedAt: '2026-10-20' }, { verifiedAt: '2026-10-21' }, { sourceURL: '' }, { sourceURL: 'javascript:alert(1)' }, { sourceURL: 'https://user:secret@example.invalid' }, { reviewValidUntil: '2026-10-19' }, { reviewValidUntil: '2026-02-30' }]) assert.equal(run([fixture(changes)]).details.length, 0);
  assert.equal(run([fixture({ reviewValidUntil: '2026-10-20' })]).details.length, 1);
});
test('regional and local school breaks retain precise geography, never nationwide scope', () => {
  const local = fixture({ scope: 'local', region: '베이징 A학교', kind: 'school_break' });
  assert.match(run([local]).summary[0].text, /CN 베이징 A학교/);
  assert.doesNotMatch(run([local]).summary[0].text, /전국/);
  assert.equal(run([fixture({ scope: 'regional', region: '' })]).details.length, 0);
  assert.equal(run([local], { region: '상하이' }).details.length, 0);
  assert.equal(run([local], { region: '베이징 A학교' }).details.length, 1);
  assert.equal(run([fixture()], { region: '상하이' }).details.length, 1);
  assert.equal(run([local], { kind: 'public_holiday' }).details.length, 0);
});
test('country matching never pools OTHER and KR is opt-in origin only', () => {
  const events = [fixture(), fixture({ id: 'kr', country: 'KR' }), fixture({ id: 'jp', country: 'JP' })];
  assert.deepEqual(run(events).details.map(row => row.country), ['CN']);
  assert.deepEqual(run(events, { country: 'OTHER', includeOriginContext: true }), { summary: [], details: [] });
  assert.equal(run(events, { country: 'KR' }).details.length, 0);
  const origin = run(events, { country: 'KR', includeOriginContext: true }).details[0];
  assert.equal(origin.role, 'origin'); assert.match(origin.text, /한국 출발지 참고/); assert.doesNotMatch(origin.text, /국적/);
});
test('summary is capped at two, all details remain, selection order is deterministic and inputs unchanged', () => {
  const events = ['c', 'b', 'a'].map(id => fixture({ id }));
  const before = JSON.stringify(events);
  const result = run(events);
  assert.equal(result.summary.length, 2); assert.equal(result.details.length, 3);
  assert.deepEqual(result.summary.map(row => row.eventId), ['a', 'b']);
  assert.deepEqual(run([...events].reverse()), result);
  assert.equal(JSON.stringify(events), before);
  assert.equal(run([events[0], events[0]]).details.length, 1);
  assert.deepEqual(run([]), { summary: [], details: [] });
  assert.ok(result.summary.every(row => row.sourceURL && row.verifiedAt));
  assert.ok(result.summary.every(row => !/증가|감소|예측|원인|때문/.test(row.text)));
});

test('institutional holidays retain their applicability and unsupported closure/workday kinds stay excluded', () => {
  const event = fixture({ country: 'US', scope: 'institutional', region: '연방공무원 대상', name: '기관한정 테스트 공휴일' });
  const result = run([event], { country: 'US' });
  assert.equal(result.summary.length, 1);
  assert.equal(result.summary[0].scope, 'institutional');
  assert.match(result.summary[0].text, /US 연방공무원 대상/);
  assert.doesNotMatch(result.summary[0].text, /전국/);
  assert.equal(run([{ ...event, region: '' }], { country: 'US' }).details.length, 0);
  for (const kind of ['government_closure', 'makeup_workday']) assert.equal(run([{ ...event, kind }], { country: 'US' }).details.length, 0);
});
