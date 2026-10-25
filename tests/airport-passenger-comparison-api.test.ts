import test from 'node:test';
import assert from 'node:assert/strict';
import {airportPassengerComparisonResponse} from '../app/api/live/airport-passenger-comparison/route';
import type {AirportStatsMonth} from '../lib/airport-monthly-stats-read';
const row=(month:string):AirportStatsMonth=>({operationId:'ROUTE_COUNTRY_PASSENGERS',month,rows:[],retrievedAt:'2026-10-25T00:00:00Z'});
for(const missing of [0,1,2])test(`exact comparison API preserves requested dates and missing status ${missing}`,async()=>{
 const response=await airportPassengerComparisonResponse(new Request('https://example.test/api/live/airport-passenger-comparison?selected=2026-09&baseline=2026-03'),async(selectedMonth,baselineMonth)=>({selectedMonth,baselineMonth,selected:missing>0?null:row(selectedMonth),baseline:missing>1?null:row(baselineMonth),availableMonths:['2026-03','2026-09']}));
 const body=await response.json();assert.equal(body.selectedMonth,'2026-09');assert.equal(body.baselineMonth,'2026-03');assert.equal(body.status,['READY','PARTIAL','MISSING'][missing]);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('x-robots-tag')??'',/noindex/);
 if(missing)assert.equal(body.selected,null);
});
test('invalid comparison skips storage; failures never substitute another month',async()=>{
 const bad=await airportPassengerComparisonResponse(new Request('https://example.test?selected=2026-13&baseline=2026-03'),async()=>{assert.fail('must not read');});assert.equal(bad.status,400);
 const fail=await airportPassengerComparisonResponse(new Request('https://example.test?selected=2026-10&baseline=2026-03'),async()=>{throw Error('storage');});const body=await fail.json();assert.equal(body.status,'UNAVAILABLE');assert.equal(body.selectedMonth,'2026-10');assert.equal(body.selected,null);assert.deepEqual(body.availableMonths,[]);
});
