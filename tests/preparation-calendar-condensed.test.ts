import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {PreparationEventSource,preparationDescription} from '../app/preparation-event-source';
import {preparationEvents} from '../lib/preparation-calendar';
import manual from '../data/official-calendar/priority-country-multiyear.json';
import type {CalendarEvent} from '../lib/calendar-context.mjs';
const events=preparationEvents('2026-10-30');
test('every country gets one-sentence meaning and closed applicability/source without research logs',()=>{
 for(const event of events){
  for(const lang of ['ko','zh'] as const){
   const description=preparationDescription(event,lang);
   assert.doesNotMatch(description.meaning,/[.!?。！？]/);
   const html=renderToStaticMarkup(h(PreparationEventSource,{event,lang}));
   assert.match(html,/^<details(?: class="[^"]*")?>/);assert.doesNotMatch(html,/<details[^>]* open/);
   assert.ok(html.includes(event.verifiedAt));assert.ok(html.includes(event.sourceURL.replaceAll('&','&amp;')));
   if(lang==='zh')assert.doesNotMatch(html,/[가-힣]/);
  }
 }
 const nepal=events.find(e=>e.country==='NP')!,us=events.find(e=>e.id==='US-all-2026-11-11-19')!;
 const np=renderToStaticMarkup(h(PreparationEventSource,{event:nepal,lang:'ko'}));
 assert.match(np,/민간 전체 휴무는 별도 미확인/);assert.doesNotMatch(np,/2083|카르틱|BS\/AD|관보 2쪽|임의 생성/);
 assert.doesNotMatch(renderToStaticMarkup(h(PreparationEventSource,{event:us,lang:'ko'})),/ICS|403|HTML/);
 assert.match(nepal.notes,/2083년 공식 관보 2쪽/,'stored evidence remains intact');
 for(const file of ['app/preparation-calendar.tsx','app/airport-focus-holidays.tsx'])assert.ok(!readFileSync(file,'utf8').includes('event.notes'),file);
});
test('shortening retains holiday conditions, nonholiday events and useful exhibition restrictions',()=>{
 const sg=events.find(e=>e.id==='SG-all-2026-11-09-26')!;
 const sgHtml=renderToStaticMarkup(h(PreparationEventSource,{event:sg,lang:'ko'}));
 assert.match(sgHtml,/본인의 휴무일/);assert.match(sgHtml,/해당 날짜에 실제 근무하지 않을 것/);
 const china=preparationEvents('2026-10-30',manual.events as CalendarEvent[]).find(e=>e.country==='CN'&&e.start==='2026-10-01')!;
 const cnHtml=renderToStaticMarkup(h(PreparationEventSource,{event:china,lang:'ko'}));
 assert.match(cnHtml,/모든 날짜가 법정 공휴일이라는 뜻은 아닙니다/);assert.match(cnHtml,/보충근무일 2026-09-20, 2026-10-10 \(휴일 아님\)/);
 const expo=events.find(e=>e.id==='CN-SH-2026-11-05-ciie')!;
 const expoHtml=renderToStaticMarkup(h(PreparationEventSource,{event:expo,lang:'ko'}));
 assert.match(expoHtml,/11월 8~10일/);assert.match(expoHtml,/사전 등록·심사/);assert.match(expoHtml,/전국 공통 휴무일을 뜻하지 않습니다/);assert.match(expoHtml,/예측이 아닙니다/);
});
