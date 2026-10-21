import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isExactDate, matchCalendarContext} from '../lib/calendar-context.mjs';

const calendar=JSON.parse(readFileSync(new URL('../data/airport-focus-preview/calendar-context.json',import.meta.url),'utf8'));
const full=JSON.parse(readFileSync(new URL('../data/airport-focus-preview/holidays.json',import.meta.url),'utf8'));
const summary=JSON.parse(readFileSync(new URL('../data/airport-focus-preview/holidays-summary.json',import.meta.url),'utf8'));
const kr=calendar.events.filter(event=>event.country==='KR'&&event.scope==='national'&&event.kind==='public_holiday');
// Manually verified against KASA's published annual attachments, not a lunar
// algorithm. The 2026 additions are covered by MPM's 2026-04-29 announcement.
const expected={
  2026:'01-01 02-16 02-17 02-18 03-01 03-02 05-01 05-05 05-24 05-25 06-03 06-06 07-17 08-15 08-17 09-24 09-25 09-26 10-03 10-05 10-09 12-25',
  2027:'01-01 02-06 02-07 02-08 02-09 03-01 05-01 05-03 05-05 05-13 06-06 07-17 07-19 08-15 08-16 09-14 09-15 09-16 10-03 10-04 10-09 10-11 12-25 12-27',
};
const yearRows=year=>kr.filter(event=>event.start.startsWith(`${year}-`));

test('KR includes exactly the 22 and 24 officially published named holiday dates for 2026 and 2027',()=>{
  for(const [year,dates] of Object.entries(expected)){
    assert.deepEqual(yearRows(year).map(event=>event.start).sort(),dates.split(' ').map(day=>`${year}-${day}`));
  }
  assert.equal(kr.length,46);
  assert.equal(new Set(kr.map(event=>event.id)).size,46);
  assert.equal(new Set(kr.map(event=>event.start)).size,46);
  for(const event of kr){
    assert.ok(isExactDate(event.start));
    assert.equal(event.end,event.start);
    assert.equal(event.region,null);
    assert.equal(event.status,'verified');
    assert.equal(event.verifiedAt,'2026-10-21');
    assert.match(event.notes,/수동 대조.*실시간 수집이 아님/);
    assert.ok(['www.korea.kr','www.mpm.go.kr'].includes(new URL(event.sourceURL).hostname));
  }
});

test('KR applies the 2026 amendment and only the published substitute dates',()=>{
  for(const year of [2026,2027]){
    assert.equal(kr.find(event=>event.start===`${year}-05-01`).name,'노동절');
    assert.equal(kr.find(event=>event.start===`${year}-07-17`).name,'제헌절');
  }
  for(const date of ['2026-05-01','2026-07-17'])assert.match(kr.find(event=>event.start===date).sourceURL,/mpm\.go\.kr/);
  assert.deepEqual(yearRows(2026).filter(event=>event.name.includes('대체공휴일')).map(event=>event.start),['2026-03-02','2026-05-25','2026-08-17','2026-10-05']);
  assert.deepEqual(yearRows(2027).filter(event=>event.name.includes('대체공휴일')).map(event=>event.start),['2027-02-09','2027-05-03','2027-07-19','2027-08-16','2027-10-04','2027-10-11','2027-12-27']);
  for(const date of ['2026-06-08','2026-09-28','2027-06-07'])assert.ok(!kr.some(event=>event.start===date));
  assert.equal(kr.find(event=>event.start==='2026-06-03').name,'제9회 전국동시지방선거일');
});

test('KR excludes preliminary 2028 dates, ordinary weekends, school vacations and unconfirmed temporary holidays',()=>{
  assert.ok(!kr.some(event=>event.start>='2028-01-01'||/임시공휴일|방학|일요일/.test(event.name)));
  assert.equal(calendar.automaticCollectionEnabled,false);
  for(const date of ['2026-02-14','2026-09-27','2027-01-02','2027-08-14'])assert.ok(!kr.some(event=>event.start===date));
});

test('existing full-detail Christmas and New Year share the annual IDs and appear once in the briefing projection',()=>{
  for(const date of ['2026-12-25','2027-01-01']){
    const annual=kr.find(event=>event.start===date);
    const detail=full.events.find(event=>event.country==='KR'&&event.start===date);
    assert.equal(annual.id,detail.id);
    assert.equal(annual.name,detail.name);
    assert.equal(summary.events.filter(event=>event.id===annual.id).length,1);
  }
  for(const event of kr)assert.equal(summary.events.filter(row=>row.country==='KR'&&row.start===event.start&&row.end===event.end).length,1);
});

test('annual review dates are not backdated to a frozen preview and KR stays explicitly opt-in origin context',()=>{
  const query={country:'KR',selectedMonth:'2027-05',actualDataMonths:['2027-05'],asOf:'2026-10-21',includeOriginContext:true};
  assert.equal(matchCalendarContext(kr,query).details.length,4);
  assert.ok(matchCalendarContext(kr,query).details.every(event=>event.role==='origin'));
  assert.equal(matchCalendarContext(kr,{...query,asOf:'2026-10-20'}).details.length,0);
  assert.equal(matchCalendarContext(kr,{...query,includeOriginContext:false}).details.length,0);
});
