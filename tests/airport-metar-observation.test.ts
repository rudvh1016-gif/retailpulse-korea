import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeAirportMetar, airportMetarProjection, type AirportMetarResponse } from '../lib/airport-metar-observation';

// Synthetic XML reproduces verified paths. The real raw response was not retained.
const xml = (time = '2026-10-09T02:30:00Z', speed = 6, unit = '[kn_i]', station = 'RKSI') =>
  `<iwxxm:METAR reportStatus="NORMAL" permissibleUsage="OPERATIONAL"><iwxxm:issueTime><gml:TimeInstant><gml:timePosition>2026-10-09T02:40:00Z</gml:timePosition></gml:TimeInstant></iwxxm:issueTime><iwxxm:aerodrome><aixm:AirportHeliport><aixm:timeSlice><aixm:AirportHeliportTimeSlice><aixm:designator>${station}</aixm:designator><aixm:locationIndicatorICAO>${station}</aixm:locationIndicatorICAO></aixm:AirportHeliportTimeSlice></aixm:timeSlice></aixm:AirportHeliport></iwxxm:aerodrome><iwxxm:observationTime><gml:TimeInstant><gml:timePosition>${time}</gml:timePosition></gml:TimeInstant></iwxxm:observationTime><iwxxm:observation><iwxxm:MeteorologicalAerodromeObservation><iwxxm:airTemperature uom="Cel">22</iwxxm:airTemperature><iwxxm:surfaceWind><iwxxm:AerodromeSurfaceWind><iwxxm:meanWindDirection uom="deg">290</iwxxm:meanWindDirection><iwxxm:meanWindSpeed uom="${unit}">${speed}</iwxxm:meanWindSpeed></iwxxm:AerodromeSurfaceWind></iwxxm:surfaceWind></iwxxm:MeteorologicalAerodromeObservation></iwxxm:observation></iwxxm:METAR>`;
const response = (reports = [xml()]): AirportMetarResponse => ({ retrievedAt: '2026-10-09T02:47:54Z', httpStatus: 200,
  payload: { response: { header: { resultCode: '00' }, body: { pageNo: 1, numOfRows: 100, totalCount: reports.length,
    items: { item: reports.map(metarMsg => ({ metarMsg, arbitrary: 'do-not-retain' })) } } } } });
const now = '2026-10-09T02:48:00Z';

test('verified RKSI observation paths preserve station, observation time, unit and scope', () => {
  const result = normalizeAirportMetar(response());
  const proof = JSON.parse(readFileSync(new URL('../docs/reviews/metar-connection-20261009/connection-proof.json', import.meta.url), 'utf8'));
  assert.equal(proof.contractStatus, 'VERIFIED_CONTRACT');
  assert.equal(result.status, 'OK');
  assert.equal(result.observation?.station, proof.actualObservation.station);
  assert.equal(result.observation?.observedAt, new Date(proof.actualObservation.observedAt).toISOString());
  assert.deepEqual(result.observation?.measurements.meanWindSpeed, proof.actualObservation.measurements.meanWindSpeed);
  assert.equal(result.observation?.measurementScope, 'GROUND_OBSERVATION');
  assert.equal(result.observation?.turbulenceRisk, 'NOT_INFERRED');
  assert.equal(JSON.stringify(result).includes('do-not-retain'), false);
  assert.equal(JSON.stringify(result).includes('iwxxm:'), false);
});
test('zero wind is observed; recognized m/s units are preserved without guessing knots', () => {
  for (const [speed, unit] of [[0, '[kn_i]'], [3.5, 'm/s']] as const) {
    const result = normalizeAirportMetar(response([xml(undefined, speed, unit)]));
    assert.deepEqual(result.observation?.measurements.meanWindSpeed, { value: speed, unit });
    assert.equal(airportMetarProjection(result, result, now).windState, 'OBSERVED');
  }
});
test('unknown or nil wind remains unknown with no cache of a complete observation', () => {
  for (const text of [xml(undefined, 6, 'unknown-unit'), xml().replace('uom="[kn_i]"', 'uom="[kn_i]" xsi:nil="true"')]) {
    const result = normalizeAirportMetar(response([text]));
    assert.equal(result.status, 'OK');
    assert.equal(result.observation?.measurements.meanWindSpeed, undefined);
    assert.equal(airportMetarProjection(result, result, now).windState, 'UNKNOWN');
    assert.equal(airportMetarProjection(result, result, now).cacheControl, 'no-store');
  }
});
test('latest complete page is selected and equivalent duplicates are accepted', () => {
  const result = normalizeAirportMetar(response([xml('2026-10-09T02:00:00Z', 1), xml(), xml()]));
  assert.equal(result.status, 'OK');
  assert.equal(result.observation?.observedAt, '2026-10-09T02:30:00.000Z');
});
test('same-time conflicting readings with unverified correction identity are withheld', () => {
  assert.equal(normalizeAirportMetar(response([xml(), xml(undefined, 7)])).status, 'CONFLICTING_REPORTS');
});
test('unreadable or other-station row prevents an older partial page claiming latest', () => {
  for (const bad of ['invalid-shape', xml(undefined, 6, '[kn_i]', 'RKSS')]) {
    const result = normalizeAirportMetar(response([xml(), bad]));
    assert.equal(result.status, 'SCHEMA_UNVERIFIED');
    assert.equal(result.observation, null);
  }
});
test('missing observation time never falls back to issue time; calendar rollover is rejected', () => {
  const missing = xml().replace(/<iwxxm:observationTime>[\s\S]*?<\/iwxxm:observationTime>/, '');
  assert.equal(normalizeAirportMetar(response([missing])).status, 'SCHEMA_UNVERIFIED');
  assert.equal(normalizeAirportMetar(response([xml('2026-02-30T02:30:00Z')])).status, 'SCHEMA_UNVERIFIED');
  assert.equal(normalizeAirportMetar(response([xml('2026-10-09T02:59:00Z')])).status, 'OBSERVATION_TIME_INVALID');
});
test('paging limits and mismatches cannot publish a truncated latest observation', () => {
  assert.equal(normalizeAirportMetar(response(Array(101).fill(xml()))).status, 'INCOMPLETE_RESPONSE');
  const input = response();
  (input.payload as { response: { body: { totalCount: number } } }).response.body.totalCount = 2;
  assert.equal(normalizeAirportMetar(input).status, 'INCOMPLETE_RESPONSE');
  assert.equal(normalizeAirportMetar(response([])).status, 'NO_DATA');
});
test('transport and provider failures expose safe enums, not payloads or URLs', () => {
  const secretMarker = 'do-not-expose-provider-body';
  for (const [httpStatus, expected] of [[403, 'AUTH_BLOCKED'], [429, 'RATE_LIMITED'], [500, 'PROVIDER_ERROR']] as const) {
    const result = normalizeAirportMetar({ ...response(), httpStatus, payload: secretMarker });
    assert.equal(result.status, expected);
    assert.equal(JSON.stringify(result).includes(secretMarker), false);
  }
  assert.equal(normalizeAirportMetar({ ...response(), failure: 'TIMEOUT' }).status, 'TIMEOUT');
  assert.equal(normalizeAirportMetar({ ...response(), failure: 'NETWORK' }).status, 'NETWORK_ERROR');
  assert.equal(normalizeAirportMetar({ ...response(), retrievedAt: 'invalid' }).status, 'RETRIEVAL_TIME_INVALID');
});
test('current observation cache cannot cross the provisional 90 minute freshness boundary', () => {
  const good = normalizeAirportMetar(response());
  assert.equal(airportMetarProjection(good, good, now).cacheControl, 'public, max-age=60');
  assert.equal(airportMetarProjection(good, good, '2026-10-09T03:59:59Z').cacheControl, 'public, max-age=1');
  const stale = airportMetarProjection(good, good, '2026-10-09T04:00:00Z');
  assert.equal(stale.status, 'STALE');
  assert.equal(stale.cacheControl, 'no-store');
  assert.equal(stale.observation?.observedAt, good.observation?.observedAt);
});
test('failed refresh preserves original last good timestamps and marks stale', () => {
  const good = normalizeAirportMetar(response());
  const failed = normalizeAirportMetar({ retrievedAt: '2026-10-09T02:48:30Z', failure: 'TIMEOUT' });
  const view = airportMetarProjection(good, failed, '2026-10-09T02:49:00Z');
  assert.equal(view.status, 'STALE');
  assert.equal(view.observation, good.observation);
  assert.equal(view.retrievedAt, good.retrievedAt);
  assert.equal(view.attemptedAt, failed.retrievedAt);
});
test('incoherent attempt times and mismatched latest readings cannot relabel old data current', () => {
  const good = normalizeAirportMetar(response());
  assert.equal(airportMetarProjection(good, { ...good, retrievedAt: '2026-10-09T02:59:00Z' }, now).status, 'STALE');
  assert.equal(airportMetarProjection(good, normalizeAirportMetar(response([xml(undefined, 7)])), now).status, 'STALE');
  assert.equal(airportMetarProjection(good, good, 'invalid').status, 'ERROR');
  assert.equal(airportMetarProjection(null, null, now).status, 'MISSING');
});
test('external entities cannot escape the pure bounded parser through the new boundary', () => {
  const input = response([`<!DOCTYPE x SYSTEM "https://example.invalid/secret">${xml()}`]);
  assert.equal(normalizeAirportMetar(input).status, 'SCHEMA_UNVERIFIED');
});
