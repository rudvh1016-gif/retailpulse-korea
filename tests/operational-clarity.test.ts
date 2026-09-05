import assert from 'node:assert/strict';
import test from 'node:test';
import {flightScopeCounts} from '../lib/flight-scope';
import {predictionReadiness,predictionScore} from '../lib/prediction-progress';
import {seoulContextTime} from '../lib/seoul-context';
import {nextSourceWindow,publicFailureReason} from '../lib/source-status';
import {selectNextBand} from '../lib/terminal-briefing';

test('physical departure partition reconciles without guessing missing terminals',()=>{
 const rows=[{physicalFlightId:'a',terminal:'T1'},{physicalFlightId:'a',terminal:'T1'},
 {physicalFlightId:'b',terminal:'T2'},{physicalFlightId:'c',terminal:null},
 {physicalFlightId:'d',terminal:'P02'},{physicalFlightId:'e',terminal:'T1'},{physicalFlightId:'e',terminal:'T2'}];
 const counts=flightScopeCounts(rows);
 assert.deepEqual(counts,{total:5,T1:1,T2:1,other:1,unassigned:1,conflicting:1});
 assert.equal(counts.total,counts.T1+counts.T2+counts.other+counts.unassigned+counts.conflicting);
});
test('next means future at the hour boundary and near midnight, never current',()=>{
 const bands=[16,17,23].map(hour=>({targetStartAt:`2026-09-05T${hour}:00:00+09:00`,targetEndAt:hour===23?'2026-09-06T00:00:00+09:00':`2026-09-05T${hour+1}:00:00+09:00`,expectedPassengers:100}));
 for(const time of ['16:00:00','16:53:00'])assert.equal(selectNextBand(bands,`2026-09-05T${time}+09:00`,'TODAY')?.targetStartAt,'2026-09-05T17:00:00+09:00');
 assert.equal(selectNextBand(bands,'2026-09-05T23:53:00+09:00','TODAY'),null);
});
test('readiness needs matching weekdays, hour and source definition, not any two observed days',()=>{
 const progress=predictionReadiness([{day:'2026-08-30',eligible:'10:v1,11:v1,12:v1'}, {day:'2026-08-23',eligible:'10:v1,12:v2'}, {day:'2026-08-24',eligible:'11:v1'}],'2026-09-06');
 assert.equal(progress.hours[10].ready,true);
 assert.equal(progress.hours[11].missingWeeks,1);
 assert.equal(progress.hours[12].compatible,false);
 assert.equal(progress.hours[12].ready,false);
 assert.equal(progress.hours[13].missingWeeks,2);
});
test('scorecard counts prospective matched observations only and computes absolute error',()=>{
 const base={targetAt:'2026-09-05T10:00:00+09:00',predicted:1000,actual:1200,createdAt:'2026-09-04T09:30:00Z',actualAt:'2026-09-05T10:05:00+09:00'};
 const score=predictionScore([base,{...base,targetAt:'2026-09-05T11:00:00+09:00',predicted:1300}, {...base,actual:null}, {...base,createdAt:'2026-09-06T00:00:00Z'}]);
 assert.equal(score.meanAbsoluteError,150);assert.equal(score.matchedHours,2);assert.equal(score.matchedDays,1);assert.equal(score.pendingHours,1);
 assert.equal(predictionScore([]).meanAbsoluteError,null);
});
test('commercial compact timestamps and absent timestamps remain distinct',()=>{
 assert.equal(seoulContextTime('20260905 1620'),'2026-09-05T16:20:00+09:00');
 assert.equal(seoulContextTime(undefined),null);
});
test('nominal source schedules roll over KST correctly and failure text never leaks raw details',()=>{
 assert.equal(nextSourceWindow('KASI_PUBLIC_HOLIDAYS','2026-09-05T00:00:00Z'),'2026-09-05T10:07:00+09:00');
 assert.equal(nextSourceWindow('KTO_TOURAPI_EVENT','2026-09-05T07:00:00Z'),'2026-09-06T06:07:00+09:00');
 assert.equal(nextSourceWindow('unknown','2026-09-05T07:00:00Z'),null);
 assert.equal(publicFailureReason('failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT'),'NETWORK');
 assert.equal(publicFailureReason('arbitrary private detail'),'OTHER');
});
