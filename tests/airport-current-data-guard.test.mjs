import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { shouldRetryAirport } from '../lib/congestion-retry.ts';
import { airportTodayCoverage, readAirportTodayCoverage } from '../lib/airport-today-coverage.ts';
import { airportFlightEvidence } from '../lib/airport-flight-evidence.ts';
import { collectAirportFlightsToday } from '../lib/airport-today.ts';
import { SourceFetchError } from '../lib/source-adapters.ts';

const result = (status, detail) => JSON.stringify({ source:'airport_recent', status, detail });
const nowIso='2026-10-08T23:15:00Z'; // Oct 9 08:15 KST: actual missed run
const healthy={nowIso,hasTodayRows:true,completeScan:true,retrievedAt:'2026-10-08T23:18:24Z'};

test('the actual A1 success plus holidays 403 does not repeat A1/A2',()=>{
 const holiday=JSON.stringify({context:'holidays',status:'ERROR',detail:'failureClass=HTTP httpStatus=403'});
 assert.equal(shouldRetryAirport(result('SUCCESS','')+'\n'+holiday),false);
 assert.equal(shouldRetryAirport(result('SKIPPED_ALREADY_COMPLETE_TODAY','')+'\n'+holiday),false);
});
test('only classified transient A1 fetch failures qualify for the existing bounded ladder',()=>{
 for(const failure of ['NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT','TIMEOUT','HTTP httpStatus=503']) {
  assert.equal(shouldRetryAirport(result('ERROR','failureStage=FETCH failureClass='+failure)),true);
  assert.equal(shouldRetryAirport(result('ERROR','failureStage=STORE failureClass='+failure)),false);
 }
 for(const failure of ['HTTP httpStatus=403','HTTP httpStatus=429','HTTP httpStatus=503 retryDeferred=true','AUTH','SCHEMA','VALIDATION','NO_DATA','NETWORK | failureClass=AUTH'])
  assert.equal(shouldRetryAirport(result('ERROR','failureStage=FETCH failureClass='+failure)),false,failure);
 for(const log of ['',result('ERROR',''),result('ERROR','failureClass=NETWORK'),result('ERROR','failureStage=FETCH failureClass=NETWORK')+'\n'+result('SUCCESS','')])assert.equal(shouldRetryAirport(log),false);
});
test('A1 collector returns its own sanitized fetch-stage verdict for the workflow',async()=>{
 let calls=0;
 const r=await collectAirportFlightsToday({DATA_GO_KR_SERVICE_KEY:'fixture-only'},new Date(nowIso),async()=>{calls++;throw new SourceFetchError('HTTP',403);});
 assert.equal(calls,1);assert.equal(r.status,'ERROR');assert.match(r.detail,/failureStage=FETCH failureClass=HTTP httpStatus=403/);assert.doesNotMatch(r.detail,/fixture-only/);
});
test('actual Oct9 missing run and old Oct8 stamp cannot read as current',()=>{
 const missing=airportTodayCoverage({...healthy,hasTodayRows:false,completeScan:false,retrievedAt:'2026-10-08T00:55:47.356Z'});
 assert.equal(missing.today,'2026-10-09');assert.equal(missing.state,'MISSING_TODAY');assert.equal(missing.alert,true);
 const old=airportTodayCoverage({...healthy,retrievedAt:'2026-10-08T00:55:47.356Z'});
 assert.equal(old.state,'OLD_OR_UNVERIFIED_STAMP');assert.equal(old.alert,true);
 assert.equal(airportTodayCoverage({...healthy,completeScan:false}).state,'COMPLETE_SCAN_UNVERIFIED');
 assert.equal(airportTodayCoverage({...healthy,retrievedAt:null}).alert,true);
});
test('grace does not alert before the early window; stored verified recovery becomes current',()=>{
 assert.equal(airportTodayCoverage({...healthy,nowIso:'2026-10-08T19:20:00Z',hasTodayRows:false,completeScan:false}).alert,false);
 const current=airportTodayCoverage({...healthy,nowIso:'2026-10-08T23:26:47Z'});
 assert.equal(current.state,'CURRENT');assert.equal(current.alert,false);
 assert.equal(airportTodayCoverage(healthy).state,'OLD_OR_UNVERIFIED_STAMP','a future collection stamp is not current proof');
});
test('monitor reads bounded SELECTs and reuses the existing complete-scan marker, never writes',async()=>{
 const queries=[];
 const db={prepare(sql){assert.match(sql,/^SELECT/);assert.match(sql,/LIMIT (1|10)\b/);queries.push(sql);return {bind(...params){queries.push(params);return this;},async first(){return sql.includes('source_health')?{last_retrieved_at:'2026-10-08T23:18:24Z'}:{physical_flight_id:'today'};},async run(){return {success:true,results:[{detail:'recent 2026-10-06..2026-10-09; pages 119; requests 119'}]};}};}};
 assert.equal((await readAirportTodayCoverage(db,'2026-10-08T23:26:47Z')).state,'CURRENT');
 assert.equal(queries.filter(x=>typeof x==='string').length,3);
 await assert.rejects(()=>readAirportTodayCoverage({prepare(){throw Error('unavailable');}},nowIso),/unavailable/);
});
test('same-date schedule delay and actual record source timestamps are explicit in four languages',()=>{
 const old='2026-10-08T00:55:47.356Z';
 for(const lang of ['ko','en','zh','ja']){
  const pending=airportFlightEvidence({date:'2026-10-09',today:true,basis:'OFFICIAL_DEPARTURE_SCHEDULE',retrievedAt:old},lang);
  assert.match(pending,/2026-10-09 KST/);assert.match(pending,/2026-10-08 09:55 KST/);
  const actual=airportFlightEvidence({date:'2026-10-09',today:true,basis:'COLLECTED_FLIGHT_RECORDS',retrievedAt:'2026-10-08T23:18:24Z'},lang);
  assert.match(actual,/2026-10-09 08:18 KST/);assert.notEqual(actual,pending);
 }
 assert.match(airportFlightEvidence({date:'2026-10-09',today:true,basis:'OFFICIAL_DEPARTURE_SCHEDULE',retrievedAt:old},'en'),/collection pending/);
 assert.doesNotMatch(airportFlightEvidence({date:'2026-10-10',today:false,basis:'OFFICIAL_DEPARTURE_SCHEDULE',retrievedAt:old},'en'),/collection pending/);
 assert.match(airportFlightEvidence({date:'2026-10-09',today:true,retrievedAt:'invalid'},'en'),/Source unverified.*Collection time unverified/);
});
test('wiring retains three existing attempts, 125 requests each and the single realtime trigger',async()=>{
 const early=await readFile(new URL('../.github/workflows/collect-airport-recovery.yml',import.meta.url),'utf8');
 assert.match(early,/needs.collect.outputs.retry_airport == 'true'/);assert.match(early,/needs.retry_1.outputs.retry_airport == 'true'/);
 assert.equal((early.match(/a1_max_requests: "125"/g)||[]).length,3);
 const shared=await readFile(new URL('../.github/workflows/collect-attempt.yml',import.meta.url),'utf8');
 assert.match(shared,/jobs.collect.outputs.retry_airport/);assert.match(shared,/decide-congestion-retry.ts .*--airport/);assert.match(shared,/set -o pipefail/);
 const realtime=await readFile(new URL('../.github/workflows/collect-realtime.yml',import.meta.url),'utf8');
 assert.doesNotMatch(realtime,/^  schedule:/m);assert.match(realtime,/airport_today_coverage:/);assert.match(realtime,/scripts\/check-airport-today-coverage.ts/);
});
