/** Observer only: cannot dispatch, suppress, retry or modify a collector's result. */
import { OperationalMemory, safeOperationalEvidence } from './operational-memory';
import { canonicalOperationalJob, fullyVerified, measureSource, sourceIdsForRun, type SourceMeasurement } from './operational-evidence';
import { incidentFingerprint } from './incident-ledger';
import { recoveryExecutionId, verifyRecovery } from './recovery-orchestration';
import { classifyTriggerEvidence, type ExecutionPlatform } from './trigger-evidence';
import type { ProductionSourceResult } from './production-runner';

/**
 * `trigger_evidence` has existed since migration 0020 and nothing ever wrote it,
 * so every Production row carries the NOT NULL default 'UNKNOWN'. It is written
 * now from the execution environment — and only with what that environment
 * genuinely proves. A workflow_dispatch is recorded as
 * GITHUB_WORKFLOW_DISPATCH_ORIGIN_UNVERIFIED rather than as a Worker Cron
 * firing, because GitHub reports the Worker's dispatch and a person's click
 * identically. See lib/trigger-evidence.ts.
 */
export async function saveMeasurement(memory:OperationalMemory,measurement:SourceMeasurement,runId:string,
  metrics:{providerRequests:number|null;rowsRead:number|null;rowsWritten:number|null},
  executionPlatform:ExecutionPlatform='GITHUB_ACTIONS',env:Record<string,string|undefined>=process.env):Promise<void> {
  const {db}=memory, job=canonicalOperationalJob(measurement.sourceId), verified=fullyVerified(measurement);
  const at=new Date(measurement.observedAt).toISOString();
  const detail=safeOperationalEvidence(measurement.detail);
  const current=await db.prepare('SELECT * FROM operational_source_state WHERE source_id=?').bind(measurement.sourceId).first<Record<string,unknown>>();
  const lastGood=verified?at:(current?.contract_version===measurement.contractVersion?current?.last_good_at:null)??null;
  const statements:D1PreparedStatement[]=[];
  // A retry or delayed older completion cannot double-add observed usage.
  if(!current||String(current.checked_at)<at) {
    statements.push(db.prepare(`INSERT INTO operational_usage_daily(day,source_id,executions,provider_requests,provider_measured,rows_read,rows_written,d1_measured)
      SELECT ?,?,1,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM operational_source_state WHERE source_id=? AND (run_id=? OR checked_at>=?))
      ON CONFLICT(day,source_id) DO UPDATE SET executions=executions+1,provider_requests=provider_requests+excluded.provider_requests,
       provider_measured=provider_measured+excluded.provider_measured,rows_read=rows_read+excluded.rows_read,
       rows_written=rows_written+excluded.rows_written,d1_measured=d1_measured+excluded.d1_measured`)
      .bind(at.slice(0,10),measurement.sourceId,metrics.providerRequests??0,Number(metrics.providerRequests!==null),
        metrics.rowsRead??0,metrics.rowsWritten??0,Number(metrics.rowsRead!==null&&metrics.rowsWritten!==null),measurement.sourceId,runId,at));
    statements.push(db.prepare(`INSERT INTO operational_source_state(source_id,logical_job,run_id,checked_at,contract_version,last_good_at,
      data_valid,storage_valid,public_valid,collector_status,stored_rows,evidence,execution_platform,trigger_evidence)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET logical_job=excluded.logical_job,run_id=excluded.run_id,
       checked_at=excluded.checked_at,contract_version=excluded.contract_version,last_good_at=CASE WHEN excluded.contract_version<>operational_source_state.contract_version THEN excluded.last_good_at ELSE COALESCE(excluded.last_good_at,operational_source_state.last_good_at) END,
       data_valid=excluded.data_valid,storage_valid=excluded.storage_valid,public_valid=excluded.public_valid,
       collector_status=excluded.collector_status,stored_rows=excluded.stored_rows,evidence=excluded.evidence,
       execution_platform=excluded.execution_platform,trigger_evidence=excluded.trigger_evidence
       WHERE excluded.checked_at>operational_source_state.checked_at`)
      .bind(measurement.sourceId,job,runId,at,measurement.contractVersion,lastGood,
        ...[measurement.dataValid,measurement.storageValid,measurement.publicValid].map(v=>v===null?null:Number(v)),
        String(measurement.run?.status??'UNKNOWN'),measurement.storedRows,detail,executionPlatform,
        classifyTriggerEvidence(env,executionPlatform)));
  }
  if(measurement.failureClass)statements.push(memory.eventStatement({parts:{sourceId:measurement.sourceId,logicalJob:job,
    contractVersion:measurement.contractVersion,failureClass:measurement.failureClass},kind:'FAILURE',runId,at,
    evidence:detail,lastGoodAt:typeof lastGood==='string'?lastGood:null}));
  if(verified) {
    for(const incident of await memory.incidents(measurement.sourceId)) {
      if(incident.currentState==='RESOLVED'||incident.contractVersion!==measurement.contractVersion)continue;
      // A stored incident also carries evidence, counts and nullable dates;
      // only its four fingerprint fields are operational identities.
      const {sourceId,failureClass,contractVersion,logicalJob}=incident;
      statements.push(memory.eventStatement({parts:{sourceId,failureClass,contractVersion,logicalJob},
        kind:'HEALTHY',runId,at,evidence:detail,verification:measurement}));
    }
  }
  for(let i=0;i<statements.length;i+=40)await db.batch(statements.slice(i,i+40));
}

export async function recordExistingCompletion(db:D1Database,result:ProductionSourceResult,context:{runId:string;startedAt:string;completedAt:string;attempt:number;
  rowsRead?:number|null;rowsWritten?:number|null}):Promise<{state:string;sourceCount:number}> {
  const memory=new OperationalMemory(db);
  if(!await memory.available())return {state:'DORMANT_MIGRATION_UNAVAILABLE',sourceCount:0};
  const ids=sourceIdsForRun(result.source);
  for(const sourceId of ids) {
    const earlierIncidents=(result.mode==='RECOVERY'||context.attempt>1)?await memory.incidents(sourceId):[];
    const measured=await measureSource(db,sourceId,context.completedAt);
    // A skip may not create a collector_runs row; the actual Actions identity is then used.
    const runId=measured.run&&Date.parse(String(measured.run.started_at))>=Date.parse(context.startedAt)
      ?measured.runId!:context.runId;
    const metrics={providerRequests:sourceId===ids[0]?result.providerRequests??null:null,rowsRead:sourceId===ids[0]?context.rowsRead??null:null,rowsWritten:sourceId===ids[0]?context.rowsWritten??null:null};
    await saveMeasurement(memory,measured,runId,metrics);
    if(result.mode!=='RECOVERY'&&context.attempt<=1)continue;
    const prior=earlierIncidents.filter(row=>row.currentState!=='RESOLVED'&&row.contractVersion===measured.contractVersion
      &&Date.parse(row.lastSeen)<=Date.parse(context.startedAt)).sort((a,b)=>b.lastSeen.localeCompare(a.lastSeen))[0];
    const parts={sourceId,logicalJob:canonicalOperationalJob(sourceId),contractVersion:measured.contractVersion,
      failureClass:prior?.failureClass??measured.failureClass??'RECOVERY_PENDING' as const};
    // No retrospective claim about the trigger's failure class: unknown stays pending.
    const operation=result.mode==='RECOVERY'?'REQUEST_ONLY_MISSING_COVERAGE':'REDISPATCH_SAME_WORKFLOW';
    const targetDate=new Date(Date.parse(context.startedAt)+9*3600_000).toISOString().slice(0,10);
    const executionId=recoveryExecutionId({sourceId,targetDate,scheduledSlot:context.startedAt.slice(0,16),operation});
    const outcome=verifyRecovery(measured);
    const statements=[db.prepare(`INSERT INTO operational_recovery_attempts(attempt_id,execution_id,fingerprint,source_id,failure_class,contract_version,logical_job,
      target_date,scheduled_slot,operation,attempt_number,started_at,completed_at,data_valid,storage_valid,public_valid,outcome,verified,
      provider_requests,rows_read,rows_written,duration_ms,escalation_required,mode)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'EXISTING_RUN') ON CONFLICT(attempt_id) DO NOTHING`)
      .bind(`${sourceId}|${context.runId}`,executionId,incidentFingerprint(parts),sourceId,parts.failureClass,parts.contractVersion,parts.logicalJob,
        targetDate,context.startedAt.slice(0,16),operation,context.attempt,context.startedAt,context.completedAt,
        ...[measured.dataValid,measured.storageValid,measured.publicValid].map(v=>v===null?null:Number(v)),outcome.stage,Number(outcome.verified),
        metrics.providerRequests,metrics.rowsRead,metrics.rowsWritten,Date.parse(context.completedAt)-Date.parse(context.startedAt),Number(!outcome.verified))];
    if(prior) {
      // Actual existing attempts are observations, never admission or extra dispatch.
      statements.push(memory.eventStatement({parts,kind:'RECOVERY_STARTED',runId:context.runId,at:context.startedAt,evidence:'observed existing recovery execution'}));
      statements.push(memory.eventStatement({parts,kind:'RECOVERY_RESULT',runId:context.runId,at:context.completedAt,evidence:outcome.reason,verification:measured}));
    }
    await db.batch(statements);
  }
  return {state:'PERSISTED',sourceCount:ids.length};
}
