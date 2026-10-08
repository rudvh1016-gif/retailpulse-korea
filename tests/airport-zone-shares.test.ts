import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildingZoneCounts, selectedZoneShares } from '../lib/airport-zone-shares';
import { departureMap } from '../lib/airport-departure-map';

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

test('building denominators use only normalized flights in the selected window', () => {
  const date='2026-08-31';
  const base={scheduledAt:date+'T09:30:00+09:00',retrievedAt:date+'T01:00:00Z',status:'scheduled',direction:'departure'};
  const row=(id:string,terminal:string|null,gate:string|null)=>({...base,physicalFlightId:id,terminal,gate});
  const map=departureMap({date,nextDate:'2026-09-01',terminal:'T1',buildingScope:'all',window:{startMin:540,endMin:600},rows:[
    row('w','T1','29'), {...row('w','T1','29'),retrievedAt:date+'T02:00:00Z'}, row('c','T1','26'),row('e','T1','5'),
    row('t2e','T2','280'),row('t2u','T2',null),row('con','CONCOURSE','121'),row('unknown',null,null),
    {...row('cancel','T2','215'),status:'cancelled'}, {...row('outside','T1','29'),scheduledAt:date+'T10:00:00+09:00'},
  ]});
  const counts=buildingZoneCounts(map);
  assert.equal(map.flights.length,7);
  assert.deepEqual(counts.T1,{WEST:1,CENTER:1,EAST:1,UNVERIFIED:0,total:3});
  assert.deepEqual(counts.T2,{WEST:0,CENTER:0,EAST:1,UNVERIFIED:1,total:2});
  assert.deepEqual(counts.CONCOURSE,{WEST:1,CENTER:0,EAST:0,UNVERIFIED:0,total:1});
  assert.equal(selectedZoneShares(counts.T2).EAST,50);
  assert.equal(selectedZoneShares(counts.CONCOURSE).WEST,100);
  assert.equal(map.unknownBuilding,1);
  const empty=buildingZoneCounts({flights:[]});
  assert.equal(selectedZoneShares(empty.T1).WEST,null);
});
