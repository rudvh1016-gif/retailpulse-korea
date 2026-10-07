import assert from 'node:assert/strict';
import test from 'node:test';
import { airportSides } from '../lib/airport-sides-summary.ts';
import { topReferences } from '../lib/airport-top-reference.ts';

const date = '2026-08-31';
const stamp = '2026-08-31T05:00:00Z';
const nowIso = '2026-08-31T05:10:00Z';
const rows = ['T1:9', 'T1:29', 'T1:27', ':110', 'T2:274', 'T2:231', 'T2:228', ':'].map((item, index) => {
  const [terminal, gate] = item.split(':');
  return { physicalFlightId: `R${index}`, terminal, gate, scheduledAt: `${date}T09:00:00+09:00`,
    retrievedAt: stamp, status: 'scheduled', direction: 'departure' };
});
const sides = airportSides(date, 'TODAY', [], rows, [], false, false);
const summary = { serviceDateKst: date, dayRelation: 'TODAY', airport: {
  serviceDateKst: date, forecastCoverage: { byTerminal: { T1: 'COMPLETE', T2: 'COMPLETE' } },
  passengerForecastTimelineByTerminal: { T1: [{ expectedPassengers: 4000 }], T2: [{ expectedPassengers: 3000 }] },
  passengerForecastRetrievedAtByTerminal: { T1: stamp, T2: stamp },
} };
const source = { serviceDateKst: date, retrievedAt: stamp, basis: 'COLLECTED_FLIGHT_RECORDS', truncated: false, flights: rows };
const references = (changes = {}) => topReferences({ summary, sides, date, nowIso, scope: 'all', wholeDaySelected: true, source, ...changes });

test('whole-day all scope keeps T1/T2 official denominators separate, including concourse and unknown groups', () => {
  const [t1, t2] = references();
  assert.deepEqual([t1.terminal, t2.terminal], ['T1', 'T2']);
  assert.equal(t1.estimate.total, 4000);
  assert.equal(t1.estimate.flights, 4, 'T1 main plus the concourse, counted once');
  assert.equal(t1.estimate.concourse.flights, 1);
  assert.equal(t1.estimate.center.flights, 1);
  assert.equal(t1.estimate.outsideScope, 1, 'unidentified building is disclosed but gets no T1 allocation');
  assert.equal(t1.estimate.east.people, 1000);
  assert.equal(t2.estimate.total, 3000);
  assert.equal(t2.estimate.flights, 3);
  assert.equal(t2.estimate.unverified.flights, 1);
  assert.equal(t2.estimate.outsideScope, 1);
  assert.equal(t2.estimate.concourse, null);
  assert.equal(t2.estimate.east.people, 1000);
  assert.deepEqual(references({ scope: 'T1' }).map((row) => row.terminal), ['T1']);
  assert.deepEqual(references({ scope: 'T2' }).map((row) => row.terminal), ['T2']);
});

test('time selection and concourse-only scope have no terminal-wide denominator', () => {
  assert.equal(references({ wholeDaySelected: false }), null);
  assert.equal(references({ scope: 'CONCOURSE' }), null);
});

test('arrival rows in the shared flights API cannot enter the departure denominator', () => {
  const arrival = { ...rows[0], physicalFlightId: 'ARRIVAL', direction: 'arrival', gate: '9' };
  assert.deepEqual(references({ source: { ...source, flights: [...rows, arrival] } }).map((row) => Boolean(row.estimate)), [true, true]);
});

test('date, source freshness, truncation, basis, and exact flight set must agree', () => {
  assert.equal(references({ date: '2026-09-01' }), null);
  assert.equal(references({ source: { ...source, serviceDateKst: '2026-09-01' } }), null);
  assert.equal(references({ source: { ...source, serviceDateKst: undefined } }), null);
  assert.equal(references({ source: { ...source, truncated: true } }), null);
  assert.equal(references({ source: { ...source, retrievedAt: null } }), null);
  assert.equal(references({ nowIso: '2026-09-02T12:00:00Z' }), null);
  assert.deepEqual(references({ source: { ...source, basis: 'OFFICIAL_DEPARTURE_SCHEDULE' } }).map((row) => row.estimate), [null, null]);
  assert.deepEqual(references({ source: { ...source, flights: rows.slice(1) } }).map((row) => Boolean(row.estimate)), [false, true], 'one missing T1 flight does not invalidate an independent T2 result');
  assert.deepEqual(references({ source: { ...source, flights: rows.slice(0, -1) } }).map((row) => row.estimate), [null, null], 'unknown building is part of the reconciliation');
});

test('incomplete official forecast or stale summary withholds only the affected terminal', () => {
  const withoutT2 = { ...summary, airport: { ...summary.airport,
    forecastCoverage: { byTerminal: { T1: 'COMPLETE', T2: 'PARTIAL' } } } };
  assert.deepEqual(references({ summary: withoutT2 }).map((row) => Boolean(row.estimate)), [true, false]);
  const oldGates = { ...sides, gates: { ...sides.gates, date: '2026-08-30' } };
  assert.deepEqual(references({ sides: oldGates }).map((row) => row.estimate), [null, null]);
});

test('a complete official forecast with missing T2 gates reports the gate cause and allocates no passengers', () => {
  const held=rows.map(row=>row.terminal==='T2'?{...row,gate:null}:row);
  const heldSides=airportSides(date,'TODAY',[],held,[],false,false);
  const entries=references({sides:heldSides,source:{...source,flights:held}});
  assert.equal(entries[0].estimate.total,4000,'the independent T1 forecast is preserved');
  assert.equal(entries[1].estimate,null);
  assert.equal(entries[1].unavailableReason,'GATES_PENDING');
  assert.equal(summary.airport.passengerForecastTimelineByTerminal.T2[0].expectedPassengers,3000);
});
