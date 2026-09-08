import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passengerReferenceSum as sum} from '../lib/passenger-reference-sum';
const date='2026-09-09';
const rows=[{terminal:'T1',serviceDate:date,expectedTransferPassengers:559},{terminal:'T2',serviceDate:date,expectedTransferPassengers:10485}];
test('reference arithmetic retains both components for T1, T2 and all',()=>{
  assert.deepEqual(sum(39509,'COMPLETE',date,'T2',rows),{hall:39509,transfer:10485,total:49994});
  assert.deepEqual(sum(47198,'COMPLETE',date,'T1',rows),{hall:47198,transfer:559,total:47757});
  assert.deepEqual(sum(86707,'COMPLETE',date,'all',rows),{hall:86707,transfer:11044,total:97751});
});
test('missing, wrong-date and duplicate transfer rows cannot create a sum',()=>{
  for(const data of [[],rows.slice(0,1),[rows[0],rows[0]],rows.map(r=>({...r,serviceDate:'2026-09-10'}))]) {
    assert.equal(sum(86707,'COMPLETE',date,'all',data),null);
  }
  assert.equal(sum(39509,'COMPLETE',date,'T2',rows.slice(0,1)),null);
});
test('invalid values and partial hall coverage cannot create arithmetic totals',()=>{
  for(const hall of [null,undefined,NaN,-1,Infinity,0.5]) assert.equal(sum(hall,'COMPLETE',date,'T2',rows),null);
  assert.equal(sum(39509,'PARTIAL',date,'T2',rows),null);
  for(const value of [NaN,-1,0.5,Infinity]) assert.equal(sum(39509,'COMPLETE',date,'T2',[{...rows[1],expectedTransferPassengers:value}]),null);
});
test('an explicit source zero is distinct from missing and inputs stay unchanged',()=>{
  const original=structuredClone(rows);
  assert.deepEqual(sum(39509,'COMPLETE',date,'T2',[{...rows[1],expectedTransferPassengers:0}]),{hall:39509,transfer:0,total:39509});
  sum(39509,'COMPLETE',date,'T2',rows);
  assert.deepEqual(rows,original);
});
