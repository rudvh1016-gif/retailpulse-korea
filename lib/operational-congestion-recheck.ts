/** Observer-only follow-up of unresolved A4 incidents; never retries a provider. */
import { canonicalOperationalJob, fullyVerified, matchPublicEvidence, readPublicSummary, type SourceMeasurement } from './operational-evidence';
import { safeOperationalEvidence } from './operational-memory';

const SOURCES=['INCHEON_DEPARTURE_CONGESTION','INCHEON_DEPARTURE_CONGESTION_T2'];
const ROW_FIELDS=['id','source_id','record_origin','terminal','zone','wait_time_minutes','wait_time_raw','waiting_count',
  'observed_at','retrieved_at','freshness','schema_version','quality_status','source_hash'];
const HEALTH_FIELDS=['status','last_event_at','last_published_at','last_retrieved_at','consecutive_failures','schema_version','updated_at','detail'];
const RUN_FIELDS=['run_id','status','started_at','finished_at'];

/**
 * Called only after a successful first-attempt regular collection. A past pending
 * attempt remains immutable: a new HEALTHY event records what is proven NOW.
 * One bounded own-site read only when this source has unresolved incidents.
 */
export async function recheckCongestionPublication(db:D1Database,measurement:SourceMeasurement,
  context:{runId:string;startedAt:string;completedAt:string},fetchImpl:typeof fetch=fetch):Promise<void> {
  if(!SOURCES.includes(measurement.sourceId)||measurement.contractVersion==='UNKNOWN_CONTRACT'||
    measurement.dataValid!==true||measurement.storageValid!==true||!measurement.run||!measurement.health||
    !measurement.sample.length||measurement.sample.length>=30||
    Date.parse(String(measurement.run.started_at))<Date.parse(context.startedAt)||
    Date.parse(String(measurement.run.finished_at))>Date.parse(context.completedAt))return;
  const source=measurement.sourceId,terminal=source.endsWith('_T2')?'T2':'T1';
  const checked=Date.parse(context.completedAt),started=Date.parse(context.startedAt);
  if(!Number.isFinite(checked)||!Number.isFinite(started)||started>checked||
    !Number.isFinite(Date.parse(String(measurement.run.started_at)))||
    Date.parse(String(measurement.run.started_at))>Date.parse(String(measurement.run.finished_at))||
    ['last_event_at','last_published_at','last_retrieved_at'].some(field=>measurement.health![field]!==null&&measurement.health![field]!==undefined&&
      (!Number.isFinite(Date.parse(String(measurement.health![field])))||Date.parse(String(measurement.health![field]))>checked))||
    new Set(measurement.sample.map(row=>row.zone)).size!==measurement.sample.length||
    !measurement.sample.every(row=>row.source_id===source&&row.terminal===terminal&&row.schema_version===measurement.contractVersion&&
      Number.isSafeInteger(row.waiting_count)&&Number(row.waiting_count)>=0&&
      (row.wait_time_minutes===null||(Number.isSafeInteger(row.wait_time_minutes)&&Number(row.wait_time_minutes)>=0))&&
      typeof row.retrieved_at==='string'&&Number.isFinite(Date.parse(row.retrieved_at))&&Date.parse(row.retrieved_at)<=checked&&
      checked-Date.parse(String(row.observed_at))<=20*60_000))return;
  const runId=context.runId;
  if(!runId||runId.length>200||!/^[A-Za-z0-9._:@/|+-]+$/.test(runId))throw new Error('invalid_operational_identity');
  const at=new Date(context.completedAt).toISOString();
  const incidents=await db.prepare(`SELECT fingerprint,last_seen FROM operational_incidents
    WHERE source_id=? AND contract_version=? AND logical_job=? AND current_state<>'RESOLVED'
    AND last_seen<=? ORDER BY fingerprint LIMIT 501`).bind(source,measurement.contractVersion,canonicalOperationalJob(source),at)
    .all<{fingerprint:string;last_seen:string}>();
  if(!incidents.success||!incidents.results)throw new Error('operational_ledger_unmeasured');
  if(incidents.results.length>500)throw new Error('operational_ledger_limit_requires_review');
  if(!incidents.results.length)return;
  let body:unknown;
  try {body=await readPublicSummary(fetchImpl);}catch {return;}
  // Reuse operations:memory's exact projection comparison; then require an exact
  // terminal set and original retrieval clocks, not just a matching subset.
  if(matchPublicEvidence(measurement,body)!==true)return;
  const rows=(body as {airport?:{congestion?:unknown}}).airport?.congestion;
  if(!Array.isArray(rows))return;
  const published=rows.filter(row=>row&&typeof row==='object'&&row.terminal===terminal);
  if(published.length!==measurement.sample.length||new Set(published.map(row=>row.zone)).size!==published.length||
    !measurement.sample.every(row=>published.some(actual=>actual.zone===row.zone&&actual.retrievedAt===row.retrieved_at&&
      actual.waitTimeRaw===row.wait_time_raw&&actual.freshness==='LIVE')))return;
  if(!fullyVerified({...measurement,publicValid:true}))return;

  // Each insert performs the compare-and-set inside the same D1 transaction as
  // its incident fold. A collection starting/completing/changing rows during the
  // public read cannot turn an old snapshot into a new healthy claim.
  const health=measurement.health,run=measurement.run;
  const healthGuard=HEALTH_FIELDS.map(field=>`h.${field} IS ?`).join(' AND ');
  const runGuard=RUN_FIELDS.map(field=>`r.${field} IS ?`).join(' AND ');
  const rowGuard=ROW_FIELDS.map(field=>`c.${field} IS json_extract(j.value,'$.${field}')`).join(' AND ');
  const guard=`EXISTS(SELECT 1 FROM operational_source_state WHERE source_id=? AND run_id=? AND checked_at=?
      AND data_valid=1 AND storage_valid=1 AND contract_version=?)
    AND EXISTS(SELECT 1 FROM source_health h WHERE h.source_id=? AND ${healthGuard})
    AND EXISTS(SELECT 1 FROM collector_runs r WHERE r.source_id=? AND ${runGuard})
    AND NOT EXISTS(SELECT 1 FROM collector_runs WHERE source_id=? AND (started_at>? OR (started_at=? AND run_id<>?)))
    AND (SELECT MAX(observed_at) FROM airport_congestion WHERE terminal=? AND source_id=?)=?
    AND (SELECT COUNT(*) FROM airport_congestion WHERE terminal=? AND source_id=? AND observed_at=?)=?
    AND NOT EXISTS(SELECT 1 FROM airport_congestion c WHERE c.terminal=? AND c.source_id=? AND c.observed_at=?
      AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE ${rowGuard}))`;
  const observed=measurement.sample[0].observed_at;
  const params=[source,String(measurement.runId),at,measurement.contractVersion,source,...HEALTH_FIELDS.map(field=>health[field]??null),source,...RUN_FIELDS.map(field=>run[field]??null),
    source,run.started_at,run.started_at,run.run_id,terminal,source,observed,terminal,source,observed,measurement.sample.length,
    terminal,source,observed,JSON.stringify(measurement.sample)];
  const evidence=safeOperationalEvidence('regular collection: exact latest stored/public congestion rows and clocks reverified; prior attempt outcomes unchanged');
  for(const incident of incidents.results) {
    const eventId=`${incident.fingerprint}|HEALTHY|${runId}`;
    await db.batch([
      db.prepare(`INSERT INTO operational_incident_events
        (event_id,fingerprint,source_id,failure_class,contract_version,logical_job,kind,run_id,at,evidence,verified,last_good_at)
        SELECT ?,fingerprint,source_id,failure_class,contract_version,logical_job,'HEALTHY',?,?,?,1,?
        FROM operational_incidents WHERE fingerprint=? AND last_seen=? AND current_state<>'RESOLVED' AND ${guard}
        ON CONFLICT(event_id) DO NOTHING`).bind(eventId,runId,at,evidence,at,incident.fingerprint,incident.last_seen,...params),
      db.prepare(`UPDATE operational_source_state SET public_valid=1,last_good_at=?,evidence=?
        WHERE source_id=? AND run_id=? AND checked_at=?
        AND EXISTS(SELECT 1 FROM operational_incident_events WHERE event_id=? AND verified=1) AND ${guard}`)
        .bind(at,evidence,source,String(measurement.runId),at,eventId,...params),
    ]);
  }
}
