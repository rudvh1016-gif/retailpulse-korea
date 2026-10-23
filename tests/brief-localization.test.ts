import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {briefCountryName,briefHoliday,briefHolidayText,briefReturnText,briefText} from '../lib/brief-localization';
import {passengerDailyDeltaText} from '../lib/passenger-reference-comparison';
import {PreparationEvent} from '../app/airport-preparation-event';
import {PassengerBriefComparison} from '../app/airport-brief-comparison';
import type {BriefHoliday} from '../lib/holiday-flight-brief';
import type {PassengerReferenceMonth} from '../lib/passenger-reference-month';
const seed=JSON.parse(readFileSync('data/airport-focus-preview/holidays-summary.json','utf8')).events as BriefHoliday[];
const hangul=/[가-힣]/;
for(const lang of ['en','zh'] as const){
 test(`${lang}: every current brief holiday name, meaning and institutional scope is translated without changing metadata`,()=>{
  const original=JSON.stringify(seed);
  for(const event of seed){
   const label=briefHoliday(event,lang);
   for(const field of [label.name,label.meaning,label.scope,label.country,briefReturnText(event,lang)])assert.doesNotMatch(field,hangul,`${event.id}: ${field}`);
   const rendered=renderToStaticMarkup(h(PreparationEvent,{event,lang}));
   assert.doesNotMatch(rendered,hangul,event.id);
   assert.ok(rendered.includes(event.start.slice(5).replace('-','/')));
   assert.ok(rendered.includes(event.end.slice(5).replace('-','/')));
   if(event.sourceURL)assert.ok(rendered.includes(event.sourceURL.replaceAll('&','&amp;')));
   assert.ok(rendered.includes(`data-country="${event.country}"`));
  }
  assert.equal(JSON.stringify(seed),original);
 });
 test(`${lang}: complete, partial, missing, zero and sub-resolution comparisons preserve numerical truth`,()=>{
  const base:PassengerReferenceMonth={month:'2026-09',start:'2026-09-01',end:'2026-09-30',expectedDays:30,completeDays:30,missingDates:[],mean:60000,status:'COMPLETE'};
  const render=(total:number|null,baseline=base)=>renderToStaticMarkup(h(PassengerBriefComparison,{total,baseline,lang,day:'2026-10-21'}));
  assert.match(render(52919),/60,000/);assert.match(render(52919),/7,081/);assert.match(render(52919),/▲ 12%/);assert.doesNotMatch(render(52919),hangul);
  assert.match(render(61000),/\+2%/);
  const partial=render(52919,{...base,status:'PARTIAL',mean:null,completeDays:22,missingDates:Array.from({length:8},(_,i)=>`2026-09-0${i+1}`)});
  assert.match(partial,/22/);assert.match(partial,/30/);assert.match(partial,/8/);assert.doesNotMatch(partial,/%|[가-힣]/);
  const observed:PassengerReferenceMonth={...base,status:'PARTIAL',mean:null,completeDays:22,
   missingDates:Array.from({length:8},(_,i)=>`2026-09-${i+23}`),
   observedDays:Array.from({length:22},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,departures:50000,transfers:10000}))};
  const sample=render(52919,observed);
  for(const value of ['60,000','7,081','▲ 12%','1,320,000','22','30','8'])assert.ok(sample.includes(value),value);
  assert.doesNotMatch(sample,hangul);
  assert.match(sample,lang==='en'?/Forecast arithmetic sum/ : /预报简单合计/);
  assert.match(sample,lang==='en'?/Not a full-month average/ : /非全月平均值/);
  assert.match(render(61000,observed),/\+2%/);
  assert.doesNotMatch(render(100,{...observed,observedDays:observed.observedDays!.map(row=>({...row,departures:0,transfers:0}))}),/%|[가-힣]/);
  assert.doesNotMatch(render(null),hangul);assert.doesNotMatch(render(100,{...base,mean:0}),/%|[가-힣]/);
  for(const delta of [0,.01,-.01,100,-100,NaN])assert.doesNotMatch(passengerDailyDeltaText(delta,lang),hangul);
 });
}
test('country labels retain regional identity and Korean remains byte-for-byte original',()=>{
 assert.equal(briefCountryName('US','괌','en'),'Guam');assert.equal(briefCountryName('US','사이판','zh'),'塞班岛');assert.equal(briefCountryName('US','하와이','en'),'Hawaii');
 for(const event of seed){const ko=briefHoliday(event,'ko');assert.equal(ko.name,event.name);assert.equal(ko.scope,event.scope);assert.equal(ko.meaning,event.meaning_ko||event.scope);assert.equal(ko.country,event.countryLabel);}
 assert.equal(briefText('ko','원문','English','中文'),'원문');
 assert.equal(briefHolidayText('Unreviewed source wording','en'),'Unreviewed source wording');
});
test('production and preview thread locale into the complete brief; no font or style changes are needed',()=>{
 for(const file of ['app/airport-focus-production.tsx','app/airport-focus-preview.tsx'])assert.match(readFileSync(file,'utf8'),/<OverviewHeadline lang=\{lang\} context=/);
 const source=readFileSync('app/airport-focus-preview.tsx','utf8').split('function PreparationBrief(')[1].split('export default function AirportFocusPreview')[0];
 for(const component of ['PreparationEvent','PassengerBriefComparison','SelectedCountryChanges','TodayReturnContext','PreparationBrief'])assert.ok(source.includes(`<${component} lang={lang}`),component);
 assert.doesNotMatch(source,/lang="ko"/);
});
test('all runtime JP/US normalized names have EN/ZH translations',()=>{
 const runtime=readFileSync('lib/official-calendar-runtime.ts','utf8');
 const names=runtime.split('const names:Record<string,string>=')[1].split(';')[0];
 for(const scope of ['미국 취임식 지정 지역·해당 연방공무원','미국 연방공무원(관측 휴일)'])for(const lang of ['en','zh'] as const)assert.doesNotMatch(briefHolidayText(scope,lang),hangul);
 for(const match of names.matchAll(/:'([^']+)'/g))for(const lang of ['en','zh'] as const)assert.doesNotMatch(briefHolidayText(match[1],lang),hangul,match[1]);
});
