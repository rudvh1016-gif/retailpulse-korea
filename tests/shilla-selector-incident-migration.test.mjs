/** Offline proof only: fixture SQLite, never a provider, D1 client or credentials. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';

const sql=readFileSync(new URL('../drizzle/0030_shilla_selector_incident_20261021.sql',import.meta.url),'utf8');
assert.equal(createHash('sha256').update(sql).digest('hex'),'4029d85bf084f563a12b2c75cc67d44c666498e944c60a6d997be779087eb2e3');
assert.equal((sql.match(/'now'/g)??[]).length,2);
// Inject a deterministic clock only into this offline fixture; production retains DB now.
const fixtureSql=sql.replaceAll("'now'",':fixture_clock');
const attempt='2026-10-21T02:10:25.714Z',due='2026-10-22T02:10:27.047Z',target='2026-10-21T03:21:10.000Z';
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 for(const file of ['0022_duty_free_exchange.sql','0024_duty_free_exchange_daily.sql'])db.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
 db.prepare("INSERT INTO duty_free_exchange_attempt VALUES ('shilla',?,'BLOCKED','SELECTOR_UNVERIFIED',?,?,NULL,'')").run(attempt,'2026-10-20T00:53:15.429Z',due);
 db.prepare("INSERT INTO duty_free_exchange_attempt VALUES ('shinsegae',?,'BLOCKED','SELECTOR_UNVERIFIED',?,?,NULL,'')").run(attempt,null,due);
 const rate=(day,current=true)=>{
  const row=['shilla',day,'USD',1200.25,'2026-10-20T00:53:15.429Z','https://www.shilladfs.com/estore/kr/ko/','INTERNET_SHOP','synthetic_hash'];
  if(current)db.prepare('INSERT OR REPLACE INTO duty_free_exchange_current VALUES (?,?,?,?,?,?,?,?)').run(...row);
  db.prepare('INSERT OR REPLACE INTO duty_free_exchange_daily VALUES (?,?,?,?,?,?,?,?,?)').run(...row.slice(0,-1),'CURRENT_WIDGET',row.at(-1));
 };
 rate('2026-10-20');
 const snapshot=()=>Object.fromEntries(['duty_free_exchange_attempt','duty_free_exchange_current','duty_free_exchange_daily'].map(name=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY 1,2`).all().map(row=>({...row}))]));
 const apply=(clock='2026-10-21T03:00:00.000Z')=>Number(db.prepare(fixtureSql).run({fixture_clock:clock}).changes);
 const reject=clock=>{const before=snapshot();assert.equal(apply(clock),0);assert.deepEqual(snapshot(),before);};
 return {db,rate,snapshot,apply,reject};
}

test('incident CAS changes only next_due_at once; canonical and retired vendor rows stay identical',t=>{
 const f=fixture(t),expected=f.snapshot();expected.duty_free_exchange_attempt[0].next_due_at=target;
 assert.equal(f.apply(),1);assert.deepEqual(f.snapshot(),expected);assert.equal(f.apply(),0);assert.deepEqual(f.snapshot(),expected);
});
test('incident CAS preserves any raw last_success_at without guessing it from public verification',t=>{
 const f=fixture(t);
 for(const value of [null,'','2026-10-20T00:53:15.429Z','2026-10-21T01:00:00.000Z','opaque_invalid_existing_value']){
  f.db.prepare("UPDATE duty_free_exchange_attempt SET last_success_at=?,next_due_at=? WHERE vendor='shilla'").run(value,due);
  const expected=f.snapshot();expected.duty_free_exchange_attempt[0].next_due_at=target;
  assert.equal(f.apply(),1);assert.deepEqual(f.snapshot(),expected);
 }
});
test('incident CAS rejects security, throttling, unknown and null errors',t=>{
 const f=fixture(t);
 for(const code of ['HTTP_403','HTTP_406','HTTP_429','SOURCE_ACCESS_CHALLENGE','NETWORK_OR_STORAGE_ERROR','SOURCE_DATE_ROLLOVER','UNKNOWN',null]){
  f.db.prepare("UPDATE duty_free_exchange_attempt SET error_code=? WHERE vendor='shilla'").run(code);f.reject();
 }
});
test('incident CAS rejects every nonblocked state',t=>{
 const f=fixture(t);
 for(const status of ['RUNNING','SUCCESS','ERROR']){f.db.prepare("UPDATE duty_free_exchange_attempt SET status=? WHERE vendor='shilla'").run(status);f.reject();}
});
test('incident CAS rejects a changed source attempt',t=>{const f=fixture(t);f.db.exec("UPDATE duty_free_exchange_attempt SET attempt_at='2026-10-21T03:00:00.000Z' WHERE vendor='shilla'");f.reject();});
test('incident CAS rejects a changed original due',t=>{const f=fixture(t);f.db.exec("UPDATE duty_free_exchange_attempt SET next_due_at='2026-10-21T04:00:00.000Z' WHERE vendor='shilla'");f.reject();});
test('incident CAS rejects an active lease',t=>{const f=fixture(t);f.db.exec("UPDATE duty_free_exchange_attempt SET lease_id='test',lease_until='2026-10-21T03:02:00.000Z' WHERE vendor='shilla'");f.reject();});
test('incident CAS also rejects an expired residual lease',t=>{const f=fixture(t);f.db.exec("UPDATE duty_free_exchange_attempt SET lease_id='test',lease_until='2026-10-21T02:02:00.000Z' WHERE vendor='shilla'");f.reject();});
test('incident CAS requires empty lease_until even if lease_id is null',t=>{const f=fixture(t);f.db.exec("UPDATE duty_free_exchange_attempt SET lease_until='2026-10-21T02:02:00.000Z' WHERE vendor='shilla'");f.reject();});
test('incident CAS rejects an existing current-day daily row',t=>{const f=fixture(t);f.rate('2026-10-21',false);f.reject();});
test('incident CAS rejects an existing current-day current row',t=>{const f=fixture(t);f.db.exec("UPDATE duty_free_exchange_current SET service_date_kst='2026-10-21' WHERE vendor='shilla'");f.reject();});
test('incident CAS rejects the preceding KST day',t=>fixture(t).reject('2026-10-20T14:59:59.999Z'));
test('incident CAS expires exactly at the next KST midnight',t=>fixture(t).reject('2026-10-21T15:00:00.000Z'));
test('incident CAS cannot release a day after expiry',t=>fixture(t).reject('2026-10-22T04:00:00.000Z'));
test('incident CAS can match immediately before expiry',t=>assert.equal(fixture(t).apply('2026-10-21T14:59:59.999Z'),1));
test('incident target is at least an hour after the diagnostic rounded up to the next second',()=>{
 assert.equal(Date.parse(target)-Date.parse('2026-10-21T02:21:10.000Z'),3_600_000);
 assert.ok(Date.parse(target)-Date.parse(attempt)>3_600_000);
});
test('incident CAS cannot make the collector eligible before its exact target',t=>{
 const f=fixture(t);assert.equal(f.apply(),1);
 const row=f.db.prepare("SELECT next_due_at>? AS protected FROM duty_free_exchange_attempt WHERE vendor='shilla'").get('2026-10-21T03:21:09.999Z');assert.equal(row.protected,1);
});
test('incident CAS cannot release a subsequent failed incident',t=>{
 const f=fixture(t);assert.equal(f.apply(),1);
 f.db.exec("UPDATE duty_free_exchange_attempt SET attempt_at='2026-10-21T03:22:00.000Z',next_due_at='2026-10-22T03:22:01.000Z' WHERE vendor='shilla'");f.reject();
});
test('incident migration requires a separate latest-request accounting gate, not a dynamic retry bypass',()=>{
 assert.match(sql,/verify no later source request/);
 assert.match(sql,/no older-code FX job remains queued\/running/);
 assert.equal((sql.match(/^UPDATE /gm)??[]).length,1);assert.equal((sql.match(/^SET /gm)??[]).length,1);
 assert.match(sql,/^SET next_due_at='2026-10-21T03:21:10\.000Z'$/m);
});
