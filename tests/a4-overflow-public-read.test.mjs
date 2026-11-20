import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergePublicA4Terminal,projectOverflowA4} from '../lib/a4-overflow-public-read';
import {normalizeAirportCongestionT2} from '../lib/source-adapters';
const now=Date.parse('2026-11-19T08:12:00Z');
const raw={terminalId:'P03',gateId:'DG2_A',waitTime:'60+',waitLength:'12',occurtime:'2026-11-19T17:10:00+09:00'};
const row=await normalizeAirportCongestionT2(raw,'2026-11-19T08:11:00.000Z');
const legacy={terminal:'T2',zone:'DG1_A',observedAt:'2026-11-19T17:08:00+09:00',retrievedAt:'2026-11-19T08:09:00.000Z',waitTimeMinutes:5,waitTimeRaw:'5',waitingCount:7};
test('public projection preserves provider lower-bound, reported zero, and timestamps; malformed captures fail',()=>{
 const projected=projectOverflowA4('T2',[row],now);
 assert.deepEqual(projected,[{terminal:'T2',zone:'DG2_A',observedAt:row.observedAt,retrievedAt:row.retrievedAt,waitTimeMinutes:null,waitTimeRaw:'60+',waitingCount:12}]);
 assert.equal(projectOverflowA4('T2',[{...row,waitingCount:0}],now)[0].waitingCount,0);
 for(const patch of [{waitingCount:null},{waitingCount:-1},{waitTimeMinutes:60},{retrievedAt:'2026-11-19T08:09:00Z'},{sourceId:'other'},{qualityStatus:'PARTIAL'},{observedAt:'2026-11-19T17:13:00+09:00'}]) assert.equal(projectOverflowA4('T2',[{...row,...patch}],now),null);
 assert.equal(projectOverflowA4('T2',[row,row],now),null);
});
test('reads use one terminal generation, legacy on disabled/empty and marked legacy on corrupt shard',async()=>{
 const disabled=await mergePublicA4Terminal('T2',[legacy],undefined,now,12);
 assert.deepEqual(disabled,{rows:[legacy],degraded:false,shard:false});
 const ok=async()=>({state:'ok',rows:[row]});
 assert.deepEqual((await mergePublicA4Terminal('T2',[legacy],ok,now,24)).rows.map(x=>x.zone),['DG2_A']);
 const failure=await mergePublicA4Terminal('T2',[legacy],async()=>({state:'error'}),now,12);
 assert.deepEqual(failure,{rows:[legacy],degraded:true,shard:false});
 const partial=await mergePublicA4Terminal('T2',[legacy],async()=>({state:'ok',rows:[{...row,qualityStatus:'PARTIAL'}]}),now,12);
 assert.deepEqual(partial,{rows:[legacy],degraded:true,shard:false});
});
