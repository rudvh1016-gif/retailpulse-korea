import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {PassengerReferenceMonth} from '../lib/passenger-reference-month';
import {passengerReferenceDailyChange as compare,passengerDailyDeltaText} from '../lib/passenger-reference-comparison';
import {formatChangeRate} from '../lib/change-rate';
const baseline=(month='2026-09',mean=60_000):PassengerReferenceMonth=>{
 const [year,m]=month.split('-').map(Number),end=new Date(Date.UTC(year,m,0)).toISOString().slice(0,10),days=Number(end.slice(8));
 return {month,start:month+'-01',end,expectedDays:days,completeDays:days,missingDates:[],mean,status:'COMPLETE'};
};
test('one-day arithmetic total versus a prior-month DAILY mean preserves count and rate signs',()=>{
 const down=compare(52_919,'2026-10-21',baseline())!;
 assert.equal(down.currentDays,1);assert.equal(down.currentMean,52_919);assert.equal(down.baselineDays,30);
 assert.equal(down.delta,-7_081);assert.equal(down.percent,-7_081/60_000*100);
 assert.equal(passengerDailyDeltaText(down.delta),'7,081명/일 감소');assert.equal(formatChangeRate(down.percent),'▲ 11.8%');
 const up=compare(67_081,'2026-10-21',baseline())!;
 assert.equal(up.delta,7_081);assert.equal(formatChangeRate(up.percent),'+11.8%');assert.equal(passengerDailyDeltaText(up.delta),'7,081명/일 증가');
 const same=compare(60_000,'2026-10-21',baseline())!;
 assert.equal(same.delta,0);assert.equal(same.percent,0);assert.equal(passengerDailyDeltaText(same.delta),'0명/일 · 차이 없음');
});
test('28/29/30/31-day calendars and January year boundary require the exact prior month',()=>{
 for(const [month,day,days] of [['2026-02','2026-03-01',28],['2028-02','2028-03-31',29],['2026-09','2026-10-21',30],['2025-12','2026-01-01',31]] as const){
  const ref=baseline(month,3_900),result=compare(4_000,day,ref)!;
  assert.equal(result.baselineDays,days);assert.equal(result.delta,100);
  assert.equal(compare(4_000,day,{...ref,expectedDays:days-1,completeDays:days-1}),null);
 }
 assert.equal(compare(4_000,'2026-10-21',baseline('2026-08')),null);
 assert.equal(compare(4_000,'2026-02-30',baseline('2026-01')),null);
 assert.equal(compare(4_000,'',baseline()),null);
});
test('partial 22/30 days, missing, malformed and null values never become monthly comparisons',()=>{
 const missingDates=Array.from({length:8},(_,i)=>`2026-09-${String(i+1).padStart(2,'0')}`);
 assert.equal(compare(52_919,'2026-10-21',{...baseline(),status:'PARTIAL',completeDays:22,missingDates,mean:null}),null);
 assert.equal(compare(52_919,'2026-10-21',{...baseline(),status:'PARTIAL',completeDays:22,missingDates,mean:60_000}),null);
 for(const change of [{completeDays:22},{expectedDays:0},{missingDates:['2026-09-01']},{mean:null},{mean:NaN},{mean:Infinity},{mean:-1},{end:'2026-09-29'},{start:'2026-09-02'}])assert.equal(compare(52_919,'2026-10-21',{...baseline(),...change}),null);
 for(const total of [null,undefined,NaN,Infinity,-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.equal(compare(total,'2026-10-21',baseline()),null);
 assert.equal(compare(52_919,'2026-10-21',null),null);
});
test('true zero current count is -100%; zero baseline withholds rate but not an arithmetic difference',()=>{
 assert.equal(compare(0,'2026-10-21',baseline())!.percent,-100);
 assert.deepEqual(compare(100,'2026-10-21',baseline('2026-09',0)),{currentDays:1,currentMean:100,baselineDays:30,mean:0,delta:100,percent:null});
 assert.equal(compare(0,'2026-10-21',baseline('2026-09',0))!.percent,null);
});
test('fractional daily means are not rounded before comparison and tiny differences keep direction',()=>{
 const mean=100/30,change=compare(3,'2026-10-21',baseline('2026-09',mean))!;
 assert.equal(change.delta,3-mean);assert.equal(change.percent,(3-mean)/mean*100);
 assert.equal(passengerDailyDeltaText(.01),'0.1명/일 미만 증가');assert.equal(passengerDailyDeltaText(-.01),'0.1명/일 미만 감소');
});
