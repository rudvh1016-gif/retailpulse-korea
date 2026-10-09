import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteD1} from './helpers/operational-sqlite.mjs';
import {refreshCommercialMonths} from '../lib/commercial-monthly-store.ts';
test('one daily indexed rebuild; same-day invocation reads no raw rows or provider',async()=>{
 const db=new SqliteD1();for(const month of ['09','10'])db.raw.prepare('INSERT INTO seoul_context VALUES(?,?,?,?,?)').run('myeongdong',`2026-${month}-01T10:10:00+09:00`,'2026-10-02T00:00:00Z',JSON.stringify({commercialAt:`2026-${month}-01T10:10:00+09:00`,categories:[{category:'한식',group:'음식',payments:month==='09'?10:20,amountMin:100,amountMax:200}]}),month);
 const first=await refreshCommercialMonths(db,new Date('2026-10-02T01:00:00Z'));assert.equal(first.providerRequests,0);assert.equal(first.readRows,2);
 const current=JSON.parse(db.raw.prepare("SELECT payload FROM seoul_commercial_months WHERE area='myeongdong' AND month='2026-10'").get().payload);
 assert.equal(current.categories[0].comparison.changePercent,100);
 const second=await refreshCommercialMonths(db,new Date('2026-10-02T02:00:00Z'));assert.equal(second.readRows,0);assert.equal(second.changedRows,0);
 const plan=db.raw.prepare('EXPLAIN QUERY PLAN SELECT observed_at,payload FROM seoul_context WHERE area=? AND observed_at>=? AND observed_at<? ORDER BY observed_at LIMIT 12001').all('myeongdong','2026-09-01','2026-10-02');assert.ok(plan.some(row=>row.detail.includes('SEARCH seoul_context USING INDEX')));
 db.raw.close();
});
test('later month compacts old bins without deleting archived result or forecast data',async()=>{
 const db=new SqliteD1();db.raw.prepare('INSERT INTO seoul_context VALUES(?,?,?,?,?)').run('myeongdong','2026-09-01T10:10:00+09:00','2026-09-01T01:20:00Z',JSON.stringify({commercialAt:'2026-09-01T10:10:00+09:00',categories:[{category:'한식',group:'음식',payments:10,amountMin:100,amountMax:200}]}),'hash');
 db.raw.prepare('INSERT INTO forecast_runs VALUES(?,?,?,?)').run('myeongdong','2026-10-02','2026-10-01T00:00:00Z','{"immutable":true}');
 await refreshCommercialMonths(db,new Date('2026-10-02T01:00:00Z'));
 const count=()=>db.raw.prepare('SELECT COUNT(*) AS n FROM seoul_commercial_months').get().n;const before=count();
 await refreshCommercialMonths(db,new Date('2026-11-02T01:00:00Z'));assert.ok(count()>before);assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM seoul_commercial_months WHERE month='2026-09'").get().n,4);
 const archived=JSON.parse(db.raw.prepare("SELECT payload FROM seoul_commercial_months WHERE area='myeongdong' AND month='2026-09'").get().payload).categories[0];assert.equal(archived.hours.length,0);assert.equal(archived.readings,1);assert.equal(archived.observedHours,1);
 assert.equal(db.raw.prepare('SELECT payload FROM forecast_runs').get().payload,'{"immutable":true}');
 assert.ok(!db.calls.some(sql=>/\bDELETE\b|INSERT INTO predictions|UPDATE forecast_runs/i.test(sql)));db.raw.close();
});
test('failed source read cannot overwrite the last good monthly payload',async()=>{
 const db=new SqliteD1();await refreshCommercialMonths(db,new Date('2026-10-02T01:00:00Z'));const before=db.raw.prepare('SELECT payload,calculated_at FROM seoul_commercial_months ORDER BY area,month').all();
 const prepare=db.prepare.bind(db);db.prepare=sql=>{const stmt=prepare(sql);if(sql.includes('FROM seoul_context'))stmt.all=async()=>({success:false,results:[]});return stmt;};
 await assert.rejects(refreshCommercialMonths(db,new Date('2026-10-03T01:00:00Z')),/SOURCE_READ_FAILED/);assert.deepEqual(db.raw.prepare('SELECT payload,calculated_at FROM seoul_commercial_months ORDER BY area,month').all(),before);db.raw.close();
});
