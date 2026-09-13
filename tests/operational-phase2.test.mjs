import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync,readFileSync,readdirSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { SqliteD1 } from './helpers/operational-sqlite.mjs';
import { OperationalMemory,safeOperationalEvidence,AUTOMATIC_POLICY_CHANGE_ALLOWED } from '../lib/operational-memory.ts';
import { decideRecovery } from '../lib/recovery-orchestration.ts';
import { executeControlledRecovery,recoveryActivation,CENTRAL_RECOVERY_EXECUTION_ENABLED } from '../lib/operational-recovery-runner.ts';
import { scoreRecoveryAttempts,evaluateShadowPolicy,regressionCandidates,observedUsage } from '../lib/recovery-scorecard.ts';
import { observedContract,measureSource,matchPublicEvidence,matchPublicBundle,verifyPublicMeasurement,sourceObservation,sourceIdsForRun } from '../lib/operational-evidence.ts';
import { evaluateSource } from '../lib/source-lifecycle.ts';
import { summarizeTodayPassengerForecast } from '../lib/airport-today-summary.ts';
import { sha256 } from '../lib/hash.ts';
import { POPULATION_MODEL } from '../lib/population-predictions.ts';
import { CloudflareD1RestDatabase } from '../lib/d1-rest.ts';
import { unstable_splitSqlQuery } from 'wrangler';
import { saveMeasurement,recordExistingCompletion } from '../lib/operational-bookkeeping.ts';
import { readForecastEvidence } from '../lib/operational-forecast-evidence.ts';
import { scanForRuntimeLlm } from '../lib/runtime-llm-scan.ts';
import { walkLifecycle } from '../lib/operational-states.ts';
import { readWorkflowFacts } from '../lib/scheduler-truth.ts';

const at='2026-09-13T06:00:00.000Z';
const later='2026-09-13T06:01:00.000Z';
const parts={sourceId:'KMA_VILAGE_FCST',failureClass:'STALE',contractVersion:'weather-v1',logicalJob:'collect-weather.yml'};
const failure=(runId='run1',overrides={})=>({parts,kind:'FAILURE',runId,at,evidence:'current issuance absent',...overrides});
const request=(runId='run1',overrides={})=>({parts,targetDate:'2026-09-13',scheduledSlot:'14:00',operation:'REQUEST_ONLY_MISSING_COVERAGE',runId,at,...overrides});
const verified={dataValid:true,storageValid:true,publicValid:true};
const setup=()=>{const db=new SqliteD1();return {db,memory:new OperationalMemory(db)};};

test('first occurrence persists exactly one incident',async()=>{const {memory}=setup();await memory.recordEvent(failure());assert.equal((await memory.incidents())[0].occurrenceCount,1);});
test('same fingerprint increments while duplicate event does not',async()=>{const {memory}=setup();await memory.recordEvent(failure());await memory.recordEvent(failure());await memory.recordEvent(failure('run2'));assert.equal((await memory.incidents())[0].occurrenceCount,2);});
test('real child process restart preserves incidence, attempt result and daily budget',()=>{
  const dir=mkdtempSync(join(tmpdir(),'koretail-memory-')),path=join(dir,'ledger.sqlite');
  try {
    const initial=new SqliteD1(path);initial.raw.close();
    const shared=`import {SqliteD1} from './tests/helpers/operational-sqlite.mjs'; import {OperationalMemory} from './lib/operational-memory.ts';
      const db=new SqliteD1(${JSON.stringify(path)},false),m=new OperationalMemory(db);`;
    const run1=spawnSync(process.execPath,['--experimental-sqlite','--import','tsx','--input-type=module','-e',shared+
      `await m.recordEvent(${JSON.stringify(failure())});const a=await m.admit(${JSON.stringify(request())});await m.finish(a.attemptId,${JSON.stringify(later)},${JSON.stringify(verified)},{providerRequests:1});db.raw.close();`],{encoding:'utf8'});
    assert.equal(run1.status,0,run1.stderr);
    const run2=spawnSync(process.execPath,['--experimental-sqlite','--import','tsx','--input-type=module','-e',shared+
      `await m.recordEvent(${JSON.stringify(failure('run2',{at:later}))});const rows=await m.incidents();const attempts=await m.attempts('KMA_VILAGE_FCST','2026-09-13');console.log(JSON.stringify({count:rows[0].occurrenceCount,verified:attempts[0].verified,attempts:attempts.length}));db.raw.close();`],{encoding:'utf8'});
    assert.equal(run2.status,0,run2.stderr);assert.deepEqual(JSON.parse(run2.stdout),{count:2,verified:true,attempts:1});
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('resolved incident reopens without resetting lifetime recurrence or firstSeen',async()=>{const {memory}=setup();await memory.recordEvent(failure());await memory.recordEvent({parts,kind:'HEALTHY',runId:'ok',at:later,evidence:'three layers matched',verification:verified});await memory.recordEvent(failure('run3',{at:'2026-09-13T07:00:00Z'}));const [row]=await memory.incidents();assert.equal(row.currentState,'OPEN');assert.equal(row.firstSeen,at);assert.equal(row.occurrenceCount,2);assert.equal(row.lastGoodAt,later);});
test('contract changes remain different incidents',async()=>{const {memory}=setup();await memory.recordEvent(failure());await memory.recordEvent(failure('run2',{parts:{...parts,contractVersion:'weather-v2'}}));assert.equal((await memory.incidents()).length,2);});
test('unverified recovery cannot resolve or earn lastGood',async()=>{const {memory}=setup();await memory.recordEvent(failure());await memory.recordEvent({parts,kind:'RECOVERY_RESULT',runId:'r',at:later,evidence:'exit zero',verification:{...verified,publicValid:null}});const [row]=await memory.incidents();assert.equal(row.currentState,'DEGRADED');assert.equal(row.lastGoodAt,null);await assert.rejects(memory.recordEvent({parts,kind:'HEALTHY',runId:'bad',at:later,evidence:'unproven'}));});
for(const [name,verification,state] of [
  ['failed storage',{...verified,storageValid:false},'RECOVERY_FAILED'],
  ['failed publication',{...verified,publicValid:false},'RECOVERY_FAILED'],
  ['unknown publication',{...verified,publicValid:null},'RECOVERY_PENDING'],
])test(`durable closed loop: ${name}`,async()=>{const {memory}=setup();await memory.recordEvent(failure());const result=await executeControlledRecovery(memory,request(),{now:()=>later,execute:async()=>({source:'weather_recovery',status:'SUCCESS',records:0,providerRequests:0}),verify:async()=>verification});assert.equal(result.stage,state);const [attempt]=await memory.attempts(parts.sourceId,'2026-09-13');assert.equal(attempt.outcome,state);assert.equal(attempt.verified,false);assert.notEqual((await memory.incidents())[0].currentState,'RESOLVED');});
test('duplicate execution blocked and provider called once',async()=>{const {memory}=setup();await memory.recordEvent(failure());let calls=0;const executor={execute:async()=>{calls++;return {status:'SUCCESS',source:'weather',records:3};},verify:async()=>verified,now:()=>later};await executeControlledRecovery(memory,request(),executor);await executeControlledRecovery(memory,request('again'),executor);assert.equal(calls,1);});
test('stale lock never automatically releases',async()=>{const {memory}=setup();await memory.recordEvent(failure());assert.equal((await memory.admit(request())).admitted,true);assert.equal((await memory.admit(request('next',{at:'2026-10-20T06:00:00Z'}))).admitted,false);});
test('concurrent clients cannot admit different slots for same source/job',async()=>{const {db,memory}=setup();const other=new OperationalMemory(db);const results=await Promise.all([memory.admit(request('a')),other.admit(request('b',{scheduledSlot:'15:00'}))]);assert.equal(results.filter(row=>row.admitted).length,1);});
test('persistent budget survives fresh store instances, different slots and changed contract',async()=>{const {db,memory}=setup();await memory.recordEvent(failure());for(let i=0;i<3;i++){const m=new OperationalMemory(db),a=await m.admit(request(`r${i}`,{scheduledSlot:String(i)}));assert.equal(a.admitted,true);await m.finish(a.attemptId,later,{...verified,dataValid:false});}const result=await new OperationalMemory(db).admit(request('four',{scheduledSlot:'4',parts:{...parts,contractVersion:'weather-v2'}}));assert.equal(result.admitted,false);assert.equal(result.state,'HUMAN_REVIEW_REQUIRED');});
test('unknown structural failures have no automatic recovery',()=>{for(const state of ['UNKNOWN','INVALID_PAYLOAD','PERSISTENCE_FAILED','PUBLICATION_MISMATCH','HUMAN_REVIEW_REQUIRED'])assert.equal(decideRecovery(state,0).approved,false);});
test('runtime scan catches Groq too, and shipped source remains scan-gated',()=>{assert.deepEqual(scanForRuntimeLlm([{path:'lib/bad.ts',content:'fetch("https://api.groq.com")'}],['groq-sdk']).offendingDependencies,['groq-sdk']);});
test('empty evidence never healthy',()=>assert.equal(walkLifecycle([]).state,'UNKNOWN'));
test('evidence is bounded and strips credential assignments/URLs',()=>{const safe=safeOperationalEvidence('token=abc123 password=secret https://provider.invalid/key/'+ 'x'.repeat(1000));assert.ok(safe.length<=500);assert.doesNotMatch(safe,/abc123|password=secret|provider.invalid|x{40}/);});
test('migration reapplication preserves old and new rows',async()=>{const {db,memory}=setup();await memory.recordEvent(failure());db.raw.exec(readFileSync('drizzle/0020_operational_memory.sql','utf8'));assert.equal((await memory.incidents())[0].occurrenceCount,1);});
test('actual Wrangler statement splitter preserves the entire trigger and migration marker',async()=>{
 const db=new SqliteD1(':memory:',false);db.raw.exec('CREATE TABLE d1_migrations(name TEXT)');
 const sql=readFileSync('drizzle/0020_operational_memory.sql','utf8')+"\nINSERT INTO d1_migrations(name) VALUES('0020_operational_memory.sql');";
 for(const statement of unstable_splitSqlQuery(sql))db.raw.exec(statement);
 const memory=new OperationalMemory(db);assert.equal(await memory.available(),true);
 await memory.recordEvent(failure());await memory.recordEvent(failure('second'));assert.equal((await memory.incidents())[0].occurrenceCount,2);
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM d1_migrations').get().n,1);
});
test('partial schema without event trigger stays dormant',async()=>{const {db,memory}=setup();db.raw.exec('DROP TRIGGER operational_event_fold');assert.equal(await memory.available(),false);});
test('SQL constraint refuses verified recovery with an UNKNOWN layer',async()=>{const {db,memory}=setup();const a=await memory.admit(request());assert.throws(()=>db.raw.prepare("UPDATE operational_recovery_attempts SET verified=1,outcome='RECOVERED',data_valid=1,storage_valid=1,public_valid=NULL WHERE attempt_id=?").run(a.attemptId),/CHECK/);});
test('ledger serializes without losing historical recurrence',async()=>{const {memory}=setup();await memory.recordEvent(failure());const rows=await memory.incidents();assert.deepEqual(JSON.parse(JSON.stringify(rows)),rows);});
test('regression candidates and improvement order deterministic',async()=>{const {memory}=setup();for(let i=0;i<4;i++)await memory.recordEvent(failure('r'+i));const rows=await memory.incidents();assert.deepEqual(regressionCandidates(rows),regressionCandidates([...rows].reverse()));assert.equal(regressionCandidates(rows)[0].automaticCodeChangeAllowed,false);});
const scope={sourceId:parts.sourceId,failureClass:parts.failureClass,contractVersion:parts.contractVersion,logicalJob:parts.logicalJob};
function attempt(action,i,changes={}){return {...scope,operation:action,attemptId:action+i,executionId:action+i,targetDate:`2026-09-${String(10+i%3).padStart(2,'0')}`,startedAt:`2026-09-13T${String(i).padStart(2,'0')}:00:00Z`,completedAt:later,verified:true,outcome:'RECOVERED',dataValid:true,storageValid:true,publicValid:true,providerRequests:2,durationMs:1000,escalationRequired:false,...changes};}
test('shadow sample minimum: too few or unknown facts means insufficient evidence',()=>{const rows=[attempt('A',1)];assert.equal(evaluateShadowPolicy(rows,scope,'A','REQUEST_ONLY_MISSING_COVERAGE').state,'INSUFFICIENT_EVIDENCE');});
test('shadow non-worse cheaper policy is review-only, never auto-promoted',()=>{const rows=Array.from({length:10},(_,i)=>[attempt('REDISPATCH_SAME_WORKFLOW',i),attempt('REQUEST_ONLY_MISSING_COVERAGE',i,{providerRequests:1})]).flat();const result=evaluateShadowPolicy(rows,scope,'REDISPATCH_SAME_WORKFLOW','REQUEST_ONLY_MISSING_COVERAGE');assert.equal(result.state,'READY_FOR_OWNER_REVIEW');assert.equal(result.automaticPolicyChangeAllowed,false);assert.equal(AUTOMATIC_POLICY_CHANGE_ALLOWED,false);assert.deepEqual(scoreRecoveryAttempts(rows),scoreRecoveryAttempts([...rows].reverse()));});
test('shadow rejects higher failure or request cost',()=>{const rows=Array.from({length:10},(_,i)=>[attempt('REDISPATCH_SAME_WORKFLOW',i),attempt('REQUEST_ONLY_MISSING_COVERAGE',i,{providerRequests:3})]).flat();assert.equal(evaluateShadowPolicy(rows,scope,'REDISPATCH_SAME_WORKFLOW','REQUEST_ONLY_MISSING_COVERAGE').state,'REJECT_CANDIDATE');});
test('central provider execution dormant during and after trial until explicit later change',()=>{assert.equal(CENTRAL_RECOVERY_EXECUTION_ENABLED,false);assert.equal(recoveryActivation(at).allowed,false);assert.equal(recoveryActivation('2026-10-01T00:00:00Z').allowed,false);});
test('no new recurring schedule and Owner UI Lock byte-identical to approved base',()=>{
  const locks=JSON.parse(readFileSync('tests/fixtures/phase2-locks.json','utf8'));
  for(const file of readdirSync('.github/workflows')){
    const current=readWorkflowFacts(file,readFileSync('.github/workflows/'+file,'utf8'));
    assert.deepEqual(current.crons,locks.crons[file]??[],file);
  }
  for(const [file,expected] of Object.entries(locks.protectedFiles))assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),expected,file);
  const workflow=readWorkflowFacts('operational-memory.yml',readFileSync('.github/workflows/operational-memory.yml','utf8'));assert.deepEqual(workflow.triggers,['workflow_dispatch']);
});
test('real schema version used; unavailable remains unknown; companion source included',()=>{assert.equal(observedContract('KMA_VILAGE_FCST',{schema_version:'weather-v1'}),'weather-v1');assert.equal(observedContract('KMA_VILAGE_FCST',{schema_version:'unavailable'}),'UNKNOWN_CONTRACT');assert.deepEqual(sourceIdsForRun('seoul_realtime'),['SEOUL_CITYDATA_PPLTN','SEOUL_CITYDATA_CMRCL']);});
test('empty actual database is not successful coverage or forecast skill',async()=>{const {db}=setup();const measured=await measureSource(db,'SEOUL_CITYDATA_PPLTN',at);assert.equal(measured.dataValid,false);assert.equal(measured.publicValid,null);const forecasts=await readForecastEvidence(db,at);assert.equal(forecasts.length,3);assert.ok(forecasts.every(row=>row.state==='UNKNOWN'&&!row.performanceClaimAllowed));});
test('storage read failure is unknown, never empty or successful',async()=>{const {db}=setup();db.raw.exec('ALTER TABLE seoul_realtime_area RENAME TO missing_seoul');const measured=await measureSource(db,'SEOUL_CITYDATA_PPLTN',at);assert.equal(measured.storageReadFailed,true);assert.equal(measured.storedRows,null);assert.equal(measured.storageValid,null);});
test('HTTP-shaped empty public body is not publication evidence',()=>{assert.equal(matchPublicEvidence({observedAt:at,storageValid:true,sourceId:'SEOUL_CITYDATA_PPLTN',sample:[]},{status:200}),null);});
test('usage unknown remains unknown despite an observed lower bound',()=>{const [usage]=observedUsage([{day:'2026-09-13',source_id:'x',executions:4,provider_requests:2,provider_measured:1,rows_read:20,rows_written:4}]);assert.equal(usage.quotaPercent,null);assert.equal(usage.providerRequests.upperBound,null);});
test('absent/null/invalid D1 counters remain unmeasured, not an exact zero',async()=>{
 for(const value of [undefined,null,-1,'0']) {
   const db=new CloudflareD1RestDatabase('acct','db','test',async()=>({ok:true,status:200,json:async()=>({success:true,result:[{success:true,results:[],meta:{rows_read:value,rows_written:0}}]})}));
   await db.prepare('SELECT 1').all();assert.equal(db.usageSnapshot().unmeasuredStatements,1);
 }
});
test('observational bookkeeping does not rerun providers and duplicate run does not double usage',async()=>{
 const {db,memory}=setup();const measurement={sourceId:parts.sourceId,contractVersion:parts.contractVersion,observedAt:at,run:{status:'SUCCESS'},health:null,runId:'r',storedRows:3,storageReadFailed:false,coverage:'COMPLETE',failureClass:null,detail:'storage verified',sample:[],dataValid:true,storageValid:true,publicValid:null};
 await saveMeasurement(memory,measurement,'r',{providerRequests:2,rowsRead:10,rowsWritten:3});
 await saveMeasurement(memory,{...measurement,observedAt:later},'r',{providerRequests:2,rowsRead:10,rowsWritten:3});
 const row=db.raw.prepare('SELECT * FROM operational_usage_daily').get();assert.equal(row.executions,1);assert.equal(row.provider_requests,2);
 assert.equal(db.raw.prepare('SELECT last_good_at FROM operational_source_state').get().last_good_at,null);
});
test('pre-migration collector observer stays dormant without changing a result',async()=>{const db=new SqliteD1(':memory:',false);const result={source:'weather',status:'SUCCESS',records:0};assert.equal((await recordExistingCompletion(db,result,{runId:'r',startedAt:at,completedAt:later,attempt:1})).state,'DORMANT_MIGRATION_UNAVAILABLE');assert.equal(result.status,'SUCCESS');});

function insert(db,table,row){const keys=Object.keys(row);db.raw.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));}
function populationFixture(db) {
 const source='SEOUL_CITYDATA_PPLTN',observed='2026-09-13T15:00:00+09:00';
 insert(db,'collector_runs',{run_id:'observed-run',source_id:source,started_at:at,finished_at:at,status:'SUCCESS',records_read:3,records_written:3});
 insert(db,'source_health',{source_id:source,status:'LIVE',last_retrieved_at:at,schema_version:'population-v1'});
 const areas={};
 for(const area of ['hongdae','myeongdong','seongsu']) {
   insert(db,'seoul_realtime_area',{id:area,source_id:source,record_origin:'LIVE',area,area_code:area,area_name:area,congestion_level:2,
     congestion_label:'normal',population_min:100,population_max:200,observed_at:observed,retrieved_at:at,freshness:'LIVE',schema_version:'population-v1',quality_status:'VALID',source_hash:area});
   areas[area]={realtime:{observedAt:observed,populationMin:100,populationMax:200,schemaVersion:'population-v1',areaCode:area}};
 }
 return {mode:'live-summary',serviceDateKst:'2026-09-13',areas};
}
test('real three-area stored ranges match public projection; only all layers earn lastGood',async()=>{
 const {db,memory}=setup(),body=populationFixture(db),m=await measureSource(db,'SEOUL_CITYDATA_PPLTN',at);
 assert.equal(m.dataValid,true);assert.equal(m.storageValid,true);assert.equal(m.contractVersion,'population-v1');
 await saveMeasurement(memory,m,'observed-run',{providerRequests:null,rowsRead:null,rowsWritten:null});
 assert.equal(db.raw.prepare('SELECT last_good_at FROM operational_source_state').get().last_good_at,null);
 verifyPublicMeasurement(m,{today:body,tomorrow:null});assert.equal(m.publicValid,true);
 await saveMeasurement(memory,{...m,observedAt:later},'observed-run',{providerRequests:null,rowsRead:null,rowsWritten:null});
 assert.equal(db.raw.prepare('SELECT last_good_at FROM operational_source_state').get().last_good_at,later);
 assert.equal(evaluateSource(sourceObservation(m,'collect-realtime.yml',900000),at).walk.state,'HEALTHY');
 body.areas.hongdae.realtime.populationMax=201;verifyPublicMeasurement(m,{today:body,tomorrow:null});
 assert.equal(m.failureClass,'PUBLICATION_MISMATCH');assert.equal(evaluateSource(sourceObservation(m,'collect-realtime.yml',900000),at).walk.state,'PUBLICATION_MISMATCH');
});
test('invalid stored payload or unknown completion cannot hide behind a successful run',async()=>{
 const {db}=setup();populationFixture(db);db.raw.exec("UPDATE seoul_realtime_area SET population_max=99 WHERE area='hongdae'");
 const m=await measureSource(db,'SEOUL_CITYDATA_PPLTN',at);assert.equal(evaluateSource(sourceObservation(m,'collect-realtime.yml',900000),at).walk.state,'INVALID_PAYLOAD');
 db.raw.exec("UPDATE seoul_realtime_area SET population_max=200; UPDATE collector_runs SET finished_at=NULL");
 assert.equal((await measureSource(db,'SEOUL_CITYDATA_PPLTN',at)).dataValid,null);
});
test('A5 publication requires both dates and exact terminal hours, never matching totals alone',()=>{
 const sample=['2026-09-13','2026-09-14'].flatMap((day,i)=>['T1','T2'].flatMap(terminal=>[0,12].map(hour=>({terminal,direction:'departure',isAggregate:1,targetDate:day,
   timeBandRaw:String(hour),targetStartAt:`${day}T${String(hour).padStart(2,'0')}:00:00+09:00`,
   targetEndAt:hour===0?`${day}T12:00:00+09:00`:`2026-09-${15+i-1}T00:00:00+09:00`,expectedPassengers:hour===0?100:200,retrievedAt:at}))));
 const bodies=['2026-09-13','2026-09-14'].map(day=>{const s=summarizeTodayPassengerForecast(sample.filter(r=>r.targetDate===day),day);
   return {mode:'live-summary',serviceDateKst:day,airport:{todayExpectedPassengersTotal:s.total,todayExpectedPassengersByTerminal:s.totalByTerminal,
     passengerForecastRetrievedAtByTerminal:s.retrievedAtByTerminal,passengerForecastTimelineByTerminal:s.timelineByTerminal}};});
 const m={sourceId:'INCHEON_PASSENGER_FORECAST',storageValid:true,observedAt:at,sample};
 assert.equal(matchPublicBundle(m,{today:bodies[0],tomorrow:bodies[1]}),true);
 assert.equal(matchPublicBundle(m,{today:bodies[0],tomorrow:null}),null);
 [bodies[1].airport.passengerForecastTimelineByTerminal.T1[0].expectedPassengers,bodies[1].airport.passengerForecastTimelineByTerminal.T1[1].expectedPassengers]=[200,100];
 assert.equal(matchPublicBundle(m,{today:bodies[0],tomorrow:bodies[1]}),false);
});
test('existing scheduled recovery records deduplicated incident events without inventing public proof',async()=>{
 const {db,memory}=setup();await memory.recordEvent(failure('old',{at:'2026-09-13T05:00:00Z',parts:{...parts,contractVersion:'UNKNOWN_CONTRACT'}}));
 const result={source:'weather_recovery',status:'SUCCESS',records:0,mode:'RECOVERY',providerRequests:0},context={runId:'existing-1',startedAt:at,completedAt:later,attempt:1};
 await recordExistingCompletion(db,result,context);await recordExistingCompletion(db,result,context);
 const incident=(await memory.incidents()).find(r=>r.failureClass==='STALE');assert.equal(incident.recoveryAttempts,1);assert.equal(incident.currentState,'DEGRADED');
 const attempts=await memory.attempts(parts.sourceId,'2026-09-13');assert.equal(attempts.length,1);assert.equal(attempts[0].verified,false);assert.equal(attempts[0].publicValid,null);
});
async function forecastFixture(db,{futureInput=false,badOutcome=false}={}) {
 const cutoff='2026-09-11T10:00:00Z';
 for(let h=0;h<24;h++) {const id='forecast-'+h,target=`2026-09-12T${String(h).padStart(2,'0')}:00:00+09:00`;
 const samples=['2026-09-05','2026-08-29'].map(day=>({observedAt:`${day}T${String(h).padStart(2,'0')}:05:00+09:00`,retrievedAt:futureInput?at:`${day}T${String(h).padStart(2,'0')}:06:00+09:00`,populationMin:100,populationMax:200,sourceHash:day,qualityStatus:'VALID',recordOrigin:'LIVE',schemaVersion:'population-v1'}));
 insert(db,'predictions',{prediction_id:id,created_at:cutoff,target_at:target,data_cutoff:cutoff,target_id:'AREA_ACTIVITY',area:'hongdae',value:150,value_scale:1,forecast_class:'MODERATE',confidence:'LOW',model_version:POPULATION_MODEL,proxy_version:'population-midpoint-people-v1',feature_version:'same-weekday-00-14min-v1',source_versions:JSON.stringify({SEOUL_CITYDATA_PPLTN:'population-v1'}),input_hash:await sha256(samples),prediction_hash:id,record_origin:'FORECAST'});
 insert(db,'prediction_inputs',{prediction_id:id,payload:JSON.stringify(samples)});
 insert(db,'outcomes',{id, prediction_id:id,target_id:'AREA_ACTIVITY',event_at:target,available_at:at,collected_at:at,actual_value:160,actual_unit:badOutcome?'wrong_unit':'estimated_people_midpoint',source_id:'SEOUL_CITYDATA_PPLTN',source_version:'population-v1',verification_level:'FAST',quality_status:'VALID'});
 insert(db,'baseline_predictions',{id,prediction_id:id,baseline_id:'SAME_WEEKDAY',value:140,value_scale:1,created_at:cutoff});
 }
}
test('real forecast/input/outcome tables feed health without claiming independent skill',async()=>{
 const {db}=setup();await forecastFixture(db);const rows=await readForecastEvidence(db,at),hongdae=rows.find(r=>r.detail.startsWith('hongdae:'));
 assert.equal(hongdae.state,'BASELINE_NOT_INDEPENDENT');assert.equal(hongdae.performanceClaimAllowed,false);
});
for(const [option,state] of [['futureInput','INPUT_NOT_FROZEN'],['badOutcome','OUTCOME_MATCH_FAILED']])test(`forecast evidence rejects ${option}`,async()=>{
 const {db}=setup();await forecastFixture(db,{[option]:true});assert.equal((await readForecastEvidence(db,at)).find(r=>r.detail.startsWith('hongdae:')).state,state);
});
