import test from 'node:test';import assert from 'node:assert/strict';
import {airportComparisonSentence as sentence} from '../lib/airport-comparison-sentence';
import {rangeChange} from '../lib/period-comparison';
const at='2026-10-25T09:00:00+09:00';
test('concise passenger and exact-flight sentences preserve direction, original counts and time',()=>{
 const people=sentence(800,rangeChange(800,800,1000,1000,at)!,'people',7,'ko')!;assert.equal(people.sentence,'지난주 같은 요일보다 출국장 예상 승객 20% 감소');assert.match(people.basis,/800명.*1,000명.*2026-10-25 09:00:00 KST/);
 const flights=sentence(120,rangeChange(120,120,100,100,at)!,'flights',7,'ko')!;assert.equal(flights.sentence,'지난주 같은 요일보다 출발편 20편 증가 (20%)');assert.match(flights.basis,/120편.*100편/);
});
test('nonzero rounded changes keep direction, exact zero is neutral, and range uncertainty is retained',()=>{
 assert.match(sentence(1001,rangeChange(1001,1001,1000,1000,at)!,'people',7,'ko')!.sentence,/<1% 증가/);
 assert.match(sentence(1000,rangeChange(1000,1000,1000,1000,at)!,'people',7,'ko')!.sentence,/변화 없음/);
 const mixed=sentence(1000,{baselineAt:at,minPercent:-5,maxPercent:5},'people',7,'ko')!;assert.match(mixed.sentence,/변화 범위/);assert.doesNotMatch(mixed.sentence,/증가|감소/);
});
test('a contradictory exact count cannot fabricate a flight delta',()=>{
 assert.equal(sentence(120,{baselineAt:at,baselineMin:100,baselineMax:100,minPercent:10,maxPercent:10},'flights',7,'ko'),null);
 const legacy=sentence(120,{baselineAt:at,minPercent:10,maxPercent:10},'flights',7,'ko')!;assert.doesNotMatch(legacy.sentence,/20편/);assert.match(legacy.sentence,/10% 증가/);
 assert.equal(sentence(0,{baselineAt:at,minPercent:NaN,maxPercent:0},'flights',7,'ko'),null);
});
test('all supported languages retain the four-week baseline without Korean leakage',()=>{for(const lang of ['ko','en','zh','ja'] as const){const copy=sentence(80,rangeChange(80,80,100,100,at)!,'flights',28,lang)!;assert.match(copy.sentence,/20/);assert.match(copy.basis,/2026-10-25/);if(lang!=='ko')assert.doesNotMatch(copy.sentence+copy.basis,/[가-힣]/);}});
