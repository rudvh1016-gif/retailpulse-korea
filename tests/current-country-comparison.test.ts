import test from 'node:test';import assert from 'node:assert/strict';
import {currentCountryComparison} from '../lib/glance-current-country-comparison';
import type {AirportFlightMonth} from '../lib/airport-monthly-flights';
import type {GlanceWeekReference} from '../lib/glance-week-comparison';
const day='2026-11-01',at=day+'T00:00:00Z',now=day+'T01:00:00Z';
const counts={total:62,sides:{EAST:0,WEST:0,CENTER:0,UNVERIFIED:62},airlines:{},registrationCountries:{},destinationCountries:{JP:31,CN:31}};
const previous={month:'2026-10',from:'2026-10-01',through:'2026-10-31',eligibleDays:31,includedDays:Array.from({length:31},(_,i)=>`2026-10-${String(i+1).padStart(2,'0')}`),excludedDays:[],cancelled:0,airlineNames:{},scopes:{ALL:counts,T1:counts,T2:counts,CONCOURSE:counts,UNKNOWN:counts}} satisfies AirportFlightMonth;
const payload={basis:'COLLECTED_FLIGHT_RECORDS',serviceDateKst:day,retrievedAt:at,truncated:false};
const reference={day,previousDay:'2026-10-25',passengers:{all:null,T1:null,T2:null},flights:null,selectedFlights:{all:4,T1:4,T2:4,CONCOURSE:4},selectedFlightSnapshot:{day,retrievedAt:at,provisional:true}} satisfies GlanceWeekReference;
const data={total:4,countries:[{country:'JP',flights:3},{country:'CN',flights:1}]};
test('Nov 1 one-day observations compare with all 31 October included days',()=>{
 const r=currentCountryComparison(day,data,previous,'all',payload,reference,now);
 assert.equal(r.status,'READY');assert.equal(r.days,1);assert.equal(r.previousDays,31);
 assert.deepEqual(r.rows.find(x=>x.country==='JP'),{country:'JP',current:3,previous:1,delta:2});
});
test('missing, truncated, held, mismatched and cross-snapshot data never become zeros',()=>{
 for(const p of [null,{...payload,truncated:true},{...payload,basis:'OFFICIAL_DEPARTURE_SCHEDULE'},{...payload,retrievedAt:day+'T00:01:00Z'}])assert.equal(currentCountryComparison(day,data,previous,'all',p,reference,now).status,'UNAVAILABLE');
 assert.equal(currentCountryComparison(day,null,previous,'all',payload,reference,now).status,'UNAVAILABLE');
 assert.equal(currentCountryComparison(day,data,undefined,'all',payload,reference,now).status,'UNAVAILABLE');
 assert.equal(currentCountryComparison(day,data,previous,'all',payload,null,now).status,'UNAVAILABLE');
 assert.equal(currentCountryComparison(day,{...data,total:5},previous,'all',payload,reference,now).status,'UNAVAILABLE');
});
test('unknown destinations remain separate and absent categories on that side are not zero',()=>{
 const p=structuredClone(previous);p.scopes.ALL.destinationCountries={JP:31,CN:30,UNKNOWN:1} as typeof counts.destinationCountries;
 const d={total:4,countries:[{country:'JP',flights:2},{country:'US',flights:1},{country:null,flights:1}]};
 const r=currentCountryComparison(day,d,p,'all',payload,reference,now);
 assert.equal(r.status,'READY');assert.deepEqual(r.rows.map(x=>x.country),['JP']);assert.equal(r.unknownCurrent,1);assert.equal(r.unknownPrevious,1);
});
test('verified complete classifications permit a true absent-country zero',()=>{
 const r=currentCountryComparison(day,{total:4,countries:[{country:'JP',flights:4}]},previous,'all',payload,reference,now);
 assert.deepEqual(r.rows.find(x=>x.country==='CN'),{country:'CN',previous:1,current:0,delta:-1});
});
test('partial and inconsistent period/count evidence is not a complete comparison',()=>{
 for(const p of [{...previous,includedDays:[]},{...previous,includedDays:['2026-10-01','2026-10-01']},{...previous,month:'2026-09'}])assert.equal(currentCountryComparison(day,data,p,'all',payload,reference,now).status,'UNAVAILABLE');
 const p=structuredClone(previous);p.scopes.ALL.total=63;assert.equal(currentCountryComparison(day,data,p,'all',payload,reference,now).status,'UNAVAILABLE');
});
