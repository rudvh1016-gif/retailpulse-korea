import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {readFileSync} from 'node:fs';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AirportFocusData} from '../app/airport-focus-data';
import type {GlanceOverviewContext} from '../app/airport-glance-preview';
register(new URL('./helpers/static-css-loader.mjs',import.meta.url));
const {OverviewHeadline}=await import('../app/airport-focus-preview');
const context:GlanceOverviewContext={day:'2026-10-21',scope:'T2',flights:264,passengers:43319,transferPassengers:9600,referenceSum:52919,flightComparison:null,flightBaseline:{mean:261.6,delta:2.4,percent:.9,days:30,start:'2026-09-01',end:'2026-09-30',previous:true},passengerBaseline:{month:'2026-09',start:'2026-09-01',end:'2026-09-30',expectedDays:30,completeDays:30,status:'COMPLETE',mean:60000,missingDates:[]}};
const render=(values=context,lang:'ko'|'en'|'zh'|'ja'='ko')=>renderToStaticMarkup(h(AirportFocusData.Provider,{value:{asOf:'2026-10-21',trends:[],checkedAt:null,preview:false,failed:false}},h(OverviewHeadline,{context:values,lang,onCountries:()=>{},onPrepare:()=>{}})));
test('approved briefing moves component counts before both comparisons without duplicating them',()=>{
 const html=render();
 assert.match(html,/data-brief-cards="approved"/);assert.match(html,/2026-10-21 기준 · T2/);
 assert.equal((html.match(/class="focus-brief-parts focus-passenger-parts"/g)??[]).length,1);
 assert.ok(html.indexOf('focus-passenger-total')<html.indexOf('focus-brief-parts'));
 assert.ok(html.indexOf('focus-brief-parts')<html.indexOf('focus-week-comparison'));
 for(const text of ['52,919명','출국 43,319명','환승 9,600명','264편','7,081명/일','감소','△ 12%','계산 기준','숫자 비교 기준','중복을 제거한 공식 총출국객 수가 아닙니다.','항공편 수는 승객 수가 아닙니다.'])assert.ok(html.includes(text),text);
 assert.match(html,/data-direction="down"/);assert.match(html,/class="focus-passenger-calculation"/);
});
test('pending and unavailable comparisons remain distinct and never become zero',()=>{
 const values={...context,flights:null,passengers:null,transferPassengers:null,referenceSum:null,flightBaseline:null,passengerBaseline:null,weekPending:true,comparisonPending:true};
 const pending=render(values);assert.equal((pending.match(/data-metric-state="pending"/g)??[]).length,2);
 assert.ok(pending.includes('비교자료 확인 중'));assert.ok(pending.includes('선택일 단순합계 확인 중'));
 assert.doesNotMatch(pending,/>0명<|>0편<|52,919|264편/);
 const unavailable=render({...values,weekPending:false,comparisonPending:false});assert.ok(unavailable.includes('비교 불가'));assert.ok(unavailable.includes('같은 기준의 수집분 일평균 없음'));
});
test('other locales keep original presentation scope and original component-count disclosure',()=>{
 for(const lang of ['en','zh','ja'] as const){const html=render(context,lang);assert.doesNotMatch(html,/data-brief-cards|focus-brief-emblem|focus-brief-parts/);assert.match(html,/<summary[^>]+aria-describedby=/);}
});
test('approved stylesheet stays scoped and uses CSS-only breakpoint layout without data or animation changes',()=>{
 const css=readFileSync('app/airport-focus-cards.css','utf8');
 for(const line of css.split('\n').filter(line=>line.includes('{')&&!line.trim().startsWith('@')))assert.ok(line.includes('[data-brief-cards=approved]'),line);
 assert.match(css,/@media\(max-width:700px\)/);assert.match(css,/grid-column:1;grid-row:3/);
 assert.match(css,/summary:focus-visible/);assert.match(css,/forced-colors:active/);
 assert.doesNotMatch(css,/animation:|transition:|backdrop-filter:blur|linear-gradient/);
});

for(const [direction,delta] of [['up',1000],['down',-1000],['neutral',0]] as const)test(`both metric comparisons retain ${direction} direction and percentage symbols`,()=>{
 const html=render({...context,referenceSum:60000+delta,flights:300+delta/1000,flightBaseline:{mean:300,delta:delta/1000,percent:delta/3000,days:30,start:'2026-09-01',end:'2026-09-30',previous:true}});
 const people=html.slice(html.indexOf('class="focus-passenger-comparison"'),html.indexOf('class="focus-core-metric focus-flight-metric"'));
 const flights=html.slice(html.indexOf('class="focus-flight-comparison"'),html.indexOf('class="focus-selected-country-stack"'));
 for(const metric of [people,flights]){
  assert.ok(metric.includes(`data-direction="${direction}"`));
  if(direction==='down'){assert.ok(metric.includes('△ '));assert.ok(metric.includes('감소'));}
  if(direction==='up'){assert.match(metric,/class="change-rate" data-direction="up">\+/);assert.ok(metric.includes('증가'));}
  if(direction==='neutral'){assert.ok(metric.includes('차이 없음'));assert.ok(metric.includes('0%'));}
 }
 assert.doesNotMatch(html,/공항 리테일 분석/);
});
