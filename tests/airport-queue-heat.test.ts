import assert from 'node:assert/strict';
import {test} from 'node:test';
import {queueHeat, queueHeatLabel, type QueueHeatReading} from '../lib/airport-queue-heat';

const at = Date.parse('2026-10-06T13:10:00Z');
const reading: QueueHeatReading = {terminal:'T2', zone:'DG1_A', waitTimeMinutes:6, waitTimeRaw:'6', observedAt:'2026-10-06T13:07:00Z', freshness:'LIVE'};

test('T2 contract boundaries: 6 minutes is clear, heat begins at 40, 60+ remains a lower bound', () => {
  for (const [minutes, level] of [[6,'clear'],[19,'clear'],[20,'normal'],[39,'normal'],[40,'busy'],[59,'busy'],[60,'very-busy'],[120,'very-busy']] as const) {
    assert.deepEqual(queueHeat({...reading,waitTimeMinutes:minutes,waitTimeRaw:String(minutes)},at),{level,state:'current'});
  }
  const range = {...reading,waitTimeMinutes:null,waitTimeRaw:'60+'};
  assert.equal(queueHeat(range,at).level,'very-busy');
  assert.equal(range.waitTimeMinutes,null);
  assert.equal(range.waitTimeRaw,'60+');
});
test('a reported zero is neutral and an old closure is a past observation',()=>{
 assert.deepEqual(queueHeat({...reading,waitTimeMinutes:0,waitTimeRaw:'0'},at),{level:'neutral',state:'zero'});
 assert.deepEqual(queueHeat({...reading,waitTimeRaw:'closed',freshness:'STALE'},at),{level:'neutral',state:'stale'});
 assert.match(queueHeatLabel({level:'neutral',state:'zero'},'ko'),/운영 여부/);
});

test('absent, closed, stale, future and malformed observations never indicate congestion', () => {
  const cases: Array<[Partial<QueueHeatReading>,string]> = [
    [{waitTimeMinutes:null,waitTimeRaw:null},'missing'],
    [{waitTimeMinutes:80,waitTimeRaw:'운영 안 함'},'closed'],
    [{waitTimeMinutes:80,waitTimeRaw:'closed'},'closed'],
    [{waitTimeMinutes:80,waitTimeRaw:'80',freshness:'STALE'},'stale'],
    [{observedAt:'2026-10-06T12:49:59Z'},'stale'],
    [{observedAt:'2026-10-06T13:10:01Z'},'unavailable'],
    [{observedAt:'unreadable'},'unavailable'],
    [{freshness:'ERROR'},'unavailable'],
    [{waitTimeMinutes:-1,waitTimeRaw:null},'missing'],
    [{waitTimeMinutes:NaN,waitTimeRaw:null},'missing'],
    [{waitTimeMinutes:80,waitTimeRaw:'20–40'},'missing'],
  ];
  for(const [patch,state] of cases) assert.deepEqual(queueHeat({...reading,...patch},at),{level:'neutral',state});
  assert.equal(queueHeat({...reading,observedAt:'2026-10-06T12:50:00Z'},at).level,'clear');
});

test('T1 and unverified checkpoint IDs do not inherit T2 categories', () => {
  assert.deepEqual(queueHeat({...reading,terminal:'T1',zone:'P01',waitTimeMinutes:80,waitTimeRaw:'80'},at),{level:'neutral',state:'unverified'});
  assert.deepEqual(queueHeat({...reading,zone:'DG3_A'},at),{level:'neutral',state:'unverified'});
});

test('all supported languages and fallback have readable labels for every state', () => {
  for(const lang of ['ko','en','zh','ja','unsupported']) {
    for(const level of ['clear','normal','busy','very-busy'] as const) assert.ok(queueHeatLabel({level,state:'current'},lang));
    for(const state of ['stale','missing','closed','unverified','unavailable'] as const) assert.ok(queueHeatLabel({level:'neutral',state},lang));
  }
  assert.equal(queueHeatLabel({level:'clear',state:'current'},'unsupported'),'Smooth');
});

test('T1 canonical summary IDs and display aliases use the approved minute criteria',()=>{
 for(const zone of ['DG2_E','DG2_W','DG3_E','DG3_W','DG4_E','DG4_W','DG5_E','DG5_W','3W'])for(const [minutes,level] of [[6,'clear'],[35,'normal'],[40,'busy'],[60,'very-busy']] as const){
  assert.deepEqual(queueHeat({...reading,terminal:'T1',zone,waitTimeMinutes:minutes,waitTimeRaw:String(minutes)},at),{level,state:'current',basis:'KORETAIL_MINUTES'});
 }
 for(const zone of ['DG1_E','DG6_W','DG3_A','DG7_W','P01'])assert.deepEqual(queueHeat({...reading,terminal:'T1',zone},at),{level:'neutral',state:'unverified'});
 for(const patch of [{freshness:'STALE'},{waitTimeRaw:'운영 안 함'},{waitTimeMinutes:null,waitTimeRaw:null},{observedAt:'2026-10-06T13:11:00Z'}])assert.equal(queueHeat({...reading,terminal:'T1',zone:'DG3_W',...patch},at).level,'neutral');
});
