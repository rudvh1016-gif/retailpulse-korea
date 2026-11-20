import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {A4_POINTER_SCHEMA,A4_GENERATION_SCHEMA} from '../lib/a4-overflow-publication';
import {normalizeAirportCongestion,normalizeAirportCongestionT2} from '../lib/source-adapters';

const source='INCHEON_DEPARTURE_CONGESTION';
const routing={mode:'enabled',schemaReady:true,cutoverAt:'2026-11-19T08:00:00.000Z'};
const create='export default {fetch(){return new Response("test")}}';
async function fixture(fn){
 const mf=new Miniflare({workers:[{config:{name:'a4-writer',compatibilityDate:'2026-05-22',
  manifest:{mainModule:'index.js',modules:{'index.js':{type:'esm',contents:create}}},
  env:{PRIMARY:{type:'d1',id:'local-writer-primary'},SHARD:{type:'d1',id:'local-writer-shard'}}}}]});
 try {
  const primary=await mf.getD1Database('PRIMARY'),overflow=await mf.getD1Database('SHARD');
  await primary.prepare(A4_POINTER_SCHEMA.trim()).run();
  for(const sql of A4_GENERATION_SCHEMA.trim().split(/(?<=\);| END;)\s*\n(?=CREATE)/))await overflow.prepare(sql.trim()).run();
  for(const file of ['0001_crazy_nekra','0003_minor_network','0006_airport_t2_and_passenger_forecast','0007_d1_read_budget_indexes']){
   const sql=readFileSync(`drizzle/${file}.sql`,'utf8').split('--> statement-breakpoint')
    .map(text=>text.trim()).filter(text=>/^(CREATE TABLE|CREATE (?:UNIQUE )?INDEX|ALTER TABLE) /.test(text)
     &&/`(collector_runs|source_health|airport_congestion)`/.test(text));
   for(const statement of sql)await primary.prepare(statement).run();
  }
  await primary.prepare(`INSERT INTO airport_congestion(id,source_id,record_origin,terminal,zone,waiting_count,
    observed_at,retrieved_at,freshness,schema_version,quality_status,source_hash)
    VALUES('original-a4',?,'LIVE','T1','1',42,'2026-11-01T00:00:00+09:00','2026-10-31T15:00:05.000Z',
    'LIVE','airport-congestion-v1','VALID','retained-fixture')`).bind(source).run();
  const writer=await import('../lib/a4-overflow-writer');
  await fn({primary,overflow,publish:(input,dbs,config=routing)=>writer.publishA4CaptureWithEvidence(input,dbs,config)});
 }finally{await mf.dispose();}
}

async function capture(minute,terminal='T1'){
 const t1=terminal==='T1', raw={terminalId:t1?'P01':'P03',gateId:t1?'1':'DG1_A',occurtime:'2026111917'+minute,waitLength:'12',waitTime:'60+'};
 const at=(second)=>`2026-11-19T08:${minute}:${second}.000Z`;
 const row=await (t1?normalizeAirportCongestion:normalizeAirportCongestionT2)(raw,at('20'));
 return {terminal,rows:[row],startedAt:at('10'),finishedAt:at('30'),status:'SUCCESS'};
}
const one=(db,table)=>db.prepare(`SELECT * FROM ${table}`).first();
const count=(db,table)=>db.prepare(`SELECT COUNT(*) n FROM ${table}`).first('n');
test('real D1 batches publish pointer, stable run and compatible live health once',()=>fixture(async({primary,overflow,publish})=>{
 const input=await capture('05');
 assert.equal(await publish(input,{primary,overflow}),'published');
 const pointer=await one(primary,'a4_pointer'),run=await one(primary,'collector_runs'),health=await one(primary,'source_health');
 assert.equal(run.run_id,`a4-overflow-v1:${pointer.digest}`);
 assert.equal(run.source_id,source);
 assert.equal(run.started_at,input.startedAt);
 assert.equal(run.finished_at,input.finishedAt);
 assert.equal(run.status,'SUCCESS');
 assert.equal(run.records_read,1);
 assert.equal(run.records_written,1);
 assert.equal(health.last_event_at,input.rows[0].observedAt);
 assert.equal(health.last_retrieved_at,input.rows[0].retrievedAt);
 assert.equal(health.schema_version,'airport-congestion-v1');
 assert.equal(health.status,'LIVE');
 assert.equal(health.detail,run.detail);
 assert.equal(await publish(input,{primary,overflow}),'superseded');
 assert.equal(await count(primary,'collector_runs'),1);
 assert.equal(await count(overflow,'a4_generation'),1);
 assert.equal((await one(primary,'airport_congestion')).source_hash,'retained-fixture');
 assert.equal((await one(primary,'airport_congestion')).waiting_count,42);
}));

test('a failed third write rolls back both pointer and run; surviving manifest can be retried unchanged',()=>fixture(async({primary,overflow,publish})=>{
 await publish(await capture('05'),{primary,overflow});
 const old=[await one(primary,'a4_pointer'),await one(primary,'collector_runs'),await one(primary,'source_health')];
 await primary.prepare("CREATE TRIGGER fail_health BEFORE UPDATE ON source_health BEGIN SELECT RAISE(ABORT,'fixture_failure'); END").run();
 const next=await capture('06');
 await assert.rejects(publish(next,{primary,overflow}),/unverified_publication/);
 assert.deepEqual([await one(primary,'a4_pointer'),await one(primary,'collector_runs'),await one(primary,'source_health')],old);
 assert.equal(await count(primary,'collector_runs'),1);
 assert.equal(await count(overflow,'a4_generation'),2);
 await primary.prepare('DROP TRIGGER fail_health').run();
 assert.equal(await publish(next,{primary,overflow}),'published');
 assert.equal(await count(primary,'collector_runs'),2);
 assert.equal(await count(overflow,'a4_generation'),2);
}));

test('newer existing health/run is not overwritten by late publication and T2 is independent',()=>fixture(async({primary,overflow,publish})=>{
 const next=await capture('06'),later='2026-11-19T08:07:00.000Z';
 await primary.prepare("INSERT INTO collector_runs VALUES('new-legacy',?,?,?,?,0,0,NULL,'old path')").bind(source,later,later,'ERROR').run();
 await primary.prepare("INSERT INTO source_health VALUES(?,'ERROR',NULL,NULL,NULL,1,'airport-congestion-v1','legacy failed',?)").bind(source,later).run();
 assert.equal(await publish(next,{primary,overflow}),'superseded');
 assert.equal(await count(primary,'a4_pointer'),0);
 assert.equal((await one(primary,'source_health')).status,'ERROR');
 assert.equal(await publish({...await capture('06','T2'),status:'PARTIAL'},{primary,overflow}),'published');
 assert.equal((await one(primary,'a4_pointer')).terminal,'T2');
 assert.equal((await primary.prepare('SELECT status FROM collector_runs WHERE source_id=?').bind(source+'_T2').first()).status,'PARTIAL');
 assert.equal((await primary.prepare('SELECT status FROM source_health WHERE source_id=?').bind(source+'_T2').first()).status,'LIVE');
}));

test('lost commit acknowledgement resolves from the exact primary proof without reissuing writes',()=>fixture(async({primary,overflow,publish})=>{
 const input=await capture('05'),batch=primary.batch.bind(primary);
 let attempts=0;
 const primaryWithTimeout={prepare:primary.prepare.bind(primary),batch:async statements=>{attempts++;await batch(statements);throw Error('timeout');}};
 assert.equal(await publish(input,{primary:primaryWithTimeout,overflow}),'published');
 assert.equal(attempts,1);
 assert.equal(await count(primary,'collector_runs'),1);
 assert.equal(await count(primary,'source_health'),1);
}));

test('invalid canonical evidence or clocks write nothing and same-time conflicting captures cannot acquire an identity',()=>fixture(async({primary,overflow,publish})=>{
 const input=await capture('05');
 for(const bad of [
  {...input,finishedAt:'2026-11-19T08:05:15.000Z'},
  {...input,rows:[{...input.rows[0],status:'oops',qualityStatus:'PARTIAL'}]},
  {...input,rows:[{...input.rows[0],retrievedAt:'not a clock'}]},
  {...input,rows:[{...input.rows[0],sourceId:'wrong'}]},
 ]) await assert.rejects(publish(bad,{primary,overflow}),/invalid_a4_evidence/);
 assert.equal(await count(overflow,'a4_generation'),0);
 assert.equal(await publish(input,{primary,overflow}),'published');
 assert.equal(await publish({...input,rows:[{...input.rows[0],zone:'2'}]},{primary,overflow}),'superseded');
 assert.equal(await count(primary,'collector_runs'),1);
 assert.equal(await count(overflow,'a4_generation'),1);
}));

test('writer requires explicit ready future routing; late source observations cannot regress health',()=>fixture(async({primary,overflow,publish})=>{
 const input=await capture('05');
 for(const [config,pattern] of [[{mode:'disabled'},/a4_overflow_not_selected/],
  [{...routing,schemaReady:false},/a4_overflow_not_ready/],
  [{...routing,cutoverAt:'2026-11-19T08:06:00.000Z'},/a4_overflow_before_cutover/]]) {
  await assert.rejects(publish(input,{primary,overflow},config),pattern);
 }
 assert.equal(await count(overflow,'a4_generation'),0);
 await primary.prepare("INSERT INTO source_health VALUES(?,'LIVE','2026-11-19T17:06:00+09:00',NULL,NULL,0,'airport-congestion-v1','old path',?)")
  .bind(source,'2026-11-19T08:04:00.000Z').run();
 assert.equal(await publish(input,{primary,overflow}),'superseded');
 assert.equal((await one(primary,'source_health')).detail,'old path');
 assert.equal(await count(primary,'collector_runs'),0);
}));

test('a silent health no-op aborts the primary transaction rather than exposing a torn pointer',()=>fixture(async({primary,overflow,publish})=>{
 await primary.prepare("CREATE TRIGGER ignore_health BEFORE INSERT ON source_health BEGIN SELECT RAISE(IGNORE); END").run();
 await assert.rejects(publish(await capture('05'),{primary,overflow}),/unverified_publication/);
 assert.equal(await count(primary,'a4_pointer'),0);
 assert.equal(await count(primary,'collector_runs'),0);
 assert.equal(await count(primary,'source_health'),0);
 assert.equal(await count(overflow,'a4_generation'),1);
}));

test('verified public witness survives unchanged retries but rejects mixed legacy evidence and other-terminal pointers',()=>fixture(async({primary,overflow,publish})=>{
 const {createWitnessedA4Reader}=await import('../lib/a4-overflow-public-read');
 const input=await capture('05');
 assert.equal(await publish(input,{primary,overflow}),'published');
 const read=createWitnessedA4Reader(primary,overflow);
 const published=await read('T1');
 assert.deepEqual(published.rows,input.rows);
 assert.equal(published.current,true);
 assert.deepEqual(await read('T2'),{state:'ok',rows:[]});
 const newer='2026-11-19T08:06:20.000Z';
 assert.equal(await publish({...input,startedAt:'2026-11-19T08:06:10.000Z',finishedAt:'2026-11-19T08:06:30.000Z',
  rows:[{...input.rows[0],retrievedAt:newer}]},{primary,overflow}),'superseded');
 assert.deepEqual(await read('T1'),published);
 assert.equal(await count(primary,'collector_runs'),1);
 assert.equal(await count(overflow,'a4_generation'),1);
 await primary.prepare("UPDATE source_health SET detail='legacy evidence' WHERE source_id=?").bind(source).run();
 assert.deepEqual(await read('T1'),{...published,current:false});
 assert.deepEqual(await read('T2'),{state:'ok',rows:[]});
}));

test('terminal rollback racing with a staged manifest prevents publication of the orphan',()=>fixture(async({primary,overflow,publish})=>{
 const proof={...routing,requireCutoverWitness:true};
 await primary.prepare('INSERT INTO a4_cutover VALUES(?,?)').bind('T1',proof.cutoverAt).run();
 assert.equal(await publish(await capture('05'),{primary,overflow},proof),'published');
 const prior=await one(primary,'a4_pointer');
 const gatedPrimary={
  prepare:sql=>primary.prepare(sql),
  batch:async statements=>{
   await primary.prepare("UPDATE a4_cutover SET cutover_at=NULL WHERE terminal='T1'").run();
   return primary.batch(statements);
  },
 };
 assert.equal(await publish(await capture('06'),{primary:gatedPrimary,overflow},proof),'superseded');
 assert.deepEqual(await one(primary,'a4_pointer'),prior);
 assert.equal(await count(primary,'collector_runs'),1);
 assert.equal(await count(overflow,'a4_generation'),2);
}));

test('retention preserves the published pointer and any in-flight capture',()=>fixture(async({primary,overflow})=>{
 const {pruneA4Overflow}=await import('../lib/a4-overflow-retention');
 for(const sql of readFileSync('db/a4-overflow-migrations/0001_a4_retention.sql','utf8').trim()
  .split(/(?<=;)(?=\s*CREATE)/))await overflow.prepare(sql.trim()).run();
 const now=new Date();
 const daysAgo=days=>new Date(now.getTime()-days*86_400_000).toISOString();
 const digest='b'.repeat(64);
 await primary.prepare('INSERT INTO a4_pointer VALUES(?,?,?,?)').bind('T1',daysAgo(46),digest,1).run();
 const put=async (digest,at)=>overflow.prepare('INSERT INTO a4_generation VALUES(?,?,?,?,?)')
  .bind(digest.repeat(64),'T1',at,1,'[]').run();
 await put('a',daysAgo(50));
 await put('b',daysAgo(46));
 await put('c',daysAgo(1));
 assert.equal(await pruneA4Overflow(primary,overflow,now),1);
 assert.equal((await overflow.prepare('SELECT digest FROM a4_generation WHERE digest=?').bind(digest).first()).digest,digest);
 assert.equal(await count(overflow,'a4_generation'),2);
}));
