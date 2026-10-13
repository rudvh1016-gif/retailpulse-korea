import assert from 'node:assert/strict';
import test from 'node:test';
import { SqliteD1 } from './helpers/operational-sqlite.mjs';
import { collectAirportComposition } from '../lib/airport-composition-history.ts';
import { compositionObserver, compositionClassification, reusableComposition } from '../lib/airport-composition-proof.ts';
import { compositionHash } from '../lib/airport-monthly-store.ts';
const now=new Date('2026-10-13T12:00:00+09:00');
const day='2026-10-12';
const options={reuseCompleted:true};
function fixture(){
 const db=new SqliteD1();
 for(const [id,date] of [['past',day],['today','2026-10-13']])db.raw.prepare(`INSERT INTO airport_flights(id,source_id,record_origin,direction,flight_number,airport_code,terminal,gate,status,scheduled_at,event_at,retrieved_at,freshness,schema_version,quality_status,source_hash,physical_flight_id) VALUES(?,'INCHEON_FLIGHT_DETAIL','LIVE','departure','KE1','Tokyo','T2','274','scheduled',?,'2026-10-13T00:00:00Z',?,'LIVE','v1','VALID','unchanged',?)`).run(id,date+'T09:00:00+09:00',date+'T00:00:00Z',id);
 db.raw.exec(`INSERT INTO collector_runs(run_id,source_id,status,started_at,finished_at,detail) VALUES('scan','INCHEON_FLIGHT_DETAIL','SUCCESS','2026-10-13T00:00:00Z','2026-10-13T00:01:00Z','recent 2026-10-12..2026-10-13; complete')`);
 return db;
}
const collect=(db,opts=options)=>collectAirportComposition(db,now,opts);
const rawReads=db=>db.calls.filter(sql=>sql.includes('FROM airport_flights WHERE direction=')&&sql.includes('LIMIT 2001')).length;
const stored=db=>db.raw.prepare('SELECT payload,source_hash AS sourceHash,day FROM airport_daily_composition WHERE day=?').get(day);
const payload=db=>JSON.parse(stored(db).payload);
const token=db=>db.raw.prepare('SELECT token FROM airport_composition_generations WHERE day=?').get(day)?.token;
async function changed(db,sql){const before=token(db);db.raw.exec(sql);assert.notEqual(token(db),before);db.calls=[];await collect(db);assert.equal(rawReads(db),2);}

test('same input keeps identical payload and skips only the completed past raw read; repair reads both',async()=>{
 const db=fixture();try{
 await collect(db);assert.equal(rawReads(db),2);const before=stored(db);
 db.calls=[];const result=await collect(db);assert.equal(rawReads(db),1);assert.equal(result.records,0);assert.deepEqual(stored(db),before);
 db.calls=[];await collect(db,{});assert.equal(rawReads(db),2);
 const repaired=payload(db);delete repaired.compositionProof;const original=JSON.parse(before.payload);delete original.compositionProof;assert.deepEqual(repaired,original);
 }finally{db.raw.close();}
});

test('manual/A2 relevant changes without source hash/retrieval changes invalidate, as do failed partial writes',async()=>{
 const db=fixture();try{await collect(db);
 await changed(db,"UPDATE airport_flights SET airport_code='Osaka',terminal='T1' WHERE id='past'");
 assert.equal(payload(db).profile.T1.total,1);
 assert.equal(db.raw.prepare("SELECT source_hash FROM airport_flights WHERE id='past'").get().source_hash,'unchanged');
 await changed(db,"UPDATE airport_flights SET gate='9' WHERE id='past'; INSERT INTO collector_runs(run_id,source_id,status,started_at,detail) VALUES('failed','INCHEON_DUTY_FREE_ACTUAL','ERROR','2026-10-13T01:00:00Z','partial')");
 }finally{db.raw.close();}
});

test('trigger updates cost zero for identical/unreferenced updates, one per same-day change, two on day moves; rollback is atomic',()=>{
 const db=fixture();try{
 const changes=()=>Number(db.raw.prepare('SELECT total_changes() AS n').get().n);
 let before=changes(),generation=token(db);db.raw.exec("UPDATE airport_flights SET gate=gate WHERE id='past'");assert.equal(changes()-before,1);assert.equal(token(db),generation);
 before=changes();db.raw.exec("UPDATE airport_flights SET checkin_counter='A' WHERE id='past'");assert.equal(changes()-before,1);assert.equal(token(db),generation);
 before=changes();db.raw.exec("UPDATE airport_flights SET gate='231' WHERE id='past'");assert.equal(changes()-before,2);
 generation=token(db);db.raw.exec("BEGIN; UPDATE airport_flights SET gate='274' WHERE id='past'; ROLLBACK");assert.equal(token(db),generation);
 before=changes();db.raw.exec("UPDATE airport_flights SET scheduled_at='2026-10-11T09:00:00+09:00' WHERE id='past'");assert.equal(changes()-before,3);assert.notEqual(token(db),generation);
 before=changes();db.raw.exec("DELETE FROM airport_flights WHERE id='past'");assert.equal(changes()-before,2);
 }finally{db.raw.close();}
});

test('direction and physical-ID inclusion transitions invalidate their old/new departure day',()=>{
 const db=fixture();try{
 for(const sql of ["direction='arrival'","direction='departure'","physical_flight_id=NULL","physical_flight_id='past'"]){const before=token(db);db.raw.exec(`UPDATE airport_flights SET ${sql} WHERE id='past'`);assert.notEqual(token(db),before,sql);}
 }finally{db.raw.close();}
});

test('missing migration or partial trigger set fails closed and preserves legacy output',async()=>{
 for(const remove of ["DROP TRIGGER airport_composition_update", "DROP TRIGGER airport_composition_insert;DROP TRIGGER airport_composition_update;DROP TRIGGER airport_composition_delete;DROP TABLE airport_composition_generations;DROP TABLE airport_composition_observer"]){
 const db=fixture();try{await collect(db);const before=payload(db);delete before.compositionProof;db.raw.exec(remove);db.calls=[];await collect(db);assert.equal(rawReads(db),2);assert.deepEqual(payload(db),before);}finally{db.raw.close();}}
});

test('cutoff, scan evidence, classification, damaged payload, missing profile, and epoch never reuse unsafe data',async()=>{
 for(const mutate of [
 p=>{p.compositionProof.classification='old-destinations-airlines';},
 p=>{p.profile.complete=false;},p=>{p.profile.T2.hours=[];},p=>{p.profile.T2.total=999;},p=>{delete p.profile;},p=>{p.compositionProof.scans='older-scan';},
 ]){const db=fixture();try{await collect(db);const p=payload(db);mutate(p);db.raw.prepare('UPDATE airport_daily_composition SET payload=?,source_hash=?,calculated_at=? WHERE day=?').run(JSON.stringify(p),await compositionHash(p),'2099-01-01',day);db.calls=[];await collect(db);assert.equal(rawReads(db),2);}finally{db.raw.close();}}
 const db=fixture();try{await collect(db);const p=payload(db);p.profile.T2.total=999;db.raw.prepare('UPDATE airport_daily_composition SET payload=? WHERE day=?').run(JSON.stringify(p),day);db.calls=[];await collect(db);assert.equal(rawReads(db),2);assert.equal(payload(db).profile.T2.total,1);
 db.raw.exec("UPDATE airport_composition_observer SET epoch='recreated'");db.calls=[];await collect(db);assert.equal(rawReads(db),2);
 const r=stored(db),proof=payload(db).compositionProof;assert.equal(await reusableComposition(r,day,{...proof,classification:await compositionClassification()}),true);
 }finally{db.raw.close();}
});

test('mutation during raw SELECT gives no reusable proof and next run rereads',async()=>{
 const db=fixture();try{
 const prepare=db.prepare.bind(db);let raced=false;
 db.prepare=sql=>{const stmt=prepare(sql);const all=stmt.all.bind(stmt);stmt.all=async()=>{const result=await all();if(!raced&&sql.includes('LIMIT 2001')&&result.results.some(r=>r.physicalFlightId==='past')){raced=true;db.raw.exec("UPDATE airport_flights SET gate='231' WHERE id='past'");}return result;};return stmt;};
 await collect(db);assert.equal(payload(db).compositionProof,undefined);db.calls=[];await collect(db);assert.equal(rawReads(db),2);assert.ok(payload(db).compositionProof);
 }finally{db.raw.close();}
});

test('new collection invalidates scan proof even when rows do not change; empty/deleted dates keep rereading',async()=>{
 const db=fixture();try{await collect(db);db.raw.exec("UPDATE collector_runs SET started_at='2026-10-13T01:00:00Z' WHERE run_id='scan'");db.calls=[];await collect(db);assert.equal(rawReads(db),2);
 db.raw.exec("DELETE FROM airport_flights WHERE id='past'");for(let i=0;i<2;i++){db.calls=[];await collect(db);assert.equal(rawReads(db),2);}
 }finally{db.raw.close();}
});

test('observer reads use bounded primary-key index and do not read raw rows',async()=>{
 const db=fixture();try{db.calls=[];assert.ok(await compositionObserver(db,day,'2026-10-13'));assert.equal(db.calls.some(sql=>/FROM airport_flights/.test(sql)),false);const plan=db.raw.prepare('EXPLAIN QUERY PLAN SELECT day,token FROM airport_composition_generations WHERE day>=? AND day<=?').all(day,'2026-10-13');assert.ok(plan.some(r=>/USING INDEX/.test(r.detail)));}finally{db.raw.close();}
});

test('failed observer SELECTs cannot be treated as successful proof, and altered trigger definitions fail closed',async()=>{
 for(const match of ['SELECT name,sql','SELECT epoch','SELECT day,token']){
 const db=fixture();try{await collect(db);const prepare=db.prepare.bind(db);db.prepare=sql=>{const s=prepare(sql);if(sql.startsWith(match))s.all=async()=>({success:false,results:[]});return s;};await assert.rejects(collect(db),/observer .* read failed/);}finally{db.raw.close();}}
 const db=fixture();try{await collect(db);db.raw.exec('DROP TRIGGER airport_composition_update; CREATE TRIGGER airport_composition_update AFTER UPDATE ON airport_flights BEGIN SELECT 1; END');db.calls=[];await collect(db);assert.equal(rawReads(db),2);}finally{db.raw.close();}
});

test('mutation after initial observer snapshot is detected immediately before reusing a date',async()=>{
 const db=fixture();try{await collect(db);const prepare=db.prepare.bind(db);let raced=false;db.prepare=sql=>{const s=prepare(sql),all=s.all.bind(s);s.all=async()=>{const result=await all();if(!raced&&sql.startsWith('SELECT day,token')){raced=true;db.raw.exec("UPDATE airport_flights SET terminal='T1',gate='9' WHERE id='past'");}return result;};return s;};db.calls=[];await collect(db);assert.equal(rawReads(db),2);assert.equal(payload(db).profile.T1.total,1);assert.equal(payload(db).compositionProof,undefined);}finally{db.raw.close();}
});

test('an airline classification change without a version bump invalidates the actual-content fingerprint',async()=>{
 const {SUPPRESSED_AIRLINE_DESIGNATORS}=await import('../lib/airline-country.ts');const db=fixture();try{await collect(db);const before=await compositionClassification();SUPPRESSED_AIRLINE_DESIGNATORS.KE='fixture classification update';assert.notEqual(await compositionClassification(),before);db.calls=[];await collect(db);assert.equal(rawReads(db),2);}finally{delete SUPPRESSED_AIRLINE_DESIGNATORS.KE;db.raw.close();}
});

test('damaged monthly extension is discarded before hash repair and existing monthly preparation rebuilds it',async()=>{
 const db=fixture();try{await collect(db);const anchor=db.raw.prepare("SELECT day,payload FROM airport_daily_composition WHERE payload LIKE '%monthlyRollups%'").get();const p=JSON.parse(anchor.payload);p.monthlyRollups.fixtureCorruption='must not be re-certified';db.raw.prepare('UPDATE airport_daily_composition SET payload=? WHERE day=?').run(JSON.stringify(p),anchor.day);db.calls=[];const result=await collect(db);const rebuilt=JSON.parse(db.raw.prepare('SELECT payload FROM airport_daily_composition WHERE day=?').get(anchor.day).payload);assert.equal(rebuilt.monthlyRollups.fixtureCorruption,undefined);assert.ok(result.monthly.rawRows>0);}finally{db.raw.close();}
});

test('synthetic 29 days x 100 departures compares all SELECT calls/results and row changes, not billed usage',async()=>{
 const {shiftKstDay}=await import('../lib/kst.ts');
 function large(){const db=fixture();db.raw.exec('DELETE FROM airport_flights');const insert=db.raw.prepare(`INSERT INTO airport_flights(id,source_id,record_origin,direction,flight_number,airport_code,terminal,gate,status,scheduled_at,event_at,retrieved_at,freshness,schema_version,quality_status,source_hash,physical_flight_id) VALUES(?,'INCHEON_FLIGHT_DETAIL','LIVE','departure',?,'Tokyo','T2','274','scheduled',?,'2026-10-13T00:00:00Z',?,'LIVE','v1','VALID','unchanged',?)`);db.raw.exec('BEGIN');for(let i=0;i<29;i++){const date=shiftKstDay('2026-10-13',-i);for(let j=0;j<100;j++){const id=date+'-'+j;insert.run(id,'KE'+j,date+'T09:00:00+09:00',date+'T00:00:00Z',id);}}db.raw.exec("UPDATE collector_runs SET detail='recent 2026-09-15..2026-10-13; complete';COMMIT");return db;}
 async function measured(db,opts){let selects=0,returnedRows=0;const original=db.prepare.bind(db);db.prepare=sql=>{const s=original(sql),all=s.all.bind(s);s.all=async()=>{const r=await all();selects++;returnedRows+=r.results?.length??0;return r;};return s;};const count=()=>Number(db.raw.prepare('SELECT total_changes() AS n').get().n);db.calls=[];const before=count();await collect(db,opts);const result={selectCalls:selects,returnedRows,rawSelectCalls:rawReads(db),sqliteRowChanges:count()-before};db.prepare=original;return result;}
 const legacy=large(),reuse=large();try{await collect(legacy,{});await collect(reuse);const a=await measured(legacy,{}),b=await measured(reuse,options);assert.equal(a.rawSelectCalls,29);assert.equal(b.rawSelectCalls,1);assert.equal(a.sqliteRowChanges,0);assert.equal(b.sqliteRowChanges,0);const data=db=>db.raw.prepare('SELECT day,payload FROM airport_daily_composition ORDER BY day').all().map(r=>{const p=JSON.parse(r.payload);delete p.compositionProof;if(p.monthlyRollups)delete p.monthlyRollups.preparedAt;return {day:r.day,payload:p};});assert.deepEqual(data(legacy),data(reuse));console.log('LOCAL_SYNTHETIC_COMPOSITION_BENCHMARK',JSON.stringify({days:29,departuresPerDay:100,legacy:a,reuse:b,officialD1Usage:false}));}finally{legacy.raw.close();reuse.raw.close();}
});

test('failed scan/retained/raw reads with partial results cannot certify proof or publish aggregates',async()=>{
 for(const match of ['SELECT detail,','SELECT day,payload,','SELECT physical_flight_id']){
 const db=fixture();try{await collect(db);const before=stored(db),prepare=db.prepare.bind(db);db.prepare=sql=>{const s=prepare(sql),all=s.all.bind(s);if(sql.startsWith(match))s.all=async()=>({...await all(),success:false});return s;};await assert.rejects(collect(db),/Composition .* read failed/);assert.deepEqual(stored(db),before);}finally{db.raw.close();}}
});
