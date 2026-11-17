import {runCanaryCollector} from './canary-collector';
import {storageTrend} from '../lib/storage-recovery';
import {D1_FREE_PLANNING_LIMITS} from '../lib/storage-inventory';
import type {CollectorEnv} from '../lib/collector';
import type {CloudflareD1RestDatabase} from '../lib/d1-rest';
import {forecastFamily,type ForecastFamily} from '../lib/forecast-recovery';
import {collectForecastPublication} from '../lib/forecast-recovery-collector';
import {storageTransition} from '../lib/recovery-runtime';
import {bootstrapAllowed,loadRecoveryState,saveRecoveryState} from './recovery-state';
import {emptyAdmission} from '../lib/recovery-runtime';
import type {ProductionSourceResult} from '../lib/production-runner';
export interface ForecastRecoveryConfig {family:ForecastFamily;enabled:boolean;databaseId:string;bootstrap:boolean;statePath:string}
export function forecastRecoveryConfig(source:string,values:Record<string,string|undefined>):ForecastRecoveryConfig|null {
 const family=forecastFamily(source);if(!family)return null;
 const databaseId=values[`RPK_${family}_RECOVERY_DATABASE_ID`]??'',enabled=values[`RPK_${family}_RECOVERY_WRITES`]==='true';
 if(!databaseId&&!enabled)return null;
 return {family,enabled,databaseId,bootstrap:bootstrapAllowed(values[`RPK_${family}_RECOVERY_BOOTSTRAP`],values[`RPK_${family}_RECOVERY_BOOTSTRAP_UNTIL`],values[`RPK_${family}_RECOVERY_BOOTSTRAP_COMMIT`],values.GITHUB_SHA),statePath:`.wrangler/recovery-${family.toLowerCase()}-admission.json`};
}
export async function runForecastRecovery(config:ForecastRecoveryConfig,source:string,env:CollectorEnv,connection:{accountId:string;databaseId:string;apiToken:string},now=new Date()):Promise<ProductionSourceResult> {
 if(!config.enabled)return {source,status:'SKIPPED_RECOVERY_PAUSED',records:0,providerRequests:0,detail:`${config.family} active identity retained; no archive fallback`};
 if(!/^[a-f0-9-]{36}$/i.test(config.databaseId)||config.databaseId===connection.databaseId)throw Error('forecast_recovery_database_not_isolated');
 let state;try{state=loadRecoveryState(config.statePath);}catch{state=emptyAdmission();} // advisory only
 let measured:CloudflareD1RestDatabase|undefined;
 const startedAt=new Date().toISOString();
 const result=await runCanaryCollector({source,databaseId:config.databaseId,accountId:connection.accountId,apiToken:connection.apiToken,values:process.env},async db=>{measured=db;return collectForecastPublication({...env,DB:db as unknown as D1Database},source,config.databaseId,state,now);});
 const db=measured;if(!db)return result;
 const usage=db.usageSnapshot();
 if(usage.sizeBytes!==null&&usage.sizeObservedAt&&usage.sizeObservedAt>=startedAt){
   const point={at:usage.sizeObservedAt,bytes:usage.sizeBytes};
   const observation=storageTrend([...(state.sizes?.[config.databaseId]?[state.sizes[config.databaseId]]:[]),point],D1_FREE_PLANNING_LIMITS.perDatabaseBytes);
   console.log(JSON.stringify({resource:`${config.family}_storage`,basis:'OFFICIAL_QUERY_META',bytes:point.bytes,level:observation.level,bytesPerDay:observation.bytesPerDay,trendBasis:observation.trendBasis}));
   if(storageTransition(state,config.databaseId,'storage',observation.level)&&observation.level!=='NORMAL')console.log(`::warning title=Forecast storage guardrail::${config.family} ${observation.level}; no deletion or paid fallback`);
   state.sizes={...state.sizes,[config.databaseId]:point};
 }
 const notice=storageTransition(state,config.databaseId,source,state.blocked[config.databaseId]?'CAPACITY_EXHAUSTED':result.status);
 try{saveRecoveryState(config.statePath,state);}catch{return {...result,status:'ERROR',executionUncertain:true,detail:'forecast_admission_state_save_failed; manual review required'};}
 if(notice)console.log(`::${result.status==='SUCCESS'?'warning':'error'} title=Isolated forecast recovery::${config.family} ${result.status}; no cross-source action`);
 return result;
}
