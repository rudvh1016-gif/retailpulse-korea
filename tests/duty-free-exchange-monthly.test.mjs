import {readDutyFreeMonthly,DUTY_FREE_MONTHLY_SQL} from '../lib/duty-free-exchange-monthly-store.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {dutyFreeMonths,validDutyFreeMonthly,dutyFreeMonthlyCacheControl} from '../lib/duty-free-exchange-monthly.ts';
import {dutyFreeSources} from '../lib/duty-free-exchange.ts';
import {shouldRouteToSummaryCache} from '../worker/summary-cache-routing.ts';
import {canonicalSummaryUrl} from '../worker/summary-cache-key.ts';
const now=new Date('2026-10-21T05:00:00Z');
function fixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec(readFileSync(new URL('../drizzle/0022_duty_free_exchange.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../drizzle/0024_duty_free_exchange_daily.sql',import.meta.url),'utf8'));
 const db={prepare(text){return {bind(...args){return {async all(){return {success:true,results:sql.prepare(text).all(...args)};}};}};}};
 const insert=(date,rate,vendor='shilla',url=dutyFreeSources.shilla)=>sql.prepare(`INSERT INTO duty_free_exchange_daily VALUES (?,?,'USD',?,'2026-10-21T00:00:00Z',?,'INTERNET_SHOP','CURRENT_WIDGET','hash')`).run(vendor,date,rate,url);
 return {sql,db,insert};
}
test('six KST calendar months include current partial month across year and UTC boundary',()=>{
 assert.deepEqual(dutyFreeMonths(now),['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']);
 assert.deepEqual(dutyFreeMonths(new Date('2025-12-31T15:00:00Z')),['2025-08','2025-09','2025-10','2025-11','2025-12','2026-01']);
});
test('observed-day averages preserve six slots and exclude future, outside range, other source/vendor',async t=>{
 const {db,insert}=fixture(t);
 insert('2026-10-01',1300);insert('2026-10-21',1340);insert('2026-10-22',9999);
 insert('2026-05-01',1200);insert('2026-04-30',9999);
 insert('2026-06-01',8888,'shinsegae');insert('2026-07-01',7777,'shilla','https://example.com');
 const result=await readDutyFreeMonthly(db,now,[]);
 assert.equal(validDutyFreeMonthly(result),true);assert.equal(result.months.length,6);
 assert.deepEqual(result.months[5],{month:'2026-10',averageKrwPerUsd:1320,observedDays:2,calendarDays:31,inProgress:true});
 assert.deepEqual(result.months[1],{month:'2026-06',averageKrwPerUsd:null,observedDays:0,calendarDays:30,inProgress:false});
 assert.equal(result.months[0].averageKrwPerUsd,1200);assert.equal(result.months[2].averageKrwPerUsd,null);
 assert.equal(validDutyFreeMonthly({...result,months:result.months.map(row=>({...row,averageKrwPerUsd:0}))}),false);
});
test('empty storage is six genuine gaps, storage failure is not empty history',async t=>{
 const {db}=fixture(t);const result=await readDutyFreeMonthly(db,now,[]);
 assert.ok(result.months.every(row=>row.averageKrwPerUsd===null&&row.observedDays===0));
 await assert.rejects(()=>readDutyFreeMonthly({prepare(){return {bind(){return {all:async()=>({success:false})};}};}},now),/D1_READ_FAILED/);
});
test('monthly aggregate uses PK vendor/date range not full scan and no writes',t=>{
 const {sql}=fixture(t);const plan=sql.prepare(`EXPLAIN QUERY PLAN ${DUTY_FREE_MONTHLY_SQL}`).all('2026-05-01','2026-10-21',dutyFreeSources.shilla);
 assert.ok(plan.some(row=>/SEARCH duty_free_exchange_daily USING INDEX .*vendor=\? AND service_date_kst>\? AND service_date_kst<\?/.test(row.detail)));
 assert.ok(!plan.some(row=>/SCAN duty_free_exchange_daily/.test(row.detail)));
});
test('monthly cache bounded to midnight, normalized path and safe methods only',()=>{
 assert.equal(dutyFreeMonthlyCacheControl(now.getTime()),'public, max-age=300, s-maxage=3600');
 assert.equal(dutyFreeMonthlyCacheControl(Date.parse('2026-10-21T14:59:59.500Z')),'no-store');
 const path='/api/live/duty-free-exchange/monthly';
 assert.equal(shouldRouteToSummaryCache('GET',path),true);assert.equal(shouldRouteToSummaryCache('POST',path),false);
 assert.equal(canonicalSummaryUrl(new URL(`https://example.com${path}?date=2020-01-01&x=3`)),`https://example.com${path}`);
});
test('chart preserves current FX behavior and uses thin gap-aware lines, keyboard/month readouts',()=>{
 const ui=readFileSync(new URL('../app/duty-free-monthly-trend.tsx',import.meta.url),'utf8');
 assert.match(ui,/환율 6개월 · 확보한 날짜 평균/);assert.match(ui,/strokeWidth="1.25"/);assert.match(ui,/previous\?\.averageKrwPerUsd!==null/);
 for(const token of ['observedDays','calendarDays','onPointerEnter','onFocus','onClick','ArrowRight','ArrowLeft','aria-expanded','aria-controls','aria-live'])assert.ok(ui.includes(token),token);
 assert.doesNotMatch(ui,/setInterval|localStorage|gsap/);
});

test('malformed response dates, month lengths and future observed days fail closed without throwing',async t=>{
 const {db}=fixture(t),result=await readDutyFreeMonthly(db,now,[]);
 for(const asOfDateKst of ['2026-99-99','2026-02-30','not-a-date',null,{}]){
  assert.doesNotThrow(()=>validDutyFreeMonthly({...result,asOfDateKst}));
  assert.equal(validDutyFreeMonthly({...result,asOfDateKst}),false);
 }
 assert.equal(validDutyFreeMonthly({...result,generatedAt:'2026-10-20T05:00:00Z'}),false);
 assert.equal(validDutyFreeMonthly({...result,generatedAt:'invalid'}),false);
 assert.equal(validDutyFreeMonthly({...result,months:result.months.map(row=>({...row,calendarDays:28}))}),false);
 assert.equal(validDutyFreeMonthly({...result,months:result.months.map((row,i)=>i===5?{...row,observedDays:22,averageKrwPerUsd:1300}:row)}),false);
 const february=await readDutyFreeMonthly(db,new Date('2028-02-29T05:00:00Z'));
 assert.equal(february.months[5].calendarDays,29);assert.equal(validDutyFreeMonthly(february),true);
});

test('reviewed archive fills only observed dates and recomputes sparse means without D1 writes',async t=>{
 const {db,sql}=fixture(t),result=await readDutyFreeMonthly(db,now);
 assert.equal(validDutyFreeMonthly(result),true);
 assert.deepEqual(result.months.map(row=>row.observedDays),[8,2,5,5,2,2]);
 // Independently supplied research means; implementation always recomputes from dated records.
 assert.deepEqual(result.months.map(row=>Number(row.averageKrwPerUsd.toFixed(2))),[1474.35,1523.15,1506.86,1416.2,1339.5,1337.5]);
 assert.equal(result.archive.kind,'ARCHIVED_OBSERVATION');
 assert.equal(result.archive.fullDayApplicabilityVerified,false);
 assert.equal(result.archive.used.length,24);
 assert.ok(result.archive.used.every(row=>row.provenance.every(p=>p.capturedAt!==result.archive.verifiedAt)));
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM duty_free_exchange_daily').get().n,0);
 for(const row of result.months) {
  const daily=result.archive.used.filter(day=>day.observedDateKst.startsWith(row.month));
  assert.equal(row.averageKrwPerUsd,daily.reduce((sum,day)=>sum+day.krwPerUsd,0)/daily.length);
  assert.ok(row.observedDays<row.calendarDays);
 }
});
test('live date wins archive conflicts, replay is idempotent, future/outside archive excluded',async t=>{
 const {db,insert}=fixture(t);insert('2026-10-14',1400);
 const result=await readDutyFreeMonthly(db,now);
 assert.equal(result.months[5].observedDays,2);
 assert.deepEqual(result.archive.skippedLiveDates,['2026-10-14']);
 assert.ok(!result.archive.used.some(row=>row.observedDateKst==='2026-10-14'));
 const october=result.archive.used.find(row=>row.observedDateKst.startsWith('2026-10'));
 assert.equal(result.months[5].averageKrwPerUsd,(1400+october.krwPerUsd)/2);
 assert.deepEqual(await readDutyFreeMonthly(db,now),result);
 const early=await readDutyFreeMonthly(db,new Date('2026-10-10T05:00:00Z'));
 assert.equal(early.months[5].observedDays,0);
 const later=await readDutyFreeMonthly(db,new Date('2027-05-01T05:00:00Z'));
 assert.equal(later.archive.used.length,0);
 assert.ok(later.months.every(row=>row.observedDays===0&&row.averageKrwPerUsd===null));
});
test('archive cannot mask storage failure or validate unsafe provenance',async t=>{
 await assert.rejects(()=>readDutyFreeMonthly({prepare(){return {bind(){return {all:async()=>({success:false})};}};}},now),/D1_READ_FAILED/);
 const {db}=fixture(t),result=await readDutyFreeMonthly(db,now);
 const invalid=structuredClone(result);invalid.archive.used[0].provenance[0].archiveUrl='javascript:alert(1)';
 assert.equal(validDutyFreeMonthly(invalid),false);
 const mismatch=structuredClone(result);mismatch.archive.used[0].provenance[0].capturedAt='2026-01-01T00:00:00Z';
 assert.equal(validDutyFreeMonthly(mismatch),false);
 const duplicate=structuredClone(result);duplicate.archive.skippedLiveDates.push(duplicate.archive.used[0].observedDateKst);
 assert.equal(validDutyFreeMonthly(duplicate),false);
});
