import test from 'node:test';
import assert from 'node:assert/strict';
import {sortCalendarEvents} from '../lib/calendar-display-order';
import {countryTrendCalendar,groupTrendCalendarItems} from '../lib/country-trend-calendar';
import {preparationEvents,preparationEventsInMonth,preparationEventsOn} from '../lib/preparation-calendar';
import {planningHolidays} from '../lib/holiday-flight-brief';
import seed from '../data/airport-focus-preview/calendar-context.json';
import type {CalendarEvent} from '../lib/calendar-context.mjs';
const events=seed.events.map(event=>({...event,region:event.region??undefined})) as CalendarEvent[];
const shuffled=<T,>(items:readonly T[],offset:number)=>items.map((item,index)=>({item,key:((index+1)*7919+offset*104729)%9973})).sort((a,b)=>a.key-b.key).map(row=>row.item);
test('date, Korean country name, event name and stable identity order is independent of input, without mutation',()=>{
 const items=[{id:'z',country:'JP',name:'B',start:'2026-08-01'},{id:'a',country:'JP',name:'A',start:'2026-08-01'},{id:'c',country:'CN',name:'A',start:'2026-08-01'},{id:'k',country:'KR',name:'A',start:'2026-07-01'}];
 for(let i=0;i<30;i++){const input=Object.freeze(shuffled(items,i)),before=JSON.stringify(input);assert.deepEqual(sortCalendarEvents(input).map(item=>item.id),['k','a','z','c']);assert.equal(JSON.stringify(input),before);}
});
test('regional China groups use earliest real start and all regions are date ordered; Korean origin roles remain preserved',()=>{
 const query={country:'CN',selectedMonth:'2026-09',actualDataMonths:['2026-08','2026-09'],asOf:'2026-10-25'};
 const expected=groupTrendCalendarItems(countryTrendCalendar(events,query).details);
 for(let i=0;i<20;i++){
  const input=shuffled(events,i),before=JSON.stringify(input);
  const details=countryTrendCalendar(input,query).details,groups=groupTrendCalendarItems(shuffled(details,i+2));
  assert.deepEqual(groups,expected);assert.equal(JSON.stringify(input),before);
  const china=groups.find(group=>group.country==='CN'&&group.kind==='school_break')!;
  assert.deepEqual(china.items.map(item=>item.start),['2026-07-01','2026-07-08']);
  assert.equal(china.items[0].end,'2026-08-31');assert.notEqual(china.items[0].sourceURL,china.items[1].sourceURL);
  for(const role of ['route','origin']){const starts=groups.filter(group=>group.role===role).map(group=>group.items[0].start);assert.deepEqual(starts,[...starts].sort());}
 }
});
test('mixed API/static preparation and month/day entry points guarantee order',()=>{
 const all=preparationEvents('2026-10-25',events);
 for(let i=0;i<10;i++){
  assert.deepEqual(preparationEvents('2026-10-25',shuffled(events,i)),all);
  for(const select of [()=>preparationEventsInMonth(shuffled(all,i),'2026-08'),()=>preparationEventsOn(shuffled(all,i),'2026-08-15')]){const list=select();assert.deepEqual(list,sortCalendarEvents(list));}
 }
});
test('brief merged lists and selected planning lists are chronological while preserving route-priority membership',()=>{
 const items=['JP','CN','VN'].map((country,index)=>({id:country,country,countryLabel:country,name:country,start:`2026-10-${String(10+index).padStart(2,'0')}`,end:'2026-10-20',type:'public_holiday',scope:'national',verifiedAt:'2026-10-01',sourceURL:'https://example.test'}));
 const counts=new Map([['CN',30],['VN',40],['JP',1]]);
 for(let i=0;i<10;i++){
  const input=shuffled(items,i),before=JSON.stringify(input);
  assert.deepEqual(sortCalendarEvents(input),items);
  const selected=planningHolidays(input,'2026-10-01','2026-10-31','2026-10-25',counts);
  assert.deepEqual(selected.map(item=>item.country),['VN','CN']);
  assert.deepEqual(sortCalendarEvents(selected).map(item=>item.country),['CN','VN']);
  assert.equal(JSON.stringify(input),before);
 }
});
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {CountryTrendCalendarContext} from '../app/country-trend-calendar-context';
test('all localized country contexts render one chronological list with preserved item roles and keep sources folded',()=>{
 for(const lang of ['ko','en','zh','ja'] as const)for(const country of ['JP','CN','VN','US','KR'])for(const month of ['2026-04','2026-08','2026-09']){
  const previous=new Date(`${month}-01T00:00:00Z`);previous.setUTCMonth(previous.getUTCMonth()-1);
  const row={code:country,label:country,points:[{month:previous.toISOString().slice(0,7),departures:100},{month,departures:110}]};
  const html=renderToStaticMarkup(createElement(CountryTrendCalendarContext,{row,events:shuffled(events,7),asOf:'2026-10-25',lang}));
  if(!html)continue;
  assert.doesNotMatch(html,/<details[^>]*\bopen(?:\s|=|>)/);
  const groups=groupTrendCalendarItems(countryTrendCalendar(events,{country,selectedMonth:month,actualDataMonths:row.points.map(point=>point.month),asOf:'2026-10-25'}).details);
  const rendered=[...html.matchAll(/<p[^>]+data-calendar-role="(route|origin)" data-calendar-start="([^"]+)"/g)].map(match=>({role:match[1],start:match[2]}));
  assert.deepEqual(rendered,groups.map(group=>({role:group.role,start:group.items[0].start})),lang+' '+country+' '+month);
  assert.deepEqual(rendered.map(item=>item.start),rendered.map(item=>item.start).sort());
  if(groups.some(group=>group.role==='origin'))assert.match(html,/한국 출발지 참고/);
 }
});
test('brief display sorting is after representative selection and leaves monthly lead and route-flight joins intact',()=>{
 const source=readFileSync(new URL('../app/airport-focus-preview.tsx',import.meta.url),'utf8');
 for(const code of ['const lead=months[0]','sortCalendarEvents(events).map(event=>','sortCalendarEvents(ending).map(event=>','sortCalendarEvents(currentEvents).map(event=>','flights={flights}','flights={context.eventFlights}'])assert.ok(source.includes(code),code);
});
