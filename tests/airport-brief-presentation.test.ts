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
 assert.match(render(52_919),/60,000명\/일/);assert.match(render(52_919),/▲ 7,081명\/일/);assert.match(render(52_919),/▲ 11.8%/);assert.match(render(52_919),/data-direction="down"/);
 const partial=render(52_919,{...ref,status:'PARTIAL',mean:null,completeDays:22,missingDates:Array.from({length:8},(_,i)=>`2026-09-0${i+1}`)});
 assert.match(partial,/30일 중 22일 합산자료 확인 · 8일 미확인 · 비교 보류/);assert.doesNotMatch(partial,/%|명\/일 감소|명\/일 증가/);
 assert.match(render(null),/선택일 단순합계 확인 중/);assert.match(render(100,{...ref,mean:0}),/증감률 계산 불가/);
});
test('proved observed days render the sample label, numerator, divisor and missing days, not a whole-month mean',()=>{
 const baseline:PassengerReferenceMonth={...ref,status:'PARTIAL',mean:null,completeDays:22,
  missingDates:Array.from({length:8},(_,i)=>`2026-09-${i+23}`),
  observedDays:Array.from({length:22},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,departures:50_000,transfers:10_000}))};
 const html=renderToStaticMarkup(h(PassengerBriefComparison,{total:52_919,day:'2026-10-21',baseline}));
 assert.match(html,/전월 수집 22일 기준 일평균\(전체 30일 중\)/);assert.match(html,/60,000명\/일/);assert.match(html,/▲ 7,081명\/일/);assert.match(html,/▲ 11.8%/);
 assert.match(html,/1,320,000명 ÷ 22일 · 8일 미확인 · 월전체 평균 아님/);assert.doesNotMatch(html,/비교 보류/);
});
test('each planning country owns its flag, preserved date/source and optional country metric',()=>{
 const event={id:'jp',country:'JP',countryLabel:'일본',name:'문화의 날',start:'2026-11-03',end:'2026-11-03',type:'public_holiday',scope:'전국 공휴일',sourceURL:'https://example.test/jp',meaning_ko:'문화의 날 설명'};
 const japan=renderToStaticMarkup(h(PreparationEvent,{event},h('small',null,'9월 일본 노선 출발 여객, 전월비 +2.7%')));
 const us=renderToStaticMarkup(h(PreparationEvent,{event:{...event,id:'us',country:'US',countryLabel:'미국'}}));
 assert.match(japan,/data-country="JP"/);assert.match(japan,/<img[^>]+width="24" height="24" alt=""/);assert.ok(japan.indexOf('<img')<japan.indexOf('일본:'));
 assert.match(japan,/11\/03<small class="focus-event-weekday">\(화요일\)/);assert.equal((japan.match(/<time /g)||[]).length,1);assert.match(japan,/문화의 날 설명/);assert.match(japan,/https:\/\/example.test\/jp/);assert.match(japan,/9월 일본 노선/);assert.doesNotMatch(us,/9월 일본 노선/);
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

test('planning date weekdays follow each civil date in every supported language and host timezone',()=>{
 const event={id:'ph',country:'PH',countryLabel:'필리핀',name:'만성절·위령의 날',start:'2026-11-01',end:'2026-11-02',type:'public_holiday',scope:'전국 특별 비근무일',sourceURL:'https://example.test/ph'};
 const original=process.env.TZ;
 try{
  for(const zone of ['UTC','Asia/Seoul','America/Los_Angeles','Pacific/Kiritimati']){
   process.env.TZ=zone;
   for(const [lang,first,last] of [['ko','일요일','월요일'],['en','Sunday','Monday'],['zh','星期日','星期一'],['ja','日曜日','月曜日']] as const){
    const html=renderToStaticMarkup(h(PreparationEvent,{event,lang}));
    assert.ok(html.includes(`11/01<small class="focus-event-weekday">(${first})</small></time>–<wbr/><time`),zone);
    assert.ok(html.includes(`11/02<small class="focus-event-weekday">(${last})`),zone);
    assert.equal((html.match(/<time /g)||[]).length,2);
   }
   for(const [start,end,first,last] of [['2026-12-31','2027-01-01','목요일','금요일'],['2028-02-29','2028-03-01','화요일','수요일']]){
    const html=renderToStaticMarkup(h(PreparationEvent,{event:{...event,start,end}}));
    assert.ok(html.includes(`(${first})`));assert.ok(html.includes(`(${last})`));
   }
  }
 }finally{if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
 const css=readFileSync('app/airport-focus-preview.css','utf8');
 assert.match(css,/\.focus-event-date\{white-space:nowrap\}/);
 assert.match(css,/\.focus-event-date \.focus-event-weekday\{font-size:11px\}/);
 for(const file of ['app/airport-focus-production.tsx','app/airport-focus-preview.tsx'])assert.match(readFileSync(file,'utf8'),/<OverviewHeadline lang=\{lang\}/);
});

test('upcoming summaries keep dates and trends visible while preserving evidence in closed native details',()=>{
 const seed=JSON.parse(readFileSync('data/airport-focus-preview/holidays-summary.json','utf8')).events;
 for(const lang of ['ko','en','zh','ja'] as const){
  for(const country of ['JP','VN','TR']){
   const event=seed.find((item:{country:string})=>item.country===country);
   const html=renderToStaticMarkup(h(PreparationEvent,{event,lang},h('small',{className:'focus-country-month-trend'},'2026-09 route passengers +2.7%')));
   const [visible,details]=html.split('<details');
   assert.match(visible,/<h4>/);assert.match(visible,/<time /);assert.match(visible,/2026-09 route passengers \+2.7%/);
   assert.doesNotMatch(visible,/focus-holiday-gloss|귀국 준비|Return planning|返程准备/);
   assert.ok(details);assert.doesNotMatch(details,/^ open/);assert.match(details,/<summary>/);
   assert.match(details,/focus-holiday-gloss/);assert.ok(details.includes(event.sourceURL.replaceAll('&','&amp;')));
   if(country==='TR'){assert.match(visible,/10\/28/);assert.match(visible,/13/);assert.match(visible,/10\/29/);if(lang==='ja')assert.match(visible,/13時から祝日/);}
   if(lang==='ja')assert.match(details,/日程の詳細/);
   if(lang==='en'||lang==='zh')assert.doesNotMatch(html,/[가-힣]/);
  }
 }
 const event={...seed[0],scope:'확인 중: 오후 일부 시간만 적용'};
 assert.match(renderToStaticMarkup(h(PreparationEvent,{event})).split('<details')[0],/확인 중: 오후 일부 시간만 적용/);
 for(const scope of ['13:00 이후 적용 범위 확인 중','13시 이전 적용 여부 미확인']){
  const unknown={...seed[0],scope};
  assert.ok(renderToStaticMarkup(h(PreparationEvent,{event:unknown})).split('<details')[0].includes(scope));
 }
 const source=readFileSync('app/airport-focus-preview.tsx','utf8');
 assert.match(source,/휴일 종료 기준 · 귀국객 예측 아님/);
 assert.match(source,/\$\{reply\?\.month\} \$\{lead.countryLabel\} 노선 출발 여객, 전월비/);
 assert.doesNotMatch(source,/<p>\{describe\(/);
});

test('daily-average core stays concise with closed basis and directional count in all locales',()=>{
 const observed:PassengerReferenceMonth={...ref,status:'PARTIAL',mean:null,completeDays:22,
  missingDates:Array.from({length:8},(_,i)=>`2026-09-${i+23}`),
  observedDays:Array.from({length:22},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,departures:50_000,transfers:10_000}))};
 for(const lang of ['ko','en','zh','ja'] as const)for(const total of [60000,61000,59000]){
  const html=renderToStaticMarkup(h(PassengerBriefComparison,{total,day:'2026-10-21',baseline:observed,lang}));
  const core=html.split('<details')[0],basis=html.split('<details')[1];
  assert.doesNotMatch(core,/1,320,000/);assert.match(core,/60,000/);assert.match(core,/2026-09/);
  assert.match(core,/data-direction="(?:up|down|neutral)"/);
  assert.match(core,total===61000?/\+1,000/:total===59000?/▲ 1,000/:/0/);
  assert.match(basis,/^ class="focus-passenger-calculation">/);assert.match(basis,/1,320,000/);
  if(lang!=='ko')assert.doesNotMatch(html,/[가-힣]/);
  if(lang==='ko')assert.match(core,/2026-09월-22일 MTD 예보 일평균 60,000명 대비/);
 }
 const css=readFileSync('app/airport-focus-preview.css','utf8');
 assert.match(css,/focus-passenger-calculation>summary[^}]*min-height:44px/);
 assert.match(css,/focus-passenger-calculation>summary:focus-visible/);
 assert.match(css,/\.focus-passenger-rate\{display:inline-block;white-space:nowrap\}/);
 assert.match(css,/\.focus-passenger-zero-basis\{display:block;overflow-wrap:anywhere\}/);
});
test('event title and institutional scope remain distinct without removing evidence',()=>{
 const event={id:'th',country:'TH',countryLabel:'태국',name:'Chulalongkorn 국왕 추모일',start:'2026-10-23',end:'2026-10-23',type:'bank_holiday',scope:'금융기관 휴일. 민간 전체 휴무가 아닙니다.',sourceURL:'https://example.test/th'};
 const html=renderToStaticMarkup(h(PreparationEvent,{event}));
 assert.match(html,/<h4>.*Chulalongkorn 국왕 추모일<\/h4><small class="focus-event-scope">\(금융기관\)<\/small>/);
 assert.match(html,/민간 전체 휴무가 아닙니다/);assert.match(html,/https:\/\/example.test\/th/);
 const staff=readFileSync('app/airport-staff-route-holiday.tsx','utf8');
 assert.match(staff,/<h4>\{event.country==='TH'&&<img[^>]+\/>\}\{countryName\(event.country,event.countryLabel,lang\)\} \{label.name\}<\/h4>/);
 assert.match(staff,/className="staff-holiday-scope">\{scope\}/);
 assert.match(staff,/<p>\{label.scope\}<\/p>/);
});
