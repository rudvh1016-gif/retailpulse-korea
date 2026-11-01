import assert from 'node:assert/strict';
import test from 'node:test';
import { SqliteD1 } from './helpers/operational-sqlite.mjs';
import { OperationalMemory } from '../lib/operational-memory.ts';
import { recordExistingCompletion } from '../lib/operational-bookkeeping.ts';

const start='2026-11-01T01:00:00.000Z',end='2026-11-01T01:01:00.000Z';
function insert(db,table,row){const keys=Object.keys(row);db.raw.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));}
async function fixture(terminal='T1'){
 const db=new SqliteD1(),memory=new OperationalMemory(db),source='INCHEON_DEPARTURE_CONGESTION'+(terminal==='T2'?'_T2':'');
 const parts={sourceId:source,failureClass:'EXECUTION_ERROR',contractVersion:'queue-v1',logicalJob:'collect-realtime.yml'};
 await memory.recordEvent({parts,kind:'FAILURE',runId:'original-failure',at:'2026-11-01T00:45:00.000Z',evidence:'network failure'});
 insert(db,'collector_runs',{run_id:'stored-run',source_id:source,started_at:start,finished_at:end,status:'SUCCESS',records_read:2,records_written:2});
 insert(db,'source_health',{source_id:source,status:'LIVE',last_event_at:start,last_retrieved_at:end,schema_version:'queue-v1',updated_at:end});
 const congestion=['A','B'].map((zone,i)=>({terminal,zone,observedAt:start,retrievedAt:end,waitingCount:i,waitTimeMinutes:i===0?0:null,waitTimeRaw:i===0?'0':'5~10',freshness:'LIVE'}));
 for(const row of congestion)insert(db,'airport_congestion',{id:terminal+row.zone,source_id:source,record_origin:'LIVE',terminal,zone:row.zone,observed_at:start,retrieved_at:end,
  waiting_count:row.waitingCount,wait_time_minutes:row.waitTimeMinutes,wait_time_raw:row.waitTimeRaw,freshness:'LIVE',schema_version:'queue-v1',quality_status:'VALID',source_hash:row.zone});
 const body={mode:'live-summary',serviceDateKst:'2026-11-01',airport:{congestion}},result={source:terminal==='T2'?'airport_congestion_t2':'airport_congestion',status:'SUCCESS',records:2,providerRequests:1};
 const context={runId:'workflow-regular',startedAt:start,completedAt:end,attempt:1};
 let calls=0;
 const options={fetchImpl:async url=>{assert.equal(String(url),'https://koretaildata.com/api/live/summary');calls++;return new Response(JSON.stringify(body));}};
 return {db,memory,parts,source,body,result,context,options,calls:()=>calls};
}
for(const terminal of ['T1','T2'])test(`${terminal}: later exact publication resolves incident without rewriting pending recovery`,async()=>{
 const f=await fixture(terminal);
 await recordExistingCompletion(f.db,f.result,{...f.context,attempt:2,runId:'original-retry'},f.options);
 const pending=f.db.raw.prepare('SELECT * FROM operational_recovery_attempts').get();assert.equal(pending.outcome,'RECOVERY_PENDING');assert.equal(f.calls(),0);
 assert.equal((await f.memory.incidents(f.source))[0].currentState,'DEGRADED');
 await recordExistingCompletion(f.db,f.result,f.context,f.options);
 const incident=(await f.memory.incidents(f.source))[0];assert.equal(incident.currentState,'RESOLVED');assert.equal(incident.resolvedAt,end);
 assert.deepEqual(f.db.raw.prepare('SELECT * FROM operational_recovery_attempts').get(),pending);
 assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM operational_incident_events WHERE kind='HEALTHY'").get().n,1);
 assert.equal(f.db.raw.prepare('SELECT public_valid FROM operational_source_state').get().public_valid,1);
 assert.equal(f.calls(),1);
 await recordExistingCompletion(f.db,f.result,f.context,f.options);assert.equal(f.calls(),1);
 assert.equal(f.db.raw.prepare('SELECT executions FROM operational_usage_daily').get().executions,1);
});
for(const [name,mutate] of [
 ['cached old clock',f=>{for(const row of f.body.airport.congestion)row.observedAt='2026-11-01T00:59:00.000Z';}],
 ['partial terminal',f=>{f.body.airport.congestion.pop();}],
 ['extra terminal checkpoint',f=>{f.body.airport.congestion.push({...f.body.airport.congestion[0],zone:'EXTRA'});}],
 ['duplicate checkpoint',f=>{f.body.airport.congestion[1]={...f.body.airport.congestion[0]};}],
 ['changed wait',f=>{f.body.airport.congestion[0].waitTimeMinutes=9;}],
 ['changed raw range',f=>{f.body.airport.congestion[1].waitTimeRaw='10~20';}],
 ['different retrieval time',f=>{f.body.airport.congestion[0].retrievedAt=start;}],
 ['stale public projection',f=>{f.body.airport.congestion[0].freshness='STALE';}],
 ['wrong service date',f=>{f.body.serviceDateKst='2026-10-31';}],
 ['cached LIVE beyond current public freshness',f=>{f.db.raw.exec("UPDATE airport_congestion SET observed_at='2026-11-01T00:40:00.000Z'");for(const row of f.body.airport.congestion)row.observedAt='2026-11-01T00:40:00.000Z';}],
 ['future observed time',f=>{f.db.raw.exec("UPDATE airport_congestion SET observed_at='2026-11-01T02:00:00.000Z'");}],
 ['future health publication',f=>{f.db.raw.exec("UPDATE source_health SET last_published_at='2026-11-01T02:00:00.000Z'");}],
 ['future retrieval time',f=>{f.db.raw.exec("UPDATE airport_congestion SET retrieved_at='2026-11-01T02:00:00.000Z'");}],
 ['partial collector',f=>{f.db.raw.exec("UPDATE collector_runs SET status='PARTIAL'");}],
 ['invalid stored count',f=>{f.db.raw.exec('UPDATE airport_congestion SET waiting_count=-1');}],
])test(`${name} stays unresolved`,async()=>{
 const f=await fixture();mutate(f);await recordExistingCompletion(f.db,f.result,f.context,f.options);
 assert.notEqual((await f.memory.incidents(f.source))[0].currentState,'RESOLVED');
 assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM operational_incident_events WHERE kind='HEALTHY'").get().n,0);
});
for(const [name,mutate] of [
 ['new run starts',f=>insert(f.db,'collector_runs',{run_id:'racing-run',source_id:f.source,started_at:end,status:'SUCCESS',finished_at:end,records_read:2,records_written:2})],
 ['newer observer state',f=>f.db.raw.exec("UPDATE operational_source_state SET checked_at='2026-11-01T01:02:00.000Z'")],
 ['health changes',f=>f.db.raw.exec("UPDATE source_health SET status='ERROR'")],
 ['stored values change',f=>f.db.raw.exec('UPDATE airport_congestion SET waiting_count=waiting_count+1')],
 ['newer snapshot',f=>f.db.raw.exec("UPDATE airport_congestion SET observed_at='2026-11-01T01:00:30.000Z'")],
 ['incident changes',async f=>f.memory.recordEvent({parts:f.parts,kind:'FAILURE',runId:'racing-failure',at:end,evidence:'later failure'})],
])test(`collection race: ${name} remains pending`,async()=>{
 const f=await fixture();f.options.fetchImpl=async()=>{await mutate(f);return new Response(JSON.stringify(f.body));};
 await recordExistingCompletion(f.db,f.result,f.context,f.options);
 assert.notEqual((await f.memory.incidents(f.source))[0].currentState,'RESOLVED');
});
test('three healthy collections without exact public proof cannot erase pending recovery',async()=>{
 const f=await fixture();await recordExistingCompletion(f.db,f.result,{...f.context,attempt:2},f.options);
 f.options.fetchImpl=async()=>new Response('{}',{status:503});
 for(let n=0;n<3;n++)await recordExistingCompletion(f.db,f.result,{...f.context,runId:'regular-'+n},f.options);
 assert.equal((await f.memory.incidents(f.source))[0].currentState,'DEGRADED');
 assert.equal(f.db.raw.prepare('SELECT outcome FROM operational_recovery_attempts').get().outcome,'RECOVERY_PENDING');
});
test('no unresolved incident means no public read or healthy-event write',async()=>{
 const f=await fixture();f.db.raw.exec('DELETE FROM operational_incidents');await recordExistingCompletion(f.db,f.result,f.context,f.options);
 assert.equal(f.calls(),0);assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM operational_incident_events WHERE kind='HEALTHY'").get().n,0);
});
