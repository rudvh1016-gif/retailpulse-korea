import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFacilityEnvelope} from '../scripts/facility-contract-envelope.mjs';
test('locker response/header/body wrapper reports structure without provider values',()=>{
  const value=inspectFacilityEnvelope({response:{header:{resultCode:'00'},body:{totalCount:2,items:{item:[{totCrtrDt:'PRIVATE-TIME',station:'PRIVATE-STATION'},{totCrtrDt:'PRIVATE-TIME',station:'PRIVATE-STATION'}]}}}},'lockers');
  assert.equal(value.status,'STRUCTURE_OK');assert.equal(value.rows,2);assert.equal(value.total,2);
  assert.deepEqual(value.envelopeKeys,['response']);assert.deepEqual(value.rowFields,['totCrtrDt','station']);
  assert.ok(!JSON.stringify(value).includes('PRIVATE'));
});
test('legacy service wrapper and a singleton row preserve actual row count',()=>{
  const value=inspectFacilityEnvelope({getFcLckr:{RESULT:{CODE:'INFO-000'},list_total_count:1,row:{TOT_CRTR_DT:'PRIVATE'}}},'lockers');
  assert.equal(value.rows,1);assert.equal(value.status,'STRUCTURE_OK');
});
test('missing rows, error code, partial result and missing total remain unverified',()=>{
  for(const body of [{totalCount:0,items:{item:[]}},{totalCount:2,items:{item:{totCrtrDt:'x'}}},{items:{item:{totCrtrDt:'x'}}}])
    assert.equal(inspectFacilityEnvelope({response:{header:{resultCode:'00'},body}},'lockers').status,'CONTRACT_UNVERIFIED');
  assert.equal(inspectFacilityEnvelope({response:{header:{resultCode:'03'},body:{totalCount:1,items:{item:{totCrtrDt:'x'}}}}},'lockers').status,'CONTRACT_UNVERIFIED');
});
test('parking shape preserves capacity zero as a field, without inventing available spaces',()=>{
  const value=inspectFacilityEnvelope({response:{header:{resultCode:'00'},body:{totalCount:1,items:{item:{floor:'PRIVATE',parking:0,parkingarea:0,datetm:'20261009235900.0'}}}}},'parking');
  assert.equal(value.status,'STRUCTURE_OK');assert.ok(!('availableSpaces' in value));assert.ok(!JSON.stringify(value).includes('PRIVATE'));
});
