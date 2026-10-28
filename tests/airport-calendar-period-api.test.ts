import test from 'node:test';
import assert from 'node:assert/strict';
import {officialCalendarResponse} from '../app/api/airport/calendar/route';
import {periodCalendar} from '../lib/airport-period/calendar.mjs';
test('shared preparation API exposes reviewed rest intervals, workdays and explicit annual coverage',async()=>{
 const reply=await officialCalendarResponse(null,new Date('2026-10-28T00:00:00Z'));
 const value=await reply.json();
 const cn=periodCalendar(value,'CN','2026-09-24','2026-09-30','2026-10-28');
 assert.equal(cn.holidayDays,3);assert.equal(cn.events[0].dateKind,'announced_rest_interval');
 assert.deepEqual(periodCalendar(value,'CN','2026-09-20','2026-09-20','2026-10-28').workdays,['2026-09-20']);
 assert.equal(periodCalendar(value,'CN','2027-09-20','2027-09-20','2026-10-28').status,'unknown');
 assert.equal(periodCalendar(value,'JP','2026-09-28','2026-09-28','2026-10-28').status,'unknown');
 assert.equal(periodCalendar(value,'KR','2026-09-24','2026-09-30','2026-10-28').holidayDays,3);
});
