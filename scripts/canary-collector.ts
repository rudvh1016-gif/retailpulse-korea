/** The only approved active canary entry seam. No grant creation/reset or fallback. */
import {CloudflareD1RestDatabase} from '../lib/d1-rest';
import {D1AdmissionAuthority} from '../lib/d1-admission-authority';
import {CLAIM_SQL,COMPLETE_SQL} from '../lib/admission-contract';
import {executeWithAuthority} from './authoritative-admission';
import type {ProductionSourceResult} from '../lib/production-runner';
export const CANARY_WRITERS=['airport_congestion','airport_congestion_t2','seoul_realtime','airport_passenger_forecast','weather'] as const;
const CANARY_TABLES:Record<string,string[]>={
 airport_congestion:['airport_congestion','recovery_public_snapshots'],airport_congestion_t2:['airport_congestion','recovery_public_snapshots'],
 seoul_realtime:['seoul_realtime_area','seoul_realtime_commercial','seoul_realtime_forecast','seoul_context','recovery_public_snapshots'],
 airport_passenger_forecast:['airport_passenger_forecast','recovery_forecast_publications'],weather:['weather_forecast','recovery_forecast_publications'],
};
export function canaryCollectorSqlAllowed(source:string,sql:string):boolean{
 const table=/^\s*INSERT\s+INTO\s+([a-z_]+)\b/i.exec(sql)?.[1]?.toLowerCase();
 return !!table&&!!CANARY_TABLES[source]&&[...CANARY_TABLES[source],'source_health','collector_runs'].includes(table);
}
export async function runCanaryCollector(options:{source:string;databaseId:string;accountId:string;apiToken:string;values:Record<string,string|undefined>;fetchImpl?:typeof fetch},work:(db:CloudflareD1RestDatabase)=>Promise<ProductionSourceResult>):Promise<ProductionSourceResult>{
 const {values,source,databaseId}=options;
 if(values.RPK_CANARY_ENABLED!=='true'||values.GITHUB_REF!=='refs/heads/main'||values.GITHUB_EVENT_NAME!=='workflow_dispatch'||!CANARY_WRITERS.includes(source as typeof CANARY_WRITERS[number])||values.RPK_CANARY_SOURCE!==source||!values.RPK_CANARY_EPOCH||!values.RPK_CANARY_REQUEST_ID||!/^[a-f0-9]{40}$/i.test(values.GITHUB_SHA??''))return {source,status:'ERROR',records:0,providerRequests:0,detail:'canary_admission_required; no request authorized'};
 let started=false;let outcome:ProductionSourceResult|undefined;
 let phase:'AUTHORITY'|'COLLECTOR'|'CLOSED'='AUTHORITY';
 const db=new CloudflareD1RestDatabase(options.accountId,databaseId,options.apiToken,options.fetchImpl??fetch,sql=>phase==='AUTHORITY'?(sql===CLAIM_SQL||sql===COMPLETE_SQL):phase==='COLLECTOR'&&canaryCollectorSqlAllowed(source,sql));
 try{
  return await executeWithAuthority({enabled:true,authority:new D1AdmissionAuthority(db as unknown as D1Database),scope:{databaseId,epoch:values.RPK_CANARY_EPOCH,source,commit:values.GITHUB_SHA!},requestId:values.RPK_CANARY_REQUEST_ID},async()=>{started=true;phase='COLLECTOR';try{outcome=await work(db);return outcome;}finally{phase='AUTHORITY';}}) as ProductionSourceResult;
 }catch{return {...outcome,source,status:'ERROR',records:outcome?.records??0,...(!started?{providerRequests:0}:{}),executionUncertain:true,detail:'canary_admission_or_execution_unconfirmed; no retry authorized'};}
 finally{phase='CLOSED';}
}
