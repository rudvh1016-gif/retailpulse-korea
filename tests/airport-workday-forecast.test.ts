import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastForTomorrowShift as forecast, tomorrowKst} from '../lib/airport-workday-forecast';
import {homeCheckpointFallback, CHECKPOINT_OFFICIAL_WAIT_URLS} from '../lib/airport-home-wait';
import type {QueueHeatReading} from '../lib/airport-queue-heat';

const today='2026-11-23', day='2026-11-24', now='2026-11-23T12:10:00+09:00';
const band=(hour:number,expectedPassengers:number)=>({
 targetStartAt:new Date(Date.parse(day+'T00:00:00+09:00')+hour*3600000).toISOString(),
 targetEndAt:new Date(Date.parse(day+'T00:00:00+09:00')+(hour+1)*3600000).toISOString(),expectedPassengers,
});
const timeline=[band(10,200),band(11,100),band(12,300),band(13,300),band(14,100),band(15,130)];
const summary={serviceDateKst:day, airport:{ serviceDateKst:day, passengerForecastRetrievedAtByTerminal:{T2:now}, forecastCoverage:{byTerminal:{T1:'PARTIAL',T2:'COMPLETE'}},passengerForecastTimelineByTerminal:{T1:timeline,T2:timeline}}};
const shift={open:'10:30',close:'15:30'};
const forecastForTomorrowShift=(...args:Parameters<typeof forecast>)=>forecast(...args);

test('tomorrow follows KST rollover and month boundary',()=>{
 assert.equal(tomorrowKst('2026-11-30T14:59:59Z'),'2026-12-01');
 assert.equal(tomorrowKst('2026-11-30T15:00:00Z'),'2026-12-02');
 assert.equal(tomorrowKst('bad'),null);
});
test('compares only fully contained hours; ignores both partial edges even when they would win',()=>{
 const result=forecastForTomorrowShift(day,'T2',shift,{...summary,airport:{...summary.airport,passengerForecastTimelineByTerminal:{T2:[band(16,0),...timeline.slice(1,-1).reverse(),band(10,900),band(15,0),band(9,900)]}}},now);
 assert.deepEqual(result?.busiest,[band(12,300),band(13,300)]);
 assert.deepEqual(result?.quietest,[band(11,100),band(14,100)]);
 assert.equal(forecastForTomorrowShift(day,'T2',{open:'10:00',close:'12:00'},summary,now)?.busiest[0]?.expectedPassengers,200);
});
test('does not rank wrong date/terminal, partial, incomplete, duplicate, flat, single or overnight',()=>{
 assert.equal(forecastForTomorrowShift(today,'T2',shift,summary,now),null);
 assert.equal(forecastForTomorrowShift(day,'T1',shift,summary,now),null);
 assert.equal(forecastForTomorrowShift(day,'T2',{open:'23:00',close:'02:00'},summary,now),null);
 assert.equal(forecastForTomorrowShift(day,'T2',{open:'10:15',close:'10:50'},summary,now),null);
 assert.equal(forecastForTomorrowShift(day,'T2',{open:'10:30',close:'11:30'},summary,now),null);
 assert.equal(forecastForTomorrowShift(day,'T2',{open:'10:30',close:'12:30'},summary,now),null);
 for (const t of [timeline.slice(2),[...timeline,band(13,0)],timeline.map((_,i)=>band(10+i,100)),timeline.map((b,i)=>i===4?{...b,expectedPassengers:-1}:b)])
  assert.equal(forecastForTomorrowShift(day,'T2',shift,{...summary,airport:{...summary.airport,passengerForecastTimelineByTerminal:{T2:t}}},now),null);
});
test('requires a verified per-terminal retrieval within 30 hours, never a retained refresh failure',()=>{
 const at=(hours:number)=>new Date(Date.parse(now)-hours*3600000).toISOString();
 const withStamp=(stamp:string|null)=>({...summary,airport:{...summary.airport,passengerForecastRetrievedAtByTerminal:{T1:now,T2:stamp}}});
 assert.ok(forecastForTomorrowShift(day,'T2',shift,withStamp(at(30)),now));
 for(const stamp of [null,at(30.000001),'2026-11-23',at(-1)])
  assert.equal(forecastForTomorrowShift(day,'T2',shift,withStamp(stamp),now),null);
 assert.equal(forecastForTomorrowShift(day,'T2',shift,{...summary,clientRefresh:{failedAt:now}},now),null);
 assert.equal(forecastForTomorrowShift(day,'T2',shift,summary,'2026-11-24T00:00:00+09:00'),null);
});
const row=(terminal:'T1'|'T2',observedAt:string,extra:Partial<QueueHeatReading>={}):QueueHeatReading=>({terminal,zone:terminal==='T1'?'DG2_W':'DG1_A',waitTimeMinutes:5,observedAt,freshness:'LIVE',...extra});
test('home fallback shows latest stale provider time only, no false clock for missing, invalid or failed',()=>{
 const at='2026-11-23T11:49:59+09:00';
 const rows=[row('T1',at),row('T1','2026-11-23T09:05:00+09:00'),row('T2','2026-11-23T12:11:00+09:00')];
 assert.deepEqual(homeCheckpointFallback('T1',rows,Date.parse(now)),{observedAt:at});
 assert.deepEqual(homeCheckpointFallback('T2',rows,Date.parse(now)),{observedAt:null});
 assert.deepEqual(homeCheckpointFallback('T2',[row('T2','bad'),row('T2','2026-11-23')],Date.parse(now)),{observedAt:null});
 assert.deepEqual(homeCheckpointFallback('T2',[row('T2',at,{collectionStatus:'FAILED'})],Date.parse(now)),{observedAt:null});
 assert.equal(homeCheckpointFallback('T1',[...rows,row('T1','2026-11-23T11:50:00+09:00')],Date.parse(now)),null);
 assert.deepEqual(CHECKPOINT_OFFICIAL_WAIT_URLS,{T1:'https://www.airport.kr/ap_ko/6651/subview.do',T2:'https://business.airport.kr/ap_ko/6652/subview.do'});
});
