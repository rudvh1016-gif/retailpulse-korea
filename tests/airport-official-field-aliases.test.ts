import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAirportFlight, SourceFetchError } from '../lib/source-adapters';
import { destinationOf } from '../lib/airport-destinations';
import { summarizeAirlineRanking } from '../lib/airline-ranking';
import { lookupAirline } from '../lib/airline-country';
import { fetchA1DeparturesForDate } from '../lib/airport-today';

// Synthetic values using the public A1 (15140153) response field spellings.
// https://www.data.go.kr/data/15140153/openapi.do (schema reviewed 2026-10-21).
// No live provider calls or captured passenger data.
const official = {
  fid: 'fixture-flight', flightId: 'KE703', masterFlightId: 'KE703',
  scheduleDatetime: '202610211430', estimatedDatetime: '202610211545',
  terminalId: 'P03', gateNumber: '231', chkinRange: 'D01-D10', remark: '지연',
  airline: '대한항공', airport: '도쿄/나리타', airportCode: 'NRT',
};
const retrievedAt = '2026-10-21T04:00:00Z';

test('official estimatedDatetime preserves changed time and event time in both directions', async () => {
  for (const direction of ['departure', 'arrival'] as const) {
    const row = await normalizeAirportFlight(official, direction, retrievedAt);
    assert.equal(row.scheduledAt, '2026-10-21T14:30:00+09:00');
    assert.equal(row.changedAt, '2026-10-21T15:45:00+09:00');
    assert.equal(row.eventAt, row.changedAt);
    assert.equal(row.direction, direction);
    assert.equal(row.terminal, 'T2');
    assert.equal(row.gate, '231');
    assert.equal(row.status, 'delayed');
  }
});

test('official changed time changes semantic hash but never physical flight identity', async () => {
  const first = await normalizeAirportFlight(official, 'departure', retrievedAt);
  const repeated = await normalizeAirportFlight(official, 'departure', '2026-10-21T04:05:00Z');
  const delayed = await normalizeAirportFlight({...official, estimatedDatetime: '202610211630'}, 'departure', retrievedAt);
  assert.equal(first.sourceHash, repeated.sourceHash);
  assert.equal(first.physicalFlightId, delayed.physicalFlightId);
  assert.notEqual(first.sourceHash, delayed.sourceHash);
});

test('legacy timestamp aliases retain precedence and missing estimates remain missing', async () => {
  for (const field of ['estimatedDateTime', 'estimatedDatetime', 'changedDateTime', 'changedAt']) {
    const row = await normalizeAirportFlight({...official, estimatedDatetime: undefined, [field]: '202610211545'}, 'departure', retrievedAt);
    assert.equal(row.changedAt, '2026-10-21T15:45:00+09:00', field);
  }
  const precedence = await normalizeAirportFlight({...official, estimatedDateTime: '202610211500'}, 'departure', retrievedAt);
  assert.equal(precedence.changedAt, '2026-10-21T15:00:00+09:00');
  for (const value of [undefined, null, '']) {
    const row = await normalizeAirportFlight({...official, estimatedDatetime: value}, 'departure', retrievedAt);
    assert.equal(row.changedAt, null);
    assert.equal(row.eventAt, row.scheduledAt);
  }
  await assert.rejects(normalizeAirportFlight({...official, estimatedDatetime: 'not-a-time'}, 'departure', retrievedAt),
    error => error instanceof SourceFetchError && error.code === 'SCHEMA');
});

test('existing provider-name fields resolve destinations and operating airline without a schema change', async () => {
  const row = await normalizeAirportFlight(official, 'departure', retrievedAt);
  assert.equal(row.airportCode, '도쿄/나리타');
  assert.equal(row.airlineCode, '대한항공');
  assert.equal(destinationOf(row.airportCode)?.iata, 'NRT');
  assert.equal(destinationOf(row.airportCode)?.country, 'JP');
  assert.deepEqual(destinationOf(row.airportCode), destinationOf(official.airportCode));
  const ranking = summarizeAirlineRanking([{...row, operatingFlight: row.flightNumber}], lookupAirline);
  assert.equal(ranking.all.airlines[0].iata, 'KE');
  assert.equal(ranking.all.airlines[0].country, 'KR');
  const codeOnly = await normalizeAirportFlight({...official, airport: undefined, airline: undefined, airlineCode: 'KE'}, 'departure', retrievedAt);
  assert.equal(codeOnly.airportCode, 'NRT');
  assert.equal(codeOnly.airlineCode, 'KE');
  assert.equal(destinationOf(codeOnly.airportCode)?.country, 'JP');
});


test('A1 page collection preserves official changed time without changing the scheduled service day', async () => {
  let requests = 0;
  const result = await fetchA1DeparturesForDate('fixture-key', '2026-10-21', async () => {
    requests++;
    return {response: {header: {resultCode: '00', resultMsg: 'NORMAL SERVICE'}, body: {
      items: [{...official, scheduleDatetime: '202610212350', estimatedDatetime: '202610220020'}], totalCount: 1,
    }}};
  });
  assert.equal(requests, 1);
  assert.equal(result.records.length, 1);
  assert.equal(result.futureRecords.length, 0);
  assert.equal(result.records[0].scheduledAt, '2026-10-21T23:50:00+09:00');
  assert.equal(result.records[0].changedAt, '2026-10-22T00:20:00+09:00');
  assert.equal(result.records[0].eventAt, result.records[0].changedAt);
});
