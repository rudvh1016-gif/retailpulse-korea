import test from 'node:test';
import assert from 'node:assert/strict';
import {checkpointLayout} from '../lib/airport-checkpoint-layout';
const row=(terminal:string,zone:string,waitTimeMinutes:number,observedAt='2026-10-11T08:00:00+09:00')=>({terminal,zone,waitTimeMinutes,waitTimeRaw:String(waitTimeMinutes),observedAt,freshness:'LIVE'});
test('T2 pairs use source identities and retain location order instead of wait ranking',()=>{
 const groups=checkpointLayout('T2',[row('T2','DG1_A',60),row('T2','DG2_D',0),row('T1','DG2_E',20)]);
 assert.deepEqual(groups.map(group=>group.map(slot=>slot.key)),[['2D','2C'],['2B','2A'],['1D','1C'],['1B','1A']]);
 assert.equal(groups[0][0].row?.waitTimeMinutes,0);assert.equal(groups[3][1].row?.waitTimeMinutes,60);assert.equal(groups[0][1].row,null);
});
test('T1 local east/west aliases do not turn flight gates or unverified IDs into checkpoints',()=>{
 const groups=checkpointLayout('T1',[row('T1','5W',11),row('T1','DG5_E',9),row('T1','291',80),row('T1','DG6_W',90)]);
 assert.equal(groups[0][0].row?.waitTimeMinutes,11);assert.equal(groups[0][1].row?.waitTimeMinutes,9);
 assert.equal(groups.flat().filter(slot=>slot.row).length,2);
});
test('latest source clock wins; contradictory latest values are withheld, never averaged',()=>{
 const groups=checkpointLayout('T2',[row('T2','DG2_D',1),row('T2','DG2_D',9,'2026-10-11T08:10:00+09:00'),row('T2','DG2_D',12,'2026-10-11T08:10:00+09:00')]);
 assert.equal(groups[0][0].row,null);assert.equal(groups[0][0].ambiguous,true);
});
