import test from 'node:test';
import assert from 'node:assert/strict';
import { queueHeat, queueHeatLabel } from '../lib/airport-queue-heat';
const now=Date.parse('2026-10-09T08:28:00+09:00');
const at='2026-10-09T08:21:00+09:00';
test('reported T1 waits get minute colors; head counts never determine their grade',()=>{
 for(const [zone,minutes,level] of [['3E',31,'normal'],['3W',30,'normal'],['2E',14,'clear'],['5W',14,'clear']] as const){
  const reading={terminal:'T1',zone,waitTimeMinutes:minutes,waitTimeRaw:String(minutes),observedAt:at,freshness:'LIVE'};
  const heat=queueHeat(reading,now);assert.equal(heat.level,level);assert.equal(heat.state,'current');assert.equal(heat.basis,'KORETAIL_MINUTES');
  for(const lang of ['ko','en','zh','ja'])assert.match(queueHeatLabel(heat,lang),/코리테일|KORETAIL/);
 }
});
test('T1 retains missing/stale/closed/unknown guards and the same minute boundaries',()=>{
 const base={terminal:'T1',zone:'3E',waitTimeMinutes:31,waitTimeRaw:'31',observedAt:at,freshness:'LIVE'};
 for(const [minutes,level] of [[0,'clear'],[19,'clear'],[20,'normal'],[39,'normal'],[40,'busy'],[59,'busy'],[60,'very-busy']] as const)assert.equal(queueHeat({...base,waitTimeMinutes:minutes,waitTimeRaw:String(minutes)},now).level,level);
 for(const patch of [{waitTimeMinutes:null,waitTimeRaw:null},{waitTimeRaw:'closed'},{freshness:'STALE'},{observedAt:'2026-10-09T08:29:00+09:00'},{zone:'P01'}])assert.equal(queueHeat({...base,...patch},now).level,'neutral');
 assert.equal(queueHeat({...base,terminal:'T2',zone:'DG1_A'},now).basis,undefined);
});
