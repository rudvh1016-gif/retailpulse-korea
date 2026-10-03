import test from 'node:test';
import assert from 'node:assert/strict';
import {airportScene} from '../lib/airport-scene';
import {zoneCountries} from '../lib/airport-zone-countries';
import {departureMap,type MapFlight} from '../lib/airport-departure-map';
import {destinationOf} from '../lib/airport-destinations';
test('scene uses airport timezone at both day boundaries, independent of device timezone',()=>{
 for(const [iso,expected] of [['2026-10-03T20:59:59Z','night'],['2026-10-03T21:00:00Z','day'],['2026-10-04T08:59:59Z','day'],['2026-10-04T09:00:00Z','night']] as const)assert.equal(airportScene(Date.parse(iso)),expected);
});
test('country leaders include every third-place tie, unknowns and zero zones; totals reconcile',()=>{
 const flights=[] as MapFlight[];
 for(const [country,count] of [['JP',5],['CN',4],['US',3],['VN',3],[null,1]] as const)for(let n=0;n<count;n++)flights.push({side:'WEST',destination:country?{country}:null} as MapFlight);
 const zones=zoneCountries(flights);assert.equal(zones[0].total,16);assert.deepEqual(zones[0].leaders.map(c=>c.country),['JP','CN','US','VN']);assert.equal(zones[0].countries.reduce((s,c)=>s+c.flights,0),16);assert.equal(zones.slice(1).reduce((s,z)=>s+z.total,0),0);
});
test('explicit building scopes preserve unknown and deduplicate codeshares without changing legacy T1 grouping',()=>{
 const date='2026-10-04';const base={scheduledAt:date+'T10:00:00+09:00',retrievedAt:date+'T01:00:00Z',status:'scheduled',direction:'departure'};
 const rows=[{...base,physicalFlightId:'main',terminal:'T1',gate:'1'},{...base,physicalFlightId:'concourse',terminal:'CONCOURSE',gate:null},{...base,physicalFlightId:'t2',terminal:'T2',gate:'215'},{...base,physicalFlightId:'unknown',terminal:null,gate:null},{...base,physicalFlightId:'concourse',terminal:'CONCOURSE',gate:null},{...base,physicalFlightId:'cancel',terminal:'T2',status:'cancelled'}];
 const input={date,nextDate:'2026-10-05',terminal:'T1' as const,window:{startMin:0,endMin:1440},rows};
 const all=departureMap({...input,buildingScope:'all'});assert.equal(all.flights.length,4);assert.equal(all.sides.total,4);assert.equal(all.unknownBuilding,1);
 assert.deepEqual(departureMap({...input,buildingScope:'CONCOURSE'}).flights.map(f=>f.id),['concourse']);
 assert.deepEqual(departureMap({...input,buildingScope:'T1'}).flights.map(f=>f.id),['main']);
 assert.equal(departureMap(input).flights.length,2);
});
test('unknown destination cannot displace a real country from the top-three ranks',()=>{
 const flights=[] as MapFlight[];for(const [country,count] of [[null,100],['JP',5],['CN',4],['US',3],['VN',3]] as const)for(let n=0;n<count;n++)flights.push({side:'WEST',destination:country?{country}:null} as MapFlight);
 const west=zoneCountries(flights)[0];assert.equal(west.unknown,100);assert.deepEqual(west.leaders.map(c=>c.country),['JP','CN','US','VN']);assert.equal(west.total,115);
});
test('verified IATA aliases resolve through the existing destination table; unverified values stay unknown',()=>{
 assert.equal(destinationOf('NRT')?.country,'JP');assert.equal(destinationOf(' nrt ')?.country,'JP');assert.equal(destinationOf('not-an-evidenced-airport'),null);
});
