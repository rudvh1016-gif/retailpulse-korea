import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dailyFlightProfile} from '../lib/airport-day-profile';
import {countryDayObservations,storedCountryDayObservations} from '../lib/airport-country-day-history';
import {compareHolidayPeriod} from '../lib/holiday-period-comparison.mjs';
const day='2026-10-01';
const row={physicalFlightId:'a',terminal:'T1',gate:'11',scheduledAt:day+'T12:00:00+09:00',retrievedAt:day+'T13:00:00Z',status:'departed',airportCode:'베이징/서우두'};
const profile=dailyFlightProfile([row],day,true);
test('destination country, not airline nationality, gives a complete daily series with explicit zeros',()=>{
 const values=countryDayObservations(profile);assert.equal(values.find(r=>r.country==='CN')?.value,1);assert.equal(values.find(r=>r.country==='JP')?.value,0);assert.ok(values.every(r=>r.complete));
});
test('incomplete scan, unknown destination/building and corrupt totals withhold every country',()=>{
 for(const p of [{...profile,complete:false},{...profile,unknownBuilding:1},dailyFlightProfile([{...row,airportCode:'UNKNOWN'}],day,true),{...profile,T1:{...profile.T1,total:4}}])assert.ok(countryDayObservations(p).every(r=>r.value===null&&!r.complete));
});
test('stored mismatched dates and malformed JSON are rejected',()=>{
 assert.deepEqual(storedCountryDayObservations([{day,payload:'garbage'},{day:'2026-10-02',payload:JSON.stringify({profile})}]),[]);
 assert.equal(storedCountryDayObservations([{day,payload:JSON.stringify({profile})}]).length,12);
});
test('actual holiday and nonholiday observations compare with explicit coverage',()=>{
 const p2=dailyFlightProfile([{...row,scheduledAt:'2026-10-08T12:00:00+09:00'}],'2026-10-08',true);
 const values=[...countryDayObservations(profile),...countryDayObservations(p2)].filter(r=>r.country==='CN');
 const result=compareHolidayPeriod(values,{country:'CN',metric:'departure_flights',scope:'ALL',month:'2026-10',start:'2026-10-01',end:'2026-10-08',asOf:'2026-10-09',holiday:{start:'2026-10-01',end:'2026-10-07'}});
 assert.equal(result.status,'available');assert.equal(result.holiday.mean,1);assert.equal(result.nonHoliday.mean,1);assert.equal(result.holiday.sampleDays,1);assert.equal(result.holiday.expectedDays,7);
});
test('terminal country series keeps T1 with the concourse separate from T2',()=>{
 const rows=[row,{...row,physicalFlightId:'b',terminal:'CONCOURSE',gate:'120',airportCode:'NRT'},{...row,physicalFlightId:'c',terminal:'T2',gate:'250',airportCode:'NRT'}];
 const p=dailyFlightProfile(rows,day,true);
 const value=(scope:'ALL'|'T1'|'T2',country:string)=>countryDayObservations(p,scope).find(r=>r.country===country);
 assert.equal(value('ALL','JP')?.value,2);assert.equal(value('T1','JP')?.value,1);assert.equal(value('T2','JP')?.value,1);
 assert.equal(value('T1','CN')?.value,1);assert.equal(value('T2','CN')?.value,0);
 for(const scope of ['ALL','T1','T2'] as const)assert.ok(countryDayObservations({...p,unknownBuilding:1},scope).every(r=>r.value===null&&!r.complete));
});
