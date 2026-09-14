import { OperationalMemory, TRIAL_END_EXCLUSIVE, type AttemptRequest } from './operational-memory';
import { measureSource, verifyPublicMeasurement, readPublicEvidence } from './operational-evidence';
import { runSelectedProductionSources, type ProductionSourceResult } from './production-runner';
import { verifyRecovery, type RecoveryVerification } from './recovery-orchestration';
import { resolveCentralRecoveryActivation, runtimeCentralRecoveryEnabled, ownerApprovedCentralRecovery,
  type CentralRecoveryActivation } from './central-recovery-gate';
import { capabilityFor } from './recovery-capability';
import type { CollectorEnv } from './collector';

/** No recurring workflow calls this. Production execution is deliberately dormant.
 * Even after trial expiry, activation still needs a reviewed explicit configuration change. */
export const CENTRAL_RECOVERY_EXECUTION_ENABLED = false;

/**
 * Resolves the gate from this repository's constant plus the runtime environment.
 *
 * `compiledEnabled` is the constant above and stays false until an owner-approved
 * pull request changes it. The other two come from the process environment, so a
 * deployment cannot open the gate on its own either — it can only supply one of
 * the three conditions a reviewed activation still needs.
 */
export function centralRecoveryActivation(nowIso:string,env:Record<string,string|undefined>=process.env):CentralRecoveryActivation {
  return resolveCentralRecoveryActivation({compiledEnabled:CENTRAL_RECOVERY_EXECUTION_ENABLED,
    runtimeEnabled:runtimeCentralRecoveryEnabled(env),ownerApproved:ownerApprovedCentralRecovery(env),
    nowIso,trialEndExclusiveIso:TRIAL_END_EXCLUSIVE});
}

/** Kept for existing callers; the structured gate above is what enforcement uses. */
export function recoveryActivation(nowIso:string) {
  return {allowed:false as const,reason:Date.parse(nowIso)<Date.parse(TRIAL_END_EXCLUSIVE)
    ?'UI_TRIAL_LOCK: no additional provider execution':'CENTRAL_RECOVERY_DORMANT: owner-reviewed activation required'};
}
export interface RecoveryExecutor {
  execute:()=>Promise<ProductionSourceResult>;
  verify:()=>Promise<RecoveryVerification>;
  now:()=>string;
}
/**
 * Durable closed loop; dependency injection is the same adapter boundary used by source runners.
 *
 * THIS IS THE ENFORCEMENT POINT. Until 2026-09-14 the two dormancy signals lived
 * in a constant and a reporting helper that this function never consulted, so the
 * only thing holding provider traffic at zero was that nothing called it yet. A
 * future caller — or a test harness handed a real adapter — would have gone
 * straight to `memory.admit` and then to the provider.
 *
 * Both refusals now happen BEFORE admission, so a blocked call writes no D1 row,
 * burns no attempt from the daily budget, takes no in-flight lock and makes no
 * provider request. Nothing downstream of here can be reached while the gate is
 * locked, whatever executor is passed in.
 *
 * The source capability check is the second half of the same guarantee: a gate
 * that is open still does not authorise a source nobody cleared.
 */
export async function executeControlledRecovery(memory:OperationalMemory,request:AttemptRequest,executor:RecoveryExecutor,
  options:{nowIso?:string;env?:Record<string,string|undefined>;activation?:CentralRecoveryActivation}={}) {
  const nowIso=options.nowIso??executor.now();
  // `activation` is a TEST SEAM, the same dependency-injection boundary
  // `RecoveryExecutor` already is. Production must never pass it, because
  // passing it is how a caller would supply its own answer to the question this
  // function exists to ask. tests/operational-phase3.test.mjs asserts by source
  // scan that no file outside tests/ ever does — so the seam cannot quietly
  // become a production code path.
  const gate=options.activation??centralRecoveryActivation(nowIso,options.env??process.env);
  if(!gate.allowed)return {admitted:false,attemptId:'',state:'CENTRAL_RECOVERY_DORMANT',reason:gate.reason,blockedBy:gate.blockedBy};
  // An open gate still authorises nothing source-specific. A generic rule may
  // approve the failure class while this source has no adapter, no measured
  // budget, or no way to prove the repair reached the reader.
  const capability=capabilityFor(request.parts.sourceId);
  if(!capability.controlledRecoveryEligible||!capability.supportedActions.includes(request.operation as never))
    return {admitted:false,attemptId:'',state:'BLOCKED_UNSUPPORTED_SOURCE',reason:capability.reason,blockedBy:['SOURCE_NOT_CONTROLLED_ELIGIBLE' as const]};
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
