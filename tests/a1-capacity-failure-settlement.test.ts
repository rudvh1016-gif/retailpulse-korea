import assert from 'node:assert/strict';
import test from 'node:test';
import { knownA1Failure, settleKnownA1CapacityFailure } from '../lib/a1-capacity-failure-settlement';
import { A1_RECOVERY_WORKFLOW, A1_SOURCE } from '../lib/airport-midnight-recovery';
import type { OperationalMemory, StoredAttempt } from '../lib/operational-memory';

const expected=knownA1Failure;
const now='2026-11-22T14:00:00Z';
const proof={
  run:{id:expected.run,run_attempt:expected.attempt,status:'completed',conclusion:'failure',
    head_sha:expected.sha,path:'.github/workflows/collect-realtime.yml'},
  job:{id:expected.job,run_id:expected.run,run_attempt:expected.attempt,name:'airport_midnight_recovery / collect',
    status:'completed',conclusion:'failure',started_at:'2026-11-19T15:08:25Z',completed_at:'2026-11-19T15:11:48Z',
    steps:[{name:'Collect airport_recent (attempt 1)',conclusion:'failure'}]},
};

function fixture() {
  const record={
    sourceId:A1_SOURCE,logicalJob:A1_RECOVERY_WORKFLOW,attemptId:'old-execution-id|'+expected.child,
    targetDate:expected.targetDate,mode:'CONTROLLED',scheduledSlot:'00:07',
    failureClass:'MISSED_RUN',operation:'REDISPATCH_SAME_WORKFLOW',startedAt:'2026-11-19T15:09:00Z',
    completedAt:null,outcome:'RECOVERY_STARTED',providerRequests:null,
  } as StoredAttempt;
  let writes=0,missingReceipt=false;
  const memory:Pick<OperationalMemory,'attempts'|'openAttemptsWithoutReceipt'|'finish'>={
    async attempts(){return [record];},
    async openAttemptsWithoutReceipt(){return missingReceipt?[record.attemptId]:[];},
    async finish(id,at,verification,metrics){
      assert.equal(id,record.attemptId);assert.equal(at,proof.job.completed_at);
      assert.deepEqual(verification,{dataValid:false,storageValid:null,publicValid:null});
      assert.equal(metrics?.providerRequests,106);
      record.completedAt=at;record.outcome='RECOVERY_FAILED';record.providerRequests=106;
      writes++;
    },
  };
  return {memory,record,writes:()=>writes,removeReceipt:()=>{missingReceipt=true;}};
}

test('proof must be the failed historical attempt and completed collector from the same job',async()=>{
  const f=fixture();
  assert.equal(await settleKnownA1CapacityFailure(f.memory,{...proof,job:{...proof.job,run_attempt:2}},now,true,true),'UNVERIFIED_WORKFLOW');
  assert.equal(await settleKnownA1CapacityFailure(f.memory,{...proof,job:{...proof.job,status:'in_progress'}},now,true,true),'UNVERIFIED_WORKFLOW');
  assert.equal(await settleKnownA1CapacityFailure(f.memory,proof,now,false,true),'CURRENT_A1_NOT_VERIFIED');
  assert.equal(f.writes(),0);
});
test('the same receipt is previewed without writing and applied exactly once',async()=>{
  const f=fixture();
  assert.equal(await settleKnownA1CapacityFailure(f.memory,proof,now,true,false),'READY_TO_RECORD_FAILED_ATTEMPT');
  assert.equal(f.writes(),0);
  assert.equal(await settleKnownA1CapacityFailure(f.memory,proof,now,true,true),'RECORDED_FAILED_ATTEMPT');
  assert.equal(await settleKnownA1CapacityFailure(f.memory,proof,now,true,true),'ALREADY_RECORDED');
  assert.equal(f.writes(),1);
});
test('does not mistake an unreceipted or mismatched row for the historical child',async()=>{
  const f=fixture();
  f.removeReceipt();
  assert.equal(await settleKnownA1CapacityFailure(f.memory,proof,now,true,true),'RECEIPT_UNVERIFIED');
  f.record.targetDate='2026-11-21';
  assert.equal(await settleKnownA1CapacityFailure(f.memory,proof,now,true,true),'ATTEMPT_UNVERIFIED');
  assert.equal(f.writes(),0);
});
