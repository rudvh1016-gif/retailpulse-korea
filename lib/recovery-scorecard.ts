import type { StoredAttempt } from './operational-memory';
import type { Incident } from './incident-ledger';
import { decideRecovery } from './recovery-orchestration';

export const SHADOW_MINIMUM_PER_ACTION = 10;
export const SHADOW_MINIMUM_DAYS = 3;
export type PromotionState='KEEP_CURRENT'|'CANDIDATE_SHADOW_ONLY'|'READY_FOR_OWNER_REVIEW'|'INSUFFICIENT_EVIDENCE'|'REJECT_CANDIDATE';
export function median(values:number[]):number|null {
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}
export function scoreRecoveryAttempts(attempts:readonly StoredAttempt[]) {
  const groups=new Map<string,StoredAttempt[]>();
  for(const attempt of attempts) {
    const key=[attempt.sourceId,attempt.failureClass,attempt.contractVersion,attempt.logicalJob,attempt.operation].join('::');
    groups.set(key,[...(groups.get(key)??[]),attempt]);
  }
  return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([key,rows])=>{
    const verified=rows.filter(row=>row.verified&&row.outcome==='RECOVERED'&&row.dataValid===true&&row.storageValid===true&&row.publicValid===true).length;
    const completed=rows.filter(row=>row.completedAt!==null);
    return {key,attempts:rows.length,completed:completed.length,verifiedRecoveries:verified,
      verifiedRecoveryRate:rows.length?verified/rows.length:null,
      medianDurationMs:median(completed.flatMap(row=>row.durationMs===null?[]:[row.durationMs])),
      durationMeasured:completed.filter(row=>row.durationMs!==null).length,
      observedProviderRequests:rows.reduce((sum,row)=>sum+(row.providerRequests??0),0),
      requestMeasured:rows.filter(row=>row.providerRequests!==null).length,
      requestBasis:'OBSERVED_LOWER_BOUND' as const,
      invalidData:rows.filter(row=>row.dataValid===false).length,
      persistenceFailures:rows.filter(row=>row.storageValid===false).length,
      publicationMismatches:rows.filter(row=>row.publicValid===false).length,
      unknownVerification:rows.filter(row=>[row.dataValid,row.storageValid,row.publicValid].includes(null)).length,
      escalations:rows.filter(row=>row.escalationRequired).length};
  });
}

/** Screening rule, NOT statistical confidence. Ten fully measured executions across
 * three distinct days per action avoid promoting a one-outage anecdote. Still owner review only. */
export function evaluateShadowPolicy(attempts:readonly StoredAttempt[],scope:{sourceId:string;failureClass:string;contractVersion:string;logicalJob:string},
  currentAction:string,candidateAction:string):{state:PromotionState;reason:string;automaticPolicyChangeAllowed:false;scorecard:ReturnType<typeof scoreRecoveryAttempts>} {
  const comparable=attempts.filter(row=>Object.entries(scope).every(([key,value])=>row[key as keyof StoredAttempt]===value));
  const current=comparable.filter(row=>row.operation===currentAction),candidate=comparable.filter(row=>row.operation===candidateAction);
  const finish=(state:PromotionState,reason:string)=>({state,reason,automaticPolicyChangeAllowed:false as const,scorecard:scoreRecoveryAttempts([...current,...candidate])});
  if(currentAction===candidateAction)return finish('KEEP_CURRENT','identical policies');
  if(scope.contractVersion==='UNKNOWN_CONTRACT'||!['MISSED_RUN','STALE','PARTIAL_DATA','EXECUTION_ERROR'].includes(scope.failureClass))
    return finish('INSUFFICIENT_EVIDENCE','known contract and pre-approved failure class required');
  if(!['REDISPATCH_SAME_WORKFLOW','REQUEST_ONLY_MISSING_COVERAGE'].includes(candidateAction))return finish('REJECT_CANDIDATE','outside pre-approved action vocabulary');
  const factsComplete=(rows:StoredAttempt[])=>rows.length>=SHADOW_MINIMUM_PER_ACTION&&new Set(rows.map(row=>row.targetDate)).size>=SHADOW_MINIMUM_DAYS
    &&rows.every(row=>row.completedAt!==null&&row.durationMs!==null&&row.providerRequests!==null&&[row.dataValid,row.storageValid,row.publicValid].every(v=>v!==null))
    &&new Set(rows.map(row=>row.executionId)).size===rows.length;
  if(!factsComplete(current)||!factsComplete(candidate))return finish('INSUFFICIENT_EVIDENCE','need 10 independent executions/action across 3 days with data/storage/public/cost/latency evidence');
  const rate=(rows:StoredAttempt[],fn:(row:StoredAttempt)=>boolean)=>rows.filter(fn).length/rows.length;
  const averageRequests=(rows:StoredAttempt[])=>rows.reduce((sum,row)=>sum+row.providerRequests!,0)/rows.length;
  const recurrence=(rows:StoredAttempt[])=>{
    const sorted=[...rows].sort((a,b)=>a.startedAt.localeCompare(b.startedAt)||a.attemptId.localeCompare(b.attemptId));
    return sorted.slice(1).filter((row,i)=>!row.verified&&!sorted[i].verified).length/(sorted.length-1);
  };
  if(rate(candidate,r=>r.verified)<rate(current,r=>r.verified)||recurrence(candidate)>recurrence(current)||
    averageRequests(candidate)>averageRequests(current)||median(candidate.map(r=>r.durationMs!))!>median(current.map(r=>r.durationMs!))!||
    (['dataValid','storageValid','publicValid'] as const).some(key=>rate(candidate,r=>r[key]===false)>rate(current,r=>r[key]===false)))
    return finish('REJECT_CANDIDATE','candidate is worse on at least one measured safety/cost/latency dimension');
  const improved=rate(candidate,r=>r.verified)>rate(current,r=>r.verified)||recurrence(candidate)<recurrence(current)||
    averageRequests(candidate)<averageRequests(current)||median(candidate.map(r=>r.durationMs!))!<median(current.map(r=>r.durationMs!))!;
  return finish(improved?'READY_FOR_OWNER_REVIEW':'CANDIDATE_SHADOW_ONLY',improved?'non-worse measured dimensions; owner review required, promotion disabled':'no measured improvement; keep shadow only');
}

/** Sanitized facts for a human-authored regression. Never raw payloads or generated code. */
export function regressionCandidates(incidents:readonly Incident[]) {
  return incidents.filter(row=>row.occurrenceCount>=3).sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint)).map(row=>({
    fingerprint:row.fingerprint,failureClass:row.failureClass,contractVersion:row.contractVersion,occurrences:row.occurrenceCount,
    expectedRule:decideRecovery(row.failureClass,0).stage,automaticCodeChangeAllowed:false,
  }));
}

export function observedUsage(rows:readonly Record<string,unknown>[]) {
  return rows.map(row=>({day:row.day,sourceId:row.source_id,executions:row.executions,
    providerRequests:{lowerBound:Number(row.provider_requests),upperBound:null,measuredExecutions:Number(row.provider_measured)},
    d1RowsRead:{lowerBound:Number(row.rows_read),upperBound:null},d1RowsWritten:{lowerBound:Number(row.rows_written),upperBound:null},
    basis:'OBSERVED_LOWER_BOUND',accountUsage:'UNKNOWN',quotaPercent:null,
  }));
}
