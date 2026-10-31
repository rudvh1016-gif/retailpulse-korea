import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completeGlanceProfile,currentGlanceSnapshot,readGlanceWeekReference} from '../lib/glance-week-reference';
import {glanceWeekChange,type GlanceWeekReference} from '../lib/glance-week-comparison';
import {AIRPORT_SIDES_VERSION} from '../lib/airport-sides';
import {shiftKstDay} from '../lib/kst';
import type {AirportForecastAggregateRow} from '../lib/airport-today-summary';

// All fixtures are synthetic: not production counts or evidence of stored availability.
const day='2026-10-30',previousDay='2026-10-23';
const terminal=(total:number)=>({total,hours:[total,...Array<number>(23).fill(0)],sides:[total,0,0,0],destinations:{TEST:total}});
const profile=(date=previousDay)=>({profile:{v:1,day:date,sidesVersion:AIRPORT_SIDES_VERSION,complete:true,T1:terminal(10),T2:terminal(20),CONCOURSE:terminal(5),unknownBuilding:2,cancelled:3}});
const forecasts=(date=previousDay):AirportForecastAggregateRow[]=>(['T1','T2']).flatMap(terminal=>Array.from({length:24},(_,hour)=>({
 terminal,direction:'departure',isAggregate:1,targetDate:date,timeBandRaw:String(hour),
 targetStartAt:`${date}T${String(hour).padStart(2,'0')}:00:00+09:00`,
 targetEndAt:hour===23?`${shiftKstDay(date,1)}T00:00:00+09:00`:`${date}T${String(hour+1).padStart(2,'0')}:00:00+09:00`,
 expectedPassengers:terminal==='T1'?100:50,retrievedAt:`${date}T00:00:00+09:00`,
})));
const transfers=(date=previousDay)=>[{terminal:'T1',serviceDate:date,expectedTransferPassengers:100},{terminal:'T2',serviceDate:date,expectedTransferPassengers:200}];
type MockRows={forecasts?:unknown[];transfers?:unknown[];profiles?:unknown[];scans?:unknown[];failed?:number};
function mockDb(rows:MockRows={}){
 const queries:Array<{sql:string;values:unknown[]}>=[];
 return {queries,prepare(sql:string){return {bind(...values:unknown[]){const index=queries.length;queries.push({sql,values});return {all:async()=>({success:rows.failed!==index,results:sql.includes('airport_passenger_forecast')?rows.forecasts??forecasts():sql.includes('airport_transfer_forecast')?rows.transfers??transfers():sql.includes('FROM collector_runs c')?rows.scans??[]:rows.profiles??[day,previousDay].map(date=>({day:date,payload:JSON.stringify(profile(date))}))})};}};}};
}
const reference=():GlanceWeekReference=>({day,previousDay,passengers:{all:3900,T1:2500,T2:1400},flights:{all:37,T1:10,T2:20,CONCOURSE:5},selectedFlights:{all:40,T1:12,T2:21,CONCOURSE:5}});

test('complete profile preserves main building, concourse, T2 and unknown-inclusive airport totals',()=>{
 assert.deepEqual(completeGlanceProfile(profile(),previousDay),{all:37,T1:10,CONCOURSE:5,T2:20});
 const zero=profile();zero.profile.T1=terminal(0);zero.profile.T2=terminal(0);zero.profile.CONCOURSE=terminal(0);zero.profile.unknownBuilding=0;
 assert.deepEqual(completeGlanceProfile(zero,previousDay),{all:0,T1:0,CONCOURSE:0,T2:0});
});
test('missing, incomplete, wrong-date or incompatible profiles are unavailable, never zero',()=>{
 for(const value of [null,undefined,{}, {profile:null},{...profile(),profile:{...profile().profile,complete:false}},{...profile(),profile:{...profile().profile,v:2}},{...profile(),profile:{...profile().profile,sidesVersion:'unverified-version'}}])assert.equal(completeGlanceProfile(value,previousDay),null);
 assert.equal(completeGlanceProfile(profile(),day),null);
});
test('malformed profile counts, hours, side sums and unsafe totals fail closed',()=>{
 const invalid=[null,undefined,NaN,Infinity,-1,.5,'10',Number.MAX_SAFE_INTEGER+1];
 for(const value of invalid){
  for(const area of ['T1','T2','CONCOURSE'] as const){
   for(const field of ['total','hours','sides'] as const){const p=profile();if(field==='total')p.profile[area].total=value as number;else p.profile[area][field][0]=value as number;assert.equal(completeGlanceProfile(p,previousDay),null);}
  }
  const p=profile();p.profile.unknownBuilding=value as number;assert.equal(completeGlanceProfile(p,previousDay),null);
 }
 for(const field of ['hours','sides'] as const){
  for(const values of [[],[1],null,[...profile().profile.T1[field],0],profile().profile.T1[field].map((n,i)=>i===0?n+1:n)]){
   const p=profile();p.profile.T1[field]=values as number[];assert.equal(completeGlanceProfile(p,previousDay),null);
  }
 }
 const overflow=profile();overflow.profile.T1=terminal(Number.MAX_SAFE_INTEGER);assert.equal(completeGlanceProfile(overflow,previousDay),null);
});
test('exact previous weekday crosses months, years and leap February without a rolling average',async()=>{
 for(const [selected,expected] of [['2026-11-01','2026-10-25'],['2026-01-03','2025-12-27'],['2028-03-01','2028-02-23'],['2028-03-07','2028-02-29']] as const){
  const db=mockDb({forecasts:[],transfers:[],profiles:[]}),result=await readGlanceWeekReference(db as never,selected,'2026-10-19T03:00:00Z');
  assert.equal(result.previousDay,expected);assert.equal(result.day,selected);
  assert.deepEqual(db.queries.map(q=>q.values),[[expected],[expected],[selected,expected]]);
 }
 for(const selected of ['', '2026-02-29','2026-02-30','2026-13-01','2026-1-1'])await assert.rejects(readGlanceWeekReference(mockDb() as never,selected),/Exact date/);
});
test('reader sums complete departure and transfer forecasts independently by terminal',async()=>{
 const result=await readGlanceWeekReference(mockDb() as never,day);
 assert.deepEqual(result.passengers,{all:3900,T1:2500,T2:1400});
 assert.deepEqual(result.flights,{all:37,T1:10,T2:20,CONCOURSE:5});
 assert.deepEqual(result.selectedFlights,result.flights);
});
test('missing or duplicate forecast bands withhold affected sums, preserving independent terminals',async()=>{
 for(const rows of [forecasts().slice(1),[...forecasts(),forecasts()[0]]]){
  const result=await readGlanceWeekReference(mockDb({forecasts:rows}) as never,day);
  assert.deepEqual(result.passengers,{all:null,T1:null,T2:1400});
 }
 const none=await readGlanceWeekReference(mockDb({forecasts:[]}) as never,day);assert.deepEqual(none.passengers,{all:null,T1:null,T2:null});
});
test('invalid forecast and transfer component values are never coerced to zero',async()=>{
 for(const value of [null,undefined,NaN,Infinity,-1,.5,'100',Number.MAX_SAFE_INTEGER+1]){
  const rows=forecasts();rows[0].expectedPassengers=value as number;
  assert.deepEqual((await readGlanceWeekReference(mockDb({forecasts:rows}) as never,day)).passengers,{all:null,T1:null,T2:1400});
  const transfer=transfers();transfer[0].expectedTransferPassengers=value as number;
  assert.deepEqual((await readGlanceWeekReference(mockDb({transfers:transfer}) as never,day)).passengers,{all:null,T1:null,T2:1400});
 }
 for(const rows of [transfers().slice(1),transfers().map(r=>({...r,serviceDate:day})),[transfers()[0],transfers()[0]]]){
  const result=await readGlanceWeekReference(mockDb({transfers:rows}) as never,day);assert.equal(result.passengers.all,null);
 }
});
test('reader uses three bounded read-only queries and rejects failed or sentinel-overflow reads',async()=>{
 const db=mockDb();await readGlanceWeekReference(db as never,day);assert.equal(db.queries.length,3);
 assert.match(db.queries[0].sql,/target_date=\?/);assert.match(db.queries[0].sql,/LIMIT 65/);
 assert.match(db.queries[1].sql,/service_date=\?/);assert.match(db.queries[1].sql,/quality_status='OFFICIAL_FORECAST'/);assert.match(db.queries[1].sql,/LIMIT 3/);
 assert.match(db.queries[2].sql,/day IN \(\?,\?\)/);assert.match(db.queries[2].sql,/LIMIT 3/);
 for(const q of db.queries)assert.match(q.sql,/^SELECT /);
 for(const failed of [0,1,2])await assert.rejects(readGlanceWeekReference(mockDb({failed}) as never,day),/READ_INCOMPLETE/);
 for(const rows of [{forecasts:Array(65).fill(forecasts()[0])},{transfers:Array(3).fill(transfers()[0])},{profiles:Array(3).fill({day,payload:'{}'})}])await assert.rejects(readGlanceWeekReference(mockDb(rows) as never,day),/READ_INCOMPLETE/);
});
test('missing, duplicate or unreadable stored profile never supplies a flight zero',async()=>{
 for(const profiles of [[],[{day:previousDay,payload:'not-json'}],[{day:previousDay,payload:'{}'}],Array(2).fill({day:previousDay,payload:JSON.stringify(profile())})]){
  const result=await readGlanceWeekReference(mockDb({profiles}) as never,day);assert.equal(result.flights,null);assert.equal(result.selectedFlights,null);
 }
 const incomplete=profile(day);incomplete.profile.complete=false;
 const result=await readGlanceWeekReference(mockDb({profiles:[{day:previousDay,payload:JSON.stringify(profile())},{day,payload:JSON.stringify(incomplete)}]}) as never,day);
 assert.equal(result.selectedFlights,null);assert.equal(result.flights?.all,37);
 assert.equal(glanceWeekChange(37,day,result,'all','flights'),null);
});
test('single-day changes map forecast T1 shared scope but flight T1 main only',()=>{
 const ref=reference();
 assert.deepEqual(glanceWeekChange(2600,day,ref,'T1','people'),{previous:2500,delta:100,percent:4});
 assert.deepEqual(glanceWeekChange(2600,day,ref,'CONCOURSE','people'),{previous:2500,delta:100,percent:4});
 assert.deepEqual(glanceWeekChange(1400,day,ref,'T2','people'),{previous:1400,delta:0,percent:0});
 assert.deepEqual(glanceWeekChange(12,day,ref,'T1','flights'),{previous:10,delta:2,percent:20});
 assert.deepEqual(glanceWeekChange(5,day,ref,'CONCOURSE','flights'),{previous:5,delta:0,percent:0});
 assert.deepEqual(glanceWeekChange(40,day,ref,'all','flights'),{previous:37,delta:3,percent:3/37*100});
});
test('flight comparison requires completed selected profile equal to the displayed total',()=>{
 const ref=reference();
 assert.equal(glanceWeekChange(41,day,ref,'all','flights'),null);
 assert.equal(glanceWeekChange(40,day,{...ref,selectedFlights:null},'all','flights'),null);
 assert.equal(glanceWeekChange(40,day,{...ref,flights:null},'all','flights'),null);
 for(const wrong of [{...ref,day:previousDay},{...ref,previousDay:'2026-10-22'}])assert.equal(glanceWeekChange(40,day,wrong,'all','flights'),null);
 for(const value of [null,undefined,NaN,Infinity,-1,.5,'40',Number.MAX_SAFE_INTEGER+1]){
  assert.equal(glanceWeekChange(value as number,day,ref,'all','flights'),null);
  assert.equal(glanceWeekChange(value as number,day,ref,'all','people'),null);
  assert.equal(glanceWeekChange(40,day,{...ref,passengers:{...ref.passengers,all:value as number}},'all','people'),null);
  assert.equal(glanceWeekChange(40,day,{...ref,flights:{...ref.flights!,all:value as number}},'all','flights'),null);
 }
 assert.equal(glanceWeekChange(40,day,null,'all','people'),null);
 assert.equal(glanceWeekChange(40,'2026-02-30',ref,'all','people'),null);
});
test('real zero baseline preserves arithmetic difference but never invents a percentage',async()=>{
 const result=await readGlanceWeekReference(mockDb({forecasts:forecasts().map(r=>({...r,expectedPassengers:0})),transfers:transfers().map(r=>({...r,expectedTransferPassengers:0}))}) as never,day);
 assert.deepEqual(result.passengers,{all:0,T1:0,T2:0});
 assert.deepEqual(glanceWeekChange(100,day,result,'all','people'),{previous:0,delta:100,percent:null});
 const ref=reference();ref.flights={all:0,T1:0,T2:0,CONCOURSE:0};
 assert.deepEqual(glanceWeekChange(40,day,ref,'all','flights'),{previous:0,delta:40,percent:null});
 assert.deepEqual(glanceWeekChange(0,day,reference(),'all','people'),{previous:3900,delta:-3900,percent:-100});
});
test('SQLite production schema uses indexes for all exact-date reference reads',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {readFileSync,readdirSync}=await import('node:fs');const sqlite=new DatabaseSync(':memory:');
 try{
  for(const path of readdirSync('drizzle').filter(path=>path.endsWith('.sql')).sort())sqlite.exec(readFileSync(`drizzle/${path}`,'utf8'));
  const plans:string[]=[];
  const db={prepare(sql:string){return {bind(...values:unknown[]){return {all:async()=>{plans.push(...sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all(...values as never[]).map(row=>String(row.detail)));return {success:true,results:[]};}};}};}};
  await readGlanceWeekReference(db as never,day);
  for(const table of ['airport_passenger_forecast','airport_transfer_forecast','airport_daily_composition'])assert.ok(plans.some(plan=>new RegExp(`SEARCH ${table} USING INDEX`).test(plan)),plans.join('\n'));
  assert.ok(plans.every(plan=>!/^SCAN airport_/.test(plan)),plans.join('\n'));
 }finally{sqlite.close();}
});

const currentNow='2026-10-30T02:00:00Z';
const scan=()=>({startedAt:'2026-10-30T01:00:00Z',finishedAt:'2026-10-30T01:08:00Z',status:'SUCCESS',healthStatus:'LIVE',healthRetrievedAt:'2026-10-30T01:00:00Z',
 detail:`recent 2026-10-27..${day}; future scheduled 12 dates 2026-10-31..2026-11-01; pages 100; requests 100; population 10000; range rows 300; today source rows 90; today unique physical 40; range unique physical 120; changed rows 40; storage writes 120`});
const currentProfile=()=>{const p=profile(day);p.profile.complete=false;return p;};
test('today full-page scan is not confused with a day-ended operations total',()=>{
 const result=currentGlanceSnapshot(currentProfile(),day,scan(),currentNow);
 assert.deepEqual(result?.totals,{all:37,T1:10,T2:20,CONCOURSE:5});
 assert.deepEqual(result?.snapshot,{day,retrievedAt:scan().startedAt,provisional:true});
 assert.equal(completeGlanceProfile(currentProfile(),day),null,'the historical completion gate is unchanged');
});
test('current snapshot rejects failed, partial, legacy, stale, mismatched or future scan witnesses',()=>{
 for(const patch of [
  {status:'ERROR'},{healthStatus:'STALE'},{healthStatus:'ERROR'},{healthRetrievedAt:null},{healthRetrievedAt:'2026-10-29T01:00:00Z'},
  {startedAt:'2026-10-29T01:00:00Z',healthRetrievedAt:'2026-10-29T01:00:00Z'},
  {finishedAt:null},{finishedAt:'not-a-date'},{finishedAt:'2026-10-30T00:00:00Z'},{finishedAt:'2026-10-30T03:00:00Z'},
  {detail:'normalized 40; changed rows 40; storage writes 120'},
  {detail:scan().detail.replace(day,'2026-10-29')},
  ...['0','39','41','1201','NaN','-40','40.5'].map(value=>({detail:scan().detail.replace('physical 40;','physical '+value+';')})),
 ])assert.equal(currentGlanceSnapshot(currentProfile(),day,{...scan(),...patch},currentNow),null,JSON.stringify(patch));
 assert.equal(currentGlanceSnapshot(currentProfile(),day,undefined,currentNow),null);
 assert.equal(currentGlanceSnapshot(currentProfile(),day,scan(),'2026-10-30T15:00:00Z'),null,'midnight expiry');
 for(const p of [null,{}, {...currentProfile(),profile:{...currentProfile().profile,complete:undefined}}, {...currentProfile(),profile:{...currentProfile().profile,cancelled:-1}}])assert.equal(currentGlanceSnapshot(p,day,scan(),currentNow),null);
});
test('today adds only one bounded indexed witness; partial history and failed witness reads stay independent',async()=>{
 const profiles=[{day,payload:JSON.stringify(currentProfile())},{day:previousDay,payload:JSON.stringify(profile())}];
 const db=mockDb({profiles,scans:[scan()]}),result=await readGlanceWeekReference(db as never,day,currentNow);
 assert.equal(db.queries.length,4);assert.match(db.queries[3].sql,/LIMIT 1/);assert.match(db.queries[3].sql,/started_at>=\?/);assert.match(db.queries[3].sql,/JOIN source_health/);
 assert.deepEqual(result.selectedFlights,result.flights);assert.equal(result.selectedFlightSnapshot?.provisional,true);
 assert.deepEqual(glanceWeekChange(37,day,result,'all','flights',currentNow),{previous:37,delta:0,percent:0});
 assert.equal(glanceWeekChange(38,day,result,'all','flights',currentNow),null,'UI/profile disagreement is unavailable');
 for(const rows of [{scans:[]},{scans:[{...scan(),status:'ERROR'}]},{scans:[scan(),scan()]},{scans:[scan()],failed:3}]){
  const value=await readGlanceWeekReference(mockDb({profiles,...rows}) as never,day,currentNow);
  assert.equal(value.selectedFlights,null);assert.equal(value.selectedFlightSnapshot,undefined);assert.equal(value.passengers.all,3900);assert.equal(value.flights?.all,37);
 }
 const base=mockDb({profiles});
 const rejecting={prepare(sql:string){return sql.includes('FROM collector_runs c')?{bind:()=>({all:async()=>{throw new Error('witness transport unavailable');}})}:base.prepare(sql);}};
 const independent=await readGlanceWeekReference(rejecting as never,day,currentNow);assert.equal(independent.selectedFlights,null);assert.equal(independent.passengers.all,3900);
 const incompleteBaseline=profile();incompleteBaseline.profile.complete=false;
 const missing=await readGlanceWeekReference(mockDb({profiles:[profiles[0],{day:previousDay,payload:JSON.stringify(incompleteBaseline)}],scans:[scan()]}) as never,day,currentNow);
 assert.equal(missing.flights,null);assert.equal(glanceWeekChange(37,day,missing,'all','flights',currentNow),null);
 const future=await readGlanceWeekReference(mockDb({profiles}) as never,day,'2026-10-29T02:00:00Z');assert.equal(future.selectedFlights,null);
});
test('cached current-day snapshot expires at KST midnight and invalid clocks never fabricate a change',()=>{
 const ref={...reference(),selectedFlightSnapshot:{day,retrievedAt:scan().startedAt,provisional:true as const}};
 assert.ok(glanceWeekChange(40,day,ref,'all','flights',currentNow));
 for(const now of ['2026-10-30T15:00:00Z','not-a-date','2026-10-30T00:00:00Z'])assert.equal(glanceWeekChange(40,day,ref,'all','flights',now),null);
 for(const stamp of ['not-a-date','2026-10-29T01:00:00Z','2026-10-30T03:00:00Z'])assert.equal(glanceWeekChange(40,day,{...ref,selectedFlightSnapshot:{...ref.selectedFlightSnapshot,retrievedAt:stamp}},'all','flights',currentNow),null);
});
test('SQLite current-day witness seeks existing source/start and source-health indexes',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {readFileSync,readdirSync}=await import('node:fs');const sqlite=new DatabaseSync(':memory:');
 try{
  for(const path of readdirSync('drizzle').filter(path=>path.endsWith('.sql')).sort())sqlite.exec(readFileSync(`drizzle/${path}`,'utf8'));
  const plans:string[]=[];const db={prepare(sql:string){return {bind(...values:unknown[]){return {all:async()=>{plans.push(...sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all(...values as never[]).map(row=>String(row.detail)));return {success:true,results:[]};}};}};}};
  await readGlanceWeekReference(db as never,day,currentNow);
  assert.ok(plans.some(plan=>/SEARCH c USING INDEX collector_source_start_unique/.test(plan)),plans.join('\n'));
  assert.ok(plans.some(plan=>/SEARCH h USING INDEX/.test(plan)),plans.join('\n'));
  assert.ok(plans.every(plan=>!/^SCAN (?:airport_|c\b|h\b)/.test(plan)),plans.join('\n'));
 }finally{sqlite.close();}
});
