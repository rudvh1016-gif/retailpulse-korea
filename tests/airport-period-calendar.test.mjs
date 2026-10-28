import test from 'node:test';
import assert from 'node:assert/strict';
import {periodCalendar,holidaySuggestions} from '../lib/airport-period/calendar.mjs';
import {compareCountryRanges} from '../lib/airport-period/analysis.mjs';
import {readFileSync} from 'node:fs';
const seed=JSON.parse(readFileSync('data/airport-focus-preview/calendar-context.json'));
const manual=JSON.parse(readFileSync('data/official-calendar/priority-country-multiyear.json'));
const asOf='2026-10-28';
const calendar={events:[...seed.events.filter(e=>e.country!=='CN'),...manual.events],sources:[],calendarCoverage:[{country:'CN',year:2026,scope:'national',verifiedAt:manual.checkedOn}]};
const context=(country,start,end=start,c=calendar)=>periodCalendar(c,country,start,end,asOf);

test('CN reference includes exactly three Mid-Autumn rest days; KR and JP remain separate',()=>{
 const cn=context('CN','2026-09-24','2026-09-30');
 assert.equal(cn.status,'holiday');assert.equal(cn.holidayDays,3);assert.equal(cn.events.length,1);
 assert.equal(cn.events[0].start,'2026-09-25');assert.equal(cn.events[0].end,'2026-09-27');assert.equal(cn.events[0].dateKind,'announced_rest_interval');
 assert.equal(context('KR','2026-09-24','2026-09-30').holidayDays,3);
 assert.equal(context('JP','2026-09-24','2026-09-30').holidayDays,0);
 assert.equal(context('CN','2026-09-28','2026-09-30').status,'no_holiday');
 assert.equal(context('JP','2026-09-21','2026-09-23').holidayDays,3);
});
test('known nonholiday, uncollected, stale, failed, sparse and unpublished years are distinct',()=>{
 assert.equal(context('CN','2026-09-28').status,'no_holiday');
 assert.equal(context('CN','2026-09-28','2026-09-28',null).status,'unknown');
 assert.equal(context('CN','2027-09-28').status,'unknown');
 assert.equal(context('CN','2026-12-31','2027-01-02').status,'unknown');
 assert.equal(context('VN','2026-09-28').status,'unknown');
 for(const status of ['ERROR','STALE','NOT_COLLECTED','REVIEW_REQUIRED']){
  const failed={...calendar,sources:[{country:'CN',status}]};
  assert.equal(context('CN','2026-09-28','2026-09-28',failed).status,'unknown');
  const lastGood=context('CN','2026-09-25','2026-09-25',failed);assert.equal(lastGood.status,'holiday');assert.equal(lastGood.refreshFailed,true);
 }
 const expired={...calendar,events:calendar.events.map(e=>({...e,reviewValidUntil:'2026-10-27'})),calendarCoverage:[]};
 assert.equal(context('CN','2026-09-25','2026-09-25',expired).status,'unknown');
});
test('makeup working days and nonnational/cultural events do not become holiday counts',()=>{
 const c=context('CN','2026-09-20');assert.deepEqual(c.workdays,['2026-09-20']);assert.equal(c.status,'no_holiday');assert.equal(c.holidayDays,0);
 const event=calendar.events.find(e=>e.country==='CN');
 for(const extra of [{...event,scope:'regional'},{...event,kind:'cultural_observance'},{...event,status:'unverified'},{...event,verifiedAt:'2027-01-01'}]){
  assert.equal(context('CN',extra.start,extra.end,{events:[extra]}).status,'unknown');
 }
});
test('recommendations follow changed official years and never join the gap between CN holidays',()=>{
 const rows=Array.from({length:45},(_,i)=>new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10)).flatMap(date=>['CN','JP'].map(country=>({date,country})));
 const list=holidaySuggestions(calendar,rows,asOf);
 assert.ok(list.some(e=>e.country==='CN'&&e.start==='2026-09-25'&&e.end==='2026-09-27'));
 assert.ok(list.some(e=>e.country==='CN'&&e.start==='2026-10-01'&&e.end==='2026-10-07'&&e.beforeStart==='2026-09-24'));
 assert.ok(list.some(e=>e.country==='JP'&&e.start==='2026-09-21'&&e.end==='2026-09-23'));
 const next={events:[{...calendar.events.find(e=>e.country==='CN'),start:'2027-09-15',end:'2027-09-17'}]};
 assert.equal(holidaySuggestions(next,[{country:'CN',date:'2027-09-15'}],'2027-01-01')[0].start,'2027-09-15');
 assert.deepEqual(holidaySuggestions(null,rows,asOf),[]);
});
test('7/7 versus 6/7 flight coverage retains raw means and missing dates alongside holiday context',()=>{
 const rows=Array.from({length:14},(_,i)=>new Date(Date.UTC(2026,8,24+i)).toISOString().slice(0,10)).filter(date=>date!=='2026-10-07').map(date=>({date,country:'CN',scope:'ALL',value:date<'2026-10-01'?137:138,complete:true}));
 const m=compareCountryRanges(rows,'CN',{aStart:'2026-09-24',aEnd:'2026-09-30',bStart:'2026-10-01',bEnd:'2026-10-07'});
 assert.equal(m.previous.total,137);assert.equal(m.current.total,138);assert.equal(m.coverage.previous.days,7);assert.equal(m.coverage.current.days,6);assert.deepEqual(m.coverage.current.missing,['2026-10-07']);
 assert.equal(context('CN',m.coverage.previous.start,m.coverage.previous.end).holidayDays,3);
});
