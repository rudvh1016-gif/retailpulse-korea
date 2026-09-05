import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { normalizeSeoulContext } from '../lib/seoul-context';
import { normalizeHolidays } from '../lib/holidays';
import { buildPopulationHours,runPopulationPredictions,POPULATION_ROWS_SQL } from '../lib/population-predictions';
import { compareComposition } from '../lib/airport-composition-history';
import { summarizeAirlineRanking } from '../lib/airline-ranking';
const sample=(day:string,value:number,overrides={})=>({observedAt:`${day}T10:05:00+09:00`,retrievedAt:`${day}T01:10:00Z`,populationMin:value,populationMax:value+200,sourceHash:day,qualityStatus:'VALID',recordOrigin:'LIVE',schemaVersion:'v1',...overrides});
function database() {
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(`drizzle/${file}`,'utf8'));
 const db={prepare(query:string){let params:unknown[]=[];const statement={bind(...values:unknown[]){params=values;return statement;},async all(){return {results:sql.prepare(query).all(...params as never[])};},async first(){return sql.prepare(query).get(...params as never[])??null;},async run(){const result=sql.prepare(query).run(...params as never[]);return {meta:{changes:Number(result.changes)}};}};return statement;},async batch(statements:Array<{run:()=>Promise<unknown>}>){return Promise.all(statements.map(s=>s.run()));}};
 return {sql,db:db as unknown as D1Database};
}
test('context preserves suppressed values and weather time; inverted range is unavailable',()=>{
 const result=normalizeSeoulContext({LIVE_CMRCL_STTS:{CMRCL_TIME:'2026-09-05 10:10:00.0',CMRCL_RSB:[{RSB_LRG_CTGR:'음식',RSB_MID_CTGR:'카페',RSB_PAYMENT_LVL:'바쁜',RSB_SH_PAYMENT_CNT:'*',RSB_SH_PAYMENT_AMT_MIN:'200',RSB_SH_PAYMENT_AMT_MAX:'100'}]},WEATHER_STTS:[{WEATHER_TIME:'2026-09-05 10:00',TEMP:'0',HUMIDITY:'*',PM10:'12',PM25:'-999'}]});
 assert.equal(result.categories[0].payments,null);assert.equal(result.categories[0].amountMin,null);
 assert.equal(result.weather?.temperature,0);assert.equal(result.weather?.pm25,null);assert.equal(result.weather?.humidity,null);
 assert.equal(result.commercialAt,'2026-09-05T10:10:00+09:00');
});
test('holiday success, empty month and rejected/truncated response stay distinct',()=>{
 const body=(totalCount:number,item:unknown)=>({response:{header:{resultCode:'00'},body:{totalCount,items:{item}}}});
 assert.deepEqual(normalizeHolidays(body(0,[]),'2026-09'),[]);
 assert.deepEqual(normalizeHolidays(body(1,{locdate:20260925,dateName:'추석',isHoliday:'Y'}),'2026-09'),[{date:'2026-09-25',name:'추석'}]);
 assert.throws(()=>normalizeHolidays(body(2,[]),'2026-09'));
 assert.throws(()=>normalizeHolidays({response:{header:{resultCode:'30'}}},'2026-09'));
});
test('two matched weekdays required; late/backfilled/invalid/different-definition inputs rejected',()=>{
 const cutoff='2026-09-05T09:30:00Z';
 assert.equal(buildPopulationHours([sample('2026-08-30',1000)],'2026-09-06',cutoff).length,0);
 const valid=[sample('2026-08-30',1000),sample('2026-08-23',2000)];
 assert.equal(buildPopulationHours(valid,'2026-09-06',cutoff)[0].value,1600);
 for(const overrides of [{recordOrigin:'BACKFILLED'},{retrievedAt:'2026-09-07T00:00:00Z'},{schemaVersion:'v2'},{populationMin:-1},{observedAt:'2026-08-23T10:20:00+09:00'}])
  assert.equal(buildPopulationHours([valid[0],sample('2026-08-23',2000,overrides)],'2026-09-06',cutoff).length,0);
});
test('actual prediction pipeline writes once, preserves inputs and separately matches outcome',async()=>{
 const {sql,db}=database();
 const insert=(day:string,value:number,observedAt?:string)=>sql.prepare(`INSERT INTO seoul_realtime_area(id,source_id,record_origin,area,area_code,area_name,congestion_level,congestion_label,population_min,population_max,observed_at,retrieved_at,freshness,schema_version,quality_status,source_hash)
 VALUES(?, 'SEOUL_CITYDATA_PPLTN','LIVE','myeongdong','POI003','명동','보통','보통',?,?,?,?,'LIVE','v1','VALID',?)`).run(day,value,value+200,observedAt??`${day}T10:05:00+09:00`,`${day}T09:00:00Z`,day);
 insert('2026-08-30',1000);insert('2026-08-23',2000);insert('2026-09-05',1500,'2026-09-05T18:05:00+09:00');
 await runPopulationPredictions(db,new Date('2026-09-05T09:30:00Z'));
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM predictions').get()?.n,1);
 const prediction=sql.prepare('SELECT * FROM predictions').get();assert.equal(prediction?.value,1600);
 await runPopulationPredictions(db,new Date('2026-09-05T09:45:00Z'));
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM predictions').get()?.n,1);
 assert.throws(()=>sql.exec('UPDATE predictions SET value=1'));
 assert.throws(()=>sql.exec('DELETE FROM prediction_inputs'));
 insert('2026-09-06',1700);
 await runPopulationPredictions(db,new Date('2026-09-07T09:30:00Z'));
 assert.equal(sql.prepare('SELECT actual_value FROM outcomes').get()?.actual_value,1800);
 assert.equal(sql.prepare('SELECT value FROM predictions').get()?.value,1600);
 const plan=sql.prepare(`EXPLAIN QUERY PLAN ${POPULATION_ROWS_SQL}`).all('myeongdong','2026-08-01','2026-09-01');
 assert.match(JSON.stringify(plan),/INDEX/);assert.doesNotMatch(JSON.stringify(plan),/SCAN seoul_realtime_area/);
});
test('airline comparison includes disappeared/new carriers but never infinite percent from zero',()=>{
 const flight=(id:string,code:string)=>({physicalFlightId:id,terminal:'T1',operatingFlight:code,retrievedAt:'2026-09-05T00:00:00Z'});
 const lookup=(id:string|null)=>({name:id,country:id==='KE'?'KR':'JP'});
 const now=summarizeAirlineRanking([flight('a','KE101'),flight('a','KE101'),flight('b','KE102')],lookup,300).all;
 const before=summarizeAirlineRanking([flight('c','JL101')],lookup,300).all;
 const changed=compareComposition(now,before);
 assert.equal(changed.airlines.find(row=>row.id==='KE')?.percent,null);
 assert.equal(changed.airlines.find(row=>row.id==='JL')?.percent,-100);
 assert.equal(changed.countries.find(row=>row.id==='KR')?.current,2);
});
test('A5 semantic revisions are archived once and never overwrite older values',()=>{
 const {sql}=database();
 sql.prepare(`INSERT INTO airport_passenger_forecast(id,source_id,record_origin,terminal,direction,zone,is_aggregate,target_date,time_band_raw,target_start_at,target_end_at,expected_passengers,retrieved_at,schema_version,quality_status,source_hash)
 VALUES('a5','INCHEON_PASSENGER_FORECAST','FORECAST','T1','departure','ALL',1,'2026-09-06','10:00~11:00','2026-09-06T10:00:00+09:00','2026-09-06T11:00:00+09:00',1000,'2026-09-05T00:00:00Z','v1','VALID','hash1')`).run();
 sql.exec("UPDATE airport_passenger_forecast SET expected_passengers=1200,source_hash='hash2',retrieved_at='2026-09-05T01:00:00Z' WHERE id='a5'");
 sql.exec("UPDATE airport_passenger_forecast SET expected_passengers=1200 WHERE id='a5'");
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM airport_forecast_versions').get()?.n,2);
 assert.equal(sql.prepare("SELECT expected_passengers FROM airport_forecast_versions WHERE source_hash='hash1'").get()?.expected_passengers,1000);
 assert.throws(()=>sql.exec('DELETE FROM airport_forecast_versions'));
 assert.throws(()=>sql.exec('UPDATE airport_forecast_versions SET expected_passengers=0'));
});
