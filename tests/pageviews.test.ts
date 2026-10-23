import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { acceptsPageviewRequest, validPageviewEvent, readPageviewBody, snapshotFromTotals, PRUNE_RECEIPTS_SQL, READ_TOTALS_SQL, INSERT_RECEIPT_SQL, ADMIT_PAGEVIEW_SQL, RECEIPT_TTL_MS, recordPageview } from '../lib/pageviews-server';
import { pageviewPath, validPageviewsSnapshot } from '../lib/pageviews-contract';
const migration = readFileSync(new URL('../drizzle/0034_first_party_pageviews.sql', import.meta.url), 'utf8');
const at = Date.parse('2026-10-23T12:00:00Z');
function setup(limit = 100) { const db = new DatabaseSync(':memory:'); db.exec(migration); if (limit) db.prepare('UPDATE pageview_totals SET enabled=1, admission_limit=1000, daily_limit=? WHERE id=1').run(limit); return db; }
function insert(db: DatabaseSync, now = at, id = `${now}.${randomUUID()}`) { db.prepare(INSERT_RECEIPT_SQL).run(id, now); return id; }
function totals(db: DatabaseSync): Parameters<typeof snapshotFromTotals>[0] {
  const row = db.prepare(READ_TOTALS_SQL).get();
  if (!row) return null;
  const { enabled, incomplete, partial_day, day, today, total, started_at } = row;
  assert.ok(typeof enabled === 'number' && typeof incomplete === 'number');
  assert.ok(typeof partial_day === 'string' && typeof day === 'string');
  assert.ok(typeof today === 'number' && typeof total === 'number');
  assert.ok(started_at === null || typeof started_at === 'number');
  return { enabled, incomplete, partial_day, day, today, total, started_at };
}
function request(headers: Record<string,string> = {}, body = '{}') { return new Request('https://koretaildata.com/api/pageviews', { method:'POST', headers:{ origin:'https://koretaildata.com','sec-fetch-site':'same-origin','content-type':'application/json','x-koretail-pageview':'1','user-agent':'Mozilla/5.0 Chrome/130',...headers },body }); }
test('migration disabled with no seeded views or fabricated start', () => { const db=setup(0); insert(db); assert.equal(totals(db)?.total,0); assert.equal(totals(db)?.started_at,null); assert.deepEqual(snapshotFromTotals(totals(db),at),{available:false,reason:'disabled'}); db.close(); });
test('actual first event starts counter; duplicate exactly once', () => { const db=setup();const id=insert(db); insert(db,at,id); assert.deepEqual(snapshotFromTotals(totals(db),at),{available:true,today:1,total:1,totalComplete:true,day:'2026-10-23',startedAt:'2026-10-23T12:00:00.000Z'}); assert.equal(db.prepare('SELECT count(*) n FROM pageview_receipts').get()?.n,1); db.close(); });
test('interleaved independent IDs and retries preserve atomic sum', () => { const db=setup(1000);const ids=Array.from({length:250},()=>`${at}.${randomUUID()}`);for(const id of ids)insert(db,at,id);for(const id of [...ids].reverse())insert(db,at,id);assert.equal(totals(db)?.total,250);assert.equal(totals(db)?.today,250);db.close(); });
test('KST midnight resets today only; UTC budget resets separately', () => { const db=setup(2);insert(db,Date.parse('2026-10-23T14:59:59Z'));insert(db,Date.parse('2026-10-23T15:00:00Z'));assert.equal(totals(db)?.today,1);assert.equal(totals(db)?.total,2);assert.equal(db.prepare('SELECT budget_count n FROM pageview_totals').get()?.n,2);insert(db,Date.parse('2026-10-24T00:00:00Z'));assert.equal(totals(db)?.today,2);assert.equal(totals(db)?.total,3);assert.equal(db.prepare('SELECT budget_count n FROM pageview_totals').get()?.n,1);db.close(); });
test('budget exhaustion durable gap; edge duplicates not false gap', () => {const db=setup(1);const id=insert(db);insert(db,at,id);assert.equal(totals(db)?.incomplete,0);insert(db);assert.equal(totals(db)?.incomplete,1);assert.equal(totals(db)?.total,1);insert(db,at+86_400_000);assert.equal(totals(db)?.total,2);assert.deepEqual(snapshotFromTotals(totals(db),at+86_400_000),{available:true,today:1,total:null,totalComplete:false,day:'2026-10-24',startedAt:'2026-10-23T12:00:00.000Z'});db.close();});
test('day without traffic shows zero today, not yesterday',()=>{const db=setup();insert(db);const v=snapshotFromTotals(totals(db),at+86_400_000);assert.equal(v.available&&v.today,0);assert.equal(v.available&&v.total,1);db.close();});
test('expiry cleanup indexed and bounded to eight; recent receipts survive',()=>{const db=setup();for(let i=0;i<12;i++)insert(db,at-RECEIPT_TTL_MS-1);const recent=insert(db);db.prepare(PRUNE_RECEIPTS_SQL).run(at-RECEIPT_TTL_MS);assert.equal(db.prepare('SELECT count(*) n FROM pageview_receipts').get()?.n,5);assert.ok(db.prepare('SELECT event_id FROM pageview_receipts WHERE event_id=?').get(recent));assert.match(JSON.stringify(db.prepare('EXPLAIN QUERY PLAN '+PRUNE_RECEIPTS_SQL).all(at-RECEIPT_TTL_MS)),/pageview_receipts_received_idx/);assert.match(JSON.stringify(db.prepare('EXPLAIN QUERY PLAN '+READ_TOTALS_SQL).all()),/INTEGER PRIMARY KEY/);db.close();});
test('production origin JSON only; basic bot, GPC, DNT rejection', () => {
  assert.equal(acceptsPageviewRequest(request()), true);
  const rejectedHeaders: Record<string, string>[] = [
    { origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' },
    { 'content-type': 'text/plain' }, { 'x-koretail-pageview': '0' },
    { 'user-agent': 'Googlebot' }, { 'user-agent': 'HeadlessChrome' },
    { dnt: '1' }, { 'sec-gpc': '1' }, { 'content-length': '513' },
  ];
  for (const headers of rejectedHeaders) assert.equal(acceptsPageviewRequest(request(headers)), false);
});
test('fresh random IDs and allowlisted path only; no arbitrary URLs or extras',()=>{const b={id:`${at}.${randomUUID()}`,path:'/ko/airport'};assert.equal(validPageviewEvent(b,at),true);assert.equal(validPageviewEvent(b,at+120_001),false);assert.equal(validPageviewEvent(b,at-120_001),false);for(const c of [{...b,path:'/ko/airport?secret=1'},{...b,path:'/admin'},{...b,ip:'1.2.3.4'},{...b,id:'persistent-user'}])assert.equal(validPageviewEvent(c,at),false);assert.equal(pageviewPath('/ko/airport/'),'/ko/airport');assert.equal(pageviewPath('/ko/airport-focus-preview'),null);});
test('streaming body size enforced without Content-Length',async()=>{assert.deepEqual(await readPageviewBody(request({},'{"a":1}')),{a:1});await assert.rejects(readPageviewBody(request({},'x'.repeat(513))),/body_too_large/);});
test('D1 failure unavailable, never fabricated zero',async()=>{const statement={bind(){return this;},async first(){return {blocked:0};}};const db={prepare:()=>statement,batch:async()=>[{success:false}]};await assert.rejects(recordPageview(db as unknown as D1Database,`${at}.${randomUUID()}`,at),/unavailable/);assert.equal(validPageviewsSnapshot({available:true,today:4,total:3,day:'2026-10-23',startedAt:new Date(at).toISOString()}),false);});

test('independent concurrent SQLite writers cannot lose or duplicate counts', async () => {
 const dir=mkdtempSync(join(tmpdir(),'koretail-pageviews-')); const path=join(dir,'counter.sqlite');
 const db=new DatabaseSync(path);db.exec(migration);db.exec('PRAGMA journal_mode=WAL; UPDATE pageview_totals SET enabled=1,daily_limit=1000');
 const workerCode=`const {workerData,parentPort}=require('node:worker_threads'); const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(workerData.path); db.exec('PRAGMA busy_timeout=5000'); const stmt=db.prepare('INSERT OR IGNORE INTO pageview_receipts(event_id,received_at) VALUES (?,?)'); for(let i=0;i<50;i++){stmt.run('shared-'+i,workerData.at);stmt.run(workerData.n+'-'+i,workerData.at);} db.close();parentPort.postMessage('done');`;
 try {
  await Promise.all(Array.from({length:4},(_,n)=>new Promise<void>((resolve,reject)=>{const worker=new Worker(workerCode,{eval:true,workerData:{path,n,at}});worker.on('error',reject);worker.on('exit',code=>code===0?resolve():reject(new Error('worker exit '+code)));})));
  assert.equal(totals(db)?.total,250);
 } finally {db.close();rmSync(dir,{recursive:true,force:true});}
});

test('late prior-KST-day request cannot roll today backward at midnight', () => {
 const db=setup();insert(db,Date.parse('2026-10-24T15:00:00.001Z'));
 insert(db,Date.parse('2026-10-24T14:59:59.999Z'));insert(db,Date.parse('2026-10-24T15:00:00.002Z'));
 assert.equal(totals(db)?.day,'2026-10-25');assert.equal(totals(db)?.today,2);assert.equal(totals(db)?.total,3);db.close();
});
test('late prior-UTC-day request cannot reset or bypass current budget', () => {
 const db=setup(2);insert(db,Date.parse('2026-10-24T00:00:00.001Z'));
 insert(db,Date.parse('2026-10-23T23:59:59.999Z'));
 assert.equal(db.prepare('SELECT budget_day, budget_count FROM pageview_totals').get()?.budget_day,'2026-10-24');
 assert.equal(db.prepare('SELECT budget_count n FROM pageview_totals').get()?.n,2);
 insert(db,Date.parse('2026-10-24T00:00:00.002Z'));assert.equal(totals(db)?.incomplete,1);assert.equal(totals(db)?.total,2);db.close();
});
test('deployment gate is false and precedes every getDb call', () => {
 const gate=readFileSync(new URL('../lib/pageviews-deployment.ts',import.meta.url),'utf8');
 const route=readFileSync(new URL('../app/api/pageviews/route.ts',import.meta.url),'utf8');
 assert.match(gate,/PAGEVIEWS_DEPLOYMENT_ENABLED = false/);
 for(const name of ['GET','POST']){const body=route.split('export async function '+name+'(request: Request) {')[1];assert.ok(body.indexOf('if (!PAGEVIEWS_DEPLOYMENT_ENABLED)')<body.indexOf('await getDb()'));}
});

test('one-event UTC cap cannot be bypassed by alternating request days',()=>{
 const db=setup(1);insert(db,Date.parse('2026-10-24T00:00:00.001Z'));
 insert(db,Date.parse('2026-10-23T23:59:59.999Z'));insert(db,Date.parse('2026-10-24T00:00:00.002Z'));
 assert.equal(totals(db)?.total,1);assert.equal(totals(db)?.incomplete,1);db.close();
});

// Node 22 node:sqlite binds numbered ?NNN parameters by their full names.
// D1's production bind(utcDay, kstDay) remains positional and is tested separately.
function admit(db: DatabaseSync, day: string) { return db.prepare(ADMIT_PAGEVIEW_SQL).get({ '?1': day, '?2': day }); }
test('global request admission counts duplicates and persists pause after cap',()=>{
 const db=setup();db.exec('UPDATE pageview_totals SET admission_limit=2');
 assert.equal(admit(db,'2026-10-23')?.blocked,0);const id=insert(db);
 assert.equal(admit(db,'2026-10-23')?.blocked,0);insert(db,at,id);
 assert.equal(totals(db)?.total,1);
 assert.equal(admit(db,'2026-10-23')?.blocked,1);
 assert.equal(admit(db,'2026-10-24')?.blocked,0);
 assert.equal(totals(db)?.incomplete,1);
 assert.equal(db.prepare('SELECT admission_count n FROM pageview_totals').get()?.n,1);
 assert.equal(totals(db)?.total,1);db.close();
});
test('admission UTC day cannot roll backward or reset exhausted budget',()=>{
 const db=setup();db.exec('UPDATE pageview_totals SET admission_limit=1');
 assert.equal(admit(db,'2026-10-24')?.blocked,0);
 assert.equal(admit(db,'2026-10-23')?.blocked,1);
 assert.equal(db.prepare('SELECT admission_day d FROM pageview_totals').get()?.d,'2026-10-24');
 assert.equal(admit(db,'2026-10-24')?.blocked,1);assert.equal(admit(db,'2026-10-24'),undefined);db.close();
});
test('normal admission day advances when no previous gap occurred',()=>{
 const db=setup();db.exec('UPDATE pageview_totals SET admission_limit=1');
 assert.equal(admit(db,'2026-10-23')?.blocked,0);
 assert.equal(admit(db,'2026-10-24')?.blocked,0);
 assert.equal(db.prepare('SELECT admission_count n FROM pageview_totals').get()?.n,1);db.close();
});
test('denied admission never executes cleanup or receipt batch',async()=>{
 let batches=0;const statement={bind(){return this;},async first(){return null;}};
 const db={prepare:()=>statement,batch:async()=>{batches++;return [];}};
 assert.deepEqual(await recordPageview(db as unknown as D1Database,'unused',at),{available:false,reason:'unavailable'});assert.equal(batches,0);
});

test('parallel singleton admissions admit exactly limit and then preserve gap', async()=>{
 const dir=mkdtempSync(join(tmpdir(),'koretail-pageview-admissions-'));const path=join(dir,'counter.sqlite');
 const db=new DatabaseSync(path);db.exec(migration);db.exec('PRAGMA journal_mode=WAL; UPDATE pageview_totals SET enabled=1,admission_limit=50,daily_limit=1000');
 const code=`const {workerData,parentPort}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(workerData.path);db.exec('PRAGMA busy_timeout=5000');const q=db.prepare(workerData.sql);let accepted=0;for(let i=0;i<30;i++){const row=q.get({'?1':'2026-10-23','?2':'2026-10-23'});if(row&&row.blocked===0)accepted++;}db.close();parentPort.postMessage(accepted);`;
 try{
  const counts=await Promise.all(Array.from({length:4},()=>new Promise<number>((resolve,reject)=>{const w=new Worker(code,{eval:true,workerData:{path,sql:ADMIT_PAGEVIEW_SQL}});w.on('message',resolve);w.on('error',reject);w.on('exit',c=>{if(c!==0)reject(new Error('worker exit '+c));});})));
  assert.equal(counts.reduce((a,b)=>a+b,0),50);assert.equal(totals(db)?.incomplete,1);assert.equal(db.prepare('SELECT admission_count n FROM pageview_totals').get()?.n,51);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('gap raced after admission prevents pending receipt from claiming complete count',()=>{
 const db=setup();db.exec('UPDATE pageview_totals SET admission_limit=1');
 assert.equal(admit(db,'2026-10-23')?.blocked,0);assert.equal(admit(db,'2026-10-23')?.blocked,1);
 insert(db);assert.equal(totals(db)?.total,0);assert.equal(totals(db)?.incomplete,1);db.close();
});

test('today recovers only on a fresh KST day with renewed UTC capacity; lifetime remains unknown',()=>{
 const db=setup();db.exec('UPDATE pageview_totals SET admission_limit=1');
 const reserve=(utc:string,kst:string)=>db.prepare(ADMIT_PAGEVIEW_SQL).get({ '?1': utc, '?2': kst });
 assert.equal(reserve('2026-10-23','2026-10-23')?.blocked,0);insert(db,at);
 assert.equal(reserve('2026-10-23','2026-10-23')?.blocked,1);
 assert.deepEqual(snapshotFromTotals(totals(db),at),{available:false,reason:'incomplete'});
 assert.equal(reserve('2026-10-23','2026-10-24')?.blocked,1); // UTC budget not fresh at KST midnight
 assert.equal(reserve('2026-10-24','2026-10-24'),undefined); // missed early today; no partial-day resume
 const fresh=Date.parse('2026-10-24T15:00:00Z');
 assert.equal(reserve('2026-10-24','2026-10-25')?.blocked,0);insert(db,fresh);
 assert.deepEqual(snapshotFromTotals(totals(db),fresh),{available:true,today:1,total:null,totalComplete:false,day:'2026-10-25',startedAt:'2026-10-23T12:00:00.000Z'});
 assert.equal(totals(db)?.total,2);assert.equal(totals(db)?.incomplete,1);db.close();
});
test('recovered contract accepts null cumulative but rejects numeric partial or fake complete',()=>{
 const base={available:true,today:0,day:'2026-10-25',startedAt:'2026-10-23T12:00:00Z'};
 assert.equal(validPageviewsSnapshot({...base,total:null,totalComplete:false}),true);
 assert.equal(validPageviewsSnapshot({...base,total:8,totalComplete:false}),false);
 assert.equal(validPageviewsSnapshot({...base,total:null,totalComplete:true}),false);
 assert.equal(validPageviewsSnapshot({...base,total:8}),false);
});

test('SQLite test adapter maps a missing totals row to unavailable, not an unsafe cast', () => {
  const db = setup(0);
  try {
    db.exec('DELETE FROM pageview_totals');
    assert.equal(totals(db), null);
    assert.deepEqual(snapshotFromTotals(totals(db), at), { available: false, reason: 'unavailable' });
  } finally { db.close(); }
});
