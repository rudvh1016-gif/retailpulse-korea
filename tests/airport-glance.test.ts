import test from 'node:test';import assert from 'node:assert/strict';
import {glanceCountryRanking,glanceFlights} from '../lib/airport-glance';
import {buildAirportFlightMonth,type MonthFlightRow} from '../lib/airport-monthly-flights';
const row=(day:string,id:string,airportCode='NRT',terminal='T1',gate='45'):MonthFlightRow=>({physicalFlightId:id,operatingFlight:'TEST'+id,terminal,gate,airportCode,scheduledAt:day+'T10:00:00+09:00',retrievedAt:day+'T01:00:00Z',status:'scheduled'});
test('glance reuses departure scope, collapses duplicates and includes concourse only with T1',()=>{
 const date='2026-10-11',rows=[row(date,'main'),row(date,'main'),row(date,'concourse','NRT','CONCOURSE','110'),row(date,'t2','NRT','T2','274'),{...row(date,'arrival'),direction:'arrival'}];
 const data=glanceFlights(date,rows,'T1');assert.equal(data.total,2);assert.equal(data.hours[10],2);assert.equal(data.buildings.T2.total,1);assert.equal(glanceFlights(date,rows,'all').total,3);
});
test('ranking excludes absent and zero baselines rather than inventing percentage growth',()=>{
 const current=buildAirportFlightMonth('2026-10','2026-10-11',[row('2026-10-01','a'),row('2026-10-01','b','LAX')],new Set(['2026-10-01']));
 const previous=buildAirportFlightMonth('2026-09','2026-10-11',[row('2026-09-01','a')],new Set(['2026-09-01']));
 assert.deepEqual(glanceCountryRanking(current,previous,'ALL').map(row=>row.country),['JP']);assert.equal(glanceCountryRanking(current,undefined,'ALL').length,0);
});
