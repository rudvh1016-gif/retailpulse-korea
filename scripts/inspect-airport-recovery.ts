/** Current-day A1 verification only. Never invokes a collector or changes its ledger. */
import {createHash} from 'node:crypto';
import {CloudflareD1RestDatabase} from '../lib/d1-rest';
import {airportEvidenceField,inspectAirportRecoveryToday} from '../lib/airport-recovery-verification';
import {kstDayOf} from '../lib/kst';
import {resolveProductionDatabaseConfig} from './production-database';

const config=resolveProductionDatabaseConfig('production');
const database=new CloudflareD1RestDatabase(config.accountId,config.databaseId,config.apiToken);
const now=new Date().toISOString(),targetDate=kstDayOf(now);
const before=database.usageSnapshot();
try {
  const result=await database.prepare(`SELECT attempt_id,target_date,scheduled_slot,started_at,completed_at,
    outcome,verified,data_valid,storage_valid,public_valid,provider_requests
    FROM operational_recovery_attempts WHERE source_id=? AND logical_job=? AND target_date=? AND mode='CONTROLLED'
    ORDER BY started_at DESC LIMIT 10`).bind('INCHEON_FLIGHT_DETAIL','collect-airport-recovery.yml',targetDate)
    .all<Record<string,unknown>>();
  if(!result.success||!Array.isArray(result.results))throw Error('A1_LEDGER_READ_UNAVAILABLE');
  const bit=(value:unknown)=>value===0||value===1?value:null;
  const ledger=result.results.map(row=>({
    // Stable correlation without logging arbitrary identifiers or free-form evidence.
    attemptIdHash:createHash('sha256').update(String(row.attempt_id)).digest('hex'),
    targetDate:airportEvidenceField(row.target_date),scheduledSlot:row.scheduled_slot==='00:07'?'00:07':null,
    startedAt:airportEvidenceField(row.started_at),completedAt:airportEvidenceField(row.completed_at),
    outcome:typeof row.outcome==='string'&&/^[A-Z_]{1,64}$/.test(row.outcome)?row.outcome:null,
    verified:bit(row.verified),dataValid:bit(row.data_valid),storageValid:bit(row.storage_valid),publicValid:bit(row.public_valid),
    providerRequests:airportEvidenceField(row.provider_requests),
  }));
  console.log(JSON.stringify({airportRecoveryLedger:{targetDate,limit:10,rows:ledger,mutated:false}}));
  const inspected=await inspectAirportRecoveryToday(database as unknown as D1Database,targetDate,now,fetch,
    evidence=>console.log(JSON.stringify({inspectionContext:'MANUAL_READ_ONLY',airportRecoveryVerification:evidence})));
  const after=database.usageSnapshot();
  if(after.rowsWritten!==before.rowsWritten)throw Error('A1_INSPECTION_MUST_NOT_WRITE');
  console.log(JSON.stringify({inspectionExecution:'COMPLETED',verification:inspected.verification,
    providerRequests:0,ledgerWrites:0,publicReads:inspected.evidence.publicRequest.attempted?1:0,
    observedUsage:{basis:after.unmeasuredStatements===before.unmeasuredStatements?'OBSERVED_QUERY_METADATA':'UNVERIFIED_QUERY_METADATA',
      scope:'direct inspection queries only; public summary backend usage is not included',
      rowsRead:after.rowsRead-before.rowsRead,rowsWritten:after.rowsWritten-before.rowsWritten,
      unmeasuredStatements:after.unmeasuredStatements-before.unmeasuredStatements},
    limitation:'Current verification does not rewrite or retroactively credit a prior recovery attempt.'}));
}catch {
  console.error('A1_VERIFICATION_INSPECTION_UNAVAILABLE; no provider/retry/ledger mutation; inspect safe diagnostic stage');
  process.exitCode=1;
}
