import test from 'node:test';
import assert from 'node:assert/strict';
import {fromSummary,readExistingSummary} from '../lib/seoul-flow-data.mjs';
const block=(n)=>({subwayRidership:{referenceDate:'2026-10-07',boardingCount:n,alightingCount:0,selectedStations:'Selected station',datasetId:'OA-22723',retrievedAt:'2026-10-08T00:55:00Z'},foreignPresence:{qualityStatus:'VALID',value:n,referenceAt:'2026-08-26T23:00:00+09:00',productVersion:'OA-23018',retrievedAt:'2026-09-28T00:17:00Z'},foreignPurposeMobility:{referenceDate:'2026-09-30',tourism:n,datasetId:'OA-22378',retrievedAt:'2026-10-06T01:43:00Z'}});
test('switching districts selects their own values and keeps independent reporting periods',()=>{
 const keys=['myeongdong','hongdae','seongsu','itaewon'];
 const summary={generatedAt:'2026-10-09T00:34:00Z',areas:Object.fromEntries(keys.map((k,i)=>[k,block(i)]))};
 keys.forEach((area,i)=>{const d=fromSummary(summary,area);assert.equal(d.station.boardingCount,i);assert.equal(d.station.alightingCount,0);assert.equal(d.foreignLivingPopulation.value,i);assert.equal(d.station.referenceDate,'2026-10-07');assert.equal(d.foreignLivingPopulation.referenceAt,'2026-08-26T23:00:00+09:00');assert.equal(d.tourismPurposeMovement.referenceDate,'2026-09-30');assert.equal(d.tourismPurposeMovement.releaseMonth,null);assert.equal(d.tourismPurposeMovement.originalUnit,null);assert.equal(d.tourismPurposeMovement.unitVerified,false)});
 assert.equal(fromSummary(null,'seongsu').station,null);
});
test('invalid values or source quality remain missing and publication month is separate metadata',()=>{
 const b=block(-1);b.foreignPresence.qualityStatus='INVALID';b.foreignPurposeMobility.tourism=NaN;
 const d=fromSummary({areas:{itaewon:b}},'itaewon',{releaseMonth:'2026-09'});
 assert.equal(d.station.boardingCount,null);assert.equal(d.foreignLivingPopulation,null);assert.equal(d.tourismPurposeMovement.value,null);assert.equal(d.tourismPurposeMovement.releaseMonth,'2026-09');assert.equal(d.tourismPurposeMovement.referenceDate,'2026-09-30');
});
test('reader uses the existing same-origin API and fails without falling back to the review snapshot',async()=>{
 globalThis.window={location:{origin:'http://127.0.0.1:4183'}};const oldFetch=globalThis.fetch;let observed;
 try {globalThis.fetch=async(url)=>{observed=String(url);return {ok:true,json:async()=>({areas:{seongsu:block(7)}})}};
  assert.equal((await readExistingSummary({area:'seongsu',date:'2026-10-08'})).station.boardingCount,7);assert.match(observed,/\/api\/live\/summary\?date=2026-10-08$/);
  globalThis.fetch=async()=>({ok:false,status:503});await assert.rejects(readExistingSummary(),/summary_http_503/);await assert.rejects(readExistingSummary({endpoint:'https://unrelated.example/api'}),/same_origin/);
 }finally{globalThis.fetch=oldFetch;delete globalThis.window}
});