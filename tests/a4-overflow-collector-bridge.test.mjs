import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {collectAirportCongestion,collectAirportCongestionT2} from '../lib/collector';
import {A4_POINTER_SCHEMA,A4_GENERATION_SCHEMA} from '../lib/a4-overflow-publication';
import {decideCongestionRetry} from '../lib/congestion-retry';

function db(native){
 const writes=[];
 class Statement{
  constructor(sql,args=[]){this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.sql,args);}
  async first(){return native.prepare(this.sql).get(...this.args)??null;}
  async run(){return this.exec();}
  exec(){
   if(/^\s*SELECT/i.test(this.sql)){native.prepare(this.sql).all(...this.args);return {success:true,meta:{changes:0}};}
   const result=native.prepare(this.sql).run(...this.args);writes.push(this.sql);
   return {success:true,meta:{changes:result.changes,rows_written:result.changes}};
  }
 }
 return {writes,prepare:sql=>new Statement(sql),batch:async statements=>{
  native.exec('BEGIN');try{const results=statements.map(s=>s.exec());native.exec('COMMIT');return results;}
  catch(e){native.exec('ROLLBACK');throw e;}
 }};
}
function setup(){
 const p=new DatabaseSync(':memory:'), s=new DatabaseSync(':memory:');
 for(const file of ['0001_crazy_nekra','0003_minor_network','0006_airport_t2_and_passenger_forecast'])
  p.exec(readFileSync(`drizzle/${file}.sql`,'utf8'));
 p.exec(A4_POINTER_SCHEMA);s.exec(A4_GENERATION_SCHEMA);
 const primary=db(p),overflow=db(s),env={DB:primary,DATA_GO_KR_SERVICE_KEY:'fixture'};
 return {p,s,primary,overflow,env,options:{overflow,routing:{mode:'enabled',schemaReady:true,cutoverAt:new Date(Date.now()-3_600_000).toISOString()}}};
}
const providerKst=(age)=>new Date(Date.now()+9*3_600_000-age).toISOString().slice(0,16).replace(/\D/g,'');
const observed=providerKst(60_000);
const item=(t,zone,patch={})=>({terminalId:t==='T1'?'P01':'P03',gateId:zone,occurtime:observed,waitLength:'12',waitTime:'60+',...patch});
function withProvider(t,handler){
 const fn=t==='T1'?collectAirportCongestion:collectAirportCongestionT2;
 const original=globalThis.fetch;
 return async (f,response,options,maxAttempts)=>{
  let requested=0;
  globalThis.fetch=async req=>{
   requested++;assert.equal(new URL(req).hostname,'apis.data.go.kr');
   return Response.json({response:{header:{resultCode:'00'},body:response}});
  };
  try{return await handler(f,await fn({...f.env,...(maxAttempts?{A4_MAX_ATTEMPTS_PER_REQUEST:1}:{})},options),requested);}
  finally{globalThis.fetch=original;}
 };
}
const count=(native,table)=>native.prepare(`SELECT count(*) n FROM ${table}`).get().n;
for(const t of ['T1','T2'])test(`${t} explicit offline bridge routes a complete capture once; default stays primary`,async()=>{
 const zone=t==='T1'?'1':'DG1_A',response={items:[item(t,zone)],totalCount:1},call=withProvider(t,(f,result,requests)=>{
  assert.equal(requests,1);assert.equal(result.status,'SUCCESS');return result;
 });
 const off=setup(),on=setup();
 await call(off,response,undefined);
 assert.equal(count(off.p,'airport_congestion'),1);assert.equal(count(off.s,'a4_generation'),0);
 await call(on,response,on.options,true);
 assert.equal(count(on.p,'airport_congestion'),0);assert.equal(count(on.s,'a4_generation'),1);
 assert.equal(count(on.p,'collector_runs'),1);
 assert.equal(count(on.p,'source_health'),1);
});
test('partial, mixed-clock, unproven T2 count, or capped retry capture only uses the original sink',async()=>{
 const cases=[
  ['T1',{items:[item('T1','1'),item('T1','2',{waitLength:''})],totalCount:2}],
  ['T1',{items:[item('T1','1'),item('T1','2',{occurtime:providerKst(180_000)})],totalCount:2}],
  ['T2',{items:[item('T2','DG1_A')]}],
  ['T2',{items:[item('T2','DG1_A'),item('T2','UNKNOWN')],totalCount:2}],
  ['T2',{items:[item('T2','DG1_A')],totalCount:21}],
 ];
 for(const [t,response] of cases){
  const f=setup();
  await withProvider(t,(fixture,result,requests)=>{assert.equal(requests,1);assert.ok(['SUCCESS','PARTIAL'].includes(result.status));})(f,response,f.options,true);
  assert.ok(count(f.p,'airport_congestion')>0);assert.equal(count(f.s,'a4_generation'),0);
 }
});
test('ambiguous shard write does not dual-write, advertise health, or request a new provider attempt',async()=>{
 const f=setup();
 f.s.exec("CREATE TRIGGER reject_shard BEFORE INSERT ON a4_generation BEGIN SELECT RAISE(ABORT,'fixture'); END");
 const got=await withProvider('T1',(_,result,requests)=>{assert.equal(requests,1);return result;})(f,{items:[item('T1','1')],totalCount:1},f.options);
 assert.equal(got.status,'ERROR');
 assert.equal(count(f.p,'airport_congestion'),0);
 assert.equal(count(f.p,'source_health'),0);
 assert.equal(count(f.p,'collector_runs'),0);
 assert.deepEqual(decideCongestionRetry(JSON.stringify({source:'airport_congestion',...got})).sources,[]);
});

test('same observed timestamp does not advance shard-backed source health retrieval',async()=>{
 const f=setup(),response={items:[item('T2','DG1_A')],totalCount:1};
 const collect=withProvider('T2',(_,result,requests)=>{assert.equal(requests,1);return result;});
 assert.equal((await collect(f,response,f.options)).status,'SUCCESS');
 const getHealth=()=>f.p.prepare('SELECT last_retrieved_at,updated_at FROM source_health').get();
 const previous=getHealth();
 assert.equal((await collect(f,response,f.options)).status,'SKIPPED_NO_NEW_PUBLICATION');
 assert.deepEqual(getHealth(),previous);
 assert.equal(count(f.p,'collector_runs'),1);
 assert.equal(count(f.p,'airport_congestion'),0);
 assert.equal(count(f.s,'a4_generation'),1);
});
