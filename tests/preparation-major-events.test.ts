import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import reviewed from '../data/reviewed-major-events.json';
import {preparationEvents,preparationEventsOn,preparationEventsInMonth} from '../lib/preparation-calendar';
import {chineseText} from '../lib/chinese-ui';
import {PreparationCalendar} from '../app/preparation-calendar';
import HolidayList from '../app/airport-focus-holidays';
import {AirportFocusData} from '../app/airport-focus-data';
const asOf='2026-10-30';
test('reviewed major dates retain actual year, scope, authority and sources, without inventing holidays',()=>{
 const all=preparationEvents(asOf),major=all.filter(e=>e.kind==='major_event');
 assert.equal(major.length,7);assert.equal(new Set(major.map(e=>e.id)).size,7);
 const dates:Record<string,[string,string]>={
  'KR-2026-11-19-csat':['2026-11-19','2026-11-19'],
  'KR-2027-11-18-csat':['2027-11-18','2027-11-18'],
  'CN-SH-2026-11-05-ciie':['2026-11-05','2026-11-10'],
  'US-2026-11-03-general-election':['2026-11-03','2026-11-03'],
  'JP-2027-01-16-common-test':['2027-01-16','2027-01-17'],
  'TW-2027-01-22-gsat':['2027-01-22','2027-01-24'],
  'HK-2027-01-17-marathon':['2027-01-17','2027-01-17'],
 };
 for(const e of major){
  assert.deepEqual([e.start,e.end],dates[e.id]);assert.equal(e.verifiedAt,asOf);
  assert.equal(e.verificationMethod,'REVIEWED_OFFICIAL_SNAPSHOT');assert.match(e.sourceURL,/^https:\/\//);
  assert.match(e.connectionNote_ko,/전국 공통 휴무일을 뜻하지 않습니다/);assert.match(e.connectionNote_ko,/예측이 아닙니다/);
  assert.ok(e.scope);assert.ok(e.description_ko);assert.ok(e.notes);
 }
 assert.equal(reviewed.automaticCollectionEnabled,false);
 assert.ok(reviewed.events.every(e=>e.sourceAuthority));
 assert.equal(preparationEvents('2026-10-29').filter(e=>e.kind==='major_event').length,0,'no future verification leaks into an older as-of');
 for(const invalid of ['2026-13-01','invalid'])assert.equal(preparationEvents(invalid).length,0);
 for(const code of ['CN','JP','US','VN','TH','TW','PH','HK','SG'])assert.ok(all.some(e=>e.country===code),code);
});
test('new event intervals are inclusive, never holiday replacements and never repeated annually',()=>{
 const all=preparationEvents(asOf,[],[{country:'JP',year:2027,scope:'national'}]);
 assert.ok(all.some(e=>e.id==='JP-2027-01-16-common-test'),'holiday replacement does not erase reviewed exams');
 for(const d of ['2026-11-05','2026-11-10'])assert.ok(preparationEventsOn(all,d).some(e=>e.id==='CN-SH-2026-11-05-ciie'));
 for(const d of ['2026-11-04','2026-11-11'])assert.ok(!preparationEventsOn(all,d).some(e=>e.id==='CN-SH-2026-11-05-ciie'));
 assert.equal(preparationEventsOn(all,'2026-11-19').filter(e=>e.id==='KR-2026-11-19-csat').length,1);
 assert.ok(!preparationEventsOn(all,'2026-11-20').some(e=>e.id==='KR-2026-11-19-csat'));
 assert.equal(preparationEventsInMonth(all,'2028-11').filter(e=>e.kind==='major_event').length,0);
 assert.equal(preparationEvents(asOf).filter(e=>e.country==='JP'&&e.name==='문화의 날'&&e.start==='2026-11-03').length,1);
 assert.equal(preparationEvents(asOf).filter(e=>e.country==='US'&&e.countryLabel==='미국'&&e.name==='추수감사절'&&e.start==='2026-11-26').length,1);
});
test('preparation grid and full 90-day explanations show major events; compact holiday card does not mislabel them',()=>{
 const events=preparationEvents(asOf);
 const grid=renderToStaticMarkup(React.createElement(PreparationCalendar,{events:preparationEventsInMonth(events,'2026-11'),month:'2026-11',today:asOf,onMonthChange:()=>{}}));
 for(const name of ['2027학년도 대학수학능력시험','제9회 중국 국제수입박람회','2026년 연방 총선거'])assert.ok(grid.includes(name),name);
 const render=(full:boolean)=>renderToStaticMarkup(React.createElement(AirportFocusData.Provider,{value:{asOf,trends:[],checkedAt:null,preview:false,failed:false}},React.createElement(HolidayList,{full})));
 const full=render(true),compact=render(false);
 for(const e of reviewed.events){
  if(e.start<'2027-02-01')assert.ok(full.includes(e.id),e.id);
  assert.ok(!compact.includes(e.id),e.id);
 }
 assert.match(full,/적용 대상·공식 출처/);assert.match(full,/시험·행사 날짜이며 전국 공통 휴무일을 뜻하지 않습니다/);assert.match(full,/공식 자료 확인 2026-10-30/);assert.match(full,/수동 검토 일정이며 자동 갱신 대상이 아닙니다/);
 assert.ok(!full.includes('holiday-KR-2027-11-18-csat'),'far-future date is in calendar, not next 90 days');
});
test('all new visible fields have reviewed Chinese translations and no backend/scheduler dependency',()=>{
 for(const e of reviewed.events){
  for(const value of [e.name,e.scope,e.description_ko,e.description_ko.split(/[.!?]/)[0],e.notes])assert.doesNotMatch(chineseText('zh',value),/[가-힣]/,value);
 }
 for(const value of ['주요 일정 · 휴무 여부 별도 확인','시험·행사 날짜이며 전국 공통 휴무일을 뜻하지 않습니다. 출입국·항공편·매출 증감 예측이 아닙니다.'])assert.doesNotMatch(chineseText('zh',value),/[가-힣]/);
 for(const file of ['lib/calendar-context.mjs','lib/official-calendar-runtime.ts','lib/airport-prep-holidays.ts'])assert.ok(!readFileSync(file,'utf8').includes('reviewed-major-events'),file);
});
