import assert from 'node:assert/strict';
import test from 'node:test';
import {projectDepartureCongestion} from '../lib/airport-congestion-observation';
import {queueHeat,queueHeatLabel} from '../lib/airport-queue-heat';
import {longestCheckpoint} from '../lib/checkpoint-longest';
const now=Date.parse('2026-11-01T03:00:00Z');
const row={terminal:'T2',zone:'DG1_A',waitingCount:0,waitTimeMinutes:null,waitTimeRaw:'60+',observedAt:'2026-11-01T02:59:00Z',retrievedAt:'2026-11-01T02:59:30Z'};
const source={sourceId:'INCHEON_DEPARTURE_CONGESTION_T2',status:'LIVE',eventAt:row.observedAt,retrievedAt:row.retrievedAt};
test('projection preserves original zero, raw range and provider clocks without manufacturing minutes',()=>{
 const frozen=structuredClone(row),[out]=projectDepartureCongestion([row],[source],now);
 assert.deepEqual(row,frozen);assert.equal(out.waitingCount,0);assert.equal(out.waitTimeMinutes,null);assert.equal(out.waitTimeRaw,'60+');
 assert.equal(out.observedAt,row.observedAt);assert.equal(out.retrievedAt,row.retrievedAt);assert.equal(out.freshness,'LIVE');assert.equal(queueHeat(out,now).level,'very-busy');
});
for(const [minutes,status] of [[20,'LIVE'],[20+1/60_000,'STALE']] as const)test(`20-minute exact boundary ${minutes}`,()=>{
 const observedAt=new Date(now-minutes*60_000).toISOString(),[out]=projectDepartureCongestion([{...row,observedAt}],[{...source,eventAt:observedAt}],now);
 assert.equal(out.freshness,status);assert.equal(queueHeat(out,now).state,status==='LIVE'?'current':'stale');
});
for(const status of ['ERROR','DEGRADED','MISSING','NEEDS_KEY','PARTIAL'])test(`known ${status} cannot supply current wait, color or longest`,()=>{
 const [out]=projectDepartureCongestion([row],[{...source,status}],now);
 assert.equal(out.freshness,'STALE');assert.equal(out.collectionStatus,'FAILED');assert.deepEqual(queueHeat(out,now),{level:'neutral',state:'failed'});
 assert.equal(longestCheckpoint('T2',[out],now).value,null);
 for(const lang of ['ko','en','zh','ja'])assert.ok(queueHeatLabel(queueHeat(out,now),lang));
});
for(const [name,changedRow,changedSource] of [
 ['future observation',{observedAt:'2026-11-01T03:00:00.001Z'},{}],
 ['future retrieval',{retrievedAt:'2026-11-01T03:00:00.001Z'},{}],
 ['unreadable observation',{observedAt:'invalid'},{}],
 ['future health retrieval',{}, {retrievedAt:'2026-11-01T03:00:00.001Z'}],
 ['future health observation',{}, {eventAt:'2026-11-01T03:00:00.001Z'}],
 ['unknown health',{}, {status:'UNKNOWN'}],
] as const)test(`${name} is never LIVE`,()=>{
 const [out]=projectDepartureCongestion([{...row,...changedRow}],[{...source,...changedSource}],now);
 assert.equal(out.freshness,'STALE');assert.equal(out.collectionStatus,'UNKNOWN');assert.equal(queueHeat(out,now).state,'unavailable');
});
test('missing health is unknown, and a failed T1 does not downgrade T2',()=>{
 assert.equal(projectDepartureCongestion([row],[],now)[0].collectionStatus,'UNKNOWN');
 const rows=projectDepartureCongestion([{...row,terminal:'T1',zone:'DG2_E'},row],[{...source,sourceId:'INCHEON_DEPARTURE_CONGESTION',status:'ERROR'},source],now);
 assert.deepEqual(rows.map(value=>value.collectionStatus),['FAILED','LIVE']);
});
test('existing client readings age out without requiring another HTTP response',()=>{
 const [out]=projectDepartureCongestion([row],[source],now);
 assert.equal(queueHeat(out,now).state,'current');assert.equal(queueHeat(out,now+20*60_000).state,'stale');
});
