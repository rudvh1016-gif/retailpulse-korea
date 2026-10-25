import assert from 'node:assert/strict';
import test from 'node:test';
import {createStoredReadCache} from '../lib/stored-read-cache';
import {compareRoutePassengerMonths,passengerMonthDays} from '../lib/route-passenger-comparison';
import type {AirportStatsMonth} from '../lib/airport-monthly-stats-read';
const month=(date:string,count:number|null):AirportStatsMonth=>({operationId:'ROUTE_COUNTRY_PASSENGERS',month:date,retrievedAt:'2026-10-25T00:00:00Z',rows:[{label:'Japan',departures:count,arrivals:null,total:null,aggregate:false,region:null,startHour:null,endHour:null}]});
test('independent comparison uses each calendar divisor, preserves exact totals and inputs',()=>{
 const march=month('2026-03',3100),september=month('2026-09',3000),before=JSON.stringify([march,september]);
 assert.equal(passengerMonthDays('2026-03'),31);assert.equal(passengerMonthDays('2026-09'),30);assert.equal(passengerMonthDays('2028-02'),29);assert.equal(passengerMonthDays('2026-02'),28);
 let row=compareRoutePassengerMonths(september,march)[0];assert.equal(row.selectedMean,100);assert.equal(row.baselineMean,100);assert.equal(row.percent,0);
 row=compareRoutePassengerMonths(month('2026-09',3300),march)[0];assert.equal(row.percent,10);
 assert.ok(compareRoutePassengerMonths(march,month('2026-09',3300))[0].percent!<0);
 assert.equal(JSON.stringify([march,september]),before);
 assert.equal(compareRoutePassengerMonths(null,march)[0].selectedTotal,null);
 assert.equal(compareRoutePassengerMonths(month('2026-09',0),march)[0].percent,-100);
 assert.equal(compareRoutePassengerMonths(march,month('2026-09',0))[0].percent,null);
 assert.equal(compareRoutePassengerMonths(month('2026-09',null),march)[0].selectedMean,null);
});
test('fulfilled cache expires, coalesces and keeps last-good only for the same selection',async()=>{
 let now=0,calls=0,fail=false;
 const cache=createStoredReadCache(async key=>{calls++;if(fail)throw Error();return key+calls;},()=>now,300,2);
 const [a,b]=await Promise.all([cache.read('03|09'),cache.read('03|09')]);assert.deepEqual(a,b);assert.equal(calls,1);
 await cache.read('03|09');assert.equal(calls,1);now=301;assert.equal((await cache.read('03|09')).value,'03|092');
 now=602;fail=true;assert.deepEqual(await cache.read('03|09'),{value:'03|092',failed:true});
 await assert.rejects(cache.read('10|09'));assert.equal(calls,4);await assert.rejects(cache.read('10|09'));assert.equal(calls,4);
 fail=false;now+=60001;await cache.read('01|09');assert.ok(cache.size()<=2);
});

test('bounded cache rejects excess concurrent distinct keys without duplicate loads',async()=>{
 let finish!:(value:string)=>void,calls=0;const cache=createStoredReadCache(()=>{calls++;return new Promise<string>(resolve=>{finish=resolve;});},()=>0,300,1);
 const first=cache.read('03|09');await assert.rejects(cache.read('01|09'));assert.equal(cache.size(),1);assert.equal(calls,1);finish('ok');await first;
});
