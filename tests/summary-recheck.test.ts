import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SOURCE_RECOVERY_CAPABILITIES } from '../lib/recovery-capability';
import { FAST_RECHECK_SOURCE_IDS, shortensSummaryRecheck } from '../lib/summary-recheck';

// lib/recovery-capability.ts states each source's own schedule. A row is
// sub-hourly or daily-or-slower; a schedule that is neither must be decided
// here before it can change how often open pages re-read the summary.
const SUB_HOURLY = /every 15 minutes|^hourly\b|per KMA issuance/;
const DAILY_OR_SLOWER = /daily group|^weekly$|every morning|00:07 KST early window|early A1 window/;

test('the fast re-check set is exactly the sources collected within the hour', () => {
  const fast = new Set<string>();
  for (const row of SOURCE_RECOVERY_CAPABILITIES) {
    const subHourly = SUB_HOURLY.test(row.nextScheduledSlotBehavior);
    const slower = DAILY_OR_SLOWER.test(row.nextScheduledSlotBehavior);
    assert.equal(subHourly !== slower, true, `${row.sourceId}: classify "${row.nextScheduledSlotBehavior}"`);
    if (subHourly) fast.add(row.sourceId);
  }
  assert.deepEqual([...FAST_RECHECK_SOURCE_IDS].sort(), [...fast].sort());
});

test('only a problem with a sub-hourly source shortens the re-check', () => {
  for (const sourceId of FAST_RECHECK_SOURCE_IDS) {
    for (const status of ['ERROR', 'DEGRADED', 'MISSING']) assert.equal(shortensSummaryRecheck({ sourceId, status }), true, `${sourceId} ${status}`);
    for (const status of ['LIVE', 'STALE', 'OFFICIAL_HISTORICAL']) assert.equal(shortensSummaryRecheck({ sourceId, status }), false, `${sourceId} ${status}`);
  }
  for (const sourceId of ['KASI_PUBLIC_HOLIDAYS', 'SEOUL_ESTIMATED_SALES', 'INCHEON_FLIGHT_DETAIL', 'INCHEON_TRANSFER_FORECAST', 'SEOUL_STORE_DYNAMICS']) {
    assert.equal(shortensSummaryRecheck({ sourceId, status: 'ERROR' }), false, sourceId);
  }
  assert.equal(shortensSummaryRecheck({ sourceId: 'NOT_A_SOURCE', status: 'ERROR' }), false);
  assert.equal(shortensSummaryRecheck({}), false);
  assert.equal(shortensSummaryRecheck({ sourceId: null, status: null }), false);
});

test('the 2026-10-14 public summary no longer forces the 2-minute re-check by its sources', () => {
  // Status of every source on /api/live/summary, Production Site Smoke run 38520165375.
  const production = [
    ['INCHEON_DEPARTURE_CONGESTION', 'LIVE'], ['INCHEON_DEPARTURE_CONGESTION_T2', 'LIVE'], ['INCHEON_DUTY_FREE_ACTUAL', 'LIVE'],
    ['INCHEON_FACILITY_DIRECTORY', 'LIVE'], ['INCHEON_FLIGHT_DETAIL', 'LIVE'], ['INCHEON_PASSENGER_FORECAST', 'LIVE'],
    ['INCHEON_SCHEDULED_DUTY_FREE', 'LIVE'], ['INCHEON_TRANSFER_FORECAST', 'LIVE'], ['KASI_PUBLIC_HOLIDAYS', 'ERROR'],
    ['KMA_VILAGE_FCST', 'STALE'], ['KTO_TOURAPI_EVENT', 'LIVE'], ['SEOUL_CITYDATA_CMRCL', 'LIVE'], ['SEOUL_CITYDATA_PPLTN', 'LIVE'],
    ['SEOUL_ESTIMATED_SALES', 'ERROR'], ['SEOUL_FOREIGN_PURPOSE_MOBILITY', 'OFFICIAL_HISTORICAL'],
    ['SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION', 'OFFICIAL_HISTORICAL'], ['SEOUL_STORE_DYNAMICS', 'STALE'], ['SEOUL_SUBWAY_RIDERSHIP', 'LIVE'],
  ].map(([sourceId, status]) => ({ sourceId, status }));
  assert.equal(production.some((source) => ['ERROR', 'DEGRADED', 'MISSING'].includes(source.status)), true, 'the previous rule shortened it');
  assert.equal(production.some(shortensSummaryRecheck), false);
  const realtimeDown = production.map((source) => source.sourceId === 'SEOUL_CITYDATA_PPLTN' ? { ...source, status: 'ERROR' } : source);
  assert.equal(realtimeDown.some(shortensSummaryRecheck), true, 'a realtime source in error still shortens it');
});

test('the open page decides its re-check with the shared rule, and only there', () => {
  // The summary reader moved verbatim from app/live-signals.tsx to app/live-summary.tsx (first-load split, 2026-10-14).
  const source = readFileSync(new URL('../app/live-summary.tsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('function summaryRecheckDelay('), source.indexOf('async function loadSummary('));
  assert.match(body, /value\.sources\?\.some\(shortensSummaryRecheck\)/);
  assert.doesNotMatch(body, /\["ERROR", "DEGRADED", "MISSING"\]/);
  // The cadences themselves are unchanged.
  assert.match(source, /const SUMMARY_RECHECK_MS = \{ empty: 60_000, partial: 120_000, normal: 300_000 \};/);
  // Coverage gaps in the A5 forecast still use the 2-minute re-check.
  assert.match(body, /airport\.forecastCoverage\?\.all !== "COMPLETE"/);
  assert.match(body, /airport\.arrivalForecast\?\.forecastCoverage\?\.all !== "COMPLETE"/);
});
