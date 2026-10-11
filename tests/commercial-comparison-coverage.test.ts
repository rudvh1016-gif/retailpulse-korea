import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCommercialMonth,compareCommercialMonths,commercialComparisonCoverage,commercialComparisonPeriod} from '../lib/commercial-monthly';
const reading=(month:string,day:string,hour:string,minute:string,payments:number)=>({observed_at:`${month}-${day}T${hour}:${minute}:00+09:00`,payload:JSON.stringify({commercialAt:`${month}-${day}T${hour}:${minute}:00+09:00`,categories:[{category:'한식',group:'food',payments}]})});
test('10-minute means get equal hour weight; dates and window counts describe the actual paired bins',()=>{
 const older=buildCommercialMonth([reading('2026-09','01','10','10',10),reading('2026-09','01','10','20',30),reading('2026-09','02','11','10',40)],'2026-09','2026-09-30');
 const raw=buildCommercialMonth([reading('2026-10','01','10','10',50),reading('2026-10','02','11','10',60),reading('2026-10','03','12','10',100)],'2026-10','2026-10-09');
 const compared=compareCommercialMonths(raw,older),c=compared.categories[0].comparison;
 assert.equal(c.previousMean,30);assert.equal(c.currentMean,55);assert.equal(c.matchedHours,2);assert.equal(c.matchedDays,2);
 assert.deepEqual(c.coverage,{currentDates:['2026-10-01','2026-10-02'],previousDates:['2026-09-01','2026-09-02'],currentWindows:2,previousWindows:3,
  hours:['01T10','02T11'],amount:{hours:[],currentDates:[],previousDates:[],currentWindows:0,previousWindows:0}});
 const legacy=structuredClone(compared);delete legacy.categories[0].comparison.coverage;
 assert.deepEqual(commercialComparisonCoverage(legacy,older),compared);
 const noBins={...older,categories:older.categories.map(row=>({...row,hours:[]}))};
 assert.equal(commercialComparisonCoverage(legacy,noBins).categories[0].comparison.coverage,undefined);
 assert.deepEqual(commercialComparisonPeriod(compared),{current:['2026-10-01','2026-10-09'],previous:['2026-09-01','2026-09-09']});
});

test('noncontinuous hour membership and separate amount coverage do not imply full-day observations',()=>{
 const sample=(month:string,hour:string,payments:number|null,amount:boolean)=>({observed_at:`${month}-01T${hour}:20:00+09:00`,
  payload:JSON.stringify({commercialAt:`${month}-01T${hour}:20:00+09:00`,categories:[{category:'한식',group:'food',payments,amountMin:amount?100:null,amountMax:amount?200:null}]})});
 const previous=buildCommercialMonth([sample('2026-09','09',10,true),sample('2026-09','11',30,false),sample('2026-09','14',null,true)],'2026-09','2026-09-30');
 const current=buildCommercialMonth([sample('2026-10','09',20,true),sample('2026-10','11',40,false),sample('2026-10','14',null,true)],'2026-10','2026-10-10');
 const result=compareCommercialMonths(current,previous).categories[0].comparison;
 assert.equal(result.currentMean,30);assert.deepEqual(result.coverage?.hours,['01T09','01T11']);
 assert.deepEqual(result.coverage?.amount?.hours,['01T09','01T14']);
 assert.equal(result.coverage?.currentWindows,2);assert.equal(result.coverage?.amount?.currentWindows,2);
});
