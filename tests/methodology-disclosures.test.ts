import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AirportAtAGlance,FlightScopeNote,type LiveSummary} from '../app/live-signals';
import {SUMMARY_FIXTURE} from '../e2e/summary-fixture';
const labels={ko:'집계 기준 보기',en:'Counting methodology',zh:'查看统计口径',ja:'集計基準を見る'};
for(const lang of ['ko','en','zh','ja'] as const)test(`${lang}: flight and passenger methods are closed, counts and capped warning stay visible`,()=>{
 const airport={...SUMMARY_FIXTURE.airport,flightScope:{total:10,T1:4,T2:3,CONCOURSE:2,other:0,unassigned:1,conflicting:0,capped:true}} as LiveSummary['airport'];
 const html=renderToStaticMarkup(h(FlightScopeNote,{airport,lang}));
 const detail=html.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0]??'';
 assert.ok(detail.includes(`<summary>${labels[lang]}</summary>`));
 assert.doesNotMatch(detail.split('>')[0],/\bopen\b/);
 assert.match(detail,/101[~–]132/);
 const visible=html.replace(detail,'');
 assert.match(visible,/T1 4/);assert.match(visible,/T2 3/);assert.match(visible,/1/);
 assert.ok(visible.includes({ko:'조회 상한',en:'Query limit',zh:'查询上限',ja:'取得上限'}[lang]));
 const summary={...SUMMARY_FIXTURE,airport} as unknown as LiveSummary;
 const glance=renderToStaticMarkup(h(AirportAtAGlance,{summary,lang,showFlights:false,showCrowding:false}));
 const passenger=glance.match(/<details class="methodology-details passenger-scope-note">[\s\S]*?<\/details>/)?.[0]??'';
 assert.ok(passenger.includes(`<summary>${labels[lang]}</summary>`));
 assert.match(passenger,/T1/);assert.doesNotMatch(passenger.split('>')[0],/\bopen\b/);
});
test('selected long explanations use native closed details and retain original content',()=>{
 for(const [file,content] of [['app/airport-monthly-flights.tsx','탑승동 이용객도 T1에서'],['app/seoul-flow-models.tsx','{t.livingNote}'],['app/seoul-flow-models.tsx','{t.tourismNote}'],['app/tourism-desk.tsx','limitLines(lang, areaName)']] as const){
  const source=readFileSync(file,'utf8');
  const details=source.match(/<details\b[^>]*>[\s\S]*?<\/details>/g)??[];
  const detail=details.find(item=>item.includes(content));assert.ok(detail,file+': '+content);
  assert.doesNotMatch(detail.split('>')[0],/\bopen\b/);
 }
 const css=readFileSync('app/globals.css','utf8');
 assert.match(css,/\.methodology-details > summary \{[^}]*min-height: 44px/);
 assert.match(css,/summary:focus-visible \{ outline:/);
});

test('brief row sizing is restricted to the existing desktop query',()=>{
 const css=readFileSync('app/airport-focus-preview.css','utf8');
 const rule='grid-template-rows:auto auto auto auto minmax(0,1fr)';
 assert.equal(css.split(rule).length-1,1);
 assert.ok(css.slice(css.indexOf('@media(min-width:1000px){'),css.indexOf('/* Keep the briefing')).includes(rule));
});
