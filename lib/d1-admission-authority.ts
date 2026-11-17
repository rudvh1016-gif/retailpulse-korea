/** Default-unwired reference adapter for an already approved active D1 only.
 * No route/config/credential/grant issuer is added. Never use the full original DB.
 * A lost acknowledgement is a consumed/unknown grant, never permission to retry. */
import {CLAIM_SQL,COMPLETE_SQL,outcomeState,type AdmissionAuthority,type AdmissionScope,type AdmissionPermit,type AdmissionOutcome} from './admission-contract';
export class D1AdmissionAuthority implements AdmissionAuthority {
 constructor(private database:D1Database){}
 async acquire(scope:AdmissionScope,requestId:string,now=Date.now()):Promise<AdmissionPermit>{
  if(!requestId||requestId.length>128||!Number.isFinite(now))throw Error('invalid_admission_request');
  const permit={...scope,requestId,owner:crypto.randomUUID()};
  const result=await this.database.prepare(CLAIM_SQL).bind(requestId,permit.owner,scope.databaseId,scope.epoch,scope.source,scope.commit,now,now+900000).run();
  if(!result.success||result.meta?.changes!==1)throw Error('admission_denied');return permit;
 }
 async complete(permit:AdmissionPermit,outcome:AdmissionOutcome){
  const result=await this.database.prepare(COMPLETE_SQL).bind(outcomeState(outcome),permit.databaseId,permit.epoch,permit.source,permit.commit,permit.requestId,permit.owner).run();
  if(!result.success||result.meta?.changes!==1)throw Error('admission_completion_denied');
 }
}
