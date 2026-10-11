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

const pairedCoverageFixture=()=>{
 const sample=(month:string,day:string,hour:string,minute:string,payments:number|null,amount:[number,number]|null)=>({
  observed_at:`${month}-${day}T${hour}:${minute}:00+09:00`,payload:JSON.stringify({commercialAt:`${month}-${day}T${hour}:${minute}:00+09:00`,
   categories:[{category:'food',group:'food',payments,amountMin:amount?.[0]??null,amountMax:amount?.[1]??null}]})});
 const previous=buildCommercialMonth([
  sample('2026-09','01','09','10',10,[100,200]),sample('2026-09','01','09','20',30,null),
  sample('2026-09','03','11','10',40,null),sample('2026-09','03','14','10',null,[300,500]),
 ],'2026-09','2026-09-30');
 const current=buildCommercialMonth([
  sample('2026-10','01','09','10',20,[200,400]),sample('2026-10','03','11','10',60,null),
  sample('2026-10','03','14','10',null,[400,600]),sample('2026-10','03','14','20',null,[600,800]),
 ],'2026-10','2026-10-10');
 return {previous,compared:compareCommercialMonths(current,previous)};
};

test('partial coverage fills only missing hour and amount metadata without mutating stored inputs',()=>{
 const {previous,compared}=pairedCoverageFixture(),previousBefore=structuredClone(previous);
 const coverage=compared.categories[0].comparison.coverage!;
 assert.deepEqual(coverage.hours,['01T09','03T11']);assert.deepEqual(coverage.amount?.hours,['01T09','03T14']);
 assert.deepEqual([coverage.currentWindows,coverage.previousWindows],[2,3]);
 assert.deepEqual([coverage.amount?.currentWindows,coverage.amount?.previousWindows],[3,2]);
 for(const missing of [['hours'],['amount'],['hours','amount']] as const){
  const partial=structuredClone(compared);
  for(const field of missing)delete partial.categories[0].comparison.coverage![field];
  const before=structuredClone(partial),result=commercialComparisonCoverage(partial,previous);
  assert.deepEqual(result,compared,`missing ${missing.join(',')}`);
  assert.deepEqual(partial,before,'current input is immutable');assert.deepEqual(previous,previousBefore,'previous input is immutable');
 }
});

test('partial coverage preserves stored results when existing metadata or comparison values conflict',()=>{
 const {previous,compared}=pairedCoverageFixture();
 type Comparison=typeof compared.categories[number]['comparison'];
 const conflicts:Array<[string,(comparison:Comparison)=>void]>=[
  ['current dates',c=>{c.coverage!.currentDates=['2026-10-02'];}],
  ['previous dates',c=>{c.coverage!.previousDates=['2026-09-02'];}],
  ['current windows',c=>{c.coverage!.currentWindows++;}],
  ['previous windows',c=>{c.coverage!.previousWindows++;}],
  ['existing hours',c=>{c.coverage!.hours=['01T09'];delete c.coverage!.amount;}],
  ['amount hours',c=>{c.coverage!.amount!.hours=['01T09'];}],
  ['amount dates',c=>{c.coverage!.amount!.previousDates=['2026-09-02'];}],
  ['amount windows',c=>{c.coverage!.amount!.currentWindows++;}],
  ['matched hours',c=>{c.matchedHours++;}],
  ['matched days',c=>{c.matchedDays++;}],
  ['current mean',c=>{c.currentMean=999;}],
  ['previous mean',c=>{c.previousMean=999;}],
  ['current amount',c=>{c.currentAmount=[1,2];}],
  ['previous amount',c=>{c.previousAmount=[1,2];}],
 ];
 for(const [name,change] of conflicts){
  const partial=structuredClone(compared);delete partial.categories[0].comparison.coverage!.hours;
  change(partial.categories[0].comparison);const before=structuredClone(partial);
  const result=commercialComparisonCoverage(partial,previous);
  assert.deepEqual(result,before,name);assert.strictEqual(result.categories[0],partial.categories[0],name);
  assert.deepEqual(partial,before,`${name}: input is immutable`);
 }
});

test('missing, mismatched and compacted source months cannot fill partial coverage',()=>{
 const {previous,compared}=pairedCoverageFixture(),partial=structuredClone(compared);
 delete partial.categories[0].comparison.coverage!.hours;
 const before=structuredClone(partial),compactedPrevious=structuredClone(previous);
 compactedPrevious.categories[0].hours=[];
 for(const prior of [null,{...previous,month:'2026-08'},compactedPrevious]){
  const result=commercialComparisonCoverage(partial,prior);
  assert.deepEqual(result,before);assert.strictEqual(result.categories[0],partial.categories[0]);
 }
 const compactedCurrent=structuredClone(partial);compactedCurrent.categories[0].hours=[];
 const compactedBefore=structuredClone(compactedCurrent),result=commercialComparisonCoverage(compactedCurrent,previous);
 assert.deepEqual(result,compactedBefore);assert.strictEqual(result.categories[0],compactedCurrent.categories[0]);
 assert.deepEqual(partial,before);
});

test('complete coverage including valid empty membership preserves the original row',()=>{
 const {previous,compared}=pairedCoverageFixture();
 const zeroPrevious=buildCommercialMonth([reading('2026-09','01','09','10',0)],'2026-09','2026-09-30');
 const zeroCurrent=buildCommercialMonth([reading('2026-10','03','14','10',0)],'2026-10','2026-10-10');
 const empty=compareCommercialMonths(zeroCurrent,zeroPrevious);
 assert.equal(empty.categories[0].zeroReadings,1);assert.equal(empty.categories[0].comparison.matchedHours,0);
 assert.deepEqual(empty.categories[0].comparison.coverage?.hours,[]);
 assert.deepEqual(empty.categories[0].comparison.coverage?.amount?.hours,[]);
 for(const [current,prior] of [[compared,previous],[empty,zeroPrevious]]){
  const before=structuredClone(current),result=commercialComparisonCoverage(current,prior);
  assert.deepEqual(result,before);assert.strictEqual(result.categories[0],current.categories[0]);assert.deepEqual(current,before);
 }
 const partialEmpty=structuredClone(empty);delete partialEmpty.categories[0].comparison.coverage!.hours;
 const partialBefore=structuredClone(partialEmpty);
 assert.deepEqual(commercialComparisonCoverage(partialEmpty,zeroPrevious),empty,'nonoverlapping original bins still establish valid empty membership');
 const compactedPrevious=structuredClone(zeroPrevious);compactedPrevious.categories[0].hours=[];
 for(const prior of [compactedPrevious,{...zeroPrevious,categories:[]}]){
  const result=commercialComparisonCoverage(partialEmpty,prior);
  assert.deepEqual(result,partialBefore);assert.strictEqual(result.categories[0],partialEmpty.categories[0]);
 }
 assert.deepEqual(partialEmpty,partialBefore);
});
