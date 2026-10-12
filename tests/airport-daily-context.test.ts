import test from 'node:test';
import assert from 'node:assert/strict';
import {destinationComparison} from '../lib/airport-destination-comparison';
import type {TerminalDay} from '../lib/airport-day-compare';
import {mainBuildingMonth} from '../lib/airport-monthly-building';
import {buildAirportFlightMonth,type MonthFlightRow} from '../lib/airport-monthly-flights';
import {airportMonthly} from '../app/retailpulse-data';
const day=(groups:TerminalDay['groups'],total=100)=>({groups,total}) as TerminalDay;
test('destination shares exclude unknown and missing records rather than calling them other countries',()=>{
 assert.deepEqual(destinationComparison(day({JP:40,CN:20,EUROPE:20,UNKNOWN:10})),{known:80,unknown:20,JP:50,CN:25,OTHER:25});
 const incomplete=destinationComparison(day({JP:40,CN:20}));
 assert.equal(incomplete.unknown,40);assert.equal(incomplete.OTHER,0);assert.ok(Math.abs(incomplete.JP!-200/3)<1e-10);
});
test('unknown, empty and malformed historical destination mixes stay unavailable',()=>{
 for(const value of [day({},0),day({UNKNOWN:100}),day({JP:101}),day({JP:-1}),day({JP:NaN})])assert.equal(destinationComparison(value).JP,null);
});
const row=(id:string,gate:string,airportCode:string):MonthFlightRow=>({physicalFlightId:id,terminal:gate==='110'?'CONCOURSE':'T1',gate,airportCode,operatingFlight:'KE703',scheduledAt:'2026-09-01T10:00:00+09:00',retrievedAt:'2026-09-02T00:00:00Z'});
test('T1 main-building projection splits exact same-day concourse counts without changing stored totals',()=>{
 const original=buildAirportFlightMonth('2026-09','2026-10-12',[row('main','1','NRT'),row('concourse','110','PEK'),row('main2','2','PEK')],new Set(['2026-09-01']));
 const copy=JSON.stringify(original),main=mainBuildingMonth(original)!;
 assert.equal(original.scopes.T1.total,3);assert.equal(main.scopes.T1.total,2);assert.equal(main.scopes.CONCOURSE.total,1);
 assert.deepEqual(main.scopes.T1.destinationCountries,{JP:1,CN:1});
 assert.equal(main.scopes.T1.sides.UNVERIFIED,0);assert.equal(main.scopes.T1.destinationSides!.CN.UNVERIFIED,0);
 assert.deepEqual(main.includedDays,original.includedDays);assert.equal(JSON.stringify(original),copy);
});
test('missing or inconsistent concourse split is unavailable, never a made-up main-building zero',()=>{
 const original=buildAirportFlightMonth('2026-09','2026-10-12',[row('concourse','110','NRT')],new Set(['2026-09-01']));
 assert.equal(mainBuildingMonth(original)!.scopes.T1.total,0);
 const invalid=structuredClone(original);invalid.scopes.CONCOURSE.total=2;assert.equal(mainBuildingMonth(invalid),undefined);
 const missing=structuredClone(original);delete (missing.scopes as Partial<typeof missing.scopes>).CONCOURSE;assert.equal(mainBuildingMonth(missing),undefined);
 assert.equal(mainBuildingMonth(undefined),undefined);
});
test('official August and September passenger values are published terminal counts and reconcile',()=>{
 assert.equal(airportMonthly.at(-1)!.month,'2026-09');
 assert.equal(airportMonthly.find(x=>x.month==='2026-08')!.T2.departure,1751282);
 assert.equal(airportMonthly.at(-1)!.T2.departure,1605895);
 for(const month of airportMonthly.slice(-2))for(const direction of ['arrival','departure'] as const)assert.equal(month.all[direction],month.T1[direction]+month.T2[direction]);
});
