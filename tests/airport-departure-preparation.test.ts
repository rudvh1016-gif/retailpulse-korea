import test from 'node:test';import assert from 'node:assert/strict';
import {departurePreparation,type DeparturePreparationInput} from '../lib/airport-departure-preparation';
test('all 108 route/choice combinations preserve conditional customs and security boundaries',()=>{
 for(const route of ['T1','T2','T1_CONCOURSE','UNKNOWN'] as const)for(const checkedBaggage of ['YES','NO','UNKNOWN'] as const)for(const taxRefund of ['YES','NO','UNKNOWN'] as const)for(const dutyFreePickup of ['YES','NO','UNKNOWN'] as const){
  const input:DeparturePreparationInput={route,checkedBaggage,taxRefund,dutyFreePickup},plan=departurePreparation(input),ids=plan.steps.map(s=>s.id);
  if(route==='UNKNOWN'){assert.equal(plan.supported,false);assert.deepEqual(ids,['CONFIRM']);continue;}
  assert.equal(plan.supported,true);assert.equal(ids.includes('PICKUP'),dutyFreePickup==='YES');assert.equal(ids.includes('REFUND'),taxRefund==='YES');assert.equal(ids.includes('BAG_DROP'),checkedBaggage==='YES');
  assert.equal(ids.includes('CHECKED_CUSTOMS'),taxRefund==='YES'&&checkedBaggage!=='NO');
  for(const step of plan.steps){if(step.id==='CHECKED_CUSTOMS'){assert.equal(step.conditional,true);assert.equal(step.phase,'BEFORE_SECURITY');assert.ok(ids.indexOf(step.id)<ids.indexOf('SECURITY'));if(ids.includes('BAG_DROP'))assert.ok(ids.indexOf(step.id)<ids.indexOf('BAG_DROP'));}if(step.id==='REFUND'||step.id==='PICKUP')assert.equal(step.phase,'AFTER_SECURITY');}
  assert.ok(ids.indexOf('SECURITY')<ids.indexOf('IMMIGRATION'));assert.equal(ids.at(-1),'GATE');
 }
});
