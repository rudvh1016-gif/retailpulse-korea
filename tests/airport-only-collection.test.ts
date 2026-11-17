import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSeoulRealtime, collectSeoulForeignPresence, collectForeignPurposeMobility, collectEstimatedSales, collectStoreDynamics, collectTourismEvents, type CollectorEnv } from '../lib/collector';
import { runPopulationPredictions, matchPopulationOutcomes, updatePopulationCoverage } from '../lib/population-predictions';
import { refreshCommercialMonths } from '../lib/commercial-monthly-store';
import { runSelectedProductionSources } from '../lib/production-runner';
import { SEOUL_ONLY_SOURCES, isSeoulOnlySourceId } from '../lib/product-scope';
import { SOURCE_RECOVERY_CAPABILITIES, PRODUCTION_SOURCE_IDS } from '../lib/recovery-capability';
import { SOURCE_CENSUS } from '../lib/source-census';

test('retired direct collectors and materializers perform zero provider/DB I/O', async () => {
  const forbidden = new Proxy({}, {get() {throw new Error('unexpected I/O');}});
  const env = forbidden as CollectorEnv;
  for(const collect of [collectSeoulRealtime, collectSeoulForeignPresence, collectForeignPurposeMobility, collectEstimatedSales, collectStoreDynamics, collectTourismEvents]) {
    const result = await collect(env);
    assert.equal(result.status, 'SKIPPED_PRODUCT_DISABLED');
    assert.equal(result.records, 0);
    assert.equal(result.providerRequests, 0);
    assert.equal(result.lastGoodPreserved, true);
  }
  const db = forbidden as D1Database;
  assert.equal((await runPopulationPredictions(db)).status, 'SKIPPED_PRODUCT_DISABLED');
  await matchPopulationOutcomes(db); await updatePopulationCoverage(db);
  assert.equal((await refreshCommercialMonths(db)).readRows, 0);
});
test('explicit retired names cannot bypass policy; shared airport/subway/weather remain selectable', async () => {
  const calls: string[] = [];
  const runners = Object.fromEntries([...SEOUL_ONLY_SOURCES, 'airport_congestion', 'airport_congestion_t2', 'weather', 'subway_ridership'].map(name => [name, async () => {calls.push(name);return {status:'SUCCESS',records:1};}]));
  const results = await runSelectedProductionSources({} as CollectorEnv, [...SEOUL_ONLY_SOURCES, 'airport_congestion', 'airport_congestion_t2', 'weather', 'subway_ridership'], new Date(), runners);
  assert.deepEqual(calls, ['airport_congestion', 'airport_congestion_t2', 'weather', 'subway_ridership']);
  assert.equal(results.filter(row=>row.status==='SKIPPED_PRODUCT_DISABLED').length, SEOUL_ONLY_SOURCES.length);
});
test('retired sources no longer cause production missing-source/recovery expectations', () => {
  for(const id of PRODUCTION_SOURCE_IDS) assert.equal(isSeoulOnlySourceId(id), false);
  for(const row of SOURCE_CENSUS) assert.equal(isSeoulOnlySourceId(row.sourceId), false);
  for(const row of SOURCE_RECOVERY_CAPABILITIES) assert.equal(isSeoulOnlySourceId(row.sourceId), false);
  assert.ok(PRODUCTION_SOURCE_IDS.includes('SEOUL_SUBWAY_RIDERSHIP'));
  assert.ok(PRODUCTION_SOURCE_IDS.includes('KMA_VILAGE_FCST'));
});
