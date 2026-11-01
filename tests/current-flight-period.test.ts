import test from 'node:test';
import assert from 'node:assert/strict';
import {currentFlightPeriod,currentDestinationChanges} from '../lib/current-flight-period';
import {buildAirportFlightMonth,monthlyMetric} from '../lib/airport-monthly-flights';
import {mainBuildingMonth} from '../lib/airport-monthly-building';
const day='2026-11-01',at=day+'T00:00:00Z',now=day+'T01:00:00Z';
const row=(date:string,id:string,terminal:string,gate:string,airportCode:string)=>({physicalFlightId:id,flightNumber:'KE100',operatingFlight:'KE100',airlineCode:'KE',terminal,gate,airportCode,scheduledAt:date+'T12:00:00+09:00',retrievedAt:at,status:'scheduled',direction:'departure'});
const dates=Array.from({length:31},(_,i)=>`2026-10-${String(i+1).padStart(2,'0')}`);
const previous=buildAirportFlightMonth('2026-10',day,dates.flatMap(date=>[row(date,date+'A','T1','10','NRT'),row(date,date+'B','CONCOURSE','110','PVG'),row(date,date+'C','T2','230','SFO')]),new Set(dates));
const flights=[row(day,'a','T1','10','NRT'),row(day,'b','CONCOURSE','110','PVG'),row(day,'c','T2','230','NRT'),row(day,'d','UNKNOWN','','ZZZ')];
const payload={basis:'COLLECTED_FLIGHT_RECORDS',serviceDateKst:day,retrievedAt:at,truncated:false,flights};
const reference={day,previousDay:'2026-10-25',passengers:{all:null,T1:null,T2:null},flights:null,selectedFlights:{all:4,T1:1,T2:1,CONCOURSE:1},selectedFlightSnapshot:{day,retrievedAt:at,provisional:true as const}};

test('Nov 1 zone and country periods use one witnessed day vs 31 included October days without persisting',()=>{
 const original=JSON.stringify({previous,payload});const result=currentFlightPeriod(day,payload,reference,previous,now);
 assert.ok(result);assert.deepEqual(result.period.includedDays,[day]);assert.equal(result.period.scopes.ALL.total,4);assert.equal(result.period.scopes.T1.total,2);
 const main=mainBuildingMonth(result.period);assert.equal(main?.scopes.T1.total,1);assert.equal(result.period.scopes.CONCOURSE.total,1);assert.equal(result.period.scopes.UNKNOWN.total,1);
 assert.deepEqual(monthlyMetric(result.period,previous,'ALL',c=>c.total),{previous:3,current:4,percent:(4/3-1)*100});
 for(const scope of ['ALL','T1','T2','CONCOURSE','UNKNOWN'] as const)assert.equal(Object.values(result.period.scopes[scope].sides).reduce((a,b)=>a+b,0),result.period.scopes[scope].total);
 assert.equal(JSON.stringify({previous,payload}),original);
});
test('unknown destinations remain in denominators and do not invent zero-departure countries',()=>{
 const result=currentFlightPeriod(day,payload,reference,previous,now);assert.ok(result);
 assert.equal(result.period.scopes.ALL.destinationCountries.UNKNOWN,1);
 assert.ok(!result.comparableCountries.ALL.includes('US'));assert.ok(result.comparableCountries.ALL.includes('JP'));
 assert.equal(result.period.scopes.ALL.destinationSides?.UNKNOWN.UNVERIFIED,1);
});
test('duplicates and cancelled records do not inflate the witnessed scope totals',()=>{
 const records=[...flights,{...flights[0],retrievedAt:day+'T00:00:01Z'},{...flights[0],physicalFlightId:'cancelled',status:'cancelled'}];
 const result=currentFlightPeriod(day,{...payload,flights:records},reference,previous,now);assert.ok(result);assert.equal(result.period.scopes.ALL.total,4);assert.equal(result.period.cancelled,1);
});
test('missing, truncated, future, held and mismatched collection evidence stays unavailable',()=>{
 for(const value of [null,{...payload,truncated:true},{...payload,basis:'OFFICIAL_DEPARTURE_SCHEDULE'},{...payload,retrievedAt:day+'T00:01:00Z'},{...payload,retrievedAt:day+'T02:00:00Z'}])assert.equal(currentFlightPeriod(day,value,reference,previous,now),null);
 assert.equal(currentFlightPeriod(day,payload,null,previous,now),null);
 assert.equal(currentFlightPeriod(day,payload,{...reference,selectedFlights:{...reference.selectedFlights!,T1:2}},previous,now),null);
 assert.equal(currentFlightPeriod(day,payload,reference,previous,'2026-11-02T01:00:00Z'),null);
 assert.equal(currentFlightPeriod(day,payload,reference,undefined,now),null);
});
test('malformed prior zone counts are unavailable rather than a false zero share',()=>{
 const broken=structuredClone(previous);broken.scopes.ALL.sides.EAST++;
 assert.equal(currentFlightPeriod(day,payload,reference,broken,now),null);
});

test('full country menus preserve known countries and mark unconfirmed absences with null, not zero',()=>{const result=currentFlightPeriod(day,payload,reference,previous,now);assert.ok(result);const us=currentDestinationChanges(result.period,previous,'ALL').find(r=>r.country==='US');assert.equal(us?.previous,1);assert.equal(us?.current,null);assert.equal(us?.delta,null);assert.equal(us?.sides.EAST.current,null);});

test('a genuinely witnessed empty day stays a measured zero, unlike a missing snapshot',()=>{const proof={...reference,selectedFlights:{all:0,T1:0,T2:0,CONCOURSE:0}};const result=currentFlightPeriod(day,{...payload,flights:[]},proof,previous,now);assert.ok(result);assert.equal(result.period.scopes.ALL.total,0);assert.equal(monthlyMetric(result.period,previous,'ALL',c=>c.total).current,0);assert.equal(currentDestinationChanges(result.period,previous,'ALL').find(r=>r.country==='US')?.current,0);});

test('inconsistent cross tables and included-date metadata are not presented as complete comparisons',()=>{const cross=structuredClone(previous);cross.scopes.ALL.destinationSides!.JP.EAST++;assert.equal(currentFlightPeriod(day,payload,reference,cross,now),null);const coverage=structuredClone(previous);coverage.eligibleDays=30;assert.equal(currentFlightPeriod(day,payload,reference,coverage,now),null);const missing=structuredClone(previous);delete (missing.scopes.ALL.sides as Partial<typeof missing.scopes.ALL.sides>).CENTER;assert.equal(currentFlightPeriod(day,payload,reference,missing,now),null);});
