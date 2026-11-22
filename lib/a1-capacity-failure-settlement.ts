import type { OperationalMemory } from './operational-memory';
import { A1_RECOVERY_WORKFLOW, A1_SOURCE } from './airport-midnight-recovery';

export const knownA1Failure = {
  run: 44551281640,
  job: 135655808036,
  attempt: 1,
  targetDate: '2026-11-20',
  sha: 'c7f876a43a066e64b5f83f45d2735fc50b5509a9',
  child: 'a1-direct-44551281640-1-airport_midnight_recovery-collect-c7f876a43a066e64b5f83f45d2735fc50b5509a9',
  providerRequests: 106,
} as const;

type WorkflowProof = {
  id: number; run_attempt: number; status: string; conclusion: string; head_sha: string; path: string;
};
type JobProof = {
  id: number; run_id: number; run_attempt: number; name: string; status: string; conclusion: string;
  started_at: string; completed_at: string; steps?: Array<{name:string;conclusion:string}>;
};

export async function settleKnownA1CapacityFailure(memory: Pick<OperationalMemory,'attempts'|'openAttemptsWithoutReceipt'|'finish'>,
  proof: {run:WorkflowProof;job:JobProof}, now: string, currentCoverage: boolean, apply: boolean) {
  const expected=knownA1Failure;
  const {run,job}=proof;
  const start=Date.parse(job.started_at), end=Date.parse(job.completed_at), checked=Date.parse(now);
  if (run.id!==expected.run||run.run_attempt!==expected.attempt||run.head_sha!==expected.sha
    ||run.path!=='.github/workflows/collect-realtime.yml'||run.status!=='completed'||run.conclusion!=='failure'
    ||job.id!==expected.job||job.run_id!==expected.run||job.run_attempt!==expected.attempt
    ||job.name!=='airport_midnight_recovery / collect'||job.status!=='completed'||job.conclusion!=='failure'
    ||!job.steps?.some(step=>step.name==='Collect airport_recent (attempt 1)'&&step.conclusion==='failure')
    ||!(start<=end&&end<checked)) return 'UNVERIFIED_WORKFLOW';
  if (!currentCoverage) return 'CURRENT_A1_NOT_VERIFIED';
  const matching=(await memory.attempts(A1_SOURCE,expected.targetDate)).filter(row=>
    row.sourceId===A1_SOURCE&&row.logicalJob===A1_RECOVERY_WORKFLOW&&row.mode==='CONTROLLED'
    &&row.targetDate===expected.targetDate&&row.scheduledSlot==='00:07'
    &&row.failureClass==='MISSED_RUN'&&row.operation==='REDISPATCH_SAME_WORKFLOW'
    &&row.attemptId.endsWith('|'+expected.child));
  if (matching.length!==1) return 'ATTEMPT_UNVERIFIED';
  const row=matching[0], begun=Date.parse(row.startedAt);
  if (!(start<=begun&&begun<=end)) return 'ATTEMPT_UNVERIFIED';
  if (row.completedAt!==null) return 'ALREADY_RECORDED';
  const unreceipted=await memory.openAttemptsWithoutReceipt(A1_SOURCE,A1_RECOVERY_WORKFLOW,now);
  if (unreceipted.includes(row.attemptId)) return 'RECEIPT_UNVERIFIED';
  if (!apply) return 'READY_TO_RECORD_FAILED_ATTEMPT';

  // This fixes one proved, ended job. Unknown storage/public results remain
  // unknown, and the 106 consumed calls remain attributed to the old attempt.
  await memory.finish(row.attemptId,job.completed_at,{dataValid:false,storageValid:null,publicValid:null},
    {providerRequests:expected.providerRequests});
  const after=(await memory.attempts(A1_SOURCE,expected.targetDate)).find(item=>item.attemptId===row.attemptId);
  return after?.completedAt&&after.outcome==='RECOVERY_FAILED'&&after.providerRequests===expected.providerRequests
    ?'RECORDED_FAILED_ATTEMPT':'READBACK_UNVERIFIED';
}
