import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { unstable_splitSqlQuery } from 'wrangler';
import { SqliteD1 } from './helpers/operational-sqlite.mjs';
import { OperationalMemory } from '../lib/operational-memory.ts';
import { OPERATIONAL_OBJECTS, migrationGate, checkResumeEvidence, normalizedDefinition, readWranglerResults } from '../lib/operational-migration-preflight.ts';

const statements=unstable_splitSqlQuery(readFileSync('drizzle/0020_operational_memory.sql','utf8'));
const objects=db=>db.raw.prepare("SELECT name,type,sql FROM sqlite_master WHERE name LIKE 'operational_%' ORDER BY name").all();
const canonicalDb=new SqliteD1(':memory:',false);for(const sql of statements)canonicalDb.raw.exec(sql);
const expected=objects(canonicalDb);canonicalDb.raw.close();
const names=Object.keys(OPERATIONAL_OBJECTS),tables=expected.filter(r=>r.type==='table');
const variants=[
 ['none',[], 'STATE_A_EMPTY_PENDING'],
 ['first table',['operational_incidents'],'STATE_B_PARTIAL_PENDING'],
 ['several tables',tables.slice(0,3).map(r=>r.name),'STATE_B_PARTIAL_PENDING'],
 ['tables and some indexes',[...tables.map(r=>r.name),'operational_event_incident_idx','operational_incident_source_idx'],'STATE_B_PARTIAL_PENDING'],
 ['all except trigger',names.filter(n=>n!=='operational_event_fold'),'STATE_B_PARTIAL_PENDING'],
 ['all objects',names,'STATE_C_FULL_PENDING'],
];
function install(db,selected){for(const row of [...expected.filter(r=>r.type==='table'),...expected.filter(r=>r.type!=='table')])if(selected.includes(row.name))db.raw.exec(row.sql);}
const parts={sourceId:'KMA_VILAGE_FCST',failureClass:'STALE',contractVersion:'weather-v1',logicalJob:'collect-weather.yml'};
const event=(runId,kind='FAILURE',verification)=>({parts,kind,runId,verification,at:'2026-09-13T09:00:00.000Z',evidence:'local partial migration fixture'});
const fullProof={dataValid:true,storageValid:true,publicValid:true};

for(const [label,selected,state] of variants)test(`actual Wrangler split safely resumes pending ${label}`,async()=>{
 const db=new SqliteD1(':memory:',false);install(db,selected);
 if(selected.includes('operational_incidents'))db.raw.exec("INSERT INTO operational_incidents(fingerprint,source_id,failure_class,contract_version,logical_job,first_seen,last_seen,occurrence_count) VALUES('historic','x','STALE','v1','job','2026-09-01','2026-09-02',7)");
 const historic=selected.includes('operational_incidents')?db.raw.prepare("SELECT * FROM operational_incidents WHERE fingerprint='historic'").get():null;
 const before=objects(db),gate=checkResumeEvidence(migrationGate(false,before,expected),sql=>db.raw.prepare(sql).all());
 assert.equal(gate.classification,state);assert.equal(gate.action,'SAFE_TO_APPLY');
 for(const sql of statements)db.raw.exec(sql);
 const memory=new OperationalMemory(db);assert.equal(await memory.available(),true);
 assert.equal(objects(db).length,11);
 for(const object of before)assert.equal(objects(db).find(r=>r.name===object.name).sql,object.sql);
 if(historic)assert.deepEqual(db.raw.prepare("SELECT * FROM operational_incidents WHERE fingerprint='historic'").get(),historic);
 await memory.recordEvent(event('first'));await memory.recordEvent(event('first'));await memory.recordEvent(event('second'));
 let [incident]=await memory.incidents(parts.sourceId);assert.equal(incident.occurrenceCount,2);
 await memory.recordEvent(event('start','RECOVERY_STARTED'));await memory.recordEvent(event('start','RECOVERY_STARTED'));
 [incident]=await memory.incidents(parts.sourceId);assert.equal(incident.recoveryAttempts,1);
 await memory.recordEvent(event('ok','RECOVERY_RESULT',fullProof));assert.equal((await memory.incidents(parts.sourceId))[0].currentState,'RESOLVED');
 await memory.recordEvent(event('recur'));[incident]=await memory.incidents(parts.sourceId);assert.equal(incident.occurrenceCount,3);assert.equal(incident.currentState,'OPEN');
 await memory.recordEvent(event('unknown','RECOVERY_RESULT',{...fullProof,publicValid:null}));assert.equal((await memory.incidents(parts.sourceId))[0].currentState,'DEGRADED');
 const prior=JSON.stringify(await memory.incidents());const events=db.raw.prepare('SELECT COUNT(*) n FROM operational_incident_events').get().n;
 for(const sql of statements)db.raw.exec(sql);
 assert.equal(JSON.stringify(await memory.incidents()),prior);assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM operational_incident_events').get().n,events);
 assert.equal(objects(db).filter(r=>r.type==='trigger').length,1);
 assert.equal(migrationGate(true,objects(db),expected).action,'ALREADY_VALID');db.raw.close();
});

test('applied but incomplete stops; valid applied skips replay',()=>{
 assert.equal(migrationGate(true,expected.slice(1),expected).classification,'STATE_E_APPLIED_INCOMPLETE');
 assert.equal(migrationGate(true,expected.slice(1),expected).action,'UNSAFE');
 assert.equal(migrationGate(true,expected,expected).action,'ALREADY_VALID');
});
test('unknown migration or schema evidence fails closed',()=>{
 for(const [applied,actual] of [[null,expected],[false,null],[null,null]])assert.equal(migrationGate(applied,actual,expected).classification,'STATE_F_UNKNOWN');
 assert.equal(migrationGate(false,[],[]).action,'UNSAFE');
});
test('wrong definition, wrong object type and unexpected trigger all stop',()=>{
 for(const actual of [expected.map((r,i)=>i? r:{...r,sql:r.sql.replace(/\(/,'(unexpected TEXT,')}),expected.map((r,i)=>i?r:{...r,type:'view'}),[...expected,{name:'duplicate_fold',type:'trigger',sql:'CREATE TRIGGER duplicate_fold AFTER INSERT ON operational_incident_events BEGIN SELECT 1; END;'}]])assert.equal(migrationGate(false,actual,expected).action,'UNSAFE');
});
test('definition normalization tolerates SQLite formatting but preserves string meaning',()=>{
 assert.equal(normalizedDefinition('CREATE TABLE IF NOT EXISTS x(a TEXT);'),normalizedDefinition('create table x (a text)'));
 assert.notEqual(normalizedDefinition("CREATE TABLE x(a TEXT DEFAULT 'OPEN')"),normalizedDefinition("CREATE TABLE x(a TEXT DEFAULT 'open')"));
 assert.notEqual(normalizedDefinition("CREATE TABLE x(a TEXT DEFAULT '-- keep')"),normalizedDefinition("CREATE TABLE x(a TEXT DEFAULT '-- change')"));
});
test('events without trigger are preserved but block automatic resumption',()=>{
 const db=new SqliteD1(':memory:',false);install(db,names.filter(n=>n!=='operational_event_fold'));
 db.raw.exec("INSERT INTO operational_incident_events(event_id,fingerprint,source_id,failure_class,contract_version,logical_job,kind,run_id,at,evidence) VALUES('e','f','s','STALE','v','j','FAILURE','r','2026-09-13','local')");
 const gate=checkResumeEvidence(migrationGate(false,objects(db),expected),sql=>db.raw.prepare(sql).all());
 assert.equal(gate.action,'UNSAFE');assert.equal(gate.reason,'event_history_without_trigger_requires_review');
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM operational_incident_events').get().n,1);db.raw.close();
});
test('conflicting in-flight attempts without unique index stop without deleting evidence',()=>{
 const db=new SqliteD1(':memory:',false);install(db,names.filter(n=>n!=='operational_attempt_inflight_idx'));
 for(const id of ['one','two'])db.raw.prepare("INSERT INTO operational_recovery_attempts(attempt_id,execution_id,fingerprint,source_id,failure_class,contract_version,logical_job,target_date,scheduled_slot,operation,attempt_number,started_at,mode) VALUES(?,?,'f','s','STALE','v','j','2026-09-13','slot','operation',1,'2026-09-13','CONTROLLED')").run(id,id);
 const gate=checkResumeEvidence(migrationGate(false,objects(db),expected),sql=>db.raw.prepare(sql).all());
 assert.equal(gate.action,'UNSAFE');assert.equal(gate.reason,'conflicting_inflight_locks_require_review');assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM operational_recovery_attempts').get().n,2);db.raw.close();
});
test('empty/error/truncated Wrangler output cannot mean an empty pending database',()=>{
 for(const payload of ['', '{}','[]','[{"success":false,"results":[]}]','[{"success":true}]','[{"success":true,"results":[null]}]'])assert.throws(()=>readWranglerResults(payload,1));
 assert.deepEqual(readWranglerResults('[{"success":true,"results":[]}]',1),[[]]);
});
test('deployment retains protected ordering, postcheck gate, existing secrets and no new trigger',()=>{
 const workflow=readFileSync('.github/workflows/deploy-cloudflare.yml','utf8');
 const steps=['Require current main revision','Record Production D1 recovery bookmark','List pending Production D1 migrations','Inspect Production operational schema before migration','Apply Production D1 migrations','List Production migrations after application','Require registered migration and valid operational schema','run: npm run deploy:cloudflare','Record post-deployment operational evidence','Re-read persistent memory in a separate process'];
 for(let i=1;i<steps.length;i++)assert.ok(workflow.indexOf(steps[i])>workflow.indexOf(steps[i-1]),steps[i]);
 const apply=workflow.split('- name: Apply Production D1 migrations')[1].split('\n      - ')[0];
 assert.match(apply,/if: github\.event_name == 'workflow_run' \|\| inputs\.stage == 'production'/);
 assert.match(apply,/run: npm run db:migrate:production/);
 assert.doesNotMatch(workflow,/schedule:|cron:/);
 for(const name of ['Inspect Production operational schema before migration','Require registered migration and valid operational schema']) {
  const block=workflow.split(`- name: ${name}`)[1].split('\n      - ')[0];assert.doesNotMatch(block,/continue-on-error/);assert.match(block,/secrets\.CLOUDFLARE_API_TOKEN/);
 }
});
