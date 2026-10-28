import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {SqliteD1} from './helpers/operational-sqlite.mjs';
import {dutyFreeHistoryRange} from '../lib/duty-free-dated-history';
import {readDutyFreeDatedHistory} from '../lib/duty-free-dated-history-store';
import {dutyFreeSources} from '../lib/duty-free-exchange';
import type {ArchivedDutyFreeDay} from '../lib/duty-free-exchange-monthly';
const now=new Date('2026-10-28T07:00:00Z');
const archive=(date:string,rate=1339.5):ArchivedDutyFreeDay=>({observedDateKst:date,krwPerUsd:rate,provenance:[{capturedAt:date+'T03:00:00Z',sourceUrl:dutyFreeSources.shilla,archiveUrl:'https://web.archive.org/web/20261002030000id_/https://www.shilladfs.com/estore/kr/ko/',sha256:'a'.repeat(64),dateEvidence:'reviewed capture'}]});
function fixture(t:TestContext){
 const db=new SqliteD1(':memory:',false);t.after(()=>db.raw.close());
 db.raw.exec('CREATE TABLE duty_free_exchange_daily(vendor TEXT,service_date_kst TEXT,currency TEXT,krw_per_unit REAL,first_verified_at TEXT,source_url TEXT,scope TEXT,date_evidence TEXT,PRIMARY KEY(vendor,service_date_kst))');
 const insert=(date:string,rate:number,overrides:Record<string,string>={})=>db.raw.prepare('INSERT INTO duty_free_exchange_daily VALUES(?,?,?,?,?,?,?,?)').run(overrides.vendor??'shilla',date,overrides.currency??'USD',rate,overrides.verifiedAt??date+'T03:00:00Z',overrides.source??dutyFreeSources.shilla,overrides.scope??'INTERNET_SHOP',overrides.evidence??'CURRENT_WIDGET');
 return {db,insert,store:db as unknown as Pick<D1Database,'prepare'>};
}
test('requested calendar range stays exact and bounded through current KST date',()=>{
 assert.deepEqual(dutyFreeHistoryRange({},now),{start:'2026-09-01',end:'2026-10-28',today:'2026-10-28',expectedDays:58});
 for(const input of [{start:'2026-08-31'},{end:'2026-10-29'},{start:'2026-10-02',end:'2026-10-01'},{start:'2026-09-31'},{end:'invalid'}])assert.throws(()=>dutyFreeHistoryRange(input,now),/INVALID_RANGE/);
 assert.throws(()=>dutyFreeHistoryRange({},new Date('2027-10-28T07:00:00Z')),/RANGE_TOO_LONG/);
});
test('SQL keeps only same official vendor, currency, scope and date evidence; gaps remain missing',async t=>{
 const {db,insert,store}=fixture(t);insert('2026-10-01',1400.1234);insert('2026-10-03',1500.5678);
 insert('2026-10-02',200,{currency:'CNY'});insert('2026-10-04',200,{scope:'AIRPORT'});insert('2026-10-05',200,{source:'https://example.test/market'});insert('2026-10-06',200,{evidence:'INFERRED'});insert('2026-10-07',0);
 const before=db.raw.prepare('SELECT * FROM duty_free_exchange_daily ORDER BY service_date_kst').all();
 const result=await readDutyFreeDatedHistory(store,{start:'2026-10-01',end:'2026-10-08'},now,[]);
 assert.equal(result.status,'PARTIAL');assert.equal(result.expectedDays,8);assert.equal(result.observedDays,2);assert.equal(result.missingDates.length,6);
 assert.deepEqual(result.days.map(d=>[d.date,d.krwPerUsd]),[['2026-10-01',1400.1234],['2026-10-03',1500.5678]]);assert.equal(result.fullDayApplicabilityVerified,false);
 assert.deepEqual(db.raw.prepare('SELECT * FROM duty_free_exchange_daily ORDER BY service_date_kst').all(),before);assert.equal(db.calls.length,1);assert.match(db.calls[0],/LIMIT 185/);assert.doesNotMatch(db.calls[0],/INSERT|UPDATE|DELETE/);
});
test('reviewed archive fills only known dates, preserves provenance, and never overwrites stored days',async t=>{
 const {insert,store}=fixture(t);insert('2026-10-03',1500.5678);const historical=[archive('2026-10-03',1),archive('2026-10-02')],before=JSON.stringify(historical);
 const result=await readDutyFreeDatedHistory(store,{start:'2026-10-01',end:'2026-10-03'},now,historical);
 assert.deepEqual(result.days.map(d=>d.date),['2026-10-02','2026-10-03']);assert.equal(result.days[0].kind,'ARCHIVED_OBSERVATION');assert.deepEqual(result.days[0].archiveSources,historical[1].provenance);assert.equal(result.days[1].krwPerUsd,1500.5678);assert.equal(result.days[1].kind,'STORED_OBSERVATION');assert.deepEqual(result.missingDates,['2026-10-01']);assert.equal(JSON.stringify(historical),before);
});
test('empty and complete observation coverage are distinct; corrupt dates fail honestly',async t=>{
 const {insert,store}=fixture(t);assert.equal((await readDutyFreeDatedHistory(store,{start:'2026-10-01',end:'2026-10-02'},now,[])).status,'MISSING');
 insert('2026-10-01',1400);insert('2026-10-02',1401);assert.equal((await readDutyFreeDatedHistory(store,{start:'2026-10-01',end:'2026-10-02'},now,[])).status,'COMPLETE');
 insert('2026-10-03',1402,{verifiedAt:'2026-10-04T03:00:00Z'});await assert.rejects(()=>readDutyFreeDatedHistory(store,{start:'2026-10-01',end:'2026-10-03'},now,[]),/INVALID_OBSERVATION/);
});
test('D1 failure is not disguised as an archive-only success',async()=>{
 const db={prepare(){return {bind(){return {all:async()=>({success:false})};}};}} as unknown as Pick<D1Database,'prepare'>;
 await assert.rejects(()=>readDutyFreeDatedHistory(db,{},now,[archive('2026-09-10')]),/D1_READ_FAILED/);
});
test('existing explicit next-day application policy is preserved without moving dates',async t=>{
 const {store,insert}=fixture(t);insert('2026-10-01',1400,{verifiedAt:'2026-09-30T03:00:00Z',evidence:'EXPLICIT_SOURCE_DATE'});
 const result=await readDutyFreeDatedHistory(store,{start:'2026-10-01',end:'2026-10-01'},now,[]);
 assert.equal(result.days[0].date,'2026-10-01');assert.equal(result.days[0].verifiedAt,'2026-09-30T03:00:00Z');assert.equal(result.days[0].dateEvidence,'EXPLICIT_SOURCE_DATE');
 insert('2026-10-02',1401,{verifiedAt:'2026-09-30T03:00:00Z',evidence:'EXPLICIT_SOURCE_DATE'});await assert.rejects(()=>readDutyFreeDatedHistory(store,{start:'2026-10-02',end:'2026-10-02'},now,[]),/INVALID_OBSERVATION/);
});
