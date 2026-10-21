import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement as h} from 'react';
import {PassengerBriefComparison} from '../app/airport-brief-comparison';
import {PreparationEvent} from '../app/airport-preparation-event';
import type {PassengerReferenceMonth} from '../lib/passenger-reference-month';
const ref:PassengerReferenceMonth={month:'2026-09',start:'2026-09-01',end:'2026-09-30',expectedDays:30,completeDays:30,missingDates:[],mean:60_000,status:'COMPLETE'};
test('brief renders people/day and shared signed percentage, with honest partial and loading states',()=>{
 const render=(total:number|null,baseline=ref)=>renderToStaticMarkup(h(PassengerBriefComparison,{total,day:"2026-10-21",baseline}));
 assert.match(render(52_919),/60,000명\/일 대비/);assert.match(render(52_919),/7,081명\/일 감소/);assert.match(render(52_919),/▲ 11.8%/);assert.match(render(52_919),/data-direction="down"/);
 const partial=render(52_919,{...ref,status:'PARTIAL',mean:null,completeDays:22,missingDates:Array.from({length:8},(_,i)=>`2026-09-0${i+1}`)});
 assert.match(partial,/30일 중 22일 합산자료 확인 · 8일 미확인 · 비교 보류/);assert.doesNotMatch(partial,/%|명\/일 감소|명\/일 증가/);
 assert.match(render(null),/선택일 단순합계 확인 중/);assert.match(render(100,{...ref,mean:0}),/증감률 계산 불가/);
});
test('each planning country owns its flag, preserved date/source and optional country metric',()=>{
 const event={id:'jp',country:'JP',countryLabel:'일본',name:'문화의 날',start:'2026-11-03',end:'2026-11-03',type:'public_holiday',scope:'전국 공휴일',sourceURL:'https://example.test/jp',meaning_ko:'문화의 날 설명'};
 const japan=renderToStaticMarkup(h(PreparationEvent,{event},h('small',null,'9월 일본 노선 출발 여객, 전월비 +2.7%')));
 const us=renderToStaticMarkup(h(PreparationEvent,{event:{...event,id:'us',country:'US',countryLabel:'미국'}}));
 assert.match(japan,/data-country="JP"/);assert.match(japan,/<img[^>]+width="24" height="24" alt=""/);assert.ok(japan.indexOf('<img')<japan.indexOf('일본:'));
 assert.match(japan,/11\/03–11\/03/);assert.match(japan,/문화의 날 설명/);assert.match(japan,/https:\/\/example.test\/jp/);assert.match(japan,/9월 일본 노선/);assert.doesNotMatch(us,/9월 일본 노선/);
 const source=readFileSync('app/airport-focus-preview.tsx','utf8');
 assert.match(source,/monthly&&event.id===lead\?\.id&&<small className="focus-country-month-trend">\{monthlyTrend\}/);
 assert.match(source,/describe\(months,true\)/);assert.doesNotMatch(source,/<p>\{describe\(months[^}]*\)}<\/p><small>/);
});
test('transparent neutral glass is scoped to the whole report with white accessibility fallback',()=>{
 const css=readFileSync('app/airport-focus-preview.css','utf8');
 const surface=css.split('/* One glass surface')[1].split('.focus-event-country')[0];
 assert.match(surface,/\.airport-focus-shell \.focus-report\{background:rgb\(255 255 255 \/ 40%\)/);
 assert.match(surface,/-webkit-backdrop-filter:blur\(14px\);backdrop-filter:blur\(14px\)/);
 assert.match(surface,/0 2px 9px rgb\(24 28 34 \/ 5%\)/);assert.match(surface,/prefers-reduced-transparency:reduce/);assert.match(surface,/background:#fff/);assert.match(surface,/forced-colors:active/);
 assert.doesNotMatch(surface,/(?:padding|margin|height|font-size|animation|transition):/);
 assert.match(css,/\.airport-focus-shell\{[^}]*background:white/);
 const source=readFileSync('app/airport-focus-preview.tsx','utf8');
 assert.match(source,/= \{t\('단순합계','arithmetic sum','简单合计'\)\}/);assert.match(source,/중복을 제거한 공식 총출국객 수가 아닙니다/);assert.match(source,/미확인 날짜:/);
});
