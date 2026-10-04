import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectedZoneShares } from '../lib/airport-zone-shares';

test('all displayed regions use the full 272-flight denominator', () => {
  const shares=selectedZoneShares({WEST:131,CENTER:21,EAST:120,UNVERIFIED:0,total:272});
  assert.deepEqual(Object.values(shares).map(n=>n?.toFixed(1)),['48.2','7.7','44.1','0.0']);
});
test('unverified flights stay in every denominator', () => {
  const shares=selectedZoneShares({WEST:131,CENTER:21,EAST:120,UNVERIFIED:5,total:277});
  assert.equal(shares.WEST,131/277*100); assert.equal(shares.UNVERIFIED,5/277*100);
  assert.deepEqual(selectedZoneShares({WEST:0,CENTER:0,EAST:0,UNVERIFIED:5,total:5}),{WEST:0,CENTER:0,EAST:0,UNVERIFIED:100});
});
test('zero total is undefined percentage, while rounded thirds are 99.9 percent', () => {
  assert.deepEqual(selectedZoneShares({WEST:0,CENTER:0,EAST:0,UNVERIFIED:0,total:0}),{WEST:null,CENTER:null,EAST:null,UNVERIFIED:null});
  const shares=selectedZoneShares({WEST:1,CENTER:1,EAST:1,UNVERIFIED:0,total:3});
  assert.equal(shares.CENTER?.toFixed(1),'33.3');
});
