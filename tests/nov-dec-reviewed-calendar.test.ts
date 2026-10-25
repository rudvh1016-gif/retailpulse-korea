import test from 'node:test';
import assert from 'node:assert/strict';
import seed from '../data/airport-focus-preview/calendar-context.json';
import {projectOfficialCalendars} from '../lib/official-calendar-runtime';
import {preparationEvents,preparationEventsInMonth,preparationEventsOn} from '../lib/preparation-calendar';
import {mergeBriefHolidays,planningHolidays} from '../lib/holiday-flight-brief';
import {countryTrendCalendar} from '../lib/country-trend-calendar';
import {briefHoliday} from '../lib/brief-localization';
import type {CalendarEvent} from '../lib/calendar-context.mjs';
const events=seed.events.map(event=>({...event,region:event.region??undefined})) as CalendarEvent[];
const id='TW-2026-12-25-constitution-government',day='2026-12-25',asOf='2026-10-25';
test('Taiwan Constitution Day is one exact institutional date with official provenance and weekend separation',()=>{
 const matches=events.filter(event=>event.country==='TW'&&event.start===day);assert.equal(matches.length,1);
 const event=matches[0];assert.deepEqual([event.id,event.kind,event.scope,event.start,event.end,event.verifiedAt],[id,'public_holiday','institutional',day,day,asOf]);
 assert.match(event.region!,/정부 행정기관 공무원/);assert.match(event.region!,/12\/26~27은 주말/);assert.equal(event.sourceURL,'https://www.dgpa.gov.tw/information?pid=12574&uid=41');
 assert.equal(events.filter(event=>event.country==='TW'&&['2026-12-26','2026-12-27'].includes(event.start)).length,0);
});
test('stored-calendar projection and both planning readers preserve the bounded Taiwan event',()=>{
 const api=projectOfficialCalendars([],events,new Date(asOf+'T12:00:00Z'));assert.equal(api.events.filter(event=>event.id===id).length,1);
 const full=preparationEvents(asOf,api.events),month=preparationEventsInMonth(full,'2026-12');assert.equal(month.filter(event=>event.id===id).length,1);
 assert.equal(preparationEventsOn(full,day).filter(event=>event.id===id).length,1);for(const date of ['2026-12-24','2026-12-26','2026-12-27'])assert.equal(preparationEventsOn(full,date).filter(event=>event.id===id).length,0);
 const brief=mergeBriefHolidays([],api.events);const planning=planningHolidays(brief,'2026-12-01','2026-12-31',asOf,new Map([['대만',1000]]),20);assert.equal(planning.filter(event=>event.id===id).length,1);
 for(const lang of ['en','zh'] as const){const label=briefHoliday(brief.find(event=>event.id===id)!,lang);assert.doesNotMatch(label.name+label.scope,/[가-힣]/);}
 const context=countryTrendCalendar(api.events,{country:'TW',selectedMonth:'2026-12',actualDataMonths:['2026-11','2026-12'],asOf}).details.find(event=>event.eventId===id)!;
 assert.equal(context.role,'route');assert.match(context.scopeLabel,/정부 행정기관/);assert.deepEqual([context.start,context.end],[day,day]);
});
test('CSAT operational timing is never mislabeled or selected as a holiday or school break',()=>{
 assert.equal(events.some(event=>/수능|영어듣기|148973935/.test(event.name+event.sourceURL)),false);
 assert.equal(preparationEvents(asOf,events).some(event=>/수능|영어듣기/.test(event.name)),false);
 assert.equal(mergeBriefHolidays([],events).some(event=>/수능|영어듣기/.test(event.name)),false);
});
