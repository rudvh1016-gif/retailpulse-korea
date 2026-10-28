import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildTodayProfile} from '../lib/airport-period/today.mjs';
const fixture=JSON.parse(readFileSync('e2e/fixtures/airport-focus/flights.json','utf8'));
test('today profile retains proven terminal totals and a provisional source timestamp',()=>{
 const result=buildTodayProfile(fixture,'2026-10-19');
 assert.equal(result.provisional,true);assert.equal(result.date,'2026-10-19');
 assert.equal(result.T1,301);assert.equal(result.T2,266);
 assert.equal(result.h1.reduce((a,b)=>a+b,0),result.T1);assert.equal(result.h2.reduce((a,b)=>a+b,0),result.T2);
 assert.equal(result.retrievedAt,fixture.retrievedAt);assert.equal(result.basis,fixture.basis);
});
test('unknown buildings and empty days cannot become a complete profile',()=>{
 assert.throws(()=>buildTodayProfile({...fixture,flights:[]},'2026-10-19'),/incomplete/);
 const row={...fixture.flights[0],terminal:null,gate:null};
 assert.throws(()=>buildTodayProfile({...fixture,flights:[row]},'2026-10-19'),/incomplete/);
});
test('today chunk has a content-addressed name referenced by the runtime',()=>{
 const runtime=readFileSync('public/airport-period/runtime.js','utf8');
 const name=runtime.match(/today-[0-9a-f]{12}\.js/)?.[0];assert.ok(name);
 const bytes=readFileSync('public/airport-period/'+name);
 assert.equal(name,'today-'+createHash('sha256').update(bytes).digest('hex').slice(0,12)+'.js');
});
