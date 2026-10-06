import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMonthlyRecords, previousRecordMonth, recordMonthDays, validRecordMonth } from '../lib/monthly-records.ts';
import { readMonthlyRecords, recordMonthStatement, RECORD_BOUNDS_SQL } from '../lib/monthly-records-read.ts';
import { canonicalSummaryUrl } from '../worker/summary-cache-key.ts';
import { GET } from '../app/api/live/summary/route.ts';
import { SqliteD1 } from './helpers/operational-sqlite.mjs';

const base = {area:'hongdae',areaCode:'POI007',sourceId:'SEOUL_CITYDATA_PPLTN',schemaVersion:'seoul-realtime-v1',qualityStatus:'VALID',recordOrigin:'LIVE'};
const hour = (date, h, min=100, max=200, overrides={}) => ({...base,populationMin:min,populationMax:max,observedAt:`${date}T${String(h).padStart(2,'0')}:45:00+09:00`,...overrides});
const day = (date, min=100, max=200) => Array.from({length:24},(_,h)=>hour(date,h,min,max));
const build = (rows, overrides={}) => buildMonthlyRecords({area:'hongdae',month:'2026-10',generatedAt:'2026-10-06T14:50:00Z',rows,first:hour('2026-08-31',0),last:hour('2026-10-06',23),...overrides});

test('averages 24 equal hourly samples then equal complete days, preserving both bounds', () => {
  const result=build([...day('2026-10-01',100,200),...day('2026-10-02',300,500),...day('2026-09-01',50,100)]);
  assert.equal(result.current.min,200); assert.equal(result.current.max,350);
  assert.equal(result.current.includedDays,2); assert.equal(result.current.expectedDays,5);
  assert.equal(result.current.cutoff,'2026-10-05'); assert.equal(result.previous.expectedDays,30);
  assert.equal(result.previous.includedDays,1);
  assert.equal(result.change.minPercent,100); assert.equal(result.change.maxPercent,600);
});
test('23 hours and missing days are excluded, never zero-filled; today is unclosed', () => {
  const result=build([...day('2026-10-01'),...day('2026-10-02').slice(1),...day('2026-10-06')]);
  assert.equal(result.current.includedDays,1); assert.equal(result.current.min,100);
  assert.deepEqual(result.current.days.slice(0,6).map(x=>[x.hours,x.status,x.min]),[[24,'COMPLETE',100],[23,'PARTIAL',null],[0,'MISSING',null],[0,'MISSING',null],[0,'MISSING',null],[null,'IN_PROGRESS',null]]);
});
test('empty months are unavailable and a real zero stays a measured zero', () => {
  assert.equal(build([]).current.min,null); assert.equal(build([]).change,null);
  const zero=build([...day('2026-10-01',0,0),...day('2026-09-01',0,0)]);
  assert.equal(zero.current.min,0); assert.equal(zero.current.includedDays,1); assert.equal(zero.change,null);
});
test('collection frequency does not weight hours or days twice; last sample within each hour wins', () => {
  const result=build([...day('2026-10-01'),hour('2026-10-01',1,900,1000,{observedAt:'2026-10-01T01:10:00+09:00'})]);
  assert.equal(result.current.min,100); assert.equal(result.current.max,200);
});
for (const [key,value] of Object.entries({area:'myeongdong',areaCode:'OTHER',sourceId:'OTHER',schemaVersion:'v2',qualityStatus:'INVALID',recordOrigin:'DEMO',populationMin:-1,populationMax:0,observedAt:'2026-10-01T24:00:00+09:00'})) {
  test(`different or invalid ${key} cannot enter either month's average`,()=>{
    const rows=day('2026-10-01'); rows[0]={...rows[0],[key]:value};
    const result=build(rows); assert.equal(result.current.min,null); assert.equal(result.current.includedDays,0);
  });
}
test('calendar boundaries use KST, exclude ongoing first day, and include leap days', () => {
  assert.equal(previousRecordMonth('2026-01'),'2025-12');
  assert.equal(recordMonthDays('2024-02').length,29); assert.equal(recordMonthDays('2026-02').length,28);
  const result=build(day('2026-09-30'),{generatedAt:'2026-09-30T15:00:00Z'});
  assert.equal(result.current.expectedDays,0); assert.equal(result.current.cutoff,null);
  assert.equal(result.previous.includedDays,1);
  assert.equal(validRecordMonth('2026-13'),false); assert.equal(validRecordMonth('2026-1'),false);
});
function insert(db,row) {
  db.raw.prepare(`INSERT INTO seoul_realtime_area(id,source_id,record_origin,area,area_code,area_name,congestion_level,congestion_label,population_min,population_max,observed_at,retrieved_at,freshness,schema_version,quality_status,source_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(row.observedAt+row.area,row.sourceId,row.recordOrigin,row.area,row.areaCode,'test fixture',1,'test',row.populationMin,row.populationMax,row.observedAt,row.observedAt,'LIVE',row.schemaVersion,row.qualityStatus,'fixture');
}
test('real migrated SQLite query uses indexed hour seeks and returns one sample per hour, three statements in one batch',async()=>{
  const db=new SqliteD1();
  for(const row of [...day('2026-10-01'),hour('2026-10-01',1,999,999,{observedAt:'2026-10-01T01:10:00+09:00'}),...day('2026-09-01'),hour('2026-10-06',23)]) insert(db,row);
  const query=recordMonthStatement('hongdae','2026-10','2026-10-06T14:50:00Z');
  const plan=db.raw.prepare('EXPLAIN QUERY PLAN '+query.sql).all(...query.binds).map(x=>x.detail).join('\n');
  assert.match(plan,/SEARCH sample USING COVERING INDEX seoul_realtime_area_observed_unique/);
  assert.doesNotMatch(plan,/SCAN (?:sample|seoul_realtime_area)\b/);
  const boundsPlan=db.raw.prepare('EXPLAIN QUERY PLAN '+RECORD_BOUNDS_SQL).all(...[0,1].flatMap(()=>[base.sourceId,base.area,'2026-10-06T23:50:00+09:00'])).map(x=>x.detail).join('\n');
  assert.doesNotMatch(boundsPlan,/SCAN seoul_realtime_area\b/);
  let batches=0; const original=db.batch.bind(db); db.batch=(statements)=>{batches++; return original(statements);};
  const result=await readMonthlyRecords(db,'hongdae','2026-10','2026-10-06T14:50:00Z');
  assert.equal(batches,1); assert.equal(db.calls.length,3); assert.equal(result.current.min,100);
  assert.equal(result.availableFrom,'2026-09-01'); assert.equal(result.availableThrough,'2026-10-06');
  assert.equal(result.current.includedDays,1); assert.equal(result.previous.includedDays,1);
  assert.ok(recordMonthStatement('hongdae','2026-08','2026-10-06T14:50:00Z').binds.length<=100);
  db.raw.close();
});
test('no fallback to an older valid sample when the last hourly stored sample is invalid',async()=>{
  const db=new SqliteD1(); for(const row of day('2026-10-01')) insert(db,row);
  insert(db,hour('2026-10-01',12,999,1000,{observedAt:'2026-10-01T12:55:00+09:00',qualityStatus:'INVALID'}));
  const result=await readMonthlyRecords(db,'hongdae','2026-10','2026-10-06T14:50:00Z');
  assert.equal(result.current.includedDays,0); assert.equal(result.current.days[0].hours,23); db.raw.close();
});
test('a failed or incomplete batch cannot masquerade as a month without data',async()=>{
  const prepare=()=>({bind(){return this;}});
  await assert.rejects(()=>readMonthlyRecords({prepare,batch:async()=>[]},'hongdae','2026-10','2026-10-06T14:50:00Z'));
  await assert.rejects(()=>readMonthlyRecords({prepare,batch:async()=>{throw new Error('D1');}},'hongdae','2026-10','2026-10-06T14:50:00Z'));
});
test('records, ordinary summaries, areas and months cannot share an edge cache key',()=>{
  const canonical=path=>canonicalSummaryUrl(new URL('https://koretaildata.com'+path));
  const a=canonical('/api/live/summary?view=records&area=hongdae&month=2026-09&x=1&date=2020-01-01');
  assert.equal(a,'https://koretaildata.com/api/live/summary?view=records&area=hongdae&month=2026-09');
  assert.notEqual(a,canonical('/api/live/summary?month=2026-09'));
  assert.notEqual(a,canonical('/api/live/summary?view=records&area=itaewon&month=2026-09'));
  assert.notEqual(a,canonical('/api/live/summary?view=records&area=hongdae&month=2026-08'));
  assert.notEqual(canonical('/api/live/summary?view=records&area=hongdae&month=bad'),canonical('/api/live/summary?view=records&area=hongdae'));
  assert.equal(canonical('/api/live/summary?view=records&area=bad&month=bad'),'https://koretaildata.com/api/live/summary?view=records&area=invalid&month=invalid');
});
test('invalid records inputs return 400 before D1 and remain invalid through the gateway',async()=>{
  for(const query of ['view=records&area=bad','view=records&area=hongdae&month=bad','view=records&area=hongdae&month=','view=records&area=hongdae&month=2999-12']){
    const url=new URL('https://koretaildata.com/api/live/summary?'+query);
    for(const requestUrl of [url.href,canonicalSummaryUrl(url)]) {
      const response=await GET(new Request(requestUrl)); assert.equal(response.status,400); assert.equal(response.headers.get('cache-control'),'no-store');
    }
  }
});
