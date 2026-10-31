import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {dailyFlightHours, latestDayFlights, terminalFlightHours} from '../lib/airport-flight-hours.ts';
import {dailyFlightProfile} from '../lib/airport-day-profile.ts';
import {terminalDay} from '../lib/airport-day-compare.ts';
import {buildTodayProfile} from '../lib/airport-period/today.mjs';
const day='2026-10-19';
const row=(id,overrides={})=>({physicalFlightId:id,terminal:'T1',gate:'9',scheduledAt:day+'T12:00:00+09:00',retrievedAt:day+'T01:00:00Z',status:'scheduled',...overrides});
test('latest physical row selection preserves tie order, day filter and cancellation',()=>{
 const first=row('tie'),equal=row('tie',{terminal:'T2'});
 const rows=[first,equal,row('cancel'),row('cancel',{status:'cancelled',retrievedAt:day+'T02:00:00Z'}),row('wrong-day',{scheduledAt:'2026-10-18T12:00:00+09:00'}),row(null)];
 assert.equal(latestDayFlights(rows,day).get('tie'),first);
 const result=dailyFlightHours(rows,day);assert.equal(result.T1.total,1);assert.equal(result.T2.total,0);assert.equal(result.cancelled,1);
 assert.equal(result.T1.hours[12],1);
});
test('boarding area and T1+concourse retain explicit terminal precedence and unknowns',()=>{
 const result=dailyFlightHours([row('a',{terminal:null,gate:'101'}),row('b',{terminal:'T2',gate:'101'}),row('c',{terminal:null,gate:'101A'})],day);
 assert.equal(result.CONCOURSE.total,1);assert.equal(result.T2.total,1);assert.equal(result.unknownBuilding,1);
 assert.equal(terminalFlightHours(result,'T1').total,1);
 assert.throws(()=>buildTodayProfile({flights:[row('c',{terminal:null,gate:'101A'})]},day),/incomplete/);
});
test('lightweight totals/hours equal the full profile and terminal view for real fixture and adversarial rows',()=>{
 const fixture=JSON.parse(readFileSync('e2e/fixtures/airport-focus/flights.json','utf8'));
 const cases=[fixture.flights,[],[row('a',{scheduledAt:day+'Txx:00:00+09:00'}),row('b',{terminal:'T2',scheduledAt:day+'T24:00:00+09:00'})]];
 for(const rows of cases){
  const before=structuredClone(rows), light=dailyFlightHours(rows,day),full=dailyFlightProfile(rows,day,false);
  for(const area of ['T1','T2','CONCOURSE'])assert.deepEqual(light[area],{total:full[area].total,hours:full[area].hours});
  for(const terminal of ['T1','T2']){const view=terminalDay(full,terminal);assert.deepEqual(terminalFlightHours(light,terminal),{total:view.total,hours:view.hours});}
  assert.equal(light.cancelled,full.cancelled);assert.equal(light.unknownBuilding,full.unknownBuilding);assert.deepEqual(rows,before);
 }
});
test('today dependency graph contains no side/destination configuration or full profile',async()=>{
 const result=await build({entryPoints:['lib/airport-period/today.mjs'],bundle:true,minify:true,format:'esm',target:'es2022',write:false,metafile:true,logLevel:'silent'});
 const inputs=Object.keys(result.metafile.inputs);
 assert.deepEqual(inputs.sort(),['lib/airport-flight-hours.ts','lib/airport-period/today.mjs','lib/flight-scope.ts'].sort());
 assert.ok(result.outputFiles[0].contents.length<10000,'today remains a lightweight counts-only module');
});
