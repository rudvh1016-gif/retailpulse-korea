import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {airportEvidenceField,airportPublicationDiagnostic,airportResponseCacheEvidence,inspectAirportRecoveryToday} from '../lib/airport-recovery-verification.ts';
import {airportPublicationExpectation,matchPublicEvidence} from '../lib/operational-evidence.ts';

const NOW='2026-11-06T15:42:26.000Z',DAY='2026-11-07',STAMP='2026-11-06T15:39:00.170Z';
const sample=[['a','T1','29'],['b','CONCOURSE','101']].map(([physicalFlightId,terminal,gate])=>({
  physicalFlightId,terminal,gate,retrievedAt:STAMP,scheduledAt:`${DAY}T09:00:00+09:00`,schema_version:'airport-v1',quality_status:'VALID'}));
const measured=()=>({sourceId:'INCHEON_FLIGHT_DETAIL',observedAt:NOW,dataValid:true,storageValid:true,publicValid:null,
  coverage:'COMPLETE',sample:structuredClone(sample)});
const body=()=>({mode:'live-summary',serviceDateKst:DAY,generatedAt:'2026-11-06T15:42:00.000Z',airport:{
  departuresTrackedToday:2,departuresTrackedTodayRetrievedAt:STAMP,departuresTrackedTodayByTerminal:{T1:1,CONCOURSE:1},
  flightScope:{total:2,T1:1,T2:0,CONCOURSE:1,other:0,unassigned:0,conflicting:0,capped:false}}});
function dbFixture(rows=sample) {
  const calls=[];
  return {calls,prepare(sql){calls.push(sql);const stmt={bind(){return stmt;},
    async first(){
      if(sql.includes('FROM collector_runs'))return {run_id:'run',status:'SUCCESS',started_at:STAMP,finished_at:'2026-11-06T15:42:08.000Z'};
      if(sql.includes('source_health'))return {status:'LIVE',last_retrieved_at:STAMP,schema_version:'airport-v1'};
      if(sql.includes('airport_flights'))return {physical_flight_id:'a'};
      throw Error('unexpected SELECT');
    },async all(){return {success:true,results:rows};},
    async run(){return {success:true,results:[{detail:`recent 2026-11-04..${DAY}; complete`}]};}};return stmt;}};
}

test('one shared expectation preserves exact total/time/terminal/scope and identifies mismatch fields',()=>{
  assert.equal(airportPublicationExpectation(measured()).total,2);
  assert.equal(matchPublicEvidence(measured(),body()),true);
  const cases=[['serviceDate',b=>b.serviceDateKst='2026-11-06',null],
    ['total',b=>b.airport.departuresTrackedToday=1,false],
    ['retrievedAt',b=>b.airport.departuresTrackedTodayRetrievedAt='2026-11-05T15:39:00.170Z',false],
    ['terminalCounts',b=>b.airport.departuresTrackedTodayByTerminal.T1=0,false],
    ['terminalKeys',b=>delete b.airport.departuresTrackedTodayByTerminal.CONCOURSE,false],
    ['scope.CONCOURSE',b=>b.airport.flightScope.CONCOURSE=0,false],
    ['capped',b=>b.airport.flightScope.capped=true,false]];
  for(const [field,mutate,verdict] of cases){const actual=body();mutate(actual);
    assert.equal(matchPublicEvidence(measured(),actual),verdict,field);
    assert.ok(airportPublicationDiagnostic(measured(),actual).mismatches.includes(field),field);
  }
  const matched=airportPublicationDiagnostic(measured(),body());
  assert.deepEqual(matched.mismatches,[]);
  assert.deepEqual(matched.notApplicable,['terminal.T2']);
  assert.ok(!matched.unmeasured.includes('terminal.T2'));
  assert.equal(matched.expected.retrievedAt.value,STAMP,'timestamps retain exact text, not normalized equality');
});
test('missing, null, zero and invalid values differ and arbitrary payload/header strings are withheld',()=>{
  assert.equal(airportEvidenceField(undefined).kind,'missing');
  assert.equal(airportEvidenceField(null).kind,'null');
  assert.equal(airportEvidenceField(0).value,0);
  const secret='private-response-marker-not-for-logs';
  const actual=body();actual.mode=secret;actual.generatedAt=secret;
  actual.airport.departuresTrackedTodayByTerminal[secret]=secret;
  actual.airport.departuresTrackedTodayRetrievedAt=secret;
  const response=new Response('',{headers:{'cache-control':secret,'cf-cache-status':secret,'set-cookie':secret,'authorization':secret}});
  const text=JSON.stringify({diagnostic:airportPublicationDiagnostic(measured(),actual),cache:airportResponseCacheEvidence(response)});
  assert.ok(!text.includes(secret));assert.ok(!text.includes('authorization'));assert.ok(!text.includes('set-cookie'));
  assert.equal(airportPublicationDiagnostic(measured(),actual).published.otherTerminalKeyCount,1);
});
test('bounded read-only inspection captures observed cache metadata but leaves a mismatched result false',async()=>{
  const db=dbFixture(),events=[];let requests=0;
  const stale=body();stale.airport.departuresTrackedTodayRetrievedAt='2026-11-05T15:39:00.170Z';
  const result=await inspectAirportRecoveryToday(db,DAY,NOW,async(url,init)=>{
    requests++;assert.equal(url,'https://koretaildata.com/api/live/summary');
    assert.equal(init.redirect,'error');assert.ok(init.signal);assert.equal(init.headers,undefined);
    return Response.json(stale,{headers:{age:'232','cf-cache-status':'UPDATING','cache-control':'public, max-age=60, stale-while-revalidate=300'}});
  },e=>events.push(e));
  assert.deepEqual(result.verification,{dataValid:true,storageValid:true,publicValid:false});
  assert.equal(requests,1);assert.equal(events.length,1);
  assert.deepEqual(result.evidence.mismatches,['retrievedAt']);
  assert.equal(result.evidence.publicRequest.cache.ageSeconds,232);
  assert.equal(result.evidence.publicRequest.cache.maxAgeSeconds,60);
  assert.equal(result.evidence.publicRequest.cache.staleWhileRevalidateSeconds,300);
  assert.equal(result.evidence.collector.finishedAt.value,'2026-11-06T15:42:08.000Z');
  assert.equal(result.evidence.sourceHealth.lastRetrievedAt.value,STAMP);
  assert.ok(db.calls.every(sql=>/^SELECT\b/.test(sql)));
});
test('HTTP and transport failures retain errors, one attempt, and safe diagnostic stage',async()=>{
  for(const mode of ['http','transport']){
    const events=[];let calls=0;
    await assert.rejects(inspectAirportRecoveryToday(dbFixture(),DAY,NOW,async()=>{
      calls++;if(mode==='transport')throw Error('private-exception-marker');
      return new Response('private-body-marker',{status:503});
    },e=>events.push(e)));
    assert.equal(calls,1);assert.equal(events[0].stage,'public_read');
    assert.ok(!JSON.stringify(events).includes('private-'));
  }
});
test('unusable/wrong-date public evidence stays unmeasured, not zero or a different-day count mismatch',async()=>{
  for(const value of [null,[],{mode:'degraded'},{...body(),serviceDateKst:'2026-11-06'}]){
    const result=await inspectAirportRecoveryToday(dbFixture(),DAY,NOW,async()=>Response.json(value));
    assert.equal(result.verification.publicValid,null);
    assert.equal(result.evidence.comparisons.total,null);
    assert.ok(result.evidence.unmeasured.includes('total'));
  }
});
test('invalid data, cap, wrong target and diagnostic transport failure do not grant a false pass',async()=>{
  const invalid=structuredClone(sample);invalid[0].schema_version='';
  for(const rows of [invalid,Array.from({length:2000},()=>sample[0])]){
    let calls=0;const result=await inspectAirportRecoveryToday(dbFixture(rows),DAY,NOW,async()=>{calls++;throw Error('must not fetch');});
    assert.equal(calls,0);assert.equal(result.verification.publicValid,null);
  }
  const db=dbFixture();let calls=0;
  const wrong=await inspectAirportRecoveryToday(db,'2026-11-06',NOW,async()=>{calls++;});
  assert.equal(db.calls.length,0);assert.equal(calls,0);assert.equal(wrong.evidence.reason,'TARGET_DATE_MISMATCH');
  const good=await inspectAirportRecoveryToday(dbFixture(),DAY,NOW,async()=>Response.json(body()),()=>{throw Error('logger failed');});
  assert.equal(good.verification.publicValid,true);
});
test('manual diagnostic is selected only, reuses permissions, and cannot record or recover',async()=>{
  const yaml=await readFile(new URL('../.github/workflows/operational-memory.yml',import.meta.url),'utf8');
  assert.match(yaml,/if: inputs.mode != 'inspect_a1'/);
  assert.match(yaml,/if: inputs.mode == 'inspect_a1'/);
  assert.match(yaml,/inputs.mode != 'recover' && inputs.mode != 'inspect_a1'/);
  const script=await readFile(new URL('../scripts/inspect-airport-recovery.ts',import.meta.url),'utf8');
  assert.match(script,/LIMIT 10/);assert.doesNotMatch(script,/\.finish\(|\.recordEvent\(|\.admit\(|collectA1|DATA_GO_KR|SEOUL_OPEN_DATA|UPDATE |INSERT |DELETE /);
  assert.match(script,/rowsWritten!==before.rowsWritten/);
});
