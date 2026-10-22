import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyComparisonBasis,comparisonBasisLabel,type ComparisonBasis} from '../lib/comparison-basis';
const days=(length:number,month='2026-09')=>Array.from({length},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`);
const base:ComparisonBasis={month:'2026-09',includedDays:days(26),through:'2026-09-26',provenance:'collected'};

test('only explicit official finalized monthly actuals allow a closed label',()=>{
 assert.equal(classifyComparisonBasis({...base,includedDays:days(30),through:'2026-09-30'}).kind,'full-collected');
 for(const provenance of ['collected','forecast'] as const){
  const data={...base,includedDays:days(30),through:'2026-09-30',provenance,officialFullMonth:true};
  assert.doesNotMatch(comparisonBasisLabel(data,'ko'),/마감/);
 }
 const official={...base,includedDays:[],provenance:'official-monthly-actuals' as const,officialFullMonth:true};
 assert.equal(comparisonBasisLabel(official,'ko'),'2026-09월 마감 일평균');
 assert.notEqual(classifyComparisonBasis({...base,provenance:'official-monthly-actuals'}).kind,'closed');
});

test('MTD requires consecutive verified dates from day one to exact cutoff',()=>{
 assert.equal(comparisonBasisLabel(base,'ko'),'2026-09월-26일 MTD 일평균');
 assert.equal(classifyComparisonBasis({...base,through:undefined}).kind,'mtd');
 for(const invalid of [
  {...base,includedDays:days(26).filter(day=>!day.endsWith('-03'))},
  {...base,includedDays:days(26).map((day,i)=>i===0?'2026-09-02':day)},
  {...base,excludedDays:['2026-09-03']},
  {...base,expectedDays:30},
  {...base,through:'2026-09-30'},
  {...base,includedDays:['2026-09-30'],through:'2026-09-30'},
  {...base,includedDays:['2026-09-31'],through:'2026-09-31'},
 ]){
  assert.equal(classifyComparisonBasis(invalid).kind,'collected');
  assert.doesNotMatch(comparisonBasisLabel(invalid,'ko'),/마감|MTD/);
 }
});

test('forecast and collected evidence retain provenance in all four languages',()=>{
 const forecast={...base,provenance:'forecast' as const};
 for(const [lang,word] of [['ko','예보'],['en','forecast'],['zh','预报'],['ja','予報']] as const){
  const label=comparisonBasisLabel(forecast,lang);
  assert.ok(label.includes(word));assert.ok(label.includes('MTD'));assert.ok(label.includes('2026-09'));
  const partial=comparisonBasisLabel({...forecast,includedDays:['2026-09-26']},lang);
  assert.doesNotMatch(partial,/MTD/);
 }
});

test('invalid month, no dates, leap and year boundaries do not infer finalization',()=>{
 assert.equal(classifyComparisonBasis({...base,month:'2026-13'}).kind,'unavailable');
 assert.equal(classifyComparisonBasis({...base,includedDays:[]}).kind,'unavailable');
 assert.equal(classifyComparisonBasis({month:'2024-02',includedDays:days(29,'2024-02')}).kind,'full-collected');
 assert.equal(classifyComparisonBasis({month:'2025-12',includedDays:days(31,'2025-12')}).kind,'full-collected');
});

test('explicit unknown cutoff never becomes a verified MTD cutoff',()=>{
 assert.equal(classifyComparisonBasis({...base,through:null}).kind,'collected');
 assert.doesNotMatch(comparisonBasisLabel({...base,through:null},'ko'),/MTD|마감/);
});
