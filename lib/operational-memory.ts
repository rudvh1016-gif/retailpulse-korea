/** D1-backed memory. Imported by operational scripts only, never public page queries. */
import { incidentFingerprint, severityFromOccurrences, type Incident, type IncidentFingerprintParts } from './incident-ledger';
import { decideRecovery, recoveryExecutionId, verifyRecovery, type RecoveryVerification } from './recovery-orchestration';
import { sanitizeProductionDetail } from './production-diagnostics';
import { sha256 } from './hash';

export const OPERATIONAL_MEMORY_VERSION = '0020';
export const AUTOMATIC_POLICY_CHANGE_ALLOWED = false;
export const AUTOMATIC_CODE_CHANGE_ALLOWED = false;
export const TRIAL_END_EXCLUSIVE = '2026-09-27T00:00:00+09:00';

export function safeOperationalEvidence(value: string): string {
  return sanitizeProductionDetail(value)
    .replace(/\b(?:token|password|secret|authorization|api[_-]?key)\s*[:=]\s*[^\s;,]+/gi, '[REDACTED_CREDENTIAL]')
    .replace(/\b[A-Za-z0-9_+/=-]{40,}\b/g, '[REDACTED_OPAQUE]')
    .replace(/[\u0000-\u001f]/g, ' ').slice(0, 500);
}
function identity(value: string): string {
  if (!value || value.length > 200 || !/^[A-Za-z0-9._:@/|+-]+$/.test(value)) throw new Error('invalid_operational_identity');
  return value;
}
function iso(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error('invalid_operational_timestamp');
  return new Date(time).toISOString();
}
function count(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
type EventKind = 'FAILURE' | 'RECOVERY_STARTED' | 'RECOVERY_RESULT' | 'HEALTHY' | 'HUMAN_REVIEW';
export interface MemoryEvent {
  parts: IncidentFingerprintParts; kind: EventKind; runId: string; at: string;
  evidence: string; lastGoodAt?: string | null; verification?: RecoveryVerification;
}
type Row = Record<string, unknown>;
export interface StoredAttempt extends RecoveryVerification {
  attemptId: string; executionId: string; fingerprint: string; sourceId: string;
  failureClass: IncidentFingerprintParts['failureClass']; contractVersion: string; logicalJob: string;
  targetDate: string; scheduledSlot: string; operation: string; attemptNumber: number;
  startedAt: string; completedAt: string | null; outcome: string; verified: boolean;
  providerRequests: number | null; rowsRead: number | null; rowsWritten: number | null;
  durationMs: number | null; escalationRequired: boolean; mode: 'EXISTING_RUN' | 'CONTROLLED';
}
export interface AttemptRequest {
  parts: IncidentFingerprintParts; targetDate: string; scheduledSlot: string;
  operation: string; runId: string; at: string;
}
export class OperationalMemory {
  constructor(readonly db: D1Database) {}

  async available(): Promise<boolean> {
    // Missing migration is a supported dormant state, not a successful write.
    const result = await this.db.prepare(`SELECT name FROM sqlite_master WHERE
      (type='table' AND name IN ('operational_incidents','operational_incident_events','operational_recovery_attempts','operational_source_state','operational_usage_daily'))
      OR (type='trigger' AND name='operational_event_fold')
      OR (type='index' AND name IN ('operational_incident_source_idx','operational_event_incident_idx','operational_attempt_budget_idx','operational_attempt_execution_idx','operational_attempt_inflight_idx'))`).all();
    return result.success === true && result.results?.length === 11;
  }

  eventStatement(event: MemoryEvent): D1PreparedStatement {
    Object.values(event.parts).forEach(identity);
    const runId = identity(event.runId), at = iso(event.at), fingerprint = incidentFingerprint(event.parts);
    const verified = event.verification ? verifyRecovery(event.verification).verified : false;
    if (event.kind === 'HEALTHY' && !verified) throw new Error('healthy_requires_three_verified_layers');
    // The same underlying run/failure cannot be counted again by repeated health inspections.
    const eventId = `${fingerprint}|${event.kind}|${runId}`;
    return this.db.prepare(`INSERT INTO operational_incident_events
      (event_id,fingerprint,source_id,failure_class,contract_version,logical_job,kind,run_id,at,evidence,verified,last_good_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING`).bind(eventId, fingerprint,
      event.parts.sourceId,event.parts.failureClass,event.parts.contractVersion,event.parts.logicalJob,
      event.kind,runId,at,safeOperationalEvidence(event.evidence),Number(verified),event.lastGoodAt ? iso(event.lastGoodAt) : null);
  }
  async recordEvent(event: MemoryEvent): Promise<void> { await this.eventStatement(event).run(); }

  async incidents(sourceId?: string): Promise<Incident[]> {
    const rows = (await this.db.prepare(`SELECT * FROM operational_incidents ${sourceId ? 'WHERE source_id=?' : ''}
      ORDER BY fingerprint LIMIT 501`).bind(...(sourceId ? [identity(sourceId)] : [])).all<Row>()).results;
    if (!rows) throw new Error('operational_ledger_unmeasured');
    if (rows.length > 500) throw new Error('operational_ledger_limit_requires_review');
    const output: Incident[] = [];
    for (const row of rows) {
      const events = (await this.db.prepare(`SELECT run_id,kind,evidence FROM operational_incident_events
        WHERE fingerprint=? ORDER BY at DESC,event_id DESC LIMIT 50`).bind(row.fingerprint).all<Row>()).results;
      const failureClass = row.failure_class as Incident['failureClass'];
      if (!events) throw new Error('operational_events_unmeasured');
      output.push({ incidentId: String(row.fingerprint), fingerprint: String(row.fingerprint),
        sourceId: String(row.source_id), failureClass, contractVersion: String(row.contract_version), logicalJob: String(row.logical_job),
        firstSeen: String(row.first_seen), lastSeen: String(row.last_seen), occurrenceCount: Number(row.occurrence_count),
        affectedRuns: [...new Set(events.filter(e=>e.kind==='FAILURE').map(e=>String(e.run_id)))],
        evidence: [...new Set(events.map(e=>safeOperationalEvidence(String(e.evidence))))].slice(0,10),
        severity: severityFromOccurrences(Number(row.occurrence_count),failureClass), currentState: row.current_state as Incident['currentState'],
        lastGoodAt: row.last_good_at as string|null, recoveryAttempts: Number(row.recovery_attempts),
        lastRecoveryResult: row.last_recovery_result as string|null, resolvedAt: row.resolved_at as string|null });
    }
    return output;
  }

  async attempts(sourceId: string, fromDate: string): Promise<StoredAttempt[]> {
    const rows = (await this.db.prepare(`SELECT * FROM operational_recovery_attempts
      WHERE source_id=? AND target_date>=? ORDER BY target_date,started_at,attempt_id LIMIT 1001`)
      .bind(identity(sourceId),fromDate).all<Row>()).results;
    if(!rows)throw new Error('operational_attempts_unmeasured');
    if(rows.length>1000) throw new Error('operational_scorecard_window_limit');
    return rows.map(row=>({attemptId:String(row.attempt_id),executionId:String(row.execution_id),fingerprint:String(row.fingerprint),
      sourceId:String(row.source_id),failureClass:row.failure_class as StoredAttempt['failureClass'],contractVersion:String(row.contract_version),
      logicalJob:String(row.logical_job),targetDate:String(row.target_date),scheduledSlot:String(row.scheduled_slot),operation:String(row.operation),
      attemptNumber:Number(row.attempt_number),startedAt:String(row.started_at),completedAt:row.completed_at as string|null,
      outcome:String(row.outcome),verified:row.verified===1,dataValid:row.data_valid===null?null:row.data_valid===1,
      storageValid:row.storage_valid===null?null:row.storage_valid===1,publicValid:row.public_valid===null?null:row.public_valid===1,
      providerRequests:count(row.provider_requests as number),rowsRead:count(row.rows_read as number),rowsWritten:count(row.rows_written as number),
      durationMs:count(row.duration_ms as number),escalationRequired:row.escalation_required===1,mode:row.mode as StoredAttempt['mode']}));
  }

  /**
   * Controlled attempts that started and never finished.
   *
   * The lock these hold is correct and must stay held: elapsed time is not
   * evidence the earlier attempt stopped, and releasing on a timer is how two
   * runs end up hitting the same provider for the same window. But a lock that
   * is both permanent and invisible is indistinguishable from a system that has
   * quietly stopped trying, so the orphans are surfaced here and reported by
   * health and by the orchestration plan.
   *
   * Read-only. Nothing in this method unlocks anything.
   */
  async stuckControlledAttempts(nowIso: string, olderThanMs = 3600_000): Promise<Array<{
    attemptId: string; sourceId: string; logicalJob: string; executionId: string;
    startedAt: string; ageMs: number; disposition: 'HUMAN_REVIEW_REQUIRED';
  }>> {
    const now = Date.parse(iso(nowIso));
    const rows = (await this.db.prepare(`SELECT attempt_id,source_id,logical_job,execution_id,started_at
      FROM operational_recovery_attempts WHERE completed_at IS NULL AND mode='CONTROLLED'
      ORDER BY started_at,attempt_id LIMIT 101`).all<Row>()).results;
    if (!rows) throw new Error('operational_attempts_unmeasured');
    if (rows.length > 100) throw new Error('operational_stuck_attempt_limit_requires_review');
    return rows.flatMap(row => {
      const started = Date.parse(String(row.started_at));
      const ageMs = now - started;
      if (!Number.isFinite(ageMs) || ageMs < olderThanMs) return [];
      return [{ attemptId: String(row.attempt_id), sourceId: String(row.source_id), logicalJob: String(row.logical_job),
        executionId: String(row.execution_id), startedAt: String(row.started_at), ageMs,
        disposition: 'HUMAN_REVIEW_REQUIRED' as const }];
    });
  }

  /** Controlled attempts holding a lock right now, whatever their age. Read-only. */
  async inFlightControlled(): Promise<Array<{ sourceId: string; logicalJob: string; executionId: string; startedAt: string }>> {
    const rows = (await this.db.prepare(`SELECT source_id,logical_job,execution_id,started_at
      FROM operational_recovery_attempts WHERE completed_at IS NULL AND mode='CONTROLLED'
      ORDER BY source_id,logical_job LIMIT 101`).all<Row>()).results;
    if (!rows) throw new Error('operational_attempts_unmeasured');
    return rows.map(row => ({ sourceId: String(row.source_id), logicalJob: String(row.logical_job),
      executionId: String(row.execution_id), startedAt: String(row.started_at) }));
  }

  async admit(request: AttemptRequest): Promise<{ admitted: boolean; attemptId: string; state: string; reason: string }> {
    const {parts}=request;
    Object.values(parts).forEach(identity); identity(request.operation); identity(request.scheduledSlot); identity(request.runId);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(request.targetDate)) throw new Error('invalid_recovery_date');
    const at=iso(request.at), executionId=recoveryExecutionId({...parts,...request});
    const attemptId=`${executionId}|${request.runId}`;
    // ONLY controlled attempts spend the recovery budget.
    //
    // This counted every row, and `recordExistingCompletion` writes one per
    // ordinary scheduled collection with mode='EXISTING_RUN'. So a source that
    // simply ran on schedule all day arrived at its recovery budget already
    // exhausted: the Production rehearsal on 2026-09-14 measured A5 at 32 used
    // against a ceiling of 3, and KMA at 16 against 2, purely from normal runs.
    // The budget exists to stop a REPAIR from looping, and a healthy collection
    // is not a repair. Counting them together meant that once activation
    // happened, controlled recovery would have been permanently refused for the
    // exact two sources it was built for — failing closed, and silently.
    const used=await this.db.prepare(`SELECT COUNT(*) AS n FROM operational_recovery_attempts
      WHERE source_id=? AND logical_job=? AND target_date=? AND mode='CONTROLLED'`).bind(parts.sourceId,parts.logicalJob,request.targetDate).first<{n:number}>();
    const decision=decideRecovery(parts.failureClass,used?.n??0);
    const reject=async(reason:string)=>{
      await this.recordEvent({parts,kind:'HUMAN_REVIEW',runId:request.runId,at,evidence:reason});
      return {admitted:false,attemptId,state:'HUMAN_REVIEW_REQUIRED',reason};
    };
    if(!decision.approved || decision.action!==request.operation) return reject(decision.reason+'; action must match closed rule');
    // Admission and budget test live in ONE SQLite statement. Separate clients cannot both pass.
    const insert=this.db.prepare(`INSERT INTO operational_recovery_attempts
      (attempt_id,execution_id,fingerprint,source_id,failure_class,contract_version,logical_job,target_date,scheduled_slot,operation,attempt_number,started_at,mode)
      SELECT ?,?,?,?,?,?,?,?,?,?,
       (SELECT COUNT(*)+1 FROM operational_recovery_attempts WHERE source_id=? AND logical_job=? AND target_date=? AND mode='CONTROLLED'),?,'CONTROLLED'
      WHERE (SELECT COUNT(*) FROM operational_recovery_attempts WHERE source_id=? AND logical_job=? AND target_date=? AND mode='CONTROLLED')<?
       AND NOT EXISTS(SELECT 1 FROM operational_recovery_attempts WHERE source_id=? AND logical_job=? AND completed_at IS NULL AND mode='CONTROLLED')
       AND NOT EXISTS(SELECT 1 FROM operational_recovery_attempts WHERE execution_id=? AND outcome IN ('RECOVERED','RECOVERY_PENDING'))
      ON CONFLICT(attempt_id) DO NOTHING`).bind(attemptId,executionId,incidentFingerprint(parts),parts.sourceId,parts.failureClass,parts.contractVersion,
        parts.logicalJob,request.targetDate,request.scheduledSlot,request.operation,parts.sourceId,parts.logicalJob,request.targetDate,at,
        parts.sourceId,parts.logicalJob,request.targetDate,decision.maxAttempts,parts.sourceId,parts.logicalJob,executionId);
    const result=await insert.run();
    if(!result.meta?.changes) return reject('persistent duplicate, in-flight lock or daily budget; elapsed time never unlocks');
    // If recording this event fails, the durable lock stays held. No provider call is admitted.
    await this.recordEvent({parts,kind:'RECOVERY_STARTED',runId:request.runId,at,evidence:decision.reason});
    return {admitted:true,attemptId,state:'RECOVERY_STARTED',reason:decision.reason};
  }

  async finish(attemptId: string, at: string, verification: RecoveryVerification,
    metrics: {providerRequests?:number|null;rowsRead?:number|null;rowsWritten?:number|null}={}): Promise<void> {
    const row=await this.db.prepare('SELECT * FROM operational_recovery_attempts WHERE attempt_id=?').bind(attemptId).first<Row>();
    if(!row) throw new Error('unknown_recovery_attempt');
    if(row.completed_at!==null) return; // immutable completion, including a pending verdict
    const completed=iso(at), outcome=verifyRecovery(verification);
    if(Date.parse(completed)<Date.parse(String(row.started_at))) throw new Error('recovery_completion_before_start');
    const parts={sourceId:String(row.source_id),failureClass:row.failure_class as Incident['failureClass'],contractVersion:String(row.contract_version),logicalJob:String(row.logical_job)};
    await this.db.batch([
      this.db.prepare(`UPDATE operational_recovery_attempts SET completed_at=?,data_valid=?,storage_valid=?,public_valid=?,outcome=?,verified=?,
        provider_requests=?,rows_read=?,rows_written=?,duration_ms=?,escalation_required=? WHERE attempt_id=? AND completed_at IS NULL`)
        .bind(completed,...[verification.dataValid,verification.storageValid,verification.publicValid].map(v=>v===null?null:Number(v)),
          outcome.stage,Number(outcome.verified),count(metrics.providerRequests),count(metrics.rowsRead),count(metrics.rowsWritten),
          Date.parse(completed)-Date.parse(String(row.started_at)),Number(!outcome.verified),attemptId),
      this.eventStatement({parts,kind:'RECOVERY_RESULT',runId:await sha256(String(row.attempt_id)),at:completed,evidence:outcome.reason,verification}),
    ]);
  }
}
