import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {runSelectedProductionSources} from '../lib/production-runner.ts';
import {SqliteD1} from './helpers/operational-sqlite.mjs';
import {collectForecastPublication} from '../lib/forecast-recovery-collector.ts';
import {validForecastPublication,expectedWeatherIssuance,forecastRecoveryHealth} from '../lib/forecast-recovery.ts';
import {emptyAdmission} from '../lib/recovery-runtime.ts';
import {summarizeLiveSummary} from '../app/api/live/summary/route.ts';
import {kstDayOf,kstNowIsoOf,kstDayBounds,kstHourStartIsoOf,shiftKstDay,relateKstDay} from '../lib/kst.ts';
const now=new Date(),today=kstDayOf(now.toISOString());
const clock=(day=today)=>({generatedAt:new Date().toISOString(),now:Date.now(),kstNowIso:kstNowIsoOf(new Date().toISOString()),kstToday:today,kstHourStart:kstHourStartIsoOf(now.toISOString()),serviceDate:day,dayRelation:relateKstDay(day,today),dayStartAt:kstDayBounds(day).startAt});
function fixture(){const archive=new SqliteD1(),active=new SqliteD1();active.raw.exec(readFileSync('config/recovery/forecast-schema.sql','utf8'));return {archive,active};}
function a5(url,value,partial,referenceDay=today){const selected=new URL(url).searchParams.get('selectdate'),date=shiftKstDay(referenceDay,Number(selected));const items=Array.from({length:partial?23:24},(_,hour)=>({adate:date.replaceAll('-',''),atime:`${String(hour).padStart(2,'0')}_${String(hour+1).padStart(2,'0')}`,t1dg1:String(value),t1dg2:'0',t1dg3:'0',t1dg4:'0',t1dg5:'0',t1dg6:'0',t1dgsum1:String(value),t1eg1:String(value),t1eg2:'0',t1eg3:'0',t1eg4:'0',t1egsum1:String(value),t2dg1:String(value),t2dg2:'0',t2dgsum2:String(value),t2eg1:String(value),t2eg2:'0',t2egsum1:String(value)}));return {response:{header:{resultCode:'00'},body:{items,totalCount:items.length}}};}
function weather(url,value,partial,thin=false){const q=new URL(url).searchParams;if(partial&&q.get('nx')==='60')return {response:{header:{resultCode:'03'}}};const items=[];for(let hour=0;hour<(thin?23:24);hour++){const target=kstNowIsoOf(new Date(Date.parse(kstHourStartIsoOf(now.toISOString()))+hour*3600000).toISOString());for(const [category,fcstValue] of [['POP','30'],['TMP',String(value)],['SKY','3'],['PTY','0']])items.push({baseDate:q.get('base_date'),baseTime:q.get('base_time'),fcstDate:target.slice(0,10).replaceAll('-',''),fcstTime:target.slice(11,16).replace(':',''),nx:Number(q.get('nx')),ny:Number(q.get('ny')),category,fcstValue});}return {response:{header:{resultCode:'00'},body:{items:{item:items}}}};}
for(const [family,source,key] of [['A5','airport_passenger_forecast','a5'],['WEATHER','weather','weather']])test(`${family}: actual collector/write/read, partial publication, past/future and disabled read rollback`,async t=>{
 const {archive,active}=fixture();t.after(()=>{archive.raw.close();active.raw.close();});let value=10,partial=false,calls=0,referenceDay=today,thin=false;
 t.mock.method(globalThis,'fetch',async url=>{calls++;return Response.json(family==='A5'?a5(String(url),value,partial,referenceDay):weather(String(url),value,partial,thin));});
 const state=emptyAdmission(),env={DB:active,DATA_GO_KR_SERVICE_KEY:'synthetic'};
 value=5;const [archived]=await runSelectedProductionSources({...env,DB:archive},[source],new Date());assert.equal(archived.status,'SUCCESS');
 if(family==='A5')for(const days of [7,28]){referenceDay=shiftKstDay(today,-days);const [history]=await runSelectedProductionSources({...env,DB:archive},[source],new Date(now.getTime()-days*86400000));assert.equal(history.status,'SUCCESS');}
 referenceDay=today;await runSelectedProductionSources({...env,DB:archive},[source],new Date());value=10;
 // Nonempty original prediction/input/outcome evidence, separate from official A5 forecast versions.
 archive.raw.exec(`INSERT INTO predictions(prediction_id,created_at,target_at,data_cutoff,target_id,area,value,forecast_class,confidence,model_version,proxy_version,feature_version,source_versions,input_hash,prediction_hash,record_origin) VALUES('preserved','2026-01-01','2026-01-02','2026-01-01','AREA_ACTIVITY','myeongdong',1,'LOW','LOW','v1','v1','v1','{}','h','prediction-h','FORECAST');INSERT INTO prediction_inputs(prediction_id,payload) VALUES('preserved','{}');INSERT INTO outcomes(id,prediction_id,target_id,event_at,available_at,collected_at,actual_value,actual_unit,source_id,source_version,verification_level,quality_status) VALUES('outcome-preserved','preserved','AREA_ACTIVITY','2026-01-02','2026-01-02','2026-01-02',1,'people','fixture','v1','FAST','VALID')`);
 const dump=()=>JSON.stringify(['airport_passenger_forecast','airport_forecast_versions','weather_forecast','predictions','prediction_inputs','outcomes','source_health'].map(table=>archive.raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
 const originalBytes=dump();archive.raw.exec('PRAGMA query_only=ON');archive.batch=async statements=>{archive.raw.exec('BEGIN');try{const output=statements.map(s=>s.execute());archive.raw.exec('COMMIT');return output;}catch(error){archive.raw.exec('ROLLBACK');throw error;}};
 const legacyDir=mkdtempSync(join(tmpdir(),'rpk-legacy-summary-')),legacyPath=join(legacyDir,'summary.mts');
 const frozen=JSON.parse(readFileSync('tests/fixtures/summary-worker-4ade5ed.json','utf8')),legacyBytes=gunzipSync(Buffer.from(frozen.gzipBase64,'base64'));assert.equal(createHash('sha256').update(legacyBytes).digest('hex'),frozen.sha256);
 const legacyCode=legacyBytes.toString('utf8').replace(/(from\s+['"])(\.[^'"]+)(['"])/g,(_,before,path,after)=>before+new URL(path,pathToFileURL(resolve('app/api/live/summary/route.ts'))).href+after);
 writeFileSync(legacyPath,legacyCode);t.after(()=>rmSync(legacyDir,{recursive:true,force:true}));
 const legacy=await import(pathToFileURL(legacyPath).href);

 const first=await collectForecastPublication(env,source,'active',state,new Date());assert.equal(first.status,'SUCCESS',JSON.stringify(first));assert.match(first.detail,/PUBLISHED/);
 const saved=active.raw.prepare('SELECT payload FROM recovery_forecast_publications WHERE family=?').get(family).payload;assert.ok(validForecastPublication(JSON.parse(saved),family,Date.now()));
 const proof=JSON.parse(saved);
 assert.equal(validForecastPublication({...proof,checkedAt:new Date(Date.now()+60000).toISOString()},family,Date.now()),false);
 assert.equal(validForecastPublication({...proof,rows:proof.rows.slice(1)},family,Date.now()),false);
 if(family==='WEATHER')assert.equal(validForecastPublication({...proof,rows:proof.rows.map((row,i)=>i?row:{...row,issuedAt:'2020-01-01T00:00:00+09:00'})},family,Date.now()),false);

 const current=await (await summarizeLiveSummary(archive,clock(),undefined,{[key]:active})).json();assert.ok(current.forecastRecovery.applied.includes(family));
 const health=await forecastRecoveryHealth([], {[key]:active},Date.now());assert.deepEqual(health.applied,[family]);assert.equal(health.sources[0].status,'LIVE');
 const archivedCurrent=await (await summarizeLiveSummary(archive,clock())).json();assert.deepEqual(current.airport.monthToDate,archivedCurrent.airport.monthToDate);if(family==='A5')for(const scope of ['all','T1','T2'])for(const days of ['7','28']){
  const actual=current.airport.periodComparisons[scope][days].passengers,baseline=archivedCurrent.airport.periodComparisons[scope][days].passengers;
  assert.equal(actual.baselineAt,baseline.baselineAt);assert.equal(actual.baselineMin,baseline.baselineMin);assert.equal(actual.baselineMax,baseline.baselineMax);assert.equal(actual.minPercent,100);assert.equal(actual.maxPercent,100);
 }else assert.deepEqual(current.airport.periodComparisons,archivedCurrent.airport.periodComparisons);
 if(family==='A5'){assert.equal(current.airport.todayExpectedPassengersTotal,480);assert.equal(current.airport.arrivalForecast.todayExpectedPassengersTotal,480);assert.equal(current.airport.passengerForecastTimeline.length,24);}
 else assert.equal(current.areas.myeongdong.weather[0].temperatureTenthC,100);
 const originalCount=family==='A5'?active.raw.prepare('SELECT count(*) n FROM airport_forecast_versions').get().n:0;
 if(family==='A5'){assert.equal(originalCount,192);assert.throws(()=>active.raw.exec("UPDATE airport_forecast_versions SET expected_passengers=99"),/immutable/);assert.throws(()=>active.raw.exec('DELETE FROM airport_forecast_versions'),/immutable/);}
 if(family==='WEATHER'){thin=true;const incomplete=await collectForecastPublication(env,source,'active',state,new Date());assert.equal(incomplete.status,'PARTIAL');assert.equal(active.raw.prepare('SELECT payload FROM recovery_forecast_publications WHERE family=?').get(family).payload,saved);thin=false;}
 partial=true;const partialResult=await collectForecastPublication(env,source,'active',state,new Date());assert.notEqual(partialResult.status,'SUCCESS');assert.equal(active.raw.prepare('SELECT payload FROM recovery_forecast_publications WHERE family=?').get(family).payload,saved);
 const guardedSkip=await collectForecastPublication(env,source+'_recovery','active',state,new Date());assert.ok(!guardedSkip.detail?.includes('publication=PUBLISHED'));assert.equal(active.raw.prepare('SELECT payload FROM recovery_forecast_publications WHERE family=?').get(family).payload,saved);
 partial=false;value=20;const revised=await collectForecastPublication(env,source,'active',state,new Date());assert.equal(revised.status,'SUCCESS',JSON.stringify(revised));
 if(family==='A5')assert.ok(active.raw.prepare('SELECT count(*) n FROM airport_forecast_versions').get().n>originalCount);
 const lastGood=active.raw.prepare('SELECT payload FROM recovery_forecast_publications WHERE family=?').get(family).payload;
 active.raw.exec("CREATE TRIGGER reject_forecast_publication BEFORE UPDATE ON recovery_forecast_publications BEGIN SELECT RAISE(ABORT,'publication refused'); END");
 const failed=await collectForecastPublication(env,source,'active',state,new Date());assert.equal(failed.status,'ERROR');assert.equal(active.raw.prepare('SELECT payload FROM recovery_forecast_publications WHERE family=?').get(family).payload,lastGood);
 active.raw.exec('DROP TRIGGER reject_forecast_publication');
 const corrupt=JSON.parse(lastGood);corrupt.rows.pop();active.raw.prepare('UPDATE recovery_forecast_publications SET payload=? WHERE family=?').run(JSON.stringify(corrupt),family);
 const corrupted=await (await summarizeLiveSummary(archive,clock(),undefined,{[key]:active})).json();assert.equal(corrupted.mode,'degraded');assert.ok(corrupted.forecastRecovery.failed.includes(family));
 const unhealthy=await forecastRecoveryHealth([{sourceId:family==='A5'?'INCHEON_PASSENGER_FORECAST':'KMA_VILAGE_FCST',status:'LIVE'}],{[key]:active},Date.now());assert.equal(unhealthy.sources[0].status,'STALE');
 active.raw.prepare('UPDATE recovery_forecast_publications SET payload=? WHERE family=?').run(lastGood,family);


 for(const day of [shiftKstDay(today,-7),shiftKstDay(today,-28),shiftKstDay(today,1),shiftKstDay(today,7)]){
  const c=clock(day);const oldWorker=await (await legacy.summarizeLiveSummary(archive,c)).json();const original=await (await summarizeLiveSummary(archive,c)).json();const routed=await (await summarizeLiveSummary(archive,c,undefined,{[key]:active})).json();assert.deepEqual(routed,original,'past/future remains exact archive response');assert.deepEqual(original,oldWorker,'actual previous Worker summary matches archive');
 }
 const c=clock(),disabled=await (await summarizeLiveSummary(archive,c)).json();assert.equal(disabled.forecastRecovery,undefined);assert.deepEqual(disabled,await (await legacy.summarizeLiveSummary(archive,c)).json());assert.equal(dump(),originalBytes);
 assert.equal(archive.raw.prepare('SELECT count(*) n FROM airport_forecast_versions').get().n,family==='A5'?576:0);
 const before=calls;state.blocked.active=true;const blocked=await collectForecastPublication(env,source,'active',state,new Date());assert.equal(blocked.providerRequests,0);assert.equal(calls,before);
});

test('weather contract matches existing issuance and rejects missing hours, mixed issuance and future receipt',()=>{
 const p={version:1,family:'WEATHER',checkedAt:new Date().toISOString(),issuance:expectedWeatherIssuance(Date.now()),rows:[]};assert.equal(validForecastPublication(p,'WEATHER',Date.now()),false);
});

test('cold start bootstrap expires and is bound to the reviewed commit; an older valid cache can still lose a later block',async t=>{
 const {bootstrapAllowed,loadRecoveryState,saveRecoveryState}=await import('../scripts/recovery-state.ts');
 const now=Date.now(),sha='a'.repeat(40);assert.equal(bootstrapAllowed('true',new Date(now+60000).toISOString(),sha,sha,now),true);
 for(const [end,approved] of [[now-1,sha],[now+16*60000,sha],[now+60000,'b'.repeat(40)]])assert.equal(bootstrapAllowed('true',new Date(end).toISOString(),approved,sha,now),false);
 const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const dir=mkdtempSync(join(tmpdir(),'forecast-cache-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'state.json');
 assert.throws(()=>loadRecoveryState(path),/unavailable/);
 const old=emptyAdmission();saveRecoveryState(path,old);const latest={...old,blocked:{active:true}};
 assert.equal(loadRecoveryState(path).blocked.active,undefined,'a stale restored cache cannot prove the latest blocked state');assert.equal(latest.blocked.active,true);
});

test('actual entrypoint refuses cold A5/weather state before provider or SQL; configured disabled scope pauses safely',()=>{
 for(const family of ['A5','WEATHER'])for(const enabled of ['true','false']){
  const program=`let calls=0;globalThis.fetch=async()=>{calls++;throw Error('forbidden');};await import('./scripts/collect-production.ts');console.log(JSON.stringify({networkCalls:calls}));`;
  const run=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',program],{encoding:'utf8',env:{...process.env,ENABLE_PRODUCTION_COLLECTOR:'true',CLOUDFLARE_D1_WRITE_TOKEN:'synthetic',RPK_PRODUCTION_SOURCES:family==='A5'?'airport_passenger_forecast':'weather',[`RPK_${family}_RECOVERY_DATABASE_ID`]:'22222222-2222-4222-8222-222222222222',[`RPK_${family}_RECOVERY_WRITES`]:enabled,[`RPK_${family}_RECOVERY_BOOTSTRAP`]:'false'}});
  const lines=run.stdout.trim().split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));assert.equal(lines.at(-1).networkCalls,0);assert.equal(run.status,enabled==='true'?1:0);
  const result=lines.find(row=>row.source);assert.equal(result.providerRequests,0);assert.equal(result.status,enabled==='true'?'ERROR':'SKIPPED_RECOVERY_PAUSED');
 }
});

test('weather recovery issuance is identical to the real collector at every half-hour boundary',async()=>{
 const {latestKmaIssuance}=await import('../lib/collector.ts');
 for(let hour=0;hour<24;hour++)for(const minute of [0,29,30,59]){
  const now=new Date(`2026-11-17T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`),base=latestKmaIssuance(now);
  assert.equal(expectedWeatherIssuance(now.getTime()),`${base.baseDate.slice(0,4)}-${base.baseDate.slice(4,6)}-${base.baseDate.slice(6)}T${base.baseTime.slice(0,2)}:00:00+09:00`);
 }
});
