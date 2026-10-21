import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calendarMonthKey,calendarRefreshDecision,CALENDAR_RETRY_COOLDOWN_MS} from '../lib/official-calendar-cadence.mjs';
const good={status:'VERIFIED',checked_at:'2026-12-01T00:00:00Z',last_verified_at:'2026-12-01T00:00:00Z'};
test('successful calendar month follows KST, including UTC year boundary',()=>{
 assert.equal(calendarMonthKey('2026-12-31T21:07:00Z'),'2027-01');assert.equal(calendarMonthKey('bad'),null);
 assert.equal(calendarRefreshDecision(good,new Date('2026-12-31T14:59:59Z')),'SKIPPED_MONTHLY_GUARD');
 assert.equal(calendarRefreshDecision(good,new Date('2026-12-31T15:00:00Z')),'DUE');
 assert.equal(calendarRefreshDecision(good,new Date('2027-01-03T00:00:00Z')),'DUE');
});
test('failed attempt cooldown survives month boundary and cannot overwrite success time',()=>{
 const failed={...good,status:'ERROR',checked_at:'2027-01-31T00:00:00Z'};
 assert.equal(calendarRefreshDecision(failed,new Date('2027-02-01T00:00:00Z')),'SKIPPED_RETRY_COOLDOWN');
 assert.equal(calendarRefreshDecision(failed,new Date(Date.parse(failed.checked_at)+CALENDAR_RETRY_COOLDOWN_MS)),'DUE');
 assert.equal(calendarRefreshDecision({...good,status:'ERROR',checked_at:'2026-12-03T00:00:00Z'},new Date('2026-12-20T00:00:00Z')),'SKIPPED_MONTHLY_GUARD');
 assert.equal(calendarRefreshDecision(good,new Date('2026-11-30T00:00:00Z')),'SKIPPED_FUTURE_GUARD');
});
test('persistent failure has at most five requests per source in a 31-day month',()=>{
 let previous,calls=0;
 for(let day=1;day<=31;day++){const now=new Date(`2026-10-${String(day).padStart(2,'0')}T00:00:00Z`);if(calendarRefreshDecision(previous,now)==='DUE'){calls++;previous={status:'ERROR',checked_at:now.toISOString(),last_verified_at:null};}}
 assert.equal(calls,5);
});
test('calendar metadata gate leaves customs daily job and single scheduler intact',()=>{
 const yml=readFileSync('.github/workflows/collect-production.yml','utf8');
 assert.deepEqual([...yml.matchAll(/cron:\s*"([^"]+)"/g)].map(m=>m[1]),['7 21 * * *']);
 const customs=yml.split('  customs-allowance-check:')[1].split('  official-calendar-refresh:')[0];
 assert.match(customs,/collect-customs-allowances\.ts/);assert.doesNotMatch(customs,/calendar-window|monthly/i);
 const calendar=yml.split('  official-calendar-refresh:')[1];
 assert.equal((calendar.match(/refresh-official-calendars\.ts/g)||[]).length,1);
 assert.doesNotMatch(calendar,/calendar-window|date.*01/);
});
