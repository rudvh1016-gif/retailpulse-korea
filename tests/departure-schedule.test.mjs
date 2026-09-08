import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { persistDepartureSchedule, readDepartureSchedule } from '../lib/departure-schedule.ts';
import { summarizeScheduledBriefing } from '../lib/scheduled-briefing.ts';
import { buildPersonalBrief, recommendedPreferences } from '../lib/personal-briefing.ts';

test('official next-day snapshot is changed-only, replaces withdrawn flights, and leaves last good data on empty refresh', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('drizzle/0018_airport_departure_schedule.sql','utf8'));
  const db = { prepare: sql => ({ bind: (...params) => ({sql,params}) }),
    batch: async statements => statements.map(({sql,params}) => ({meta:{changes:Number(sqlite.prepare(sql).run(...params).changes)}})) };
  const date='2026-09-09';
  const flight={physicalFlightId:'KE703',terminal:'T2',flightNumber:'KE703',masterFlightNumber:'KE703',scheduledAt:`${date}T08:00:00+09:00`,retrievedAt:'2026-09-08T00:00:00Z'};
  const read=()=>sqlite.prepare('SELECT payload,retrieved_at AS retrievedAt FROM airport_departure_schedule WHERE service_date=?').get(date);
  try {
    assert.equal((await persistDepartureSchedule(db,date,[flight,{...flight,physicalFlightId:'KE705',flightNumber:'KE705',masterFlightNumber:'KE705'}])).changedRows,1);
    assert.equal((await persistDepartureSchedule(db,date,[{...flight,retrievedAt:'2026-09-08T01:00:00Z'},{...flight,physicalFlightId:'KE705',flightNumber:'KE705',masterFlightNumber:'KE705'}])).changedRows,0);
    assert.equal(readDepartureSchedule(read(),date).length,2);
    await persistDepartureSchedule(db,date,[flight]);
    assert.equal(readDepartureSchedule(read(),date).length,1);
    await persistDepartureSchedule(db,date,[]);
    assert.equal(readDepartureSchedule(read(),date).length,1);
    const schedule=summarizeScheduledBriefing(readDepartureSchedule(read(),date),date,()=>({name:'대한항공',country:'KR'}),'OFFICIAL_DEPARTURE_SCHEDULE');
    const summary={mode:'live-summary',serviceDateKst:date,todayKst:'2026-09-08',dayRelation:'FUTURE',airport:{serviceDateKst:date,departuresTrackedToday:null,scheduledBriefing:schedule}};
    const brief=buildPersonalBrief(summary,{...recommendedPreferences('manager'),terminal:'T2'},date,'ko');
    const card=brief.cards.find(c=>c.interest==='flights');
    assert.equal(card.label,'공식 출발 예정편');
    assert.equal(card.value,'1편');
    assert.match(card.note,/예정이며 변경/);
    assert.ok(!card.note.includes('면세점'));
    assert.deepEqual(readDepartureSchedule({payload:'broken',retrievedAt:flight.retrievedAt},date),[]);
    assert.deepEqual(readDepartureSchedule({payload:'[{}]',retrievedAt:flight.retrievedAt},date),[]);
    await persistDepartureSchedule(db,'2026-09-10',[{...flight,scheduledAt:'2026-09-10T08:00:00+09:00'}]);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM airport_departure_schedule').get().n,1);
  } finally { sqlite.close(); }
});
