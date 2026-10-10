import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatChangeRate,spokenRateText} from '../lib/change-rate';
import {comparisonValue,rangeChange} from '../lib/period-comparison';
import {tenthsPercent} from '../lib/review-copy';
test('owner signs preserve signed inputs, point units and incomparable values',()=>{
 assert.equal(formatChangeRate(8.6),'+8.6%');assert.equal(formatChangeRate(-8.6),'△8.6%');
 assert.equal(formatChangeRate(0),'0%');assert.equal(formatChangeRate(-0),'0%');
 assert.equal(formatChangeRate(-8.6,'%p'),'△8.6%p');assert.equal(formatChangeRate(0,'%p'),'0%p');
 for(const value of [null,NaN,Infinity])assert.equal(formatChangeRate(value),'—');
 const input=-8.6;formatChangeRate(input);assert.equal(input,-8.6);
 assert.equal(formatChangeRate(-.001),'△<0.1%');assert.equal(formatChangeRate(.001),'<+0.1%');
 assert.equal(tenthsPercent(-86,'ko'),'△8.6%');assert.equal(tenthsPercent(0,'en'),'0%');
 assert.equal(rangeChange(10,10,0,0,'date'),null);
 assert.equal(comparisonValue(rangeChange(90,110,100,100,'date')!),'△10.0% ~ +10.0%');
});
test('assistive speech explicitly reads the hollow upward glyph as a decrease',()=>{
 for(const [lang,word] of [['ko','감소'],['en','decrease'],['zh','下降'],['ja','減少']] as const){
  const spoken=spokenRateText('△8.6% ~ +2.0% · △<0.1%p',lang);
  assert.ok(spoken.includes(word));assert.doesNotMatch(spoken,/[△▲▼]/);
 }
 assert.match(spokenRateText('△8.6%p','ko'),/역신장.*퍼센트포인트/);
});
