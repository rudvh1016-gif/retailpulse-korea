import assert from 'node:assert/strict';
import {test} from 'node:test';
import {a1CardEvidence,prepareA1CurrentSnapshot,readA1CardEvidence} from '../lib/a1-current-snapshot';
import {dailyFlightProfile} from '../lib/airport-day-profile';
import {glanceFlights} from '../lib/airport-glance';
import {currentGlanceSnapshot} from '../lib/glance-week-reference';
import type {CanonicalAirportFlight} from '../lib/source-adapters';

const day='2026-11-19',clock='2026-11-19T02:28:59.468Z';
const flight=(n:number,patch:Partial<CanonicalAirportFlight>={}):CanonicalAirportFlight=>({
 sourceId:'INCHEON_FLIGHT_DETAIL',direction:'departure',physicalFlightId:n.toString(16).padStart(64,'0'),
 flightNumber:'KE'+n,airlineCode:'KE',airportCode:'NRT',status:'scheduled',gate:'250',terminal:'T2',
 checkinCounter:null,aircraftSubtype:null,aircraftRegNo:null,retrievedAt:clock,scheduledAt:`${day}T09:00:00+09:00`,...patch,
} as CanonicalAirportFlight);
const scan=(records:CanonicalAirportFlight[],trackedToday=records.length)=>({targetDate:day,records,trackedToday});
const detail=`recent 2026-11-16..${day}; today unique physical 2; range unique physical 6;`;
test('exact scan excludes an unproven retained row without modifying history',async()=>{
 const cancelled=flight(2,{status:'cancelled'}),old=flight(3,{retrievedAt:'2026-11-18T15:23:50.278Z'});
 const exact=[flight(1),cancelled],raw=[...exact,old],before=structuredClone(raw);
 const snapshot=prepareA1CurrentSnapshot(scan(exact));
 assert.ok(snapshot);assert.equal(snapshot.profile.complete,false);assert.equal(snapshot.profile.cancelled,1);
 assert.equal(snapshot.profile.T2.total,1);assert.equal(glanceFlights(day,snapshot.flights,'T2').total,1);
 const rawProfile=dailyFlightProfile(raw,day,false);
 const witness={startedAt:clock,finishedAt:'2026-11-19T02:32:00Z',status:'SUCCESS',healthStatus:'LIVE',healthRetrievedAt:clock,detail};
 assert.equal(rawProfile.T2.total,2);
 assert.equal(currentGlanceSnapshot({profile:rawProfile},day,witness,'2026-11-19T07:00:00Z'),null);
 assert.equal(currentGlanceSnapshot(snapshot,day,witness,'2026-11-19T07:00:00Z')?.totals.T2,1);
 const marker=await a1CardEvidence(scan(exact));
 assert.ok(marker);assert.equal(marker,await a1CardEvidence(scan([...exact].reverse())));
 assert.deepEqual(readA1CardEvidence(detail+marker,2),{all:1,T1:0,CONCOURSE:0,T2:1});
 for(const bad of [detail,detail+marker+'x',detail+marker.replace('glance-v1','glance-v2'),'x'.repeat(500)+marker])
  assert.equal(readA1CardEvidence(bad,2),null);
 assert.equal(readA1CardEvidence(detail+marker,3),null);
 assert.deepEqual(raw,before);
});
test('adjacent dates are excluded and invalid exact-population claims fail closed',()=>{
 const past=flight(3,{scheduledAt:'2026-11-18T16:00:00+09:00'}),a=flight(1),b=flight(2);
 assert.deepEqual(prepareA1CurrentSnapshot(scan([past,b,a],2)),prepareA1CurrentSnapshot(scan([a,b],2)));
 for(const candidate of [scan([a],2),scan([],0),scan([a,a]),scan([a,flight(2,{retrievedAt:'2026-11-19T03:00:00Z'})]),
  scan([flight(1,{retrievedAt:'2026-11-18T11:00:00Z'})]),scan([flight(1,{direction:'arrival'})]),
  scan([flight(1,{sourceId:'INCHEON_OTHER'})]),scan([flight(1,{physicalFlightId:'fake'})]),
  scan([flight(1,{scheduledAt:`${day}T24:00:00+09:00`})]),scan([flight(1,{scheduledAt:`${day}T09:00:00Z`})]),
  scan(Array.from({length:1201},(_,n)=>flight(n+1))),scan([flight(1,{airportCode:'x'.repeat(500_000)})]),
  {...scan([a]),targetDate:'2026-11-31'}])assert.equal(prepareA1CurrentSnapshot(candidate),null);
});
