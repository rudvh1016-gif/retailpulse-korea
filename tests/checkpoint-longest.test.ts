import test from 'node:test';
import assert from 'node:assert/strict';
import {longestCheckpoint} from '../lib/checkpoint-longest';
const now=Date.parse('2026-11-01T03:00:00Z');
const row=(zone:string,value:number,extra={})=>({terminal:'T2',zone,waitTimeMinutes:value,waitTimeRaw:String(value),freshness:'LIVE',observedAt:'2026-11-01T02:59:00Z',...extra});
test('longest excludes stale, closed, zero and contradictory records; retains ties',()=>{
 const result=longestCheckpoint('T2',[row('DG1_A',20),row('DG1_B',20),row('DG1_C',90,{freshness:'STALE'}),row('DG1_D',0),row('DG2_A',99,{waitTimeRaw:'closed'}),row('DG2_B',80),row('DG2_B',81)],now);
 assert.deepEqual(result,{keys:['1B','1A'],value:20,lowerBound:false,uncertain:false});
});
test('60+ remains a lower bound and does not assert a winner over 75 minutes',()=>{
 const result=longestCheckpoint('T2',[row('DG1_A',60,{waitTimeRaw:'60+'}),row('DG1_B',75)],now);
 assert.equal(result.uncertain,true);assert.deepEqual(result.keys,['1B','1A']);
 assert.equal(longestCheckpoint('T2',[row('DG1_A',60,{waitTimeRaw:'60+'}),row('DG1_B',25)],now).lowerBound,true);
});
test('unknown, zero, future, and old readings never create a current longest',()=>{
 assert.equal(longestCheckpoint('T2',[row('DG1_A',0),row('DG1_B',9,{observedAt:'2026-11-01T03:01:00Z'}),row('DG1_C',99,{observedAt:'2026-11-01T02:00:00Z'})],now).value,null);
});
test('an exact 60 is not presented as tied with 60+, and multiple lower bounds have no definite winner',()=>{
 const single=longestCheckpoint('T2',[row('DG1_A',60,{waitTimeRaw:'60+'}),row('DG1_B',60)],now);
 assert.deepEqual(single.keys,['1A']);assert.equal(single.uncertain,false);
 const multiple=longestCheckpoint('T2',[row('DG1_A',60,{waitTimeRaw:'60+'}),row('DG1_B',60,{waitTimeRaw:'60+'})],now);
 assert.equal(multiple.uncertain,true);assert.deepEqual(multiple.keys,['1B','1A']);
});
