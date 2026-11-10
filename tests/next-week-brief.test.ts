import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as brief from '../lib/holiday-flight-brief';
import {PreparationEvent} from '../app/airport-preparation-event';
import {preparationEvents} from '../lib/preparation-calendar';
import type {BriefHoliday} from '../lib/holiday-flight-brief';

const seed=()=>JSON.parse(readFileSync('data/airport-focus-preview/holidays-summary.json','utf8')).events as BriefHoliday[];
test('reported November 10 next week contains the reviewed Mexico and Czech public holidays without runtime or passenger data',()=>{
 const events=brief.planningHolidays(brief.mergeBriefHolidays(seed(),undefined),'2026-11-16','2026-11-22','2026-11-10',new Map());
 assert.deepEqual(events.map(event=>[event.country,event.start,event.end]),[['MX','2026-11-16','2026-11-16'],['CZ','2026-11-17','2026-11-17']]);
 for(const event of events){
  assert.equal(event.verifiedAt,'2026-11-10');
  assert.equal(preparationEvents('2026-11-10').find(row=>row.id===event.id)?.start,event.start);
  const html=renderToStaticMarkup(h(PreparationEvent,{event,planning:true}));
  assert.match(html,new RegExp(`data-country="${event.country}"`));
  assert.ok(html.includes(event.sourceURL!.replaceAll('&','&amp;')));
 }
 assert.ok(!brief.planningHolidays(seed(),'2026-11-16','2026-11-22','2026-11-09',new Map()).some(event=>['MX','CZ'].includes(event.country)),'later evidence must not be backdated');
});
test('next Monday through Sunday uses the supplied civil date at Sunday, month, year, and leap boundaries',()=>{
 assert.equal(typeof brief.nextPlanningWeek,'function');
 for(const [asOf,start,end] of [
  ['2026-11-10','2026-11-16','2026-11-22'],
  ['2026-11-15','2026-11-16','2026-11-22'],
  ['2026-11-16','2026-11-23','2026-11-29'],
  ['2026-11-30','2026-12-07','2026-12-13'],
  ['2026-12-27','2026-12-28','2027-01-03'],
  ['2026-12-31','2027-01-04','2027-01-10'],
  ['2028-02-27','2028-02-28','2028-03-05'],
 ])assert.deepEqual(brief.nextPlanningWeek(asOf),{start,end},asOf);
 for(const date of ['', 'bad','2026-02-29','2026-11-10T23:00:00-09:00'])assert.equal(brief.nextPlanningWeek(date),null);
});
test('week selection includes both edges and overlapping events but never extends the week to find content',()=>{
 const base:BriefHoliday={id:'one',country:'MX',countryLabel:'멕시코',name:'검증 일정',start:'2026-11-16',end:'2026-11-16',type:'public_holiday',scope:'전국 공휴일',sourceURL:'https://example.test/official',verifiedAt:'2026-11-10'};
 for(const [start,end,expected] of [['2026-11-16','2026-11-16',1],['2026-11-22','2026-11-22',1],['2026-11-15','2026-11-16',1],['2026-11-22','2026-11-23',1],['2026-11-15','2026-11-15',0],['2026-11-23','2026-11-23',0]] as const){
  assert.equal(brief.planningHolidays([{...base,start,end}],'2026-11-16','2026-11-22','2026-11-10',new Map()).length,expected);
 }
 assert.deepEqual(brief.planningHolidays([],'2026-11-16','2026-11-22','2026-11-10',new Map()),[]);
 for(const patch of [{reviewValidUntil:'2026-11-09'},{verifiedAt:'2026-11-11'},{conditional:true},{isRepresentative:false}])assert.deepEqual(brief.planningHolidays([{...base,...patch}],'2026-11-16','2026-11-22','2026-11-10',new Map()),[]);
});
test('an empty reviewed week reports missing registered coverage rather than endless loading or no holidays',async()=>{
 const component=await import('../app/preparation-week-empty').catch(()=>null);
 assert.ok(component,'an explicit empty state must be available');
 const ko=renderToStaticMarkup(h(component.PreparationWeekEmpty,{lang:'ko'}));
 assert.match(ko,/등록된 대표 일정이 없습니다/);
 assert.match(ko,/모든 국가의 휴일이 없다는 뜻은 아닙니다/);
 assert.doesNotMatch(ko,/대조하고 있습니다|확인 중|aria-busy="true"/);
 for(const lang of ['en','zh','ja'] as const){
  const html=renderToStaticMarkup(h(component.PreparationWeekEmpty,{lang}));
  assert.doesNotMatch(html,/[가-힣]|aria-busy="true"/);
 }
});


test('empty optional calendar data and unrelated replacement scopes preserve reviewed seed dates',()=>{
 const expected=['MX-all-2026-11-16-major','CZ-all-2026-11-17-major'];
 for(const [events,scopes] of [[undefined,[]],[[],[]],[[],[{country:'US',year:2026,scope:'institutional'}]]] as const){
  const merged=brief.mergeBriefHolidays(seed(),events,scopes);
  const selected=brief.planningHolidays(merged,'2026-11-16','2026-11-22','2026-11-10',new Map(),merged.length);
  assert.deepEqual(selected.map(event=>event.id),expected);
 }
});
