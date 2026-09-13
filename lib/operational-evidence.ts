/** Bounded read-only evidence. No provider calls, and no hot public-route imports. */
import { allAreaIds } from './areas';
import { buildCoverageContext } from './data-coverage';
import { readRequiredForecastCoverage } from './collector';
import { expectedWeatherIssuedAt } from './collection-recovery';
import { summarizeTodayPassengerForecast, type AirportForecastAggregateRow } from './airport-today-summary';
import { resolveDiagnosticSourceIds } from './production-diagnostics';
import { STORE_DYNAMICS_MAPPING_VERSION } from './store-dynamics';
import { SEOUL_SUBWAY_MAPPING_VERSION } from './subway-ridership';
import { FOREIGN_PURPOSE_MAPPING_VERSION } from './foreign-purpose-mobility';
import { SEOUL_FOREIGN_MAPPING_VERSION } from './seoul-foreign';
import { verifyRecovery, type RecoveryVerification } from './recovery-orchestration';
import type { SourceObservation } from './source-lifecycle';
import type { FailureState } from './operational-states';

export type EvidenceRow=Record<string,unknown>;
export interface SourceMeasurement extends RecoveryVerification {
  sourceId:string; contractVersion:string; runId:string|null; observedAt:string;
  run: EvidenceRow|null; health:EvidenceRow|null; storedRows:number|null;
  storageReadFailed:boolean; coverage:'COMPLETE'|'PARTIAL'|'UNKNOWN';
  failureClass:FailureState|null; detail:string; sample:EvidenceRow[];
}
const MAPPINGS:Record<string,string>={SEOUL_STORE_DYNAMICS:STORE_DYNAMICS_MAPPING_VERSION,
  SEOUL_SUBWAY_RIDERSHIP:SEOUL_SUBWAY_MAPPING_VERSION,SEOUL_FOREIGN_PURPOSE_MOBILITY:FOREIGN_PURPOSE_MAPPING_VERSION,
  SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION:SEOUL_FOREIGN_MAPPING_VERSION};
export function observedContract(sourceId:string, health:EvidenceRow|null):string {
  const version=health?.schema_version;
  if(typeof version!=='string'||!version||version==='unavailable'||version==='UNKNOWN_CONTRACT') return 'UNKNOWN_CONTRACT';
  // Mapping is a part of identity where a canonical mapping already exists.
  return version+(MAPPINGS[sourceId]?`:${MAPPINGS[sourceId]}`:'');
}
export function sourceIdsForRun(source:string):string[] {
  if(source==='airport_passenger_forecast_recovery')source='airport_passenger_forecast';
  if(source==='weather_recovery')source='weather';
  return resolveDiagnosticSourceIds(source);
}
export function canonicalOperationalJob(sourceId:string):string {
  // One source's primary and recovery share a logical job/budget.
  if(sourceId==='INCHEON_PASSENGER_FORECAST')return 'collect-forecast.yml';
  if(sourceId==='KMA_VILAGE_FCST')return 'collect-weather.yml';
  if(['SEOUL_CITYDATA_PPLTN','SEOUL_CITYDATA_CMRCL','INCHEON_DEPARTURE_CONGESTION','INCHEON_DEPARTURE_CONGESTION_T2'].includes(sourceId))return 'collect-realtime.yml';
  if(['SEOUL_ESTIMATED_SALES','SEOUL_STORE_DYNAMICS'].includes(sourceId))return 'collect-sales.yml';
  if(sourceId==='INCHEON_TRANSFER_FORECAST')return 'collect-transfer.yml';
  return 'collect-production.yml';
}
async function rows(db:D1Database,sql:string,params:unknown[]=[]):Promise<EvidenceRow[]> {
  const result=await db.prepare(sql).bind(...params).all<EvidenceRow>();
  if(!result.success)throw new Error('operational_read_failed');
  if(!Array.isArray(result.results))throw new Error('operational_rows_unmeasured');
  return result.results;
}
const validTime=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const safeNumber=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0;

export async function measureSource(db:D1Database,sourceId:string,nowIso:string):Promise<SourceMeasurement> {
  const [run,health]=await Promise.all([
    db.prepare('SELECT run_id,status,started_at,finished_at,records_read,records_written,detail FROM collector_runs WHERE source_id=? ORDER BY started_at DESC LIMIT 1').bind(sourceId).first<EvidenceRow>(),
    db.prepare('SELECT * FROM source_health WHERE source_id=?').bind(sourceId).first<EvidenceRow>(),
  ]);
  const output:SourceMeasurement={sourceId,contractVersion:observedContract(sourceId,health),runId:run?String(run.run_id):null,observedAt:nowIso,
    run,health,storedRows:null,storageReadFailed:false,coverage:'UNKNOWN',dataValid:null,storageValid:null,publicValid:null,
    failureClass:null,detail:'coverage/publication not measured for this source',sample:[]};
  const context=buildCoverageContext(nowIso), now=Date.parse(nowIso);
  try {
    if(sourceId==='SEOUL_CITYDATA_PPLTN'||sourceId==='SEOUL_CITYDATA_CMRCL') {
      const population=sourceId==='SEOUL_CITYDATA_PPLTN';
      const table=population?'seoul_realtime_area':'seoul_realtime_commercial';
      output.sample=(await Promise.all(allAreaIds.map(area=>rows(db,`SELECT * FROM ${table}
        WHERE source_id=? AND area=? AND observed_at<=? ORDER BY observed_at DESC LIMIT 1`,[sourceId,area,context.kstNowIso])))).flat();
      const valid=output.sample.every(row=>row.quality_status==='VALID'&&validTime(row.observed_at)&&
        (population?safeNumber(row.population_min)&&safeNumber(row.population_max)&&Number(row.population_max)>=Number(row.population_min):true));
      const current=output.sample.every(row=>now-Date.parse(String(row.observed_at))<=35*60_000);
      output.storedRows=output.sample.length; output.storageValid=output.sample.length===3;
      output.coverage=output.sample.length===3?'COMPLETE':'PARTIAL';output.dataValid=valid&&current&&output.storageValid;
      output.failureClass=!valid?'INVALID_PAYLOAD':!current?'STALE':!output.storageValid?'PARTIAL_DATA':null;
    } else if(sourceId==='KMA_VILAGE_FCST') {
      const {issuedAt}=expectedWeatherIssuedAt(new Date(nowIso));
      output.sample=(await Promise.all(allAreaIds.map(area=>rows(db,`SELECT * FROM weather_forecast WHERE area=? AND issued_at=? AND target_at>=?
        ORDER BY target_at LIMIT 1`,[area,issuedAt,context.kstHourStartIso])))).flat();
      output.storedRows=output.sample.length;output.storageValid=output.sample.length===3;
      output.coverage=output.storageValid?'COMPLETE':'PARTIAL';
      output.dataValid=output.storageValid&&output.sample.every(row=>row.source_id===sourceId&&row.quality_status==='VALID'&&validTime(row.target_at));
      output.failureClass=output.dataValid?null:output.storageValid?'INVALID_PAYLOAD':'PARTIAL_DATA';
    } else if(sourceId==='INCHEON_PASSENGER_FORECAST') {
      const coverage=await readRequiredForecastCoverage(db,new Date(nowIso));
      if(coverage.readFailed)throw new Error('coverage_read_failed');
      output.sample=await rows(db,`SELECT terminal,direction,is_aggregate AS isAggregate,target_date AS targetDate,
        time_band_raw AS timeBandRaw,target_start_at AS targetStartAt,target_end_at AS targetEndAt,
        expected_passengers AS expectedPassengers,retrieved_at AS retrievedAt
        FROM airport_passenger_forecast WHERE target_date IN (?,?) AND direction='departure' AND is_aggregate=1
        ORDER BY target_date,target_start_at,terminal LIMIT 192`,[context.kstToday,new Date(Date.parse(context.kstToday+'T00:00:00Z')+86400000).toISOString().slice(0,10)]);
      output.storedRows=output.sample.length;output.storageValid=coverage.days.every(day=>day.coverage==='COMPLETE');
      output.coverage=output.storageValid?'COMPLETE':'PARTIAL';output.dataValid=coverage.completeAndCurrent;
      output.failureClass=output.dataValid?null:output.storageValid?'STALE':'PARTIAL_DATA';
    } else if(sourceId==='INCHEON_DEPARTURE_CONGESTION'||sourceId==='INCHEON_DEPARTURE_CONGESTION_T2') {
      const terminal=sourceId.endsWith('_T2')?'T2':'T1';
      output.sample=await rows(db,`SELECT * FROM airport_congestion WHERE terminal=? AND source_id=?
        AND observed_at=(SELECT MAX(observed_at) FROM airport_congestion WHERE terminal=? AND source_id=?) LIMIT 30`,[terminal,sourceId,terminal,sourceId]);
      output.storedRows=output.sample.length;output.storageValid=output.sample.length>0;
      output.dataValid=output.storageValid&&output.sample.every(row=>row.quality_status==='VALID'&&validTime(row.observed_at)
        &&now-Date.parse(String(row.observed_at))>=0&&now-Date.parse(String(row.observed_at))<=35*60_000);
      // This proves the stored reported checkpoints, not that the provider covers all gates.
      output.coverage='UNKNOWN';output.failureClass=output.dataValid?null:output.storageValid?'STALE':'PARTIAL_DATA';
    } else {
      // Presence is only a storage witness, not proof of complete coverage/validity.
      // Each query has an existing indexed scope. Unsupported publication stays UNKNOWN.
      const probes:Record<string,[string,unknown[]]>={
        INCHEON_FLIGHT_DETAIL:[`SELECT physical_flight_id,scheduled_at,schema_version,quality_status FROM airport_flights WHERE direction='departure' AND scheduled_at>=? AND scheduled_at<? LIMIT 1`,[context.kstToday,context.kstToday+'T99']],
        INCHEON_DUTY_FREE_ACTUAL:[`SELECT physical_flight_id,a2_source_hash FROM airport_flights WHERE direction='departure' AND scheduled_at>=? AND scheduled_at<? AND a2_source_hash IS NOT NULL LIMIT 1`,[context.kstToday,context.kstToday+'T99']],
        INCHEON_FACILITY_DIRECTORY:[`SELECT facility_id,schema_version,quality_status FROM airport_facility WHERE terminal='T1' LIMIT 1`,[]],
        INCHEON_SCHEDULED_DUTY_FREE:[`SELECT physical_schedule_id,schema_version,quality_status FROM airport_scheduled_flights WHERE valid_from<=? AND valid_to>=? LIMIT 1`,[context.kstToday,context.kstToday]],
        KTO_TOURAPI_EVENT:[`SELECT content_id,schema_version,quality_status FROM tourism_events WHERE event_end>=? LIMIT 1`,[context.kstToday]],
        SEOUL_ESTIMATED_SALES:[`SELECT quarter_code,schema_version,quality_status FROM seoul_estimated_sales WHERE area='hongdae' ORDER BY quarter_code DESC LIMIT 1`,[]],
        SEOUL_STORE_DYNAMICS:[`SELECT quarter_code,schema_version,quality_status,mapping_version FROM seoul_store_dynamics WHERE area='hongdae' AND source_id=? AND mapping_version=? ORDER BY quarter_code DESC LIMIT 1`,[sourceId,STORE_DYNAMICS_MAPPING_VERSION]],
        SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION:[`SELECT reference_at,schema_version,quality_status FROM seoul_foreign_presence_area WHERE source_id=? AND mapping_version=? LIMIT 1`,[sourceId,SEOUL_FOREIGN_MAPPING_VERSION]],
        SEOUL_FOREIGN_PURPOSE_MOBILITY:[`SELECT reference_date,schema_version,quality_status FROM seoul_foreign_purpose_mobility WHERE source_id=? AND mapping_version=? AND area='hongdae' ORDER BY reference_date DESC LIMIT 1`,[sourceId,FOREIGN_PURPOSE_MAPPING_VERSION]],
        SEOUL_SUBWAY_RIDERSHIP:[`SELECT reference_date,schema_version,quality_status FROM seoul_subway_ridership WHERE area='hongdae' AND mapping_version=? ORDER BY reference_date DESC LIMIT 1`,[SEOUL_SUBWAY_MAPPING_VERSION]],
      };
      const probe=probes[sourceId];
      if(probe) {
        output.sample=await rows(db,...probe);output.storedRows=output.sample.length;
        // Empty current events/seasonal/reference slices do not prove storage failure.
        output.storageValid=output.sample.length?true:null;
      }
    }
    if(output.storedRows!==null)output.detail=`bounded current-scope read=${output.storedRows}; coverage=${output.coverage}; data=${output.dataValid}; storage=${output.storageValid}; publication=UNKNOWN`;
  } catch {output.storageReadFailed=true;output.storageValid=null;output.dataValid=null;output.detail='storage probe unavailable; no missing coverage inferred';output.failureClass=null;}
  if(output.contractVersion==='UNKNOWN_CONTRACT') {
    const versions=[...new Set(output.sample.map(row=>row.schema_version).filter((value):value is string=>typeof value==='string'&&value!=='unavailable'))];
    if(versions.length===1)output.contractVersion=observedContract(sourceId,{schema_version:versions[0]});
  }
  const knownCompletion=validTime(run?.finished_at)&&Date.parse(String(run?.finished_at))<=now&&
    ['OK','SUCCESS','COMPLETE','COMPLETED','SKIPPED_ALREADY_HEALTHY','SKIPPED_ALREADY_COMPLETE_TODAY','SKIPPED_FRESH'].includes(String(run?.status));
  if(output.dataValid===true&&(!knownCompletion||!validTime(health?.last_retrieved_at)||Date.parse(String(health?.last_retrieved_at))>now))output.dataValid=null;
  // A process error cannot be erased by old readable rows. Only stable, structured facts qualify.
  if((run&&['ERROR','NEEDS_KEY'].includes(String(run.status)))||health?.status==='ERROR'||health?.status==='MISSING') {
    output.dataValid=false;
    const detail=String(health?.detail??run?.detail??'');
    output.failureClass=run?.status==='NEEDS_KEY'||/failureClass=(?:AUTH|SCHEMA)|httpStatus=(?:401|403)|causeCode=D1_/.test(detail)
      ?'HUMAN_REVIEW_REQUIRED':/failureClass=(?:NETWORK|TIMEOUT)|httpStatus=(?:429|5\d\d)/.test(detail)?'EXECUTION_ERROR':'HUMAN_REVIEW_REQUIRED';
    output.detail=`collector status=${run?.status??'UNKNOWN'}; deterministic failure=${output.failureClass}; ${output.detail}`;
  } else if(run&&String(run.status)==='PARTIAL') {output.dataValid=false;output.failureClass='PARTIAL_DATA';}
  return output;
}

/** Exact KORETAIL projection comparison. HTTP success alone never sets publicValid. */
export function matchPublicEvidence(measurement:SourceMeasurement,body:unknown):boolean|null {
  if(!body||typeof body!=='object')return null;
  const summary=body as {mode?:string;serviceDateKst?:string;areas?:Record<string,Record<string,unknown>>;airport?:Record<string,unknown>};
  if(summary.mode!=='live-summary'||summary.serviceDateKst!==buildCoverageContext(measurement.observedAt).kstToday)return null;
  if(measurement.storageValid!==true)return null;
  if(!measurement.sample.length)return null;
  const matches=(actual:unknown,expected:EvidenceRow,fields:Record<string,string>)=>{
    if(!actual||typeof actual!=='object')return false;
    return Object.entries(fields).every(([published,stored])=>(actual as EvidenceRow)[published]===expected[stored]);
  };
  if(measurement.sourceId==='SEOUL_CITYDATA_PPLTN'||measurement.sourceId==='SEOUL_CITYDATA_CMRCL') {
    const population=measurement.sourceId==='SEOUL_CITYDATA_PPLTN';
    return measurement.sample.every(row=>matches(summary.areas?.[String(row.area)]?.[population?'realtime':'commercial'],row,
      population?{observedAt:'observed_at',populationMin:'population_min',populationMax:'population_max',schemaVersion:'schema_version',areaCode:'area_code'}:
        {observedAt:'observed_at',paymentAmountMin:'payment_amount_min',paymentAmountMax:'payment_amount_max',schemaVersion:'schema_version'}));
  }
  if(measurement.sourceId==='KMA_VILAGE_FCST')return measurement.sample.every(row=>{
    const weather=summary.areas?.[String(row.area)]?.weather;
    return Array.isArray(weather)&&weather.some(actual=>matches(actual,row,{issuedAt:'issued_at',targetAt:'target_at',temperatureTenthC:'temperature_tenth_c',precipitationProbability:'precipitation_probability'}));
  });
  if(measurement.sourceId==='INCHEON_PASSENGER_FORECAST') {
    // Today only. Tomorrow is intentionally not verified by today's endpoint.
    // The source requires BOTH days; use explicit dated public evidence to finish the full check.
    const expected=summarizeTodayPassengerForecast(measurement.sample.filter(row=>row.targetDate===summary.serviceDateKst) as unknown as AirportForecastAggregateRow[],summary.serviceDateKst!);
    if(summary.airport?.todayExpectedPassengersTotal!==expected.total||
      JSON.stringify(summary.airport?.todayExpectedPassengersByTerminal)!==JSON.stringify(expected.totalByTerminal))return false;
    return null;
  }
  if(measurement.sourceId.startsWith('INCHEON_DEPARTURE_CONGESTION')) {
    const congestion=summary.airport?.congestion;
    return Array.isArray(congestion)&&measurement.sample.every(row=>congestion.some(actual=>matches(actual,row,
      {terminal:'terminal',zone:'zone',observedAt:'observed_at',waitingCount:'waiting_count',waitTimeMinutes:'wait_time_minutes'})));
  }
  return null;
}
export async function readPublicSummary(fetchImpl:typeof fetch=fetch):Promise<unknown> {
  // Fixed own-origin read, no authenticated provider URL and no cache-busting poll.
  const response=await fetchImpl('https://koretaildata.com/api/live/summary',{signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)throw new Error(`public_summary_http_${response.status}`);
  return response.json();
}
export interface PublicEvidenceBundle {today:unknown;tomorrow:unknown}
export async function readPublicEvidence(nowIso:string,fetchImpl:typeof fetch=fetch):Promise<PublicEvidenceBundle> {
  const today=await readPublicSummary(fetchImpl);
  const tomorrow=new Date(Date.parse(buildCoverageContext(nowIso).kstToday+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  const response=await fetchImpl(`https://koretaildata.com/api/live/summary?date=${tomorrow}`,{signal:AbortSignal.timeout(15000),redirect:'error'});
  return {today,tomorrow:response.ok?await response.json():null};
}
export function matchPublicBundle(measurement:SourceMeasurement,bundle:PublicEvidenceBundle):boolean|null {
  if(measurement.sourceId!=='INCHEON_PASSENGER_FORECAST')return matchPublicEvidence(measurement,bundle.today);
  if(measurement.storageValid!==true)return null;
  const days=[...new Set(measurement.sample.map(row=>String(row.targetDate)))].sort();
  if(days.length!==2)return null;
  for(const [index,body] of [bundle.today,bundle.tomorrow].entries()) {
    if(!body||typeof body!=='object')return null;
    const summary=body as {mode?:string;serviceDateKst?:string;airport?:Record<string,unknown>};
    if(summary.mode!=='live-summary'||summary.serviceDateKst!==days[index])return null;
    const expected=summarizeTodayPassengerForecast(measurement.sample.filter(row=>row.targetDate===days[index]) as unknown as AirportForecastAggregateRow[],days[index]);
    const actual=summary.airport?.todayExpectedPassengersByTerminal as Record<string,unknown>|undefined;
    const actualTimes=summary.airport?.passengerForecastRetrievedAtByTerminal as Record<string,unknown>|undefined;
    if(expected.coverage.all!=='COMPLETE'||summary.airport?.todayExpectedPassengersTotal!==expected.total||
      ['T1','T2'].some(terminal=>actual?.[terminal]!==expected.totalByTerminal[terminal]||actualTimes?.[terminal]!==expected.retrievedAtByTerminal[terminal]))return false;
    // Matching totals alone cannot detect a swapped hour: compare the full terminal timelines too.
    const timelines=summary.airport?.passengerForecastTimelineByTerminal as Record<string,unknown>|undefined;
    if(['T1','T2'].some(terminal=>JSON.stringify(timelines?.[terminal])!==JSON.stringify(expected.timelineByTerminal[terminal])))return false;
  }
  return true;
}
export function verifyPublicMeasurement(measurement:SourceMeasurement,bundle:PublicEvidenceBundle):void {
  measurement.publicValid=matchPublicBundle(measurement,bundle);
  if(measurement.publicValid===false&&measurement.dataValid===true&&measurement.storageValid===true)measurement.failureClass='PUBLICATION_MISMATCH';
  measurement.detail=measurement.detail.replace('publication=UNKNOWN',`publication=${measurement.publicValid===null?'UNKNOWN':measurement.publicValid}`);
}
export function sourceObservation(measurement:SourceMeasurement,job:string,interval:number|null):SourceObservation {
  const {run,health}=measurement;
  return {sourceId:measurement.sourceId,job,enablement:'SCHEDULE_DEFINED',expectedIntervalMs:interval,
    lastRun:run?{status:String(run.status),startedAt:String(run.started_at),finishedAt:run.finished_at as string|null,
      recordsRead:Number(run.records_read),recordsWritten:Number(run.records_written),detail:null}:null,
    health:health?{status:String(health.status),lastRetrievedAt:health.last_retrieved_at as string|null,consecutiveFailures:Number(health.consecutive_failures)}:null,
    storedRows:measurement.storedRows,storageReadFailed:measurement.storageReadFailed,coverage:measurement.coverage,
    payloadProof:{valid:measurement.dataValid,failure:measurement.failureClass??'UNKNOWN',detail:measurement.detail},
    collectionFailure:measurement.failureClass,
    // Inspection time is NOT provider publication time. Exact original timestamps
    // are checked in the projection matcher; never relabel now as publishedAt.
    published:measurement.publicValid===null?null:{present:measurement.publicValid,asOf:null}};
}
export const fullyVerified=(measurement:RecoveryVerification)=>verifyRecovery(measurement).verified;
