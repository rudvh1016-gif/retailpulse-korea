import test from 'node:test';
import assert from 'node:assert/strict';
import {rhythmMetricCopy} from '../lib/airport-period/metric-labels.mjs';
import {compareRanges} from '../lib/airport-period/analysis.mjs';

test('whole calendar month and partial independent ranges identify full-day departures and included-day denominator',()=>{
 const days=['2026-09-01','2026-09-03','2026-10-01'].map((date,i)=>({date,T1:i?300:100,T2:50,h1:Array.from({length:24},(_,h)=>h===8?(i?300:100):0),h2:Array.from({length:24},(_,h)=>h===8?50:0)}));
 const model=compareRanges(days,'ALL',{aStart:'2026-09-01',aEnd:'2026-09-30',bStart:'2026-10-01',bEnd:'2026-10-27'});
 assert.equal(model.previous.total,250);assert.equal(model.current.total,350);
 const a=rhythmMetricCopy(model.coverage.previous,'공항 전체','기준'),b=rhythmMetricCopy(model.coverage.current,'공항 전체','비교');
 assert.equal(a.label,'9월 하루 평균 출발편');assert.equal(b.label,'10/1–10/27 하루 평균 출발편');
 assert.equal(a.period,'기준 · 2026-09-01–2026-09-30 · 포함 2/30일');
 assert.equal(a.basis,'공항 전체 · 24시간 출발편 합계 ÷ 포함 2일');
 assert.equal(b.period,'비교 · 2026-10-01–2026-10-27 · 포함 1/27일');
});
test('date labels follow leap months, one-day selections and year crossings without inventing dates',()=>{
 for(const [start,end,label] of [['2028-02-01','2028-02-29','2월'],['2026-12-31','2027-01-02','12/31–1/2'],['2026-10-03','2026-10-03','10/3']]){
  const copy=rhythmMetricCopy({start,end,days:1,expected:3},'T2','비교');
  assert.equal(copy.label,label+' 하루 평균 출발편');assert.ok(copy.period.includes(start+'–'+end));assert.ok(copy.basis.startsWith('T2 · 24시간'));
 }
});
