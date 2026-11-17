import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SqliteD1} from './helpers/operational-sqlite.mjs';
import {runSelectedProductionSources} from '../lib/production-runner.ts';
import {collectRecoverySource} from '../lib/recovery-collector.ts';
import {emptyAdmission,projectRealtimeSourceStatus,storageTransition,recoveryHealthSources,recoverySource,recoveryRoute} from '../lib/recovery-runtime.ts';
import {summarizeLiveSummary} from '../app/api/live/summary/route.ts';
import {kstDayOf,kstDayBounds,kstNowIsoOf,kstHourStartIsoOf} from '../lib/kst.ts';
import {areaMappings,publicAreaIds} from '../lib/areas.ts';

const clock=(now=new Date().toISOString())=>({generatedAt:now,now:Date.parse(now),kstNowIso:kstNowIsoOf(now),kstToday:kstDayOf(now),kstHourStart:kstHourStartIsoOf(now),serviceDate:kstDayOf(now),dayRelation:'TODAY',dayStartAt:kstDayBounds(kstDayOf(now)).startAt});
const kstMinute=()=>kstNowIsoOf(new Date(Date.now()-60000).toISOString()).slice(0,16).replace('T',' ');
function fixture(){const archive=new SqliteD1(),active=new SqliteD1();active.raw.exec(readFileSync('config/recovery/schema.sql','utf8'));return {archive,active};}
function provider(terminal,partial=false){const occurtime=kstMinute().replace(/[- :]/g,'');const keys=terminal==='T1'?Array.from({length:6},(_,i)=>['E','W'].map(side=>`DG${i+1}_${side}`)).flat():['DG1','DG2'].flatMap(g=>['A','B','C','D'].map(s=>`${g}_${s}`));const items=keys.map(gateId=>({terminalId:terminal==='T1'?'P01':'P03',gateId,waitTime:'12',waitLength:'45',occurtime,operatingTime:'00:00~24:00'}));if(partial)items.pop();return {response:{header:{resultCode:'00'},body:{items,totalCount:items.length}}};}
function seoul(url,partial=false){const poi=new URL(url).pathname.split('/').at(-1);const area=publicAreaIds.find(a=>areaMappings[a].seoulPoiCode===poi);assert.ok(area,'actual provider URL uses mapped POI');const at=kstMinute();return {RESULT:{'RESULT.CODE':'INFO-000'},CITYDATA:{AREA_NM:area,AREA_CD:poi,LIVE_PPLTN_STTS:[{AREA_CD:poi,AREA_NM:area,AREA_CONGEST_LVL:'보통',AREA_PPLTN_MIN:'100',AREA_PPLTN_MAX:'200',PPLTN_TIME:at,FCST_YN:'Y',FCST_PPLTN:[{FCST_TIME:kstNowIsoOf(new Date(Date.now()+3600000).toISOString()).slice(0,16).replace('T',' '),FCST_CONGEST_LVL:'보통',FCST_PPLTN_MIN:'100',FCST_PPLTN_MAX:'200'}]}],LIVE_CMRCL_STTS:partial?{}:{AREA_CMRCL_LVL:'활발',CMRCL_RSB:[],AREA_SH_PAYMENT_CNT:'10',AREA_SH_PAYMENT_AMT_MIN:1000,AREA_SH_PAYMENT_AMT_MAX:2000,CMRCL_TIME:at}}};}
for(const [source,terminal] of [['airport_congestion','T1'],['airport_congestion_t2','T2'],['seoul_realtime',null]])test(`${source}: real collector → SQLite staging → atomic publication → actual summary, partial/commit failure/rollback`,async t=>{
 const {archive,active}=fixture();t.after(()=>{archive.raw.close();active.raw.close();});
 let partial=false,calls=0;
 t.mock.method(globalThis,'fetch',async url=>{calls++;return new Response(JSON.stringify(terminal?provider(terminal,partial):seoul(String(url),partial)),{headers:{'content-type':'application/json'}});});
 const env={DB:active,DATA_GO_KR_SERVICE_KEY:'synthetic',SEOUL_OPEN_DATA_KEY:'synthetic'},state=emptyAdmission();
 const [archivedResult]=await runSelectedProductionSources({...env,DB:archive},[source]);assert.equal(archivedResult.status,'SUCCESS');
 const dump=()=>JSON.stringify(['source_health','airport_congestion','seoul_realtime_area','seoul_realtime_commercial','seoul_context'].map(table=>archive.raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
 if(!terminal){
  for(const table of ['seoul_realtime_area','seoul_realtime_commercial'])for(const row of archive.raw.prepare(`SELECT * FROM ${table}`).all())for(const days of [7,28]){
   const baseline={...row,id:`${row.id}-${days}`,observed_at:kstNowIsoOf(new Date(Date.parse(row.observed_at)-days*86400000).toISOString())};
   if(table==='seoul_realtime_area'){baseline.population_min=50;baseline.population_max=100;}
   const keys=Object.keys(baseline);archive.raw.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...Object.values(baseline));
  }
  for(const area of publicAreaIds)for(let day=0;day<62;day++){const observed=kstNowIsoOf(new Date(Date.now()-day*86400000-60000).toISOString());archive.raw.prepare('INSERT INTO seoul_context(area,observed_at,retrieved_at,payload,source_hash) VALUES(?,?,?,?,?)').run(area,observed,observed,JSON.stringify({commercialAt:observed,categories:[],weather:null}),`${area}-${day}`);}
 }
 const archivedBytes=dump(),archiveWrites=archive.calls.filter(sql=>/^(INSERT|UPDATE|DELETE)/i.test(sql.trim())).length;
 archive.raw.exec('PRAGMA query_only=ON');
 // Native D1 read batches are read-only; this fixture's default BEGIN IMMEDIATE is a writer lock.
 archive.batch=async statements=>{archive.raw.exec('BEGIN');try{const output=statements.map(s=>s.execute());archive.raw.exec('COMMIT');return output;}catch(error){archive.raw.exec('ROLLBACK');throw error;}};
 const result=await collectRecoverySource(env,source,'active',state);
 assert.equal(result.status,'SUCCESS',JSON.stringify(result));
 assert.match(result.detail,/snapshot=PUBLISHED/);
 const saved=active.raw.prepare('SELECT payload FROM recovery_public_snapshots WHERE source=?').get(source).payload;
 const summary=await (await summarizeLiveSummary(archive,clock(),active)).json();
 assert.ok(summary.recovery.applied.includes(source));
 const health=await recoveryHealthSources([],active,Date.now());for(const row of health)assert.equal(row.status,'LIVE');
 if(!terminal){assert.equal(summary.areas.myeongdong.realtime.comparisons['7'].maxPercent,300);assert.equal(summary.areas.myeongdong.realtime.comparisons['28'].maxPercent,300);assert.equal(archive.raw.prepare('SELECT count(*) n FROM seoul_context').get().n,248);}

 if(terminal){assert.equal(summary.airport.congestion.length,terminal==='T1'?12:8);assert.equal(summary.airport.congestion[0].freshness,'LIVE');}
 else for(const area of publicAreaIds){assert.equal(summary.areas[area].realtime.populationMin,100);assert.equal(summary.areas[area].commercial.paymentAmountMin,1000);assert.equal(summary.areas[area].realtime.freshness,'LIVE');}
 partial=true;const incomplete=await collectRecoverySource(env,source,'active',state);assert.notEqual(incomplete.status,'SUCCESS');
 assert.equal(active.raw.prepare('SELECT payload FROM recovery_public_snapshots WHERE source=?').get(source).payload,saved);
 partial=false;active.raw.exec("CREATE TRIGGER fail_publication BEFORE UPDATE ON recovery_public_snapshots BEGIN SELECT RAISE(ABORT,'publication failure'); END");
 const failed=await collectRecoverySource(env,source,'active',state);assert.equal(failed.status,'ERROR');
 assert.equal(active.raw.prepare('SELECT payload FROM recovery_public_snapshots WHERE source=?').get(source).payload,saved);
 const rollback=await (await summarizeLiveSummary(archive,clock())).json();assert.equal(rollback.recovery,undefined);assert.equal(rollback.airport.congestion.length,terminal?(terminal==='T1'?12:8):0);
 assert.equal(archive.calls.filter(sql=>/^(INSERT|UPDATE|DELETE)/i.test(sql.trim())).length,archiveWrites);assert.equal(dump(),archivedBytes);
 const before=calls;state.blocked.active=true;const blocked=await collectRecoverySource(env,source,'active',state);assert.equal(blocked.providerRequests,0);assert.equal(calls,before);
 state.blocked.other=true;delete state.blocked.active;active.raw.exec('DROP TRIGGER fail_publication');assert.equal((await collectRecoverySource(env,source,'active',state)).status,'SUCCESS');
 const corrupt=JSON.parse(saved);if(terminal)corrupt.congestion.pop();else delete corrupt.areas.itaewon;
 active.raw.prepare('UPDATE recovery_public_snapshots SET payload=? WHERE source=?').run(JSON.stringify(corrupt),source);
 const invalid=await (await summarizeLiveSummary(archive,clock(),active)).json();assert.ok(invalid.recovery.failed.includes(source));assert.ok(!invalid.recovery.applied.includes(source));
 active.raw.prepare('UPDATE recovery_public_snapshots SET payload=? WHERE source=?').run(saved,source);
 const old=await (await summarizeLiveSummary(archive,clock(new Date(Date.now()+3600000).toISOString()),active)).json();
 if(terminal)assert.equal(old.airport.congestion[0].freshness,'STALE');else assert.equal(old.areas.myeongdong.realtime.freshness,'STALE');
});

test('public source LIVE clock becomes STALE while stored status remains inspectable',()=>{
 const source={sourceId:'INCHEON_DEPARTURE_CONGESTION',status:'LIVE',eventAt:'2026-11-16T00:00:00Z'};
 const [publicSource]=projectRealtimeSourceStatus([source],Date.parse('2026-11-17T00:00:00Z'));
 assert.equal(publicSource.status,'STALE');assert.equal(publicSource.storedStatus,'LIVE');assert.equal(source.status,'LIVE');
 const state=emptyAdmission();assert.equal(storageTransition(state,'db1','T1','ERROR'),true);assert.equal(storageTransition(state,'db1','T1','ERROR'),false);assert.equal(storageTransition(state,'db2','T1','ERROR'),true);assert.equal(storageTransition(state,'db1','T1','SUCCESS'),true);assert.equal(storageTransition(state,'db1','T1','ERROR'),true);
});

test('admission persists full DB block and suppressed notices across fresh processes; missing/corrupt state fails closed',async t=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {loadRecoveryState,saveRecoveryState}=await import('../scripts/recovery-state.ts');
 const dir=mkdtempSync(join(tmpdir(),'rpk-admission-')),path=join(dir,'state.json');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 assert.throws(()=>loadRecoveryState(path),/unavailable/);
 const state=loadRecoveryState(path,true);state.blocked.full=true;storageTransition(state,'full','T1','ERROR');saveRecoveryState(path,state);
 const restored=loadRecoveryState(path);assert.equal(restored.blocked.full,true);assert.equal(storageTransition(restored,'full','T1','ERROR'),false);assert.equal(restored.blocked.other,undefined);
 writeFileSync(path,'{"version":9}');assert.throws(()=>loadRecoveryState(path),/invalid/);
 writeFileSync(path,'{"version":1,"blocked":[],"notices":{}}');assert.throws(()=>loadRecoveryState(path),/invalid/);
});

test('actual REST capacity failure from collector blocks only writer DB and survives admission persistence',async t=>{
 const {CloudflareD1RestDatabase}=await import('../lib/d1-rest.ts');
 const full=new CloudflareD1RestDatabase('account','full','test',async()=>new Response(JSON.stringify({success:false,errors:[{code:7500,message:'Exceeded maximum DB size.'}]}),{status:400}));
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(provider('T1')),{headers:{'content-type':'application/json'}}));
 const state=emptyAdmission(),env={DB:full,DATA_GO_KR_SERVICE_KEY:'test'};
 const result=await collectRecoverySource(env,'airport_congestion','full',state);assert.equal(result.status,'ERROR');assert.equal(state.blocked.full,true);assert.equal(state.blocked.other,undefined);
 const again=await collectRecoverySource(env,'airport_congestion','full',JSON.parse(JSON.stringify(state)));assert.equal(again.providerRequests,0);
});

test('workflow integration is opt-in, inherits existing lock, uses existing notification channel and adds no permissions or scheduler',()=>{
 const cycle=readFileSync('.github/workflows/collect-realtime-cycle.yml','utf8'),retry=readFileSync('.github/workflows/collect-attempt.yml','utf8');
 for(const source of [cycle,retry]){assert.match(source,/actions\/cache\/restore@v4/);assert.match(source,/actions\/cache\/save@v4/);assert.match(source,/fail-on-cache-miss:/);assert.doesNotMatch(source,/schedule:|actions: write|contents: write/);}
 assert.match(readFileSync('.github/workflows/collect-realtime.yml','utf8'),/group: production-collector-realtime/);
 assert.doesNotMatch(readFileSync('wrangler.production.jsonc','utf8'),/RECOVERY_DB|RPK_RECOVERY_READS/);
});

test('A5, weather, recovery variants and remaining writers are explicitly outside the minimum routing allowlist',()=>{
 for(const source of ['airport_passenger_forecast','airport_passenger_forecast_recovery','weather','weather_recovery','airport_recent','seoul_sales','subway_ridership'])assert.equal(recoverySource(source),false);
 for(const source of ['airport_congestion','airport_congestion_t2','seoul_realtime'])assert.equal(recoverySource(source),true);
 const script=readFileSync('scripts/collect-production.ts','utf8');assert.match(script,/!recoveryConfigured && !forecastConfigured && requested.includes\("seoul_realtime"\)/);assert.match(script,/!recoveryConfigured && !forecastConfigured && \(now.getUTCHours/);
});

test('deployment review gate rejects recovery aliases, missing binding and mismatched active/archive identities',async()=>{
 const {validateCloudflareEnvironment}=await import('../scripts/validate-cloudflare-environment.mjs');
 const config=JSON.parse(readFileSync('wrangler.production.jsonc','utf8'));
 const production=config.env.production;
 production.vars.RPK_RECOVERY_READS='true';assert.throws(()=>validateCloudflareEnvironment(config,'production'),/Recovery binding/);
 const archive=production.d1_databases.find(row=>row.binding==='DB');
 production.d1_databases.push({binding:'RECOVERY_DB',database_id:archive.database_id,database_name:'test-active'});
 assert.throws(()=>validateCloudflareEnvironment(config,'production'),/must not alias/);
 const active='11111111-1111-4111-8111-111111111111';production.d1_databases[1].database_id=active;
 production.vars.RPK_RECOVERY_DATABASE_ID=active;production.vars.RPK_RECOVERY_ARCHIVE_DATABASE_ID=archive.database_id;
 assert.doesNotThrow(()=>validateCloudflareEnvironment(config,'production'));
 production.vars.RPK_RECOVERY_DATABASE_ID=archive.database_id;assert.throws(()=>validateCloudflareEnvironment(config,'production'),/identities must match/);
});

test('actual production entrypoint with routing disabled and active identity retained pauses only routed sources with zero network/SQL',async()=>{
 const {execFileSync}=await import('node:child_process');
 const program=`let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network_forbidden');};await import('./scripts/collect-production.ts');console.log(JSON.stringify({networkCalls:calls}));`;
 const output=execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',program],{encoding:'utf8',env:{...process.env,ENABLE_PRODUCTION_COLLECTOR:'true',CLOUDFLARE_D1_WRITE_TOKEN:'synthetic-only',RPK_PRODUCTION_SOURCES:'airport_congestion,airport_congestion_t2,seoul_realtime',RPK_RECOVERY_WRITES:'false',RPK_RECOVERY_DATABASE_ID:'11111111-1111-4111-8111-111111111111'}});
 const lines=output.trim().split('\n').map(line=>JSON.parse(line));
 assert.equal(lines.at(-1).networkCalls,0);
 assert.equal(lines.filter(row=>row.status==='SKIPPED_RECOVERY_PAUSED'&&row.providerRequests===0).length,3);
 assert.equal(recoveryRoute('weather',false,true),'ARCHIVE');assert.equal(recoveryRoute('airport_congestion',false,false),'ARCHIVE');assert.equal(recoveryRoute('airport_congestion',false,true),'PAUSED');
});

test('adapter exposes real size_after separately from rows and never invents absent byte measurements',async()=>{
 const {CloudflareD1RestDatabase}=await import('../lib/d1-rest.ts');
 const db=new CloudflareD1RestDatabase('account','test','synthetic',async()=>new Response(JSON.stringify({success:true,result:[{success:true,results:[],meta:{size_after:450000000,rows_read:1,rows_written:0}}]})));
 assert.equal(db.usageSnapshot().sizeBytes,null);await db.prepare('SELECT 1').all();assert.equal(db.usageSnapshot().sizeBytes,450000000);assert.equal(db.usageSnapshot().rowsRead,1);
});
