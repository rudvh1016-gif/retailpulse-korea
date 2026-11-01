import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShiftBriefing, serializeShiftBriefing, shiftBriefingSignature, shiftWindow, type ShiftBriefingInput, type ShiftHistoryRow } from '../lib/shift-briefing';
import { AIRPORT_SIDES_VERSION, gateSideOf } from '../lib/airport-sides';
import type { MapFlightRow } from '../lib/airport-departure-map';
import type { TerminalDay } from '../lib/airport-day-compare';

const day = '2026-11-01', at = `${day}T06:00:00+09:00`, now = `${day}T13:00:00+09:00`;
const row = (id: string, time: string, terminal = 'T2', gate: string | null = '250', extra: Partial<MapFlightRow> = {}): MapFlightRow => ({
  physicalFlightId: id, scheduledAt: `${day}T${time}:00+09:00`, terminal, gate, direction: 'departure', retrievedAt: at, status: 'scheduled', ...extra,
});
function history(date: string, hours: number[], terminal: 'T1' | 'T2' = 'T2'): ShiftHistoryRow {
  const part = (values: number[]): TerminalDay => ({ day: date, complete: true, sidesVersion: AIRPORT_SIDES_VERSION,
    total: values.reduce((a, b) => a + b, 0), hours: values, sides: [0, 0, 0, 0], groups: {} });
  return { T1: part(terminal === 'T1' ? hours : Array(24).fill(0)), T2: part(terminal === 'T2' ? hours : Array(24).fill(0)) };
}
function hours(at7 = 1, at8 = 1): number[] { const values = Array(24).fill(0); values[7] = at7; values[8] = at8; return values; }
function input(overrides: Partial<ShiftBriefingInput> = {}): ShiftBriefingInput {
  return { day, nowIso: now, terminal: 'T2', side: null, hours: { open: '07:00', close: '15:00' },
    flights: { mode: 'live-flights', serviceDateKst: day, retrievedAt: at, truncated: false,
      basis: 'COLLECTED_FLIGHT_RECORDS', flights: [row('a', '07:00'), row('b', '08:00')] },
    weekReference: { day, previousDay: '2026-10-25', passengers: { all: null, T1: null, T2: null }, flights: null,
      selectedFlights: { all: 2, T1: 0, T2: 2, CONCOURSE: 0 }, selectedFlightSnapshot: { day, retrievedAt: at, provisional: true } },
    history: Array.from({ length: 31 }, (_, index) => history(`2026-10-${String(index + 1).padStart(2, '0')}`, hours())), ...overrides };
}
function withFlights(flights: MapFlightRow[], overrides: Partial<ShiftBriefingInput> = {}): ShiftBriefingInput {
  const value = input(overrides);
  value.flights = { ...value.flights!, flights };
  return value;
}

test('complete full-shift counts retain elapsed hours and exact weekday/month evidence', () => {
  const result = buildShiftBriefing(input());
  assert.equal(result.current.total, 2); // Now is 13:00, but 07:00 and 08:00 remain part of the shift.
  assert.equal(result.current.peak?.startAt, `${day}T07:00:00+09:00`);
  assert.equal(result.current.peak?.ties, 2);
  assert.equal(result.comparisons.week.start, '2026-10-25');
  assert.equal(result.comparisons.month.includedDates.length, 31);
  assert.equal(result.comparisons.month.baseline, 2);
  assert.equal(result.status, 'NO_CHANGE');
});

test('exact start is included, exact end excluded; changed codeshare time wins before filtering', () => {
  const value = withFlights([row('a', '07:00'), row('b', '15:00'), row('b', '08:00', 'T2', '250', { retrievedAt: `${day}T05:00:00+09:00` })]);
  const result = buildShiftBriefing(value);
  assert.equal(result.current.total, 1);
  assert.equal(result.comparisons.week.delta, -1);
});

test('arrivals and cancelled flights do not count; physical codeshares count once', () => {
  const value = withFlights([row('a', '07:00'), row('a', '07:00'), row('b', '08:00'),
    row('arrival', '09:00', 'T2', '250', { direction: 'arrival' }), row('cancel', '10:00', 'T2', '250', { status: 'cancelled' })]);
  assert.equal(buildShiftBriefing(value).current.total, 2);
});

test('side includes centre, but never substitutes whole-terminal history', () => {
  const gates = Array.from({ length: 84 }, (_, i) => String(208 + i));
  const east = gates.find(gate => gateSideOf('T2', gate) === 'EAST')!;
  const center = gates.find(gate => gateSideOf('T2', gate) === 'CENTER')!;
  assert.ok(east); assert.ok(center);
  const result = buildShiftBriefing(withFlights([row('a', '07:00', 'T2', east), row('b', '08:00', 'T2', center)], { side: 'EAST' }));
  assert.equal(result.current.total, 2);
  assert.equal(result.scope.includesCenter, true);
  assert.equal(result.comparisons.week.reason, 'UNSUPPORTED_SIDE_HISTORY');
  assert.equal(result.comparisons.month.baseline, null);
  assert.equal(result.status, 'PARTIAL');
});

test('unknown side cannot turn confirmed flights into a complete peak or zero', () => {
  const result = buildShiftBriefing(withFlights([row('a', '07:00', 'T2', null), row('b', '08:00', 'T2', null)], { side: 'WEST' }));
  assert.equal(result.current.confirmed, 0);
  assert.equal(result.current.total, null);
  assert.equal(result.current.unverified, 2);
  assert.equal(result.current.peak, null);
  assert.equal(result.current.reason, 'UNVERIFIED_LOCATION');
});

test('T1 whole terminal matches history including concourse; side never absorbs concourse', () => {
  const value = withFlights([row('a', '07:00', 'T1', '26'), row('b', '08:00', 'CONCOURSE', '101')], { terminal: 'T1' });
  value.weekReference!.selectedFlights = { all: 2, T1: 1, T2: 0, CONCOURSE: 1 };
  value.history = value.history!.map(entry => history(entry.T1.day, hours(), 'T1'));
  assert.equal(buildShiftBriefing(value).current.total, 2);
  assert.equal(buildShiftBriefing(value).scope.includesConcourse, true);
  const side = buildShiftBriefing({ ...value, side: 'EAST' });
  assert.equal(side.current.total, 1);
  assert.equal(side.scope.includesConcourse, false);
});

test('half-hour current shift is exact but hourly history is explicitly unsupported', () => {
  const result = buildShiftBriefing(input({ hours: { open: '07:30', close: '15:00' } }));
  assert.equal(result.current.total, 1);
  assert.equal(result.comparisons.week.reason, 'UNSUPPORTED_MINUTE_HISTORY');
  assert.equal(result.comparisons.month.baseline, null);
});

test('overnight hours are preserved and withheld without next-day evidence', () => {
  const window = shiftWindow(day, { open: '23:00', close: '02:00' });
  assert.equal(window?.endAt, '2026-11-02T02:00:00+09:00');
  const result = buildShiftBriefing(input({ hours: { open: '23:00', close: '02:00' } }));
  assert.equal(result.current.reason, 'UNSUPPORTED_OVERNIGHT');
  assert.equal(result.current.total, null);
});

test('missing/month duplicate/partial days never enter the denominator as zeros', () => {
  const value = input();
  const entries = value.history!.filter(entry => !['2026-10-01', '2026-10-02'].includes(entry.T2.day));
  entries.push(structuredClone(entries[0]));
  const result = buildShiftBriefing({ ...value, history: entries });
  assert.equal(result.comparisons.month.status, 'PARTIAL');
  assert.equal(result.comparisons.month.baseline, 2);
  assert.equal(result.comparisons.month.includedDates.length, 28);
  assert.deepEqual(result.comparisons.month.missingDates, ['2026-10-01', '2026-10-02', '2026-10-03']);
  assert.deepEqual(result.comparisons.month.excludedDates, ['2026-10-03']);
  assert.equal(result.status, 'PARTIAL'); // Equal observed-days mean is not full coverage/no change.
});

test('last week must be the exact date, not a different earlier same weekday', () => {
  const value = input();
  const result = buildShiftBriefing({ ...value, history: value.history!.filter(entry => entry.T2.day !== '2026-10-25') });
  assert.equal(result.comparisons.week.baseline, null);
  assert.equal(result.comparisons.week.reason, 'BASELINE_MISSING');
});

test('zero baseline has a real delta and unavailable percentage; verified zero shift is valid', () => {
  const baseline = input().history!.map(entry => history(entry.T2.day, hours(0, 0)));
  const result = buildShiftBriefing(input({ history: baseline }));
  assert.equal(result.comparisons.week.baseline, 0);
  assert.equal(result.comparisons.week.delta, 2);
  assert.equal(result.comparisons.week.percent, null);
  const zero = buildShiftBriefing(input({ hours: { open: '10:00', close: '15:00' } }));
  assert.equal(zero.current.total, 0);
  assert.equal(zero.status, 'NO_CHANGE');
});

test('stale/failed/truncated/unwitnessed data stays unavailable or explicitly partial', () => {
  assert.equal(buildShiftBriefing(input({ flights: undefined })).status, 'LOADING');
  assert.equal(buildShiftBriefing(input({ flights: null })).status, 'INSUFFICIENT');
  const value = input();
  assert.equal(buildShiftBriefing(input({ flights: { ...value.flights!, truncated: true } })).current.reason, 'TRUNCATED_RECORDS');
  assert.equal(buildShiftBriefing(input({ checkedAt: '2026-10-29T00:00:00+09:00' })).current.reason, 'STALE_RECORDS');
  const noWitness = buildShiftBriefing(input({ weekReference: null }));
  assert.equal(noWitness.current.confirmed, 2);
  assert.equal(noWitness.current.total, null);
  assert.equal(noWitness.comparisons.week.delta, null);
  assert.equal(noWitness.status, 'PARTIAL');
});

test('mismatched witness time or any full-day scope count prevents a comparison', () => {
  const value = input();
  value.weekReference!.selectedFlightSnapshot!.retrievedAt = `${day}T06:01:00+09:00`;
  assert.equal(buildShiftBriefing(value).current.comparisonEligible, false);
  const other = input(); other.weekReference!.selectedFlights!.CONCOURSE = 1;
  assert.equal(buildShiftBriefing(other).current.comparisonEligible, false);
});

test('invalid hours, malformed calendar dates and broken profiles do not produce numbers', () => {
  assert.equal(buildShiftBriefing(input({ day: '2026-11-31' })).current.reason, 'INVALID_SELECTION');
  assert.equal(buildShiftBriefing(input({ hours: { open: '24:00', close: '15:00' } })).current.total, null);
  assert.equal(buildShiftBriefing(withFlights([null as unknown as MapFlightRow])).current.reason, 'INVALID_RECORDS');
  assert.equal(buildShiftBriefing(withFlights([row('a', '07:00', 'T2', '250', { scheduledAt: `${day}T07:00:00Z` })])).current.reason, 'INVALID_RECORDS');
  const value = input(); value.history![24].T2.hours[7] = -1;
  assert.equal(buildShiftBriefing(value).comparisons.week.reason, 'BASELINE_INVALID');
});

test('serialization preserves exact scope, raw mean, missing dates and null percentage', () => {
  const value = input({ side: 'WEST' });
  const result = buildShiftBriefing(value), parsed = JSON.parse(serializeShiftBriefing(result));
  assert.deepEqual(parsed, result);
  assert.equal(parsed.comparisons.week.percent, null);
  assert.equal(parsed.comparisons.week.expectedDays, 1);
});

test('last-check signature ignores refresh clocks but retains value, coverage and availability changes', () => {
  const original = buildShiftBriefing(input()), signature = shiftBriefingSignature(original);
  const refreshed = structuredClone(original);
  refreshed.current.retrievedAt = `${day}T07:00:00+09:00`;
  refreshed.current.checkedAt = `${day}T07:00:00+09:00`;
  assert.equal(shiftBriefingSignature(refreshed), signature);
  assert.notEqual(serializeShiftBriefing(refreshed), serializeShiftBriefing(original));
  const changed = structuredClone(original); changed.current.total = 3;
  assert.notEqual(shiftBriefingSignature(changed), signature);
  const coverage = structuredClone(original); coverage.comparisons.month.missingDates = ['2026-10-01'];
  assert.notEqual(shiftBriefingSignature(coverage), signature);
  const unavailable = structuredClone(original); unavailable.current.status = 'PARTIAL';
  assert.notEqual(shiftBriefingSignature(unavailable), signature);
});

test('a whole-terminal shift includes east and west destination flows while optional side detail remains scoped', () => {
  const gates = Array.from({ length: 84 }, (_, i) => String(208 + i));
  const east = gates.find(gate => gateSideOf('T2', gate) === 'EAST')!;
  const west = gates.find(gate => gateSideOf('T2', gate) === 'WEST')!;
  const value = withFlights([
    row('east', '07:00', 'T2', east, { airportCode: 'NRT' }),
    row('west', '08:00', 'T2', west, { airportCode: 'PEK' }),
  ]);
  const whole = buildShiftBriefing(value);
  assert.equal(whole.current.total, 2);
  assert.deepEqual(whole.current.destinations, {
    countries: [{ country: 'CN', flights: 1 }, { country: 'JP', flights: 1 }],
    known: 2, unknown: 0, complete: true,
  });
  const side = buildShiftBriefing({ ...value, side: 'WEST' });
  assert.equal(side.current.total, 1);
  assert.deepEqual(side.current.destinations?.countries, [{ country: 'CN', flights: 1 }]);
});

test('destination counts combine reviewed city names and IATA codes, preserve unknown coverage and stable ties', () => {
  const value = withFlights([
    row('japan-a', '07:00', 'T2', '250', { airportCode: '도쿄/나리타' }),
    row('japan-b', '08:00', 'T2', '250', { airportCode: ' kix ' }),
    row('china', '09:00', 'T2', '250', { airportCode: 'PEK' }),
    row('taiwan', '10:00', 'T2', '250', { airportCode: 'TPE' }),
    row('unmapped', '11:00', 'T2', '250', { airportCode: 'UNKNOWN AIRPORT', airlineCode: 'JL' }),
    row('missing', '12:00', 'T2', '250', { airportCode: null, airlineCode: 'CA' }),
    row('malformed', '13:00', 'T2', '250', { airportCode: { country: 'US' } }),
  ]);
  value.weekReference!.selectedFlights = { all: 7, T1: 0, T2: 7, CONCOURSE: 0 };
  const current = buildShiftBriefing(value).current;
  assert.equal(current.total, 7); // Missing destination data does not change a valid flight total.
  assert.deepEqual(current.destinations, {
    countries: [{ country: 'JP', flights: 2 }, { country: 'CN', flights: 1 }, { country: 'TW', flights: 1 }],
    known: 4, unknown: 3, complete: false,
  });
  assert.equal(current.destinations!.known + current.destinations!.unknown, current.confirmed);
  value.flights!.flights.reverse();
  assert.deepEqual(buildShiftBriefing(value).current.destinations, current.destinations);
});

test('destination ranking follows the newest physical record, excludes cancellations, arrivals and the end boundary', () => {
  const value = withFlights([
    row('a', '07:00', 'T2', '250', { airportCode: 'NRT', retrievedAt: `${day}T05:00:00+09:00` }),
    row('a', '07:00', 'T2', '250', { airportCode: 'PEK' }),
    row('b', '15:00', 'T2', '250', { airportCode: 'KIX' }),
    row('cancel', '09:00', 'T2', '250', { airportCode: 'LAX', status: 'cancelled' }),
    row('arrival', '10:00', 'T2', '250', { airportCode: 'SIN', direction: 'arrival' }),
  ]);
  const current = buildShiftBriefing(value).current;
  assert.equal(current.total, 1);
  assert.deepEqual(current.destinations, {
    countries: [{ country: 'CN', flights: 1 }], known: 1, unknown: 0, complete: true,
  });
});

test('T1 destination ranking includes concourse and excludes T2', () => {
  const value = withFlights([
    row('main', '07:00', 'T1', '26', { airportCode: 'NRT' }),
    row('concourse', '08:00', 'CONCOURSE', '101', { airportCode: 'HKG' }),
    row('t2', '09:00', 'T2', '250', { airportCode: 'LAX' }),
  ], { terminal: 'T1' });
  value.weekReference!.selectedFlights = { all: 3, T1: 1, T2: 1, CONCOURSE: 1 };
  const current = buildShiftBriefing(value).current;
  assert.equal(current.total, 2);
  assert.deepEqual(current.destinations?.countries, [{ country: 'HK', flights: 1 }, { country: 'JP', flights: 1 }]);
});

test('unavailable destination counts stay null, verified zero stays empty, and partial counts remain partial', () => {
  for (const flights of [undefined, null]) {
    assert.equal(buildShiftBriefing(input({ flights })).current.destinations, null);
  }
  const value = input();
  assert.equal(buildShiftBriefing(input({ flights: { ...value.flights!, truncated: true } })).current.destinations, null);
  const zero = buildShiftBriefing(input({ hours: { open: '10:00', close: '15:00' } })).current.destinations;
  assert.deepEqual(zero, { countries: [], known: 0, unknown: 0, complete: true });
  const partial = buildShiftBriefing(withFlights([
    row('a', '07:00', 'T2', '250', { airportCode: 'NRT' }),
    row('b', '08:00', 'T2', '250', { airportCode: 'KIX' }),
  ], { weekReference: null })).current;
  assert.equal(partial.total, null);
  assert.deepEqual(partial.destinations, {
    countries: [{ country: 'JP', flights: 2 }], known: 2, unknown: 0, complete: false,
  });
});

test('last-check signature detects a destination change with unchanged flight count, peak and comparisons', () => {
  const value = withFlights([
    row('a', '07:00', 'T2', '250', { airportCode: 'NRT' }),
    row('b', '08:00', 'T2', '250', { airportCode: 'KIX' }),
  ]);
  const original = buildShiftBriefing(value);
  value.flights!.flights[1].airportCode = 'PEK';
  const changed = buildShiftBriefing(value);
  assert.equal(changed.current.total, original.current.total);
  assert.deepEqual(changed.current.peak, original.current.peak);
  assert.deepEqual(changed.comparisons, original.comparisons);
  assert.notEqual(shiftBriefingSignature(changed), shiftBriefingSignature(original));
  value.flights!.flights[1].airportCode = null;
  assert.notEqual(shiftBriefingSignature(buildShiftBriefing(value)), shiftBriefingSignature(changed));
});
