import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {roundDisplayInteger,formatDisplayInteger} from '../lib/display-number';

test('display integers round half up symmetrically and never expose negative zero',()=>{
 for(const [input,expected] of [[463.7,464],[463.5,464],[463.499,463],[-463.5,-464],[-.5,-1],[-.49,0],[0,0],[-0,0]]){
  assert.equal(roundDisplayInteger(input),expected);
  assert.equal(Object.is(roundDisplayInteger(input),-0),false);
 }
 for(const locale of ['ko-KR','en-US','zh-CN','ja-JP']){
  assert.equal(formatDisplayInteger(1234.5,locale),'1,235');
  assert.equal(formatDisplayInteger(-.1,locale),'0');
 }
});

test('people displays use whole numbers but mixed flight averages retain their precision',()=>{
 const brief=readFileSync('app/airport-brief-comparison.tsx','utf8');
 assert.match(brief,/maximumFractionDigits:0/);assert.match(brief,/<CountChange integer delta=/);
 const daily=readFileSync('app/daily-average-comparison.tsx','utf8');
 assert.match(daily,/maximumFractionDigits:unit==='people'\?0:1/);
 assert.match(daily,/integer=\{unit==='people'\}/);
 const chart=readFileSync('app/airport-monthly-line-chart.tsx','utf8');
 assert.match(chart,/maximumFractionDigits:0/);
 const more=readFileSync('app/retailpulse-app.tsx','utf8');
 assert.match(more,/소수 첫째 자리 5 이상 올림, 5 미만 버림/);
 assert.match(more,/계산은 원본값 기준/);assert.match(more,/0%로 표시돼도 작은 증감/);
});
