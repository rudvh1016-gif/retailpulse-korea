import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Miniflare} from './helpers/miniflare.mjs';
import {composeTodayAnswer,readTodayAnswer,resetTodayAnswerMemo} from '../lib/today-answer.ts';

const source=readFileSync('lib/today-answer.ts','utf8');
const sql=source.match(/const AIRPORT_SQL = `([^`]+)`/)[1];
const oldSql=sql.replace(' INDEXED BY airport_passenger_forecast_month_idx','');
const day='2026-10-29',now=Date.parse(day+'T12:00:00+09:00');
const canonical=value=>JSON.stringify(value);

test('both single-day consumers retain the same filter, projection, order and cap',()=>{
 const collector=readFileSync('lib/collector.ts','utf8');
 const queries=[...collector.matchAll(/`(SELECT[^`]*FROM airport_passenger_forecast INDEXED BY airport_passenger_forecast_month_idx[^`]*)`/g)];
 assert.equal(queries.length,1);
 assert.equal(queries[0][1].replace(/\s+/g,' ').trim(),sql.replace(/\s+/g,' ').trim());
 assert.match(sql,/ORDER BY target_start_at, terminal LIMIT 96$/);
});

test('local Workerd: aggregate seek reduces reads without changing forecast evidence',async t=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
 t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const part of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(part.trim())await db.prepare(part).run();
 const read=q=>db.prepare(q).bind(day).all();
 const compare=async()=>{
  const before=await read(oldSql),after=await read(sql);
  assert.deepEqual(after.results.map(canonical).sort(),before.results.map(canonical).sort());
  assert.deepEqual(composeTodayAnswer(after.results,[],now),composeTodayAnswer(before.results,[],now));
  assert.equal(after.meta.rows_written,0);
  assert.ok(after.results.length<=96);
  const keys=after.results.map(r=>r.targetStartAt+'|'+r.terminal);
  assert.deepEqual(keys,[...keys].sort());
  return {before,after};
 };
 await t.test('empty stored day stays empty',async()=>assert.equal((await compare()).after.results.length,0));
 const insert=(id,terminal,h,direction='departure',zone='total',sourceId='A5')=>{
  const start=day+`T${String(h).padStart(2,'0')}:00:00+09:00`,end=h===23?'2026-10-30T00:00:00+09:00':day+`T${String(h+1).padStart(2,'0')}:00:00+09:00`;
  return db.prepare('INSERT INTO airport_passenger_forecast VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,sourceId,'OFFICIAL_FORECAST',terminal,direction,zone,Number(zone==='total'),day,String(h),start,end,100+h,'2026-10-29T00:00:00Z','v1','VALID',id);
 };
 const rows=[];
 for(const terminal of ['T1','T2'])for(let h=0;h<24;h++)for(const type of ['departure-total','arrival-total','departure-1','departure-2','departure-3','departure-4','departure-5','departure-6']){
  const [direction,zone]=type.split('-');rows.push(insert(terminal+h+type,terminal,h,direction,zone));
 }
 for(let i=0;i<rows.length;i+=100)await db.batch(rows.slice(i,i+100));
 await t.test('48 aggregate rows: measured reads 384 to 96, zero writes',async()=>{
  const {before,after}=await compare();assert.equal(after.results.length,48);
  assert.equal(before.meta.rows_read,384);assert.equal(after.meta.rows_read,96);
  const plan=await db.prepare('EXPLAIN QUERY PLAN '+sql).bind(day).all();
  assert.ok(plan.results.some(r=>r.detail.includes('USING INDEX airport_passenger_forecast_month_idx')));
 });
 await t.test('additional source rows are not hidden or deduplicated',async()=>{
  await db.batch(Array.from({length:24},(_,h)=>insert('other'+h,'T1',h,'departure','total','OTHER')));
  assert.equal((await compare()).after.results.length,72);
 });
 await t.test('extra terminal and original 96-row cap remain unchanged',async()=>{
  await db.batch(Array.from({length:24},(_,h)=>insert('extra'+h,'T3',h)));
  assert.equal((await compare()).after.results.length,96);
  await db.prepare("INSERT INTO airport_passenger_forecast SELECT 'over-cap',source_id,record_origin,'T4',direction,zone,is_aggregate,target_date,'late',target_end_at,target_end_at,expected_passengers,retrieved_at,schema_version,quality_status,source_hash FROM airport_passenger_forecast WHERE id='extra23'").run();
  assert.equal((await compare()).after.results.length,96);
 });
 await t.test('missing mandatory existing index fails closed to null answer',async()=>{
  await db.prepare('DROP INDEX airport_passenger_forecast_month_idx').run();resetTodayAnswerMemo();
  const client={prepare:q=>({bind:(...values)=>({q,values})}),batch:statements=>Promise.all(statements.map(s=>db.prepare(s.q).bind(...s.values).all()))};
  assert.equal(await readTodayAnswer(client,now),null);resetTodayAnswerMemo();
 });
});
