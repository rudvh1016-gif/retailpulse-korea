import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteD1} from './helpers/operational-sqlite.mjs';
import {refreshCommercialMonths} from '../lib/commercial-monthly-store.ts';
import {buildCommercialMonth,compareCommercialMonths,publicCommercialMonth} from '../lib/commercial-monthly.ts';
import {readCommercialMonths} from '../app/api/live/commercial-months/route.ts';
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

function comparisonFixture(overlap=true){
 const row=(month,hour,payments,amount)=>({observed_at:`${month}-05T${hour}:20:00+09:00`,payload:JSON.stringify({commercialAt:`${month}-05T${hour}:20:00+09:00`,categories:[{category:'한식',group:'음식',payments,amountMin:amount?100:null,amountMax:amount?200:null}]})});
 const previous=buildCommercialMonth([row('2026-09',overlap?'09':'08',0,true),...(overlap?[row('2026-09','11',10,false),row('2026-09','14',null,true)]:[])],'2026-09','2026-09-30');
 const current=compareCommercialMonths(buildCommercialMonth([row('2026-10','09',0,true),row('2026-10','11',20,false),row('2026-10','14',null,true)],'2026-10','2026-10-10'),previous);
 return {current,previous};
}
function storeComparison(db,value){
 db.raw.prepare('INSERT INTO seoul_commercial_months(area,month,payload,source_hash,calculated_at) VALUES(?,?,?,?,?)').run('hongdae',value.month,JSON.stringify(value),'saved-hash','2026-10-11T00:00:00Z');
}
test('public stored reads add missing coverage with one previous-month PK read and no writes',async()=>{
 for(const missing of ['hours','amount','both','all','complete','empty','compacted']){
  const db=new SqliteD1();try{
   const {current,previous}=comparisonFixture(missing!=='empty'),saved=structuredClone(current);
   if(['hours','both'].includes(missing))delete saved.categories[0].comparison.coverage.hours;
   if(['amount','both'].includes(missing))delete saved.categories[0].comparison.coverage.amount;
   if(missing==='all')delete saved.categories[0].comparison.coverage;
   if(missing==='compacted'){saved.categories[0].hours=[];delete saved.categories[0].comparison.coverage.hours;}
   storeComparison(db,previous);storeComparison(db,saved);
   const snapshot=()=>db.raw.prepare('SELECT * FROM seoul_commercial_months ORDER BY area,month').all(),before=snapshot();
   const result=await readCommercialMonths(db,'hongdae','2026-10');
   const needsRead=['hours','amount','both','all'].includes(missing);
   assert.equal(result.status,'READY');assert.equal(result.calculatedAt,'2026-10-11T00:00:00Z');
   assert.deepEqual(result.data,publicCommercialMonth(needsRead?current:saved),missing);
   assert.equal(db.calls.length,needsRead?3:2,missing);
   assert.equal(db.calls.filter(sql=>sql.startsWith('SELECT payload FROM')).length,needsRead?1:0,missing);
   assert.ok(db.calls.every(sql=>/^SELECT\b/.test(sql)&&sql.includes('FROM seoul_commercial_months')),missing);
   assert.deepEqual(snapshot(),before,missing);assert.ok(!('hours' in result.data.categories[0]));
  }finally{db.raw.close();}
 }
});
test('missing, compacted, conflicting or unreadable prior evidence leaves the saved public comparison intact',async()=>{
 for(const state of ['missing','compacted','mismatch','read-error','invalid-json']){
  const db=new SqliteD1();try{
   const {current,previous}=comparisonFixture();delete current.categories[0].comparison.coverage.hours;delete current.categories[0].comparison.coverage.amount;
   if(state==='compacted')previous.categories[0].hours=[];
   if(state==='mismatch')previous.categories[0].hours[0][3]=100;
   if(state!=='missing')storeComparison(db,previous);
   if(state==='invalid-json')db.raw.prepare("UPDATE seoul_commercial_months SET payload='not-json' WHERE month='2026-09'").run();
   storeComparison(db,current);
   const snapshot=()=>db.raw.prepare('SELECT * FROM seoul_commercial_months ORDER BY area,month').all(),before=snapshot();
   const prepare=db.prepare.bind(db);let priorReads=0;
   db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('SELECT payload FROM')){const first=statement.first.bind(statement);statement.first=async()=>{priorReads++;if(state==='read-error')throw Error('prior unavailable');return first();};}return statement;};
   const result=await readCommercialMonths(db,'hongdae','2026-10');
   assert.equal(result.status,'READY',state);assert.deepEqual(result.data,publicCommercialMonth(current),state);assert.equal(priorReads,1,state);
   assert.deepEqual(snapshot(),before,state);assert.ok(db.calls.every(sql=>/^SELECT\b/.test(sql)),state);
  }finally{db.raw.close();}
 }
});
