import assert from 'node:assert/strict';
import test from 'node:test';
import { departureMap } from '../lib/airport-departure-map.ts';
import { leadingGates, rankMapGates } from '../lib/airport-gate-ranking.ts';

const date = '2026-10-03';
const map = rows => departureMap({ date, nextDate: date, terminal: 'T2', window: { startMin: 0, endMin: 1440 }, rows });
const row = (id, gate, extra = {}) => ({ physicalFlightId: id, flightNumber: id, terminal: 'T2', gate, scheduledAt: `${date}T09:00:00+09:00`, retrievedAt: `${date}T00:00:00Z`, status: 'scheduled', direction: 'departure', ...extra });

test('every leader is retained, including more than six ties with more than six flights', () => {
  const gates = ['208', '215', '231', '234', '263', '268', '276', '279'];
  const rows = gates.flatMap(gate => Array.from({ length: 17 }, (_, i) => row(`${gate}-${i}`, gate)));
  const ranked = rankMapGates([map(rows)]);
  assert.deepEqual(leadingGates(ranked).map(gate => gate.gate), [...gates].sort((a,b) => Number(a)-Number(b)));
  assert.ok(leadingGates(ranked).every(gate => gate.flights === 17));
  assert.equal(ranked.reduce((sum, gate) => sum + gate.flights, 0), 136);
});

test('codeshares/cancellations/arrivals are resolved by the existing flight calculation', () => {
  const rows = [row('same','215'), row('same','263',{ retrievedAt: `${date}T01:00:00Z` }), row('cancel','215',{status:'cancelled'}), row('arrival','215',{direction:'arrival'}), row('missing','')];
  const ranked = rankMapGates([map(rows)]);
  assert.deepEqual(leadingGates(ranked).map(g => [g.gate,g.flights]), [['263',1]]);
  assert.equal(ranked.find(g => g.gate === '215').flights, 0);
});

test('unpositioned assigned gates remain in the ranking without invented coordinates', () => {
  const model = map([row('unpositioned','999')]);
  assert.equal(model.flights[0].position, null);
  const ranked = rankMapGates([model]);
  assert.equal(leadingGates(ranked)[0].gate,'999');
  assert.equal(leadingGates(ranked)[0].side,'UNVERIFIED');
});

test('zero is a list value, never a spurious joint leader', () => {
  const ranked = rankMapGates([map([])]);
  assert.ok(ranked.length > 6);
  assert.ok(ranked.every(g => g.flights === 0));
  assert.deepEqual(leadingGates(ranked),[]);
});
