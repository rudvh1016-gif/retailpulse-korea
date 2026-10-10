import test from 'node:test';import assert from 'node:assert/strict';
import {buildAirportFlightMonth,type MonthFlightRow} from '../lib/airport-monthly-flights';
import {destinationDailyChanges} from '../lib/airport-destination-daily-changes';
import {monthlyCompletionDays,rollupsOf} from '../lib/airport-monthly-store';
const row=(day:string,id:string,gate:string,airportCode='NRT',terminal='T2'):MonthFlightRow=>({physicalFlightId:id,terminal,gate,airportCode,operatingFlight:'KE703',scheduledAt:day+'T10:00:00+09:00',status:'scheduled',retrievedAt:day+'T01:00:00Z'});

test('cross counts keep opposite movements that country and side margins cannot reveal',()=>{
 const previous=buildAirportFlightMonth('2026-09','2026-10-10',[row('2026-09-01','p1','274'),row('2026-09-01','p2','274'),row('2026-09-02','p3','231'),row('2026-09-02','p4','249')],new Set(['2026-09-01','2026-09-02']));
 const current=buildAirportFlightMonth('2026-10','2026-10-10',[row('2026-10-01','c1','274'),row('2026-10-01','c2','249'),row('2026-10-01','c3','249'),row('2026-10-01','c4','231')],new Set(['2026-10-01']));
 const japan=destinationDailyChanges(current,previous,'T2')[0];
 assert.equal(japan.country,'JP');assert.equal(japan.sides.EAST.previous,1);assert.equal(japan.sides.EAST.current,1);assert.equal(japan.sides.EAST.percent,0);
 assert.equal(japan.sides.CENTER.previous,.5);assert.equal(japan.sides.CENTER.current,2);assert.equal(japan.sides.CENTER.percent,300);
 assert.equal(japan.sides.WEST.percent,100);assert.equal(japan.previous,2);assert.equal(japan.current,4);
 for(const month of [previous,current])for(const scope of Object.values(month.scopes)){
  for(const [country,counts] of Object.entries(scope.destinationSides!))assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),scope.destinationCountries[country]);
  for(const side of ['EAST','CENTER','WEST','UNVERIFIED'] as const)assert.equal(Object.values(scope.destinationSides!).reduce((sum,counts)=>sum+counts[side],0),scope.sides[side]);
 }
});
test('missing crossing data is unavailable; zero baseline supplies no percentage',()=>{
 const current=buildAirportFlightMonth('2026-10','2026-10-10',[row('2026-10-01','c1','274')],new Set(['2026-10-01']));
 const previous=buildAirportFlightMonth('2026-09','2026-10-10',[row('2026-09-01','p1','231','PEK')],new Set(['2026-09-01']));
 const japan=destinationDailyChanges(current,previous,'T2').find(row=>row.country==='JP')!;
 assert.equal(japan.sides.EAST.previous,0);assert.equal(japan.sides.EAST.percent,null);
 delete previous.scopes.T2.destinationSides;
 assert.equal(destinationDailyChanges(current,previous,'T2').find(row=>row.country==='JP')!.sides.EAST.previous,null);
 assert.equal(destinationDailyChanges(current,undefined,'T2')[0].previous,null);
});
test('concourse and unknown destinations keep their exact cross buckets',()=>{
 const month=buildAirportFlightMonth('2026-10','2026-10-10',[row('2026-10-01','c','110','NRT','CONCOURSE'),row('2026-10-01','unknown','','not-known','UNKNOWN')],new Set(['2026-10-01']));
 assert.equal(month.scopes.T1.destinationSides?.JP.UNVERIFIED,1);
 assert.equal(month.scopes.ALL.destinationSides?.UNKNOWN.UNVERIFIED,1);
 assert.equal(month.scopes.T2.total,0);
});
test('v1 migration retains only valid included-date completion witnesses, never old counts',()=>{
 const old={version:1,asOf:'2026-10-10',months:[{month:'2026-09',includedDays:['2026-09-01','2026-09-31','2026-10-01']}],sidesVersion:'old',destinationsVersion:'old'};
 assert.deepEqual(monthlyCompletionDays({monthlyRollups:old}),['2026-09-01']);
 assert.equal(rollupsOf({monthlyRollups:old}),null);
});
