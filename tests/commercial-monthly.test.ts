import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCommercialMonth,compareCommercialMonths,publicCommercialMonth} from '../lib/commercial-monthly';
const row=(at:string,payments:number|null,observed=at,include=true)=>({observed_at:observed,payload:JSON.stringify({commercialAt:at,categories:include?[{category:'한식',group:'음식',payments,amountMin:payments===null?null:100,amountMax:payments===null?null:200}]:[]})});
test('dedup source clocks; preserve missing, omitted categories and published zero',()=>{
 const month=buildCommercialMonth([row('2026-10-01T10:10:00+09:00',10),row('2026-10-01T10:10:00+09:00',20,'2026-10-01T10:30:00+09:00'),row('2026-10-01T10:20:00+09:00',null),row('2026-10-01T11:10:00+09:00',0),row('2026-10-01T12:10:00+09:00',0,undefined,false),row('2026-10-02T10:10:00+09:00',999)],'2026-10','2026-10-01');
 const c=month.categories[0];assert.equal(month.uniqueClocks,4);assert.equal(c.readings,3);assert.equal(c.duplicates,1);assert.equal(c.absentReadings,1);assert.equal(c.unavailablePayments,1);assert.equal(c.zeroReadings,1);assert.equal(c.hours[0][3],20);
});
test('same completed day/hour bins only; mean windows never sum monthly sales',()=>{
 const cur=buildCommercialMonth([row('2026-10-01T10:10:00+09:00',20),row('2026-10-01T10:20:00+09:00',40),row('2026-10-01T11:10:00+09:00',1000)],'2026-10','2026-10-01');
 const prev=buildCommercialMonth([row('2026-09-01T10:10:00+09:00',10),row('2026-09-02T10:10:00+09:00',999)],'2026-09','2026-09-30');
 const result=compareCommercialMonths(cur,prev),c=result.categories[0].comparison;
 assert.equal(c.matchedHours,1);assert.equal(c.currentMean,30);assert.equal(c.previousMean,10);assert.equal(c.changePercent,200);assert.deepEqual(c.currentAmount,[100,200]);assert.ok(!('hours' in publicCommercialMonth(result).categories[0]));
});
test('no overlap, zero baseline and invalid source clocks cannot produce percentage',()=>{
 const cur=buildCommercialMonth([row('2026-10-01T10:10:00+09:00',3),row('bad',999)],'2026-10','2026-10-01');
 assert.equal(compareCommercialMonths(cur,buildCommercialMonth([row('2026-09-01T10:10:00+09:00',0)],'2026-09','2026-09-30')).categories[0].comparison.changePercent,null);
 assert.equal(compareCommercialMonths(cur,buildCommercialMonth([row('2026-09-28T10:10:00+09:00',999)],'2026-09','2026-09-30')).categories[0].comparison.currentMean,null);
});
