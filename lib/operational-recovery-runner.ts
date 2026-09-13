import { OperationalMemory, TRIAL_END_EXCLUSIVE, type AttemptRequest } from './operational-memory';
import { measureSource, verifyPublicMeasurement, readPublicEvidence } from './operational-evidence';
import { runSelectedProductionSources, type ProductionSourceResult } from './production-runner';
import { verifyRecovery, type RecoveryVerification } from './recovery-orchestration';
import type { CollectorEnv } from './collector';

/** No recurring workflow calls this. Production execution is deliberately dormant.
 * Even after trial expiry, activation still needs a reviewed explicit configuration change. */
export const CENTRAL_RECOVERY_EXECUTION_ENABLED = false;
export function recoveryActivation(nowIso:string) {
  return {allowed:false as const,reason:Date.parse(nowIso)<Date.parse(TRIAL_END_EXCLUSIVE)
    ?'UI_TRIAL_LOCK: no additional provider execution':'CENTRAL_RECOVERY_DORMANT: owner-reviewed activation required'};
}
export interface RecoveryExecutor {
  execute:()=>Promise<ProductionSourceResult>;
  verify:()=>Promise<RecoveryVerification>;
  now:()=>string;
}
/** Durable closed loop; dependency injection is the same adapter boundary used by source runners. */
export async function executeControlledRecovery(memory:OperationalMemory,request:AttemptRequest,executor:RecoveryExecutor) {
  const admission=await memory.admit(request);
  if(!admission.admitted)return admission;
  let result:ProductionSourceResult;
  try {result=await executor.execute();}
  catch {
    await memory.finish(admission.attemptId,executor.now(),{dataValid:false,storageValid:null,publicValid:null});
    return {state:'RECOVERY_FAILED',verified:false};
  }
  let verification:RecoveryVerification;
  try {verification=await executor.verify();}
  catch {verification={dataValid:null,storageValid:null,publicValid:null};}
  if(['ERROR','NEEDS_KEY'].includes(result.status))verification.dataValid=false;
  await memory.finish(admission.attemptId,executor.now(),verification,{providerRequests:result.providerRequests??null});
  return verifyRecovery(verification);
}
/** Reuses the existing missing-coverage mechanisms. A1 has no extra daily quota
 * outside its existing 500-call windows, so it cannot be newly dispatched here. */
export function existingRecoveryAdapter(env:CollectorEnv,sourceId:string):RecoveryExecutor|null {
  const source=sourceId==='INCHEON_PASSENGER_FORECAST'?'airport_passenger_forecast_recovery':sourceId==='KMA_VILAGE_FCST'?'weather_recovery':null;
  if(!source||!env.DB)return null;
  return {now:()=>new Date().toISOString(),execute:async()=> (await runSelectedProductionSources(env,[source]))[0],
    verify:async()=>{
      const measured=await measureSource(env.DB!,sourceId,new Date().toISOString());
      try {verifyPublicMeasurement(measured,await readPublicEvidence(new Date().toISOString()));}catch {measured.publicValid=null;}
      return measured;
    }};
}
