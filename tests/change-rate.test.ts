import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatChangeRate,formatCountChange,spokenRateText} from '../lib/change-rate';
import {comparisonValue,rangeChange} from '../lib/period-comparison';
import {tenthsPercent} from '../lib/review-copy';
test('owner signs preserve signed inputs, point units and incomparable values',()=>{
 assert.equal(formatChangeRate(8.6),'+9%');assert.equal(formatChangeRate(-8.6),'▲ 9%');
 assert.equal(formatChangeRate(0),'0%');assert.equal(formatChangeRate(-0),'0%');
 assert.equal(formatChangeRate(-8.6,'%p'),'▲ 9%p');assert.equal(formatChangeRate(0,'%p'),'0%p');
 for(const value of [null,NaN,Infinity])assert.equal(formatChangeRate(value),'—');
 const input=-8.6;formatChangeRate(input);assert.equal(input,-8.6);
 assert.equal(formatChangeRate(-.001),'▲ 0%');assert.equal(formatChangeRate(.001),'+0%');
 assert.equal(tenthsPercent(-86,'ko'),'▲ 9%');assert.equal(tenthsPercent(0,'en'),'0%');
 assert.equal(rangeChange(10,10,0,0,'date'),null);
 assert.equal(comparisonValue(rangeChange(90,110,100,100,'date')!),'▲ 10% ~ +10%');
});
test('assistive speech reads the directional glyphs as increase or decrease',()=>{
 for(const [lang,word] of [['ko','감소'],['en','decrease'],['zh','下降'],['ja','減少']] as const){
  const spoken=spokenRateText('▲ 8.6% ~ +2.0% · ▲ <0.1%p',lang);
  assert.ok(spoken.includes(word));assert.doesNotMatch(spoken,/[▽▲△▼−]/);
 }
 assert.match(spokenRateText('▲ 9%p','ko'),/역신장.*퍼센트포인트/);
});


test('count and mixed-direction speech does not leave visual glyphs',()=>{
 for(const lang of ['ko','en','zh','ja'] as const)assert.doesNotMatch(spokenRateText('+3편 · ▲ 2 flights · 0%',lang),/[▲▽−]/);
});


test('count signs, daily units and bounds preserve finite signed inputs',()=>{
 const format=new Intl.NumberFormat('ko',{maximumFractionDigits:1}).format;
 for(const [input,expected] of [[2.7,'+2.7'],[-2.7,'▲ 2.7'],[0,'0'],[-0,'0'],[.001,'+<0.1'],[-.001,'▲ <0.1'],[1200,'+1,200'],[-1200,'▲ 1,200']] as const){
  assert.equal(formatCountChange(input,format),expected);
 }
 for(const input of [null,NaN,Infinity,-Infinity])assert.equal(formatCountChange(input,format),'—');
 assert.equal(spokenRateText('▲ 1,200명 · +2.7편/일 · ▲ <0.1 flights/day','ko'),'감소 · 역신장 1,200명 · 증가 2.7편/일 · 감소 · 역신장 미만 0.1 flights/day');
});


test('percentage display rounds half up symmetrically without changing the source value',()=>{
 for(const [value,expected] of [[463.4,'+463%'],[463.5,'+464%'],[-463.5,'▲ 464%'],[.49,'+0%'],[-.49,'▲ 0%'],[.5,'+1%'],[-.5,'▲ 1%']] as const)assert.equal(formatChangeRate(value),expected);
 assert.equal(formatChangeRate(-.5,'%p'),'▲ 1%p');
});
test('integer person deltas keep rounded-zero direction while flight precision is unchanged',()=>{
 const format=(value:number)=>String(Math.round(value));
 for(const [value,expected] of [[.01,'+0'],[-.01,'▲ 0'],[.5,'+1'],[-.5,'▲ 1'],[463.7,'+464'],[-0,'0']] as const)assert.equal(formatCountChange(value,format,true),expected);
});
