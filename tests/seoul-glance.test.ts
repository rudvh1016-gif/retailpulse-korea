import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validGlanceForecasts,freshGlanceObservation,sameGlanceClocks,eventsOnGlanceDay,glancePaymentShares} from '../lib/seoul-glance';
const now='2026-10-09T10:00:00+09:00';
test('official forecasts require a fresh issue and a valid published horizon',()=>{
 const row={targetAt:'2026-10-09T11:00:00+09:00',issuedAt:now,congestionLevel:2};
 assert.equal(validGlanceForecasts([row],now).length,1);
 for(const invalid of [{...row,issuedAt:undefined},{...row,issuedAt:'2026-10-09T09:00:00+09:00'},
  {...row,targetAt:'2026-10-10T10:00:00+09:00'},{...row,congestionLevel:0},{...row,issuedAt:'invalid'}]){
  assert.equal(validGlanceForecasts([invalid],now).length,0);
 }
 assert.equal(validGlanceForecasts([row],now,true).length,0);
});
test('matching requires four fresh clocks; missing and stale cannot form a preference match',()=>{
 const row={observedAt:now,congestionLevel:1,freshness:'LIVE' as const};
 assert.equal(freshGlanceObservation(row,now),true);assert.equal(freshGlanceObservation({...row,freshness:'STALE'},now),false);
 assert.equal(freshGlanceObservation(null,now),false);
 assert.equal(sameGlanceClocks(Array.from({length:4},()=>({clock:now,valid:true}))),true);
 assert.equal(sameGlanceClocks([{clock:now,valid:true}]),false);
 assert.equal(sameGlanceClocks([{clock:now,valid:true},{clock:now,valid:true},{clock:now,valid:true},{clock:'different',valid:true}]),false);
});
test('events follow selected calendar date including end date; unknown dates remain unavailable',()=>{
 const rows=[{eventStart:'2026-10-08',eventEnd:'2026-10-09'},{eventStart:'2026-10-10',eventEnd:null},{eventStart:'unknown',eventEnd:null}];
 assert.deepEqual(eventsOnGlanceDay(rows,'2026-10-09'),[rows[0]]);
});
test('shares use published payment counts; absent/invalid values are excluded and zero stays zero',()=>{
 const rows=[{category:'cafe',payments:3},{category:'food',payments:1},{category:'missing',payments:null},{category:'zero',payments:0},{category:'fraction',payments:.5}];
 const result=glancePaymentShares(rows);assert.deepEqual(result.map(row=>[row.category,row.share]),[['cafe',75],['food',25]]);
 assert.deepEqual(glancePaymentShares([{category:'zero',payments:0}]),[]);
});
