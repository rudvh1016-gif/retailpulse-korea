import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'lightningcss';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {preparationEvents,preparationEventsInMonth,preparationEventsOn,preparationMonthDays,shiftPreparationMonth} from '../lib/preparation-calendar';
import {PreparationCalendar} from '../app/preparation-calendar';
import HolidayList from '../app/airport-focus-holidays';
import {AirportFocusData} from '../app/airport-focus-data';
import {PreparationArrivalLink} from '../app/preparation-arrival-link';
import snapshot from '../data/airport-focus-preview/calendar-context.json';
import type {CalendarEvent} from '../lib/calendar-context.mjs';

const asOf='2026-10-21';
test('current month keeps reviewed Korean holidays, full descriptions, exact source dates and daily multiday coverage',()=>{
 const all=preparationEvents(asOf),october=preparationEventsInMonth(all,'2026-10');
 for(const [date,name] of [['2026-10-03','개천절'],['2026-10-05','개천절 대체공휴일'],['2026-10-09','한글날']]){
  const event=preparationEventsOn(october,date).find(event=>event.country==='KR');assert.equal(event?.name,name);assert.equal(event?.verifiedAt,snapshot.events.find(row=>row.country==='KR'&&row.start===date)?.verifiedAt);assert.equal(event?.verificationMethod,'REVIEWED_OFFICIAL_SNAPSHOT');
 }
 for(const date of ['2026-10-25','2026-10-26','2026-10-27'])assert.ok(preparationEventsOn(october,date).some(event=>event.name==='띠딘쥣 연휴'));
 assert.ok(!preparationEventsOn(october,'2026-10-28').some(event=>event.name==='띠딘쥣 연휴'));
 const full=JSON.parse(readFileSync('data/airport-focus-preview/holidays.json','utf8'));
 for(const event of full.events)assert.equal(all.find(row=>row.id===event.id)?.description_ko,event.description_ko);
 assert.ok(all.some(event=>event.country==='KR'&&event.start==='2026-12-25'));
 assert.equal(preparationEventsInMonth(all,'2028-02').length,0,'unknown dates are not invented');
});
test('new annual review refreshes source metadata without duplicating an event or dropping its full explanation',()=>{
 const reviewed:CalendarEvent={id:'KR-all-2026-12-25-major',country:'KR',name:'성탄절',scope:'national',kind:'public_holiday',start:'2026-12-25',end:'2026-12-25',status:'verified',verifiedAt:asOf,sourceURL:'https://www.kasa.go.kr/'};
 const same=preparationEvents(asOf,[reviewed]).filter(event=>event.id===reviewed.id);
 assert.equal(same.length,1);assert.equal(same[0].verifiedAt,asOf);assert.equal(same[0].sourceURL,reviewed.sourceURL);assert.match(same[0].description_ko,/예수의 탄생/);
});
test('month arithmetic uses civil dates, including leap years, year boundaries, and complete weeks',()=>{
 assert.equal(shiftPreparationMonth('2026-12',1),'2027-01');assert.equal(shiftPreparationMonth('2027-01',-1),'2026-12');
 const leap=preparationMonthDays('2028-02');assert.equal(leap.filter(Boolean).length,29);assert.equal(leap.length%7,0);assert.equal(leap[2],'2028-02-01');
 assert.equal(preparationMonthDays('2026-10')[4],'2026-10-01');assert.throws(()=>preparationMonthDays('2026-13'));
});
test('scope-aware replacement never revives superseded dates and never promotes unverified or expired school data',()=>{
 const base:CalendarEvent={id:'JP-replacement',country:'JP',name:'검증 일정',scope:'national',kind:'public_holiday',start:'2026-11-04',end:'2026-11-04',status:'verified',verifiedAt:'2026-10-20',sourceURL:'https://www8.cao.go.jp/'};
 const scope=[{country:'JP',year:2026,scope:'national' as const}];
 const rows=preparationEvents(asOf,[base,{...base,id:'unverified',status:'unverified'}, {...base,id:'expired',reviewValidUntil:'2026-10-20'}, {...base,id:'future-review',verifiedAt:'2026-10-22'}, {...base,id:'school',kind:'school_break',scope:'regional',region:'신주쿠 구립학교'}],scope);
 assert.ok(rows.some(row=>row.id==='JP-replacement'));assert.ok(rows.some(row=>row.id==='school'&&row.scope==='신주쿠 구립학교'));
 assert.ok(!rows.some(row=>['unverified','expired','future-review'].includes(row.id)));assert.ok(!rows.some(row=>row.name==='문화의 날'));
 assert.ok(!preparationEvents(asOf,[{...base,status:'expired'}],scope).some(row=>row.country==='JP'&&row.start==='2026-11-03'));
});
test('calendar renders flag and small name per day with accessible expansion, +N overflow and truthful empty guidance',()=>{
 const all=preparationEvents(asOf),events=preparationEventsInMonth(all,'2026-12');
 const html=renderToStaticMarkup(React.createElement(PreparationCalendar,{events,month:'2026-12',today:asOf,onMonthChange:()=>{}}));
 assert.match(html,/aria-label="이전 달"/);assert.match(html,/aria-label="다음 달"/);assert.match(html,/>오늘<\/button>/);assert.match(html,/preparation-event-more/);assert.match(html,/전체 이름과 적용 대상 보기/);assert.match(html,/aria-expanded="false"/);assert.match(html,/빈 날짜는 휴일 없음이 아닌/);assert.match(html,/성탄/);
 const korean=renderToStaticMarkup(React.createElement(PreparationCalendar,{events:preparationEventsInMonth(all,'2026-10'),month:'2026-10',today:asOf,onMonthChange:()=>{}}));assert.match(korean,/kr\.svg/);
});
test('full list retains explanations and scope/check date while compact mode has no month grid',()=>{
 const provider=(full:boolean)=>renderToStaticMarkup(React.createElement(AirportFocusData.Provider,{value:{asOf,trends:[],checkedAt:null,preview:false,failed:false}},React.createElement(HolidayList,{full})));
 const html=provider(true);assert.match(html,/preparation-country-glass/);assert.match(html,/preparation-month-grid/);assert.match(html,/다가오는 90일 일정 설명/);assert.match(html,/공식 자료 확인 2026-10-19/);assert.match(html,/KASI 자동 수집 성공/);assert.match(html,/휴일·방학을 확인한 목록은 아닙니다/);assert.match(html,/불교 우안거의 끝을 기념/);
 assert.doesNotMatch(provider(false),/preparation-month-grid/);
});
test('arrival action preserves exact anchor and reused icon, without video, new image or unbounded motion',()=>{
 const html=renderToStaticMarkup(React.createElement(PreparationArrivalLink));assert.match(html,/href="#arrival-allowances"/);assert.match(html,/도착국 반입 면세한도 확인하기/);assert.match(html,/navigation-icon/);assert.doesNotMatch(html,/<video|<img/);
 const css=readFileSync('app/preparation-calendar.css','utf8');assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/560ms ease-out 1/);assert.doesNotMatch(css,/infinite|transition:all/);assert.match(css,/min-width:44px;min-height:44px/);
});
test('compiled compact preparation glass keeps the standard blur and accessible opaque fallbacks',()=>{
 const css=readFileSync('app/preparation-calendar.css','utf8');
 for(const targets of [undefined,{chrome:111<<16,safari:16<<16,ios_saf:16<<16}]){
  const compiled=transform({filename:'preparation-calendar.css',code:Buffer.from(css),minify:true,...(targets?{targets}:{})}).code.toString();
  const normal=compiled.match(/\.focus-country-filter \.preparation-country-glass\{([^}]+)\}/)?.[1];
  assert.ok(normal);assert.match(normal,/(?:^|;)backdrop-filter:blur\(12px\)(?:;|$)/,'Chromium needs the unprefixed property after minification');
  if(targets)assert.match(normal,/(?:^|;)-webkit-backdrop-filter:blur\(12px\)(?:;|$)/,'older Safari keeps its prefixed fallback');
  assert.match(compiled,/@media\s*\(prefers-reduced-transparency:reduce\),\(prefers-contrast:more\)\{\.focus-country-filter \.preparation-country-glass\{[^}]*backdrop-filter:none[^}]*background:#fff/);
  assert.match(compiled,/@media\s*\(forced-colors:active\)\{\.focus-country-filter \.preparation-country-glass\{[^}]*backdrop-filter:none[^}]*background:Canvas[^}]*border-color:CanvasText/i);
 }
});
