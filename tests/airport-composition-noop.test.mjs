import assert from 'node:assert/strict';
import test from 'node:test';
import {SqliteD1} from './helpers/operational-sqlite.mjs';
import {collectAirportComposition} from '../lib/airport-composition-history.ts';
const now=new Date('2026-10-13T12:00:00+09:00');
function fixture(){
 const db=new SqliteD1();
 for(const [id,day] of [['past','2026-10-12'],['today','2026-10-13']])db.raw.prepare(`INSERT INTO airport_flights(id,source_id,record_origin,direction,flight_number,airport_code,terminal,gate,status,scheduled_at,event_at,retrieved_at,freshness,schema_version,quality_status,source_hash,physical_flight_id) VALUES(?,'INCHEON_FLIGHT_DETAIL','LIVE','departure','KE1','Tokyo','T2','274','scheduled',?,'2026-10-13T00:00:00Z',?,'LIVE','v1','VALID','unchanged',?)`).run(id,day+'T09:00:00+09:00',day+'T00:00:00Z',id);
 db.raw.exec("INSERT INTO collector_runs(run_id,source_id,status,started_at,detail) VALUES('scan','INCHEON_FLIGHT_DETAIL','SUCCESS','2026-10-13T00:00:00Z','recent 2026-10-12..2026-10-13; complete')");return db;
}
const collect=db=>collectAirportComposition(db,now);
const stored=db=>db.raw.prepare('SELECT * FROM airport_daily_composition ORDER BY day').all();
const payload=db=>JSON.parse(db.raw.prepare("SELECT payload FROM airport_daily_composition WHERE day='2026-10-12'").get().payload);
const rawReads=db=>db.calls.filter(s=>s.includes('LIMIT 2001')).length;
const upserts=db=>db.calls.filter(s=>s.startsWith('INSERT INTO airport_daily_composition')).length;

test('unchanged repeat rereads every covered day but sends no aggregate UPSERT',async()=>{
 const db=fixture();try{await collect(db);const before=stored(db);db.calls=[];const r=await collect(db);assert.equal(rawReads(db),2);assert.equal(upserts(db),0);assert.equal(r.records,0);assert.deepEqual(stored(db),before);}finally{db.raw.close();}
});
test('A2/manual correction without timestamp changes is recomputed and writes only its changed day',async()=>{
 const db=fixture();try{await collect(db);db.raw.exec("UPDATE airport_flights SET terminal='T1',gate='9',airport_code='Osaka' WHERE id='past'");db.calls=[];await collect(db);assert.equal(rawReads(db),2);assert.equal(upserts(db),1);assert.equal(payload(db).profile.T1.total,1);assert.equal(db.raw.prepare("SELECT source_hash FROM airport_flights WHERE id='past'").get().source_hash,'unchanged');}finally{db.raw.close();}
});
test('missing aggregate is rebuilt rather than skipped',async()=>{
 const db=fixture();try{await collect(db);db.raw.exec("DELETE FROM airport_daily_composition WHERE day='2026-10-12'");db.calls=[];await collect(db);assert.equal(upserts(db),1);assert.equal(payload(db).profile.T2.total,1);}finally{db.raw.close();}
});
test('new scan and retrieval-only changes never create proof writes',async()=>{
 const db=fixture();try{await collect(db);const before=stored(db);db.raw.exec("UPDATE collector_runs SET started_at='2026-10-13T01:00:00Z';UPDATE airport_flights SET retrieved_at='2026-10-13T02:00:00Z'");db.calls=[];await collect(db);assert.equal(rawReads(db),2);assert.equal(upserts(db),0);assert.deepEqual(stored(db),before);}finally{db.raw.close();}
});
test('hash-damaged stored payload is repaired even when correct hash is unchanged',async()=>{
 const db=fixture();try{await collect(db);const p=payload(db);p.profile.T2.total=999;db.raw.prepare("UPDATE airport_daily_composition SET payload=? WHERE day='2026-10-12'").run(JSON.stringify(p));db.calls=[];await collect(db);assert.equal(upserts(db),1);assert.equal(payload(db).profile.T2.total,1);}finally{db.raw.close();}
});
test('untrusted monthly extension is discarded and rebuilt, not re-certified',async()=>{
 const db=fixture();try{await collect(db);const anchor=db.raw.prepare("SELECT day,payload FROM airport_daily_composition WHERE payload LIKE '%monthlyRollups%'").get();const p=JSON.parse(anchor.payload);p.monthlyRollups.corruption='bad';db.raw.prepare('UPDATE airport_daily_composition SET payload=? WHERE day=?').run(JSON.stringify(p),anchor.day);const r=await collect(db);const rebuilt=JSON.parse(db.raw.prepare('SELECT payload FROM airport_daily_composition WHERE day=?').get(anchor.day).payload);assert.equal(rebuilt.monthlyRollups.corruption,undefined);assert.ok(r.monthly.rawRows>0);}finally{db.raw.close();}
});
test('incomplete and emptied days are still reread on every run',async()=>{
 const db=fixture();try{await collect(db);assert.equal(JSON.parse(stored(db)[1].payload).profile.complete,false);db.raw.exec("DELETE FROM airport_flights WHERE id='past'");for(let i=0;i<2;i++){db.calls=[];await collect(db);assert.equal(rawReads(db),2);assert.equal(upserts(db),0);}}finally{db.raw.close();}
});
test('failed scan, retained and raw reads cannot skip writes using partial results',async()=>{
 for(const prefix of ['SELECT detail,','SELECT day,payload,','SELECT physical_flight_id']){const db=fixture();try{await collect(db);const before=stored(db),prepare=db.prepare.bind(db);db.prepare=sql=>{const s=prepare(sql),all=s.all.bind(s);if(sql.startsWith(prefix))s.all=async()=>({...await all(),success:false});return s;};await assert.rejects(collect(db),/Composition .* read failed/);assert.deepEqual(stored(db),before);}finally{db.raw.close();}}
});
test('raw mutation before SELECT is immediately observed; one after SELECT is observed next run',async()=>{
 for(const timing of ['before','after']){const db=fixture();try{await collect(db);const prepare=db.prepare.bind(db);let changed=false;db.prepare=sql=>{const s=prepare(sql),all=s.all.bind(s);s.all=async()=>{const mutate=()=>db.raw.exec("UPDATE airport_flights SET terminal='T1',gate='9' WHERE id='past'");const relevant=sql.includes('LIMIT 2001')&&!changed;if(relevant&&timing==='before'){mutate();changed=true;}const result=await all();if(relevant&&timing==='after'&&result.results.some(r=>r.physicalFlightId==='past')){mutate();changed=true;}return result;};return s;};await collect(db);assert.equal(payload(db).profile.T1.total,timing==='before'?1:0);await collect(db);assert.equal(payload(db).profile.T1.total,1);}finally{db.raw.close();}}
});
