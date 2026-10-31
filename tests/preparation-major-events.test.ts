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
 assert.equal(major.length,20);assert.equal(new Set(major.map(e=>e.id)).size,20);
 const dates:Record<string,[string,string]>={
  'KR-2026-11-19-csat':['2026-11-19','2026-11-19'],
  'KR-2027-11-18-csat':['2027-11-18','2027-11-18'],
  'CN-SH-2026-11-05-ciie':['2026-11-05','2026-11-10'],
  'US-2026-11-03-general-election':['2026-11-03','2026-11-03'],
  'JP-2027-01-16-common-test':['2027-01-16','2027-01-17'],
  'TW-2027-01-22-gsat':['2027-01-22','2027-01-24'],
  'HK-2027-01-17-marathon':['2027-01-17','2027-01-17'],
  'CN-GZ-2026-10-31-canton-fair-phase3':['2026-10-31','2026-11-04'],
  'JP-FUK-2026-11-08-sumo':['2026-11-08','2026-11-22'],
  'US-LAS-2026-11-19-f1':['2026-11-19','2026-11-21'],
  'US-LAS-2027-01-06-ces':['2027-01-06','2027-01-09'],
  'VN-HAN-2026-11-07-heritage-marathon':['2026-11-07','2026-11-08'],
  'TH-PAT-2026-11-27-fireworks':['2026-11-27','2026-11-28'],
  'TW-TPE-2026-12-20-marathon':['2026-12-20','2026-12-20'],
  'SG-2026-12-04-international-marathon':['2026-12-04','2026-12-06'],
  'AU-MEL-2027-01-11-australian-open':['2027-01-11','2027-01-31'],
  'CA-AB-2026-12-26-world-juniors':['2026-12-26','2027-01-05'],
  'PH-CEB-2027-01-10-marathon':['2027-01-10','2027-01-10'],
  'MY-PEN-2026-12-13-bridge-marathon':['2026-12-13','2026-12-13'],
  'HK-2026-12-04-clockenflap':['2026-12-04','2026-12-06'],
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

test('tourism additions retain exact intervals, official hosts, admission scope and all original evidence',()=>{
 const additions=reviewed.events.slice(7),all=preparationEvents(asOf);
 assert.equal(additions.length,13);
 assert.deepEqual([...new Set(additions.map(e=>e.country))].sort(),['AU','CA','CN','HK','JP','MY','PH','SG','TH','TW','US','VN']);
 const hosts=['www.mofcom.gov.cn','www.crossroadfukuoka.jp','www.f1lasvegasgp.com','www.ces.tech','hanoi.vietnamheritagemarathon.com','www.tatnews.org','www.taipeicitymarathon.com','singaporeinternationalmarathon.com','ausopen.com','www.hockeycanada.ca','www.cebumarathon.com.ph','system.penangmarathon.gov.my','www.clockenflap.com'];
 const shift=(date:string,days:number)=>new Date(Date.parse(`${date}T00:00:00Z`)+days*86400000).toISOString().slice(0,10);
 for(const [index,e] of additions.entries()){
  assert.equal(new URL(e.sourceURL).hostname,hosts[index]);
  assert.ok(e.scope.includes(' · '));assert.ok(e.displayConditions_ko?.length);
  assert.equal(all.filter(v=>v.id===e.id).length,1);
  assert.equal(all.find(v=>v.id===e.id)?.kind,'major_event');
  for(const day of [e.start,e.end])assert.ok(preparationEventsOn(all,day).some(v=>v.id===e.id),`${e.id}: ${day}`);
  for(const day of [shift(e.start,-1),shift(e.end,1)])assert.ok(!preparationEventsOn(all,day).some(v=>v.id===e.id),`${e.id}: excludes ${day}`);
  for(const value of e.displayConditions_ko??[])assert.doesNotMatch(chineseText('zh',value),/[가-힣]/);
  for(const value of [e.name,e.scope,e.description_ko,e.notes,...e.displayConditions_ko??[]]){
   assert.deepEqual(chineseText('zh',value).match(/\d+/g),value.match(/\d+/g),'translation preserves numeric scope');
  }
 }
 const by=(id:string)=>additions.find(e=>e.id===id)!;
 assert.match(by('US-LAS-2027-01-06-ces').scope,/18세 이상/);
 assert.match(by('US-LAS-2027-01-06-ces').notes,/일반인 공개행사가 아닙니다/);
 assert.match(by('JP-FUK-2026-11-08-sumo').notes,/전일 매진·당일권 미판매/);
 assert.match(by('VN-HAN-2026-11-07-heritage-marathon').notes,/11월 6~8일 엑스포와 구분/);
 assert.match(by('SG-2026-12-04-international-marathon').notes,/풀코스는 12월 6일/);
 assert.match(by('AU-MEL-2027-01-11-australian-open').notes,/본선 1월 17~31일/);
 assert.match(by('TW-TPE-2026-12-20-marathon').notes,/하프 종점은 난징동로 4단/);
 assert.match(by('CA-AB-2026-12-26-world-juniors').notes,/사전 평가전은 제외/);
 assert.match(by('HK-2026-12-04-clockenflap').notes,/16세 미만은 18세 초과/);
 // Compare the seven pre-existing evidence records to the reviewed base, not a looser reconstructed subset.
 const original=JSON.parse(readFileSync(new URL('./reviewed-major-events-original.fixture.json',import.meta.url),'utf8'));
 assert.deepEqual(reviewed.events.slice(0,7),original.events);
});

test('day chips prioritize starting events without losing ongoing events or changing canonical details order',()=>{
 const all=preparationEvents(asOf),daily=preparationEventsOn(all,'2026-11-19');
 const original=daily.map(e=>e.id);
 const grid=renderToStaticMarkup(React.createElement(PreparationCalendar,{events:all,month:'2026-11',today:asOf,onMonthChange:()=>{}}));
 const cell=grid.split('<time dateTime="2026-11-19">')[1]?.split('</button>')[0];
 assert.ok(cell,'November 19 cell present');
 assert.ok(cell.includes('2027학년도 대학수학능력시험'));
 assert.ok(cell.includes('2026 라스베이거스 F1 그랑프리'));
 assert.match(cell,/<span>수능<\/span>/);assert.match(cell,/<span>F1<\/span>/);
 assert.ok(!cell.includes('2026 후쿠오카 11월 스모 대회'),'ongoing event remains behind +N');
 assert.ok(cell.includes(`+${daily.length-2}`));
 assert.deepEqual(preparationEventsOn(all,'2026-11-19').map(e=>e.id),original,'chip selection cannot reorder event data');
 assert.ok(daily.some(e=>e.id==='JP-FUK-2026-11-08-sumo'));
 const filtered=renderToStaticMarkup(React.createElement(PreparationCalendar,{events:all.filter(e=>e.country==='JP'),month:'2026-11',today:asOf,onMonthChange:()=>{}}));
 assert.ok(filtered.split('<time dateTime="2026-11-19">')[1]?.split('</button>')[0].includes('2026 후쿠오카 11월 스모 대회'));
});

const expectedChipLabels:Record<string,[string,string]>={
 "KR-2026-11-19-csat": [
  "수능",
  "韩国高考"
 ],
 "KR-2027-11-18-csat": [
  "수능",
  "韩国高考"
 ],
 "CN-SH-2026-11-05-ciie": [
  "수입박람회",
  "进博会"
 ],
 "US-2026-11-03-general-election": [
  "총선",
  "大选"
 ],
 "JP-2027-01-16-common-test": [
  "공통시험",
  "统考"
 ],
 "TW-2027-01-22-gsat": [
  "학측",
  "学测"
 ],
 "HK-2027-01-17-marathon": [
  "마라톤",
  "马拉松"
 ],
 "CN-GZ-2026-10-31-canton-fair-phase3": [
  "교역회",
  "广交会"
 ],
 "JP-FUK-2026-11-08-sumo": [
  "스모",
  "相扑"
 ],
 "US-LAS-2026-11-19-f1": [
  "F1",
  "F1"
 ],
 "US-LAS-2027-01-06-ces": [
  "CES",
  "CES"
 ],
 "VN-HAN-2026-11-07-heritage-marathon": [
  "마라톤",
  "马拉松"
 ],
 "TH-PAT-2026-11-27-fireworks": [
  "불꽃축제",
  "烟花节"
 ],
 "TW-TPE-2026-12-20-marathon": [
  "마라톤",
  "马拉松"
 ],
 "SG-2026-12-04-international-marathon": [
  "마라톤",
  "马拉松"
 ],
 "AU-MEL-2027-01-11-australian-open": [
  "호주오픈",
  "澳网"
 ],
 "CA-AB-2026-12-26-world-juniors": [
  "하키",
  "冰球"
 ],
 "PH-CEB-2027-01-10-marathon": [
  "마라톤",
  "马拉松"
 ],
 "MY-PEN-2026-12-13-bridge-marathon": [
  "마라톤",
  "马拉松"
 ],
 "HK-2026-12-04-clockenflap": [
  "음악축제",
  "音乐节"
 ]
};

test('all twenty reviewed chip labels are short in Korean and Chinese while titles preserve exact official names',()=>{
 const events=preparationEvents(asOf),before=JSON.stringify(reviewed);
 const chips=(html:string)=>[...html.matchAll(/<span class="preparation-event-chip"[^>]*title="([^"]*)"[^>]*>[\s\S]*?<span>([^<]*)<\/span><\/span>/g)].map(match=>({title:match[1],visible:match[2]}));
 assert.equal(Object.keys(expectedChipLabels).length,20);
 for(const e of events.filter(e=>e.kind==='major_event'))for(const lang of ['ko','zh'] as const){
  const html=renderToStaticMarkup(React.createElement(PreparationCalendar,{events:[e],month:e.start.slice(0,7),today:asOf,onMonthChange:()=>{},lang}));
  const labels=chips(html),expected=expectedChipLabels[e.id][lang==='ko'?0:1];
  assert.ok(labels.length>0,e.id);
  for(const chip of labels){assert.equal(chip.visible,expected,e.id);assert.equal(chip.title,chineseText(lang,e.name),e.id);assert.ok(!/^20\d{2}/.test(chip.visible));}
  assert.ok(html.includes(`dateTime="${e.start}"`));
  assert.ok(html.includes(chineseText(lang,`${Number(e.start.slice(5,7))}월 ${Number(e.start.slice(8))}일, 1개 일정, 전체 이름과 적용 대상 보기`)));
 }
 const holiday=events.find(e=>e.country==='JP'&&e.name==='문화의 날'&&e.start==='2026-11-03')!;
 assert.ok(holiday);
 for(const event of [holiday,{...events.find(e=>e.id==='KR-2026-11-19-csat')!,id:'KR-unknown-event',name:'새 행사'}, {...holiday,id:'KR-2026-11-19-csat'}])for(const lang of ['ko','zh'] as const){
  const html=renderToStaticMarkup(React.createElement(PreparationCalendar,{events:[event],month:event.start.slice(0,7),today:asOf,onMonthChange:()=>{},lang}));
  for(const chip of chips(html)){assert.equal(chip.visible,chineseText(lang,event.name));assert.equal(chip.title,chineseText(lang,event.name));}
 }
 assert.equal(JSON.stringify(reviewed),before,'short labels cannot mutate official evidence');
});
