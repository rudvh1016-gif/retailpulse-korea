import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {chineseText} from '../lib/chinese-ui';
import chineseMappings from '../lib/chinese-ui.json';
import {airportFocusCopy} from '../app/airport-focus-copy';
import {preparationEvents,preparationEventsInMonth} from '../lib/preparation-calendar';
import {officialCalendarResponse} from '../app/api/airport/calendar/route';
import {AirportFocusData} from '../app/airport-focus-data';
import arrival from '../data/airport-focus-preview/arrival-allowances.json';
import {evaluateArrival,arrivalCheckSummary,arrivalCheckExplanation,visibleArrivalConditions} from '../lib/arrival-allowance-guidance';
import {arrivalCountryActions} from '../lib/arrival-country-actions';
import type {ArrivalCountry} from '../lib/arrival-allowance-guidance';
register(new URL('./helpers/static-css-loader.mjs',import.meta.url));
const {default:HolidayList}=await import('../app/airport-focus-holidays');
const {default:CountryTrends}=await import('../app/airport-focus-trends');
const {default:StaffBriefing}=await import('../app/airport-staff-briefing');
const {default:Arrival}=await import('../app/arrival-allowances-preview');
const {PreparationCalendar}=await import('../app/preparation-calendar');
const hangul=/[가-힣]/;
const visible=(html:string)=>html.replace(/<[^>]*>/g,'');
function strings(value:unknown):string[]{return typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(strings):value&&typeof value==='object'?Object.values(value).flatMap(strings):[];}
function translated(value:unknown){for(const text of strings(value))assert.doesNotMatch(chineseText('zh',text),hangul,text);}
test('Chinese production shell never falls back to Korean',()=>translated(airportFocusCopy('zh')));
test('all stored arrival display data translates without changing canonical values or rules',()=>{
 const original=JSON.stringify(arrival);translated(arrival);
 for(const country of arrival.countries as ArrivalCountry[]){
  const result=evaluateArrival(country,{});translated(result.guidance);
  translated(arrivalCountryActions(country.id,{purpose:'ordinary',age:'adult'}));
  const visit=(answers:Record<string,string>)=>{
   const next=visibleArrivalConditions(country,answers).find(condition=>!answers[condition.id]);
   if(next){for(const option of next.options)visit({...answers,[next.id]:option.id});return;}
   const value=evaluateArrival(country,answers);translated(value.result);translated(value.guidance);
   translated(arrivalCountryActions(country.id,answers));
  };visit({});
 }
 assert.equal(JSON.stringify(arrival),original);
});
test('every current holiday card and calendar-detail field has Chinese copy; dates and source URLs remain canonical',()=>{
 for(const event of preparationEvents('2026-10-28')){
  for(const key of ['name','countryLabel','scope','description_ko','dateLabel_ko','cardSummary_ko','connectionStatus_ko','connectionNote_ko','restConditions_ko','notes'] as const)translated(event[key]);
  assert.equal(chineseText('zh',event.sourceURL),event.sourceURL);
  assert.equal(chineseText('zh',event.start),event.start);assert.equal(chineseText('zh',event.end),event.end);
 }
});
test('server review statuses and unavailable cases do not fall back to Korean',()=>{
 translated([arrivalCheckSummary(),arrivalCheckExplanation()]);
 for(const state of ['NUMERIC_VERIFIED','SOURCE_UNCHANGED','REVIEW_REQUIRED','CHECK_UNAVAILABLE','BASELINE_REQUIRED','STALE','UNKNOWN']){
  const row={state,lastCheckedAt:'2026-10-28',nextCheckAt:'2026-10-29',id:'JP'};
  translated([arrivalCheckSummary(row),arrivalCheckExplanation(row)]);
 }
});
test('Chinese rest intervals and unknown classifications retain their distinct meaning and workdays',async()=>{
 const response=await officialCalendarResponse(null,new Date('2026-10-28T00:00:00Z'));
 const calendar=await response.json();
 const reviewed=preparationEvents('2026-10-28',calendar.events,calendar.calendarReplacementScopes);
 const rest=reviewed.find(event=>event.country==='CN'&&event.start==='2026-10-01');
 assert.ok(rest);
 assert.equal(chineseText('zh',rest.scope),'全国调休时段');
 assert.match(chineseText('zh',rest.description_ko),/并不表示所有日期都是法定节假日/);
 assert.match(chineseText('zh',rest.notes),/2026-09-20, 2026-10-10（不是假日）/);
 translated([rest.scope,rest.description_ko,rest.notes]);
 const fallback=preparationEvents('2026-10-28').find(event=>event.country==='CN'&&event.start==='2026-09-25');
 assert.ok(fallback);
 assert.equal(chineseText('zh',fallback.scope),'全国假期安排');
 assert.match(chineseText('zh',fallback.description_ko),/区分仍在确认中/);
 translated([fallback.scope,fallback.description_ko]);
});
test('calendar, holiday disclosures, monthly chart, staff and arrival render in Chinese in normal and missing states',()=>{
 const render=(failed:boolean)=>renderToStaticMarkup(h(AirportFocusData.Provider,{value:{asOf:failed?'':'2026-10-28',trends:failed?[]:[{code:'JP',label:'일본',points:[{month:'2026-08',departures:1000},{month:'2026-09',departures:2000}]}],checkedAt:null,preview:true,failed}},h('div',null,
  h(HolidayList,{lang:'zh',full:true}),h(CountryTrends,{lang:'zh',full:true}),
  h(StaffBriefing,{lang:'zh',day:'2026-10-28',peak:null,changes:[],flights:{day:'2026-10-28',countries:[],scope:'all',status:'MISSING'},retrievedAt:null}),h(Arrival,{lang:'zh'}))));
 for(const failed of [false,true])assert.doesNotMatch(visible(render(failed)),hangul);
 const events=preparationEvents('2026-10-28');
 for(const month of ['2026-10','2026-11','2026-12','2027-01'])assert.doesNotMatch(visible(renderToStaticMarkup(h(PreparationCalendar,{lang:'zh',events:preparationEventsInMonth(events,month),month,today:'2026-10-28',onMonthChange:()=>{}}))),hangul);
});
test('interpolated source numbers retain precision and Korean remains unchanged',()=>{
 const numbers=(text:string)=>(text.match(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g)??[]).sort();
 for(const [original,translation] of Object.entries(chineseMappings))assert.deepEqual(numbers(translation),numbers(original),original);
 for(const value of ['760mL 기준 3병','궐련만 200개비. 다른 종류·혼합은 별도 환산.','2026년 9월 기준','9월 · 43,319명',' (공동 3개 시간대)']){
  assert.deepEqual(chineseText('zh',value).match(/\d[\d,.]*/g),value.match(/\d[\d,.]*/g));assert.equal(chineseText('ko',value),value);
 }
 assert.equal(chineseText('zh','未核实原文'), '未核实原文');
 assert.equal(chineseText('zh','새로운 원천 이름'), '새로운 원천 이름');
});
