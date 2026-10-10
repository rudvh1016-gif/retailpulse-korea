import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { persistDepartureSchedule, persistDepartureSchedules, readDepartureSchedule } from '../lib/departure-schedule.ts';
import { readFlightsForDate } from '../app/api/live/flights/route.ts';
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
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM airport_departure_schedule').get().n,2,'saving a later date must preserve earlier future dates');
  } finally { sqlite.close(); }
});

test('complete multi-date scans apply explicit cancellations and preserve missing dates, deduplicate, and measure bounded storage', async t => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('drizzle/0018_airport_departure_schedule.sql','utf8'));
  const batches=[];
  const db={prepare:sql=>({bind:(...params)=>({sql,params,all:async()=>({results:sqlite.prepare(sql).all(...params)})})}),
    batch:async statements=>{batches.push(statements.length);return statements.map(({sql,params})=>({meta:{changes:Number(sqlite.prepare(sql).run(...params).changes)}}));}};
  const today='2026-09-08';
  const flight=(date,id,status='scheduled')=>({physicalFlightId:id,terminal:'T2',flightNumber:id,masterFlightNumber:id,scheduledAt:`${date}T08:00:00+09:00`,retrievedAt:'2026-09-08T00:00:00Z',status,airportCode:'NRT'});
  try {
    const rows=[flight('2026-09-09','KE1'),flight('2026-09-10','KE2'),flight('2026-09-20','KE3')];
    assert.equal((await persistDepartureSchedules(db,today,[...rows,rows[0]])).changedRows,3);
    const stored=sqlite.prepare('SELECT service_date AS day,payload FROM airport_departure_schedule ORDER BY service_date').all();
    assert.deepEqual(stored.map(r=>r.day),['2026-09-09','2026-09-10','2026-09-20']);
    assert.equal(JSON.parse(stored[0].payload).length,1);
    assert.equal((await persistDepartureSchedules(db,today,rows.map(r=>({...r,retrievedAt:'2026-09-08T01:00:00Z'})))).changedRows,0);
    const future=await readFlightsForDate(db,'2026-09-20',today);
    assert.equal(future.basis,'OFFICIAL_DEPARTURE_SCHEDULE');
    assert.equal(future.flights[0].airportCode,'NRT');
    assert.equal(future.flights[0].scheduledAt,'2026-09-20T08:00:00+09:00');
    assert.deepEqual((await readFlightsForDate(db,'2026-09-21',today)).flights,[]);
    await persistDepartureSchedules(db,today,[rows[0],{...rows[1],status:'cancelled'}]);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM airport_departure_schedule').get().n,3);
    assert.deepEqual((await readFlightsForDate(db,'2026-09-10',today)).flights,[]);
    assert.deepEqual(batches,[4,4,3]);
    const bytes=stored.reduce((n,r)=>n+Buffer.byteLength(r.payload),0);
    t.diagnostic(`INTERNAL_ESTIMATE: 3 held dates => 3 stored rows, 4 statements/1 batch, ${bytes} UTF-8 payload bytes; identical rescan changes 0 rows. D1 index-write billing not measured locally.`);
    await assert.rejects(persistDepartureSchedules(db,today,[flight('2026-09-07','bad')]),/not_future/);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM airport_departure_schedule').get().n,3);
  } finally {sqlite.close();}
});

test('production-shaped held schedules stay changed-only, bounded, and cap the flight board',async t=>{
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('drizzle/0018_airport_departure_schedule.sql','utf8'));
  let statements=0;
  const db={prepare:sql=>({bind:(...params)=>({sql,params,all:async()=>({results:sqlite.prepare(sql).all(...params)})})}),batch:async batch=>{statements+=batch.length;return batch.map(({sql,params})=>({meta:{changes:Number(sqlite.prepare(sql).run(...params).changes)}}));}};
  const rows=Array.from({length:6*550},(_,i)=>({physicalFlightId:`physical-${i}`.padEnd(64,'0'),terminal:'T2',flightNumber:`KE${i}`,masterFlightNumber:`KE${i}`,
    scheduledAt:`2026-09-${String(9+Math.floor(i/550)).padStart(2,'0')}T08:00:00+09:00`,retrievedAt:'2026-09-08T00:00:00Z',status:'scheduled',airlineCode:'대한항공',airportCode:'NRT',gate:'250',checkinCounter:'A01-A10'}));
  try {
    assert.equal((await persistDepartureSchedules(db,'2026-09-08',rows)).changedRows,6);assert.equal(statements,7);
    const snapshots=sqlite.prepare('SELECT payload FROM airport_departure_schedule').all();
    const sizes=snapshots.map(r=>Buffer.byteLength(r.payload));
    assert.equal((await persistDepartureSchedules(db,'2026-09-08',rows)).changedRows,0);
    assert.ok(Math.max(...sizes)<500000);assert.ok(sizes.reduce((a,b)=>a+b,0)<3000000);
    t.diagnostic(`INTERNAL_ESTIMATE: synthetic 6 dates x 550 physical departures => 6 rows / 7 statements / 1 batch, ${sizes.reduce((a,b)=>a+b,0)} UTF-8 payload bytes; versus one held date +5 rows/+5 statements/+${sizes.slice(1).reduce((a,b)=>a+b,0)} bytes; repeats 0 changed rows. Six days is a cost scenario, not verified A1 horizon.`);
    const large=Array.from({length:1201},(_,i)=>({...rows[0],physicalFlightId:`cap${i}`,flightNumber:`KE${i}`,masterFlightNumber:`KE${i}`}));
    await persistDepartureSchedule(db,'2026-09-09',large);
    const board=await readFlightsForDate(db,'2026-09-09','2026-09-08');
    assert.equal(board.flights.length,1200);assert.equal(board.truncated,true);
  } finally {sqlite.close();}
});

test('today before its first collection shows the held schedule, labelled; recorded flights win once they exist', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('drizzle/0018_airport_departure_schedule.sql', 'utf8'));
  sqlite.exec(`CREATE TABLE airport_flights (physical_flight_id TEXT, flight_number TEXT, airline_code TEXT, airport_code TEXT, direction TEXT, terminal TEXT,
    gate TEXT, checkin_counter TEXT, status TEXT, scheduled_at TEXT, retrieved_at TEXT)`);
  const db = { prepare: (sql) => ({ bind: (...params) => ({ all: async () => ({ results: sqlite.prepare(sql).all(...params) }) }) }) };
  const today = '2026-10-02';
  const snapshot = JSON.stringify([
    { physicalFlightId: 'B', terminal: 'T2', operatingFlight: 'KE2', scheduledTime: '09:30', airportCode: '오사카/ 간사이', gate: '274', status: 'scheduled' },
    { physicalFlightId: 'A', terminal: 'T1', operatingFlight: 'KE1', scheduledTime: '08:10', airportCode: '도쿄/나리타', gate: '9', status: 'scheduled' },
  ]);
  sqlite.prepare('INSERT INTO airport_departure_schedule (service_date, payload, retrieved_at) VALUES (?,?,?)').run(today, snapshot, '2026-10-01T13:00:00Z');
  try {
    const before = await readFlightsForDate(db, today, today);
    assert.equal(before.basis, 'OFFICIAL_DEPARTURE_SCHEDULE');
    assert.equal(before.dayRelation, 'TODAY');
    assert.deepEqual(before.flights.map((flight) => flight.flightNumber), ['KE1', 'KE2'], 'sorted by scheduled time');
    assert.equal(before.flights[0].scheduledAt, '2026-10-02T08:10:00+09:00');
    assert.equal(before.retrievedAt, '2026-10-01T13:00:00Z');
    // No held schedule and no records: an honest empty day, labelled as records.
    sqlite.prepare('DELETE FROM airport_departure_schedule').run();
    const none = await readFlightsForDate(db, today, today);
    assert.equal(none.basis, 'COLLECTED_FLIGHT_RECORDS');
    assert.deepEqual(none.flights, []);
    // Once the day has recorded flights they are used, never the schedule.
    sqlite.prepare('INSERT INTO airport_departure_schedule (service_date, payload, retrieved_at) VALUES (?,?,?)').run(today, snapshot, '2026-10-01T13:00:00Z');
    sqlite.prepare('INSERT INTO airport_flights VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('R1', 'KE9', '대한항공', '후쿠오카', 'departure', 'T2', '231', null, 'scheduled', '2026-10-02T07:00:00+09:00', '2026-10-01T19:10:00Z');
    const after = await readFlightsForDate(db, today, today);
    assert.equal(after.basis, 'COLLECTED_FLIGHT_RECORDS');
    assert.deepEqual(after.flights.map((flight) => flight.flightNumber), ['KE9']);
    assert.equal(after.terminalFallbacks.T1.basis,'OFFICIAL_DEPARTURE_SCHEDULE');
    assert.deepEqual(after.terminalFallbacks.T1.flights.map(flight=>flight.flightNumber),['KE1']);
    assert.equal(after.terminalFallbacks.T2,undefined,'good T2 records are never replaced by its schedule');
    // A past day never borrows a schedule.
    sqlite.prepare('INSERT INTO airport_departure_schedule (service_date, payload, retrieved_at) VALUES (?,?,?)').run('2026-10-01', snapshot, '2026-10-01T00:00:00Z');
    assert.equal((await readFlightsForDate(db, '2026-10-01', today)).basis, 'COLLECTED_FLIGHT_RECORDS');
  } finally { sqlite.close(); }
});

test('missing dates and a missing terminal preserve last-good schedules and their clocks through midnight',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('drizzle/0018_airport_departure_schedule.sql','utf8'));
 const db={prepare:sql=>({bind:(...params)=>({sql,params})}),batch:async statements=>statements.map(({sql,params})=>({meta:{changes:Number(sqlite.prepare(sql).run(...params).changes)}}))};
 const flight=(day,id,terminal)=>({physicalFlightId:id,terminal,flightNumber:id,scheduledAt:`${day}T09:00:00+09:00`,retrievedAt:'2026-10-09T13:00:00Z'});
 try{
  await persistDepartureSchedules(db,'2026-10-09',[flight('2026-10-10','KE1','T1'),flight('2026-10-10','KE2','T2'),flight('2026-10-10','KE3','CONCOURSE'),flight('2026-10-11','KE4','T2')]);
  const original=sqlite.prepare('SELECT payload,retrieved_at AS retrievedAt FROM airport_departure_schedule WHERE service_date=?').get('2026-10-10');
  await persistDepartureSchedule(db,'2026-10-10',[{...flight('2026-10-10','NEW1','T1'),retrievedAt:'2026-10-09T14:00:00Z'}]);
  assert.deepEqual(sqlite.prepare('SELECT payload,retrieved_at AS retrievedAt FROM airport_departure_schedule WHERE service_date=?').get('2026-10-10'),original,'a partial terminal replacement cannot erase T2 or concourse');
  await persistDepartureSchedules(db,'2026-10-10',[]);
  assert.deepEqual(sqlite.prepare('SELECT service_date FROM airport_departure_schedule ORDER BY service_date').all().map(row=>row.service_date),['2026-10-10','2026-10-11']);
  assert.deepEqual(readDepartureSchedule(original,'2026-10-10').map(row=>row.terminal),['T1','T2','CONCOURSE']);
 }finally{sqlite.close();}
});
