import type {CollectorEnv} from './collector';
import {runSelectedProductionSources,type ProductionSourceResult} from './production-runner';
import {publicAreaIds} from './areas';
import {capacitySignal} from './storage-recovery';
import {SOURCE_IDS,validRecoverySnapshot,timestamp,type RecoverySource,type RecoverySnapshot,type AdmissionState} from './recovery-runtime';
type Row=Record<string,unknown>;
async function rows(db:D1Database,sql:string,...params:unknown[]):Promise<Row[]> {
 const answer=await db.prepare(sql).bind(...params).all<Row>();if(!answer.success)throw Error('recovery_read_failed');return answer.results??[];
}
async function capture(db:D1Database,source:RecoverySource,publishedAt:string):Promise<RecoverySnapshot> {
 const sources=await rows(db,`SELECT source_id AS sourceId,status,last_event_at AS eventAt,last_retrieved_at AS retrievedAt,detail FROM source_health WHERE source_id IN (${SOURCE_IDS[source].map(()=>'?').join(',')})`,...SOURCE_IDS[source]);
 const snapshot:RecoverySnapshot={version:1,source,publishedAt,sources,congestion:[],areas:{}};
 if(source!=='seoul_realtime') {
  const terminal=source==='airport_congestion'?'T1':'T2';
  snapshot.congestion=await rows(db,`SELECT terminal,zone,wait_time_minutes AS waitTimeMinutes,wait_time_raw AS waitTimeRaw,waiting_count AS waitingCount,observed_at AS observedAt,retrieved_at AS retrievedAt FROM airport_congestion WHERE source_id=? AND terminal=? AND observed_at=(SELECT observed_at FROM airport_congestion INDEXED BY airport_congestion_terminal_observed_idx WHERE source_id=? AND terminal=? ORDER BY observed_at DESC LIMIT 1) LIMIT 21`,SOURCE_IDS[source][0],terminal,SOURCE_IDS[source][0],terminal);
 } else for(const area of publicAreaIds) {
  const realtime=(await rows(db,`SELECT area,source_id AS sourceId,schema_version AS schemaVersion,quality_status AS qualityStatus,area_code AS areaCode,congestion_level AS congestionLevel,congestion_label AS congestionLabel,population_min AS populationMin,population_max AS populationMax,observed_at AS observedAt,retrieved_at AS retrievedAt FROM seoul_realtime_area WHERE area=? AND source_id='SEOUL_CITYDATA_PPLTN' ORDER BY observed_at DESC LIMIT 1`,area))[0];
  const commercial=(await rows(db,`SELECT area,source_id AS sourceId,schema_version AS schemaVersion,quality_status AS qualityStatus,commercial_level AS commercialLevel,payment_count AS paymentCount,payment_amount_min AS paymentAmountMin,payment_amount_max AS paymentAmountMax,observed_at AS observedAt,retrieved_at AS retrievedAt FROM seoul_realtime_commercial WHERE area=? AND source_id='SEOUL_CITYDATA_CMRCL' ORDER BY observed_at DESC LIMIT 1`,area))[0];
  const forecast=await rows(db,`SELECT area,issued_at AS issuedAt,target_at AS targetAt,congestion_level AS congestionLevel,congestion_label AS congestionLabel,population_min AS populationMin,population_max AS populationMax,retrieved_at AS retrievedAt FROM seoul_realtime_forecast WHERE area=? AND issued_at=? ORDER BY target_at LIMIT 25`,area,realtime?.observedAt??'');
  snapshot.areas[area]={realtime,commercial,context:null,realtimeForecast:forecast};
 }
 return snapshot;
}
/** Actual collectors write only ACTIVE staging tables. One snapshot UPSERT is the publication boundary.
 * Any collector, validation or publication failure leaves last published payload unchanged. */
export async function collectRecoverySource(env:CollectorEnv,source:RecoverySource,databaseId:string,state:AdmissionState,now=new Date()):Promise<ProductionSourceResult> {
 if(state.blocked[databaseId])return {source,status:'ERROR',records:0,providerRequests:0,detail:'failureClass=VALIDATION causeCode=D1_STORAGE_CAPACITY_BLOCKED'};
 if(!env.DB)throw Error('recovery_database_missing');
 const started=Date.now();
 try {
  const [result]=await runSelectedProductionSources(env,[source],now);
  if(result.status!=='SUCCESS'){if(capacitySignal(result.detail??'')==='CAPACITY_EXHAUSTED')state.blocked[databaseId]=true;return result;}
  const expectedCount=source==='airport_congestion'?/terminals P01:12(?:;|,|\s)/.test(result.detail??'')
   :source==='airport_congestion_t2'?/normalized 8(?:;|\s|$)/.test(result.detail??''):true;
  const publishedAt=new Date().toISOString(),snapshot=await capture(env.DB,source,publishedAt);
  if(!expectedCount||!validRecoverySnapshot(snapshot,source,Date.parse(publishedAt),true)
    ||snapshot.sources.some(row=>timestamp(row.retrievedAt)<started))return {...result,status:'PARTIAL',detail:'recovery_snapshot_validation_failed; last publication preserved'};
  const payload=JSON.stringify(snapshot);if(new TextEncoder().encode(payload).length>131072)throw Error('recovery_snapshot_too_large');
  const published=await env.DB.prepare('INSERT INTO recovery_public_snapshots(source,published_at,payload) VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET published_at=excluded.published_at,payload=excluded.payload WHERE recovery_public_snapshots.published_at<=excluded.published_at').bind(source,publishedAt,payload).run();
  if(!published.success)throw Error('recovery_publication_unconfirmed');
  const confirmed=await env.DB.prepare('SELECT published_at,payload FROM recovery_public_snapshots WHERE source=?').bind(source).first<{published_at:string;payload:string}>();
  if(confirmed?.published_at!==publishedAt||confirmed.payload!==payload)throw Error('recovery_publication_unconfirmed');
  return {...result,detail:`${result.detail??''}; recovery_snapshot=PUBLISHED`};
 }catch(error){
  const detail=error instanceof Error?error.message:'';
  if(capacitySignal(detail)==='CAPACITY_EXHAUSTED'||/d1_storage_capacity_blocked/i.test(detail))state.blocked[databaseId]=true;
  return {source,status:'ERROR',records:0,detail:state.blocked[databaseId]?'failureClass=VALIDATION causeCode=D1_STORAGE_CAPACITY_BLOCKED':'recovery_collection_or_publication_failed'};
 }
}
