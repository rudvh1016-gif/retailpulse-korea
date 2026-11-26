import test from 'node:test';
import assert from 'node:assert/strict';
import {buildShiftBriefing, type ShiftBriefingInput} from '../lib/shift-briefing';
import {captureBriefingSnapshot} from '../lib/personal-tools/briefing-snapshot';

const pattern = {id:'morning',label:'오전',terminal:'T2' as const,side:null,open:'07:00',close:'15:00'};
const capturedAt = '2026-11-12T04:00:00Z';
const input: ShiftBriefingInput = {
  day:'2026-11-12',nowIso:capturedAt,terminal:'T2',side:null,hours:{open:'07:00',close:'15:00'},history:[],
  flights:{mode:'live-flights',truncated:false,serviceDateKst:'2026-11-12',retrievedAt:'2026-11-12T01:00:00Z',basis:'COLLECTED_FLIGHT_RECORDS',flights:[
    {physicalFlightId:'A',flightNumber:'A',direction:'departure',terminal:'T2',gate:'250',airportCode:'NRT',scheduledAt:'2026-11-12T08:00:00+09:00',retrievedAt:'2026-11-12T01:00:00Z',status:'scheduled'},
  ]},checkedAt:'2026-11-12T01:30:00Z',
  weekReference:{day:'2026-11-12',previousDay:'2026-11-05',passengers:{all:null,T1:null,T2:null},flights:null,selectedFlights:{all:1,T1:0,T2:1,CONCOURSE:0},selectedFlightSnapshot:{day:'2026-11-12',retrievedAt:'2026-11-12T01:00:00Z',provisional:true}},
};
test('journal captures actual selected briefing metrics, original source clocks and an independent copy',()=>{
  const briefing=buildShiftBriefing(input);
  const snapshot=captureBriefingSnapshot(briefing,pattern,capturedAt);
  assert.equal(snapshot.day,'2026-11-12');
  assert.equal(snapshot.capturedAt,capturedAt);
  assert.equal(snapshot.total,1);
  assert.equal(snapshot.confirmed,1);
  assert.equal(snapshot.retrievedAt,'2026-11-12T01:00:00Z');
  assert.equal(snapshot.checkedAt,'2026-11-12T01:30:00Z');
  assert.deepEqual(snapshot.topDestinations,[{country:'JP',flights:1}]);
  briefing.current.total=900;
  briefing.current.destinations!.countries[0].flights=900;
  assert.equal(snapshot.total,1);
  assert.equal(snapshot.topDestinations?.[0].flights,1);
});
test('missing and overnight briefing snapshots retain their actual unavailable reason, never zero',()=>{
  const missing=captureBriefingSnapshot(buildShiftBriefing({...input,flights:null}),pattern,capturedAt);
  assert.equal(missing.total,null);
  assert.equal(missing.reason,'READ_FAILED');
  const overnight={...pattern,open:'23:00',close:'02:00'};
  const result=captureBriefingSnapshot(buildShiftBriefing({...input,hours:overnight}),overnight,capturedAt);
  assert.equal(result.total,null);
  assert.equal(result.reason,'UNSUPPORTED_OVERNIGHT');
});
test('a snapshot rejects a mismatched selected scope or invalid capture clock',()=>{
  const result=buildShiftBriefing(input);
  assert.throws(()=>captureBriefingSnapshot(result,{...pattern,terminal:'T1'},capturedAt));
  assert.throws(()=>captureBriefingSnapshot(result,{...pattern,open:'08:00'},capturedAt));
  assert.throws(()=>captureBriefingSnapshot(result,pattern,'invalid'));
});
