import {publicAreaIds} from './areas';
import type {CollectorEnv} from './collector';
import {latestKmaIssuance} from './collector';
import {runSelectedProductionSources,type ProductionSourceResult} from './production-runner';
import {forecastFamily,readForecastPublication,validForecastPublication,type ForecastPublication,type ForecastRow} from './forecast-recovery';
import {capacitySignal} from './storage-recovery';
import type {AdmissionState} from './recovery-runtime';
import {kstDayOf,shiftKstDay} from './kst';
export async function collectForecastPublication(env:CollectorEnv,source:string,databaseId:string,state:AdmissionState,now=new Date()):Promise<ProductionSourceResult> {
 const family=forecastFamily(source);if(!family||!env.DB)throw Error('unsupported_forecast_recovery_source');
 if(state.blocked[databaseId])return {source,status:'ERROR',records:0,providerRequests:0,detail:'failureClass=VALIDATION causeCode=D1_STORAGE_CAPACITY_BLOCKED'};
 try {
  const incoming=new Set<string>(),duplicate=new Set<string>();
  // Observe exact normalized bind identities on the real writes; do not infer this attempt's
  // coverage from older canonical rows that can fill a missing hour.
  const original=env.DB;
  const instrumented={prepare(sql:string){const statement=original.prepare(sql),bind=statement.bind.bind(statement);
    statement.bind=(...values:unknown[])=>{
      let key:string|undefined;
      if(family==='A5'&&/INSERT INTO airport_passenger_forecast/.test(sql)&&values[6]===1)key=[values[3],values[4],values[7],values[9]].join('|');
      if(family==='WEATHER'&&/INSERT INTO weather_forecast/.test(sql))key=[values[2],values[3],values[4]].join('|');
      if(key){if(incoming.has(key))duplicate.add(key);incoming.add(key);}return bind(...values);
    };return statement;},batch(statements:D1PreparedStatement[]){return original.batch(statements);}} as unknown as D1Database;
  const [result]=await runSelectedProductionSources({...env,DB:instrumented},[source],now);
  if(result.status==='SKIPPED_ALREADY_HEALTHY'){
    const previous=await readForecastPublication(original,family,Math.max(now.getTime(),Date.now()));
    return previous?result:{...result,status:'PARTIAL',detail:'unpublished staging cannot authorize publication; wait for primary'};
  }
  if(!['SUCCESS','SKIPPED_ALREADY_HEALTHY'].includes(result.status)){if(capacitySignal(result.detail??'')==='CAPACITY_EXHAUSTED')state.blocked[databaseId]=true;return result;}
  const sourceId=family==='A5'?'INCHEON_PASSENGER_FORECAST':'KMA_VILAGE_FCST';
  const health=await env.DB.prepare('SELECT status,last_retrieved_at AS checkedAt FROM source_health WHERE source_id=?').bind(sourceId).first<{status:string;checkedAt:string}>();
  if(health?.status!=='LIVE')return {...result,status:'PARTIAL',detail:'forecast_recovery_receipt_not_live; publication preserved'};
  let rows:ForecastRow[],issuance:string|null=null;
  if(family==='A5'){
   const today=kstDayOf(now.toISOString());
   const answer=await env.DB.prepare(`SELECT terminal,direction,is_aggregate AS isAggregate,target_date AS targetDate,time_band_raw AS timeBandRaw,target_start_at AS targetStartAt,target_end_at AS targetEndAt,expected_passengers AS expectedPassengers,retrieved_at AS retrievedAt FROM airport_passenger_forecast INDEXED BY airport_passenger_forecast_month_idx WHERE direction IN ('departure','arrival') AND is_aggregate=1 AND target_date IN (?,?) ORDER BY target_start_at,terminal,direction LIMIT 193`).bind(today,shiftKstDay(today,1)).all<ForecastRow>();
   if(!answer.success)throw Error('a5_capture_failed');rows=answer.results??[];
  }else{
   const base=latestKmaIssuance(now);issuance=`${base.baseDate.slice(0,4)}-${base.baseDate.slice(4,6)}-${base.baseDate.slice(6)}T${base.baseTime.slice(0,2)}:00:00+09:00`;
   const hour=new Date(now.getTime()+9*3600000).toISOString().slice(0,13)+':00:00+09:00';
   const sql=`SELECT area,issued_at AS issuedAt,target_at AS targetAt,precipitation_probability AS precipitationProbability,temperature_tenth_c AS temperatureTenthC,condition_code AS conditionCode,precipitation_type_code AS precipitationTypeCode,humidity_percent AS humidityPercent,wind_speed_tenth_mps AS windSpeedTenthMps,daily_min_temperature_tenth_c AS dailyMinTemperatureTenthC,daily_max_temperature_tenth_c AS dailyMaxTemperatureTenthC,precipitation_amount_raw AS precipitationAmountRaw,precipitation_amount_kind AS precipitationAmountKind,precipitation_amount_tenth_mm AS precipitationAmountTenthMm,snow_amount_raw AS snowAmountRaw,snow_amount_kind AS snowAmountKind,snow_amount_tenth_cm AS snowAmountTenthCm FROM weather_forecast WHERE area=? AND issued_at=? AND target_at>=? ORDER BY target_at LIMIT 49`;
   const answers=await env.DB.batch<ForecastRow>(publicAreaIds.map(area=>env.DB!.prepare(sql).bind(area,issuance,hour)));
   if(answers.length!==publicAreaIds.length||answers.some(answer=>!answer.success))throw Error('weather_capture_failed');rows=answers.flatMap(answer=>answer.results??[]);
  }
  const publication:ForecastPublication={version:1,family,checkedAt:health.checkedAt,issuance,rows};
  if(!validForecastPublication(publication,family,Math.max(now.getTime(),Date.now())))return {...result,status:'PARTIAL',detail:'forecast_recovery_validation_failed; last publication preserved'};
  if(duplicate.size)return {...result,status:'PARTIAL',detail:'duplicate incoming normalized bands; last publication preserved'};
  if(family==='A5'){
    const selects=/selectdates ([01](?:,[01])?);/.exec(result.detail??'')?.[1].split(',');
    if(!selects||selects.some(offset=>{
      const day=shiftKstDay(kstDayOf(now.toISOString()),Number(offset));
      return ['T1','T2'].some(terminal=>['departure','arrival'].some(direction=>Array.from({length:24},(_,hour)=>`${day}T${String(hour).padStart(2,'0')}:00:00+09:00`).some(at=>!incoming.has([terminal,direction,day,at].join('|')))));
    }))return {...result,status:'PARTIAL',detail:'incoming A5 day is incomplete; last publication preserved'};
  }else{
    const areas=source==='weather'?publicAreaIds:[...new Set([...incoming].map(key=>key.split('|')[0]))];
    const first=Date.parse(new Date(now.getTime()+9*3600000).toISOString().slice(0,13)+':00:00+09:00');
    if(!areas.length||areas.some(area=>Array.from({length:24},(_,hour)=>first+hour*3600000).some(at=>![...incoming].some(key=>{const [a,i,target]=key.split('|');return a===area&&i===issuance&&Date.parse(target)===at;}))))return {...result,status:'PARTIAL',detail:'incoming weather horizon is incomplete; last publication preserved'};
  }
  const payload=JSON.stringify(publication);if(new TextEncoder().encode(payload).length>262144)throw Error('forecast_publication_too_large');
  const write=await env.DB.prepare('INSERT INTO recovery_forecast_publications(family,checked_at,payload) VALUES(?,?,?) ON CONFLICT(family) DO UPDATE SET checked_at=excluded.checked_at,payload=excluded.payload WHERE recovery_forecast_publications.checked_at<=excluded.checked_at').bind(family,publication.checkedAt,payload).run();
  const saved=await env.DB.prepare('SELECT payload FROM recovery_forecast_publications WHERE family=?').bind(family).first<{payload:string}>();
  if(!write.success||saved?.payload!==payload)throw Error('forecast_publication_unconfirmed');
  return {...result,detail:`${result.detail??''}; ${family}_publication=PUBLISHED`};
 }catch(error){if(capacitySignal(error instanceof Error?error.message:'')==='CAPACITY_EXHAUSTED')state.blocked[databaseId]=true;return {source,status:'ERROR',records:0,detail:state.blocked[databaseId]?'failureClass=VALIDATION causeCode=D1_STORAGE_CAPACITY_BLOCKED':'forecast_recovery_failed; last publication preserved'};}
}
