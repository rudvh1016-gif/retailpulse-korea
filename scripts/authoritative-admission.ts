/** Local reference executor only. No production caller, binding, HTTP route or cache fallback.
 * The reviewed authority must persist independently of the collector/cache lifecycle.
 * Consuming a grant is irreversible here: death/expiry never reissues it. */
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {capacitySignal} from '../lib/storage-recovery';
import {CLAIM_SQL,COMPLETE_SQL,outcomeState,type AdmissionAuthority,type AdmissionScope,type AdmissionPermit,type AdmissionOutcome} from '../lib/admission-contract';
export class LocalAdmissionAuthority {
 private database:DatabaseSync;
 constructor(path:string) {
  if(!existsSync(path))throw Error('authority_missing');
  this.database=new DatabaseSync(path);this.database.exec('PRAGMA busy_timeout=1000; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF');
 }
 close(){this.database.close();}
 acquire(scope:AdmissionScope,requestId:string,now=Date.now()):AdmissionPermit {
  if(!requestId||requestId.length>128||!Number.isFinite(now))throw Error('invalid_admission_request');
  const permit={...scope,requestId,owner:randomUUID()};
  this.database.exec('BEGIN IMMEDIATE');
  try {
   const result=this.database.prepare(CLAIM_SQL).run(requestId,permit.owner,scope.databaseId,scope.epoch,scope.source,scope.commit,now,now+900000);
   if(result.changes!==1)throw Error('admission_denied');
   this.database.exec('COMMIT');return permit;
  }catch(error){this.database.exec('ROLLBACK');throw error;}
 }
 complete(permit:AdmissionPermit,outcome:AdmissionOutcome) {
  const result=this.database.prepare(COMPLETE_SQL).run(outcomeState(outcome),permit.databaseId,permit.epoch,permit.source,permit.commit,permit.requestId,permit.owner);
  if(result.changes!==1)throw Error('admission_completion_denied');
 }
}
/** One awaited logical collection. There is no lease takeover, retry or automatic reset.
 * If completion cannot be stored, INFLIGHT remains consumed. Caller MUST NOT retry work. */
export async function executeWithAuthority<T extends {status:string;detail?:string}>(options:{enabled?:boolean;authority?:AdmissionAuthority;scope:AdmissionScope;requestId:string;now?:number},work:()=>Promise<T>):Promise<{status:'DISABLED'}|T> {
 if(options.enabled!==true)return {status:'DISABLED'};
 if(!options.authority)throw Error('authority_unavailable');
 const permit=await options.authority.acquire(options.scope,options.requestId,options.now);
 let result:T;
 try {result=await work();}
 catch(error){
  // A process can die before this: persistent INFLIGHT still denies the next run.
  const capacity=capacitySignal(error instanceof Error?error.message:'')==='CAPACITY_EXHAUSTED';
  await options.authority.complete(permit,capacity?'CAPACITY':'UNCERTAIN');throw error;
 }
 await options.authority.complete(permit,result.status==='SUCCESS'?'SUCCESS':capacitySignal(result.detail??'')==='CAPACITY_EXHAUSTED'?'CAPACITY':'UNCERTAIN');
 return result;
}
