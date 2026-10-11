import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteD1} from './helpers/operational-sqlite.mjs';
import {prepareAirportMonths,MONTH_RAW_LIMIT} from '../lib/airport-monthly-store.ts';
import {dailyFlightProfile} from '../lib/airport-day-profile.ts';
import {readAirportMonths} from '../app/api/live/airport-months/route.ts';
const today='2026-10-10';
function setup(){
 const db=new SqliteD1();
 for(const [day,id,gate,status] of [['2026-09-01','early-1','291','scheduled'],['2026-09-02','early-2','231','scheduled'],['2026-10-01','current','274','cancelled']]){
  db.raw.prepare(`INSERT INTO airport_flights(id,source_id,record_origin,direction,flight_number,terminal,gate,status,scheduled_at,event_at,retrieved_at,freshness,schema_version,quality_status,source_hash,physical_flight_id,airport_code)
   VALUES(?,'INCHEON_FLIGHT_DETAIL','LIVE','departure','KE703','T2',?,?,?,?,'2026-10-10T00:00:00Z','LIVE','v1','VALID',?,?,'NRT')`)
   .run(id,gate,status,day+'T10:00:00+09:00',day+'T10:00:00+09:00',id,id);
 }
 const payload={all:{totalFlights:1,retrievedAt:'old'},byTerminal:{},profile:{...dailyFlightProfile([],'2026-10-09',true),sidesVersion:'historical-table'}};
 db.raw.prepare('INSERT INTO airport_daily_composition VALUES(?,?,?,?)').run('2026-10-09',JSON.stringify(payload),'old-hash','old-time');
 const records=()=>db.raw.prepare('SELECT day,payload,source_hash AS sourceHash FROM airport_daily_composition').all();
 return {db,records};
}
const scans=[{from:'2026-09-01',to:'2026-10-09',startedAt:'2026-10-10T01:00:00Z'}];
test('early retained raw rows without profiles enter only with post-day scan proof; old profiles never supply mixed gate counts',async()=>{
 const {db,records}=setup();const result=await prepareAirportMonths(db,today,records(),scans);assert.equal(result.records,1);assert.equal(result.rawRows,3);
 const published=await readAirportMonths(db,'2026-10',today),[current,previous]=published.data.months;
 assert.deepEqual(previous.includedDays,['2026-09-01','2026-09-02']);assert.equal(previous.scopes.ALL.sides.EAST,1);assert.equal(previous.scopes.ALL.sides.WEST,1);
 assert.deepEqual(current.includedDays,['2026-10-01']);assert.equal(current.cancelled,1);assert.equal(current.scopes.ALL.total,0);
 const rawReads=db.calls.filter(sql=>sql.includes('FROM airport_flights')).length;
 const again=await prepareAirportMonths(db,today,records(),scans);assert.equal(again.status,'UNCHANGED');assert.equal(again.rawRows,0);assert.equal(again.records,0);
 assert.equal(db.calls.filter(sql=>sql.includes('FROM airport_flights')).length,rawReads);
 assert.equal(JSON.parse(records()[0].payload).profile.sidesVersion,'historical-table','daily history preserved');
 const plan=db.raw.prepare("EXPLAIN QUERY PLAN SELECT * FROM airport_flights WHERE direction='departure' AND scheduled_at>=? AND scheduled_at<? ORDER BY scheduled_at LIMIT 40001").all('2026-09-01',today);
 assert.ok(plan.some(row=>row.detail.includes('airport_flights_direction_scheduled_idx')));db.raw.close();
});
test('missing completion evidence, failed source reads and a capped range cannot become complete monthly data',async()=>{
 const {db,records}=setup();await prepareAirportMonths(db,today,records(),[]);
 const previous=(await readAirportMonths(db,'2026-09',today)).data.months[0];assert.equal(previous.includedDays.length,0);
 assert.equal(previous.excludedDays.find(day=>day.day==='2026-09-01').reason,'NO_COMPLETION_EVIDENCE');
 const saved=records()[0].payload,prepare=db.prepare.bind(db);
 db.prepare=sql=>{const stmt=prepare(sql);if(sql.includes('FROM airport_flights'))stmt.all=async()=>({success:false,results:[]});return stmt;};
 await assert.rejects(prepareAirportMonths(db,'2026-10-11',records(),scans),/SOURCE_READ_FAILED/);assert.equal(records()[0].payload,saved);
 db.prepare=sql=>{const stmt=prepare(sql);if(sql.includes('FROM airport_flights'))stmt.all=async()=>({success:true,results:Array.from({length:MONTH_RAW_LIMIT+1},()=>({}))});return stmt;};
 assert.equal((await prepareAirportMonths(db,'2026-10-11',records(),scans)).status,'LIMIT');assert.equal(records()[0].payload,saved);db.raw.close();
});

test('prepared days keep their completion witness but never reuse old gate counts or the daily-row clock',async()=>{
 const {db,records}=setup();await prepareAirportMonths(db,today,records(),scans);
 const payload=JSON.parse(records()[0].payload);payload.monthlyRollups.sidesVersion='old-classification';
 db.raw.prepare('UPDATE airport_daily_composition SET payload=?,calculated_at=?').run(JSON.stringify(payload),'2099-01-01T00:00:00Z');
 db.raw.prepare("UPDATE airport_flights SET gate='231' WHERE id='early-1'").run();
 await prepareAirportMonths(db,'2026-10-11',records(),[]);
 const published=await readAirportMonths(db,'2026-10','2026-10-11'),previous=published.data.months[1];
 assert.deepEqual(previous.includedDays,['2026-09-01','2026-09-02']);
 assert.equal(previous.scopes.ALL.sides.EAST,0);assert.equal(previous.scopes.ALL.sides.WEST,2);
 const preparedAt=published.data.preparedAt;assert.ok(Number.isFinite(Date.parse(preparedAt)));
 db.raw.prepare('UPDATE airport_daily_composition SET calculated_at=?').run('2099-01-01T00:00:00Z');
 assert.equal((await readAirportMonths(db,'2026-10','2026-10-11')).calculatedAt,preparedAt);
 db.raw.close();
});

test('version transition is pending rather than missing, and a failed SELECT cannot masquerade as no data',async()=>{
 const {db,records}=setup();await prepareAirportMonths(db,today,records(),scans);
 const payload=JSON.parse(records()[0].payload);payload.monthlyRollups.version=1;
 db.raw.prepare('UPDATE airport_daily_composition SET payload=?').run(JSON.stringify(payload));
 const response=await readAirportMonths(db,'2026-10',today);
 assert.equal(response.status,'PENDING_UPDATE');assert.equal(response.data,null);assert.equal(response.lastPreparedAt,payload.monthlyRollups.preparedAt);
 const prepare=db.prepare.bind(db);db.prepare=sql=>{const stmt=prepare(sql);stmt.all=async()=>({success:false,results:[]});return stmt;};
 await assert.rejects(readAirportMonths(db,'2026-10',today),/READ_FAILED/);db.raw.close();
});

test('monthly generation cannot overwrite a concurrently changed daily anchor or report a failed write as prepared',async()=>{
 const {db,records}=setup(),old=records();
 db.raw.prepare('UPDATE airport_daily_composition SET source_hash=?').run('concurrent-newer');
 assert.equal((await prepareAirportMonths(db,today,old,scans)).status,'CONFLICT');
 assert.equal(JSON.parse(records()[0].payload).monthlyRollups,undefined);
 const prepare=db.prepare.bind(db);db.prepare=sql=>{const stmt=prepare(sql);if(sql.startsWith('UPDATE airport_daily_composition'))stmt.run=async()=>({success:false,meta:{changes:0}});return stmt;};
 await assert.rejects(prepareAirportMonths(db,today,records(),scans),/WRITE_FAILED/);db.raw.close();
});
