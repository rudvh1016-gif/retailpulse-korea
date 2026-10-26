import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DailyAverageComparison} from '../app/daily-average-comparison';
import {PassengerBriefComparison} from '../app/airport-brief-comparison';
import type {PassengerReferenceMonth} from '../lib/passenger-reference-month';
const visible=(html:string)=>html.replace(/<span class="sr-only">.*?<\/span>/g,'').replace(/<[^>]*>/g,'');
test('count appears once with direction, honest basis, rate and four locales',()=>{
 for(const lang of ['ko','en','zh','ja'] as const){
  const html=visible(renderToStaticMarkup(h(DailyAverageComparison,{basis:'2026-09',mean:100000,delta:505,percent:.505,lang})));
  assert.equal((html.match(/505/g)||[]).length,1);assert.match(html,/\+505/);assert.match(html,/\+1%/);
  if(lang!=='ko')assert.doesNotMatch(html,/[가-힣]/);
  const down=visible(renderToStaticMarkup(h(DailyAverageComparison,{basis:'2026-09',mean:50,delta:-.6,percent:-1.3,lang})));
  assert.match(down,/△ 0.6/);assert.match(down,/△ 1%/);assert.doesNotMatch(down,/-0.6/);
 }
});
test('zero and subresolution preserve direction and zero denominator withholds percentage',()=>{
 const render=(delta:number,percent:number|null)=>visible(renderToStaticMarkup(h(DailyAverageComparison,{basis:'2026-09',mean:0,delta,percent,lang:'ko'})));
 assert.match(render(0,0),/0편\/일 차이 없음 \(0%\)/);
 assert.match(render(.01,null),/\+&lt;0.1편\/일 증가/);assert.match(render(-.01,null),/△ &lt;0.1편\/일 감소/);
 assert.match(render(1,null),/증감률 계산 불가/);assert.doesNotMatch(render(1,null),/\(.*%\)/);
});
test('passenger sample retains baseline value, collected-day evidence and no duplicated delta',()=>{
 const ref:PassengerReferenceMonth={month:'2026-09',start:'2026-09-01',end:'2026-09-30',expectedDays:30,completeDays:2,status:'PARTIAL',mean:null,
 observedDays:[1,3].map(day=>({date:`2026-09-0${day}`,departures:90000,transfers:10000})),
 missingDates:Array.from({length:30},(_,i)=>i+1).filter(d=>d!==1&&d!==3).map(d=>`2026-09-${String(d).padStart(2,'0')}`)};
 for(const lang of ['ko','en','zh','ja'] as const){
 const html=renderToStaticMarkup(h(PassengerBriefComparison,{total:100505,day:'2026-10-22',baseline:ref,lang}));
 const core=visible(html.split('<details')[0]);
 assert.match(core,/100,000/);assert.equal((core.match(/505/g)||[]).length,1);assert.match(core,/\+1%/);
 assert.doesNotMatch(core,/MTD|마감/);assert.doesNotMatch(html,/<details[^>]* open/);
 if(lang==='ko'){assert.match(core,/수집분 예보 일평균/);assert.match(core,/명 대비/);assert.match(core,/증가/);assert.match(html,/월전체 평균 아님/);}
 }
});

test('person means and deltas round once while flight means stay fractional',()=>{
 for(const lang of ['ko','en','zh','ja'] as const){
  for(const [delta,expected] of [[.49,'+0'],[.5,'+1'],[-.49,'△ 0'],[-.5,'△ 1']] as const){
   const html=visible(renderToStaticMarkup(h(DailyAverageComparison,{basis:'2026-09',mean:463.7,delta,percent:delta,lang,unit:'people'})));
   assert.match(html,/464/);assert.ok(html.includes(expected));assert.doesNotMatch(html,/463[.,]7|&lt;0/);
  }
 }
});
