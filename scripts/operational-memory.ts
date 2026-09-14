/** Manual / existing post-deployment bookkeeping. No provider credentials or dispatch capability. */
import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { resolveProductionDatabaseConfig } from './production-database';
import { OperationalMemory } from '../lib/operational-memory';
import { measureSource, verifyPublicMeasurement, readPublicEvidence } from '../lib/operational-evidence';
import { saveMeasurement } from '../lib/operational-bookkeeping';
import { recoveryActivation, centralRecoveryActivation } from '../lib/operational-recovery-runner';
import { buildOrchestrationPlan } from '../lib/orchestration-plan';

const mode=process.env.RPK_OPERATIONAL_MODE??'inspect';
if(!['inspect','record','recover','plan'].includes(mode))throw new Error('unknown_operational_mode');
if(mode==='recover') {
  console.log(JSON.stringify({centralRecovery:recoveryActivation(new Date().toISOString()),providerCalls:0}));
} else {
  const config=resolveProductionDatabaseConfig('production');
  const database=new CloudflareD1RestDatabase(config.accountId,config.databaseId,config.apiToken);
  const db=database as unknown as D1Database, memory=new OperationalMemory(db);
  const migration=await database.prepare("SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 5").all();
  console.log(JSON.stringify({migrationState:migration.results}));
  if(!await memory.available())throw new Error('operational_migration_unavailable');
  if(mode==='record') {
    const before=database.usageSnapshot();
    let publicBody: Awaited<ReturnType<typeof readPublicEvidence>>={today:null,tomorrow:null};
    try {publicBody=await readPublicEvidence(new Date().toISOString());}catch { /* no publication proof */ }
    const sources=(await database.prepare('SELECT source_id FROM source_health ORDER BY source_id LIMIT 100').all<{source_id:string}>()).results;
    for(const {source_id} of sources) {
      const now=new Date().toISOString(),measurement=await measureSource(db,source_id,now);
      verifyPublicMeasurement(measurement,publicBody);
      // Existing run identity prevents inspecting the same failure twice from inventing recurrence.
      await saveMeasurement(memory,measurement,measurement.runId??`inspection:${now}`,
        {providerRequests:null,rowsRead:null,rowsWritten:null},'MANUAL_INSPECTION');
    }
    const after=database.usageSnapshot();
    console.log(JSON.stringify({recordedSources:sources.length,providerCalls:0,observedD1RowsRead:after.rowsRead-before.rowsRead,
      observedD1RowsWritten:after.rowsWritten-before.rowsWritten,usageBasis:'OBSERVED_QUERY_METADATA'}));
  }
  const incidents=await memory.incidents();
  if(mode==='plan') {
    // SELECT only, and bounded: incidents are already capped at 500, attempts at
    // 1000 per source over a 30-day window, stuck/in-flight at 100. Nothing here
    // scans a growing table without a ceiling, and nothing here writes.
    const nowIso=new Date().toISOString();
    const before=database.usageSnapshot();
    const from=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
    const sourceIds=[...new Set(incidents.map(row=>row.sourceId))].sort();
    const attempts=(await Promise.all(sourceIds.map(id=>memory.attempts(id,from)))).flat();
    const plan=buildOrchestrationPlan({nowIso,incidents,attempts,
      inFlight:await memory.inFlightControlled(),
      stuck:await memory.stuckControlledAttempts(nowIso),
      activation:centralRecoveryActivation(nowIso)});
    const after=database.usageSnapshot();
    console.log(JSON.stringify({...plan,observedD1RowsRead:after.rowsRead-before.rowsRead,
      observedD1RowsWritten:after.rowsWritten-before.rowsWritten},null,2));
    if(after.rowsWritten-before.rowsWritten!==0)throw new Error('orchestration_plan_must_not_write');
  } else console.log(JSON.stringify({memory:'PERSISTED_READ',incidentCount:incidents.length,
    incidents:incidents.map(({fingerprint,occurrenceCount,currentState,lastGoodAt})=>({fingerprint,occurrenceCount,currentState,lastGoodAt})),
    automaticPolicyChangeAllowed:false,centralRecovery:'DORMANT'}));
}
