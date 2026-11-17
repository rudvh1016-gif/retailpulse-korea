/** One consumed grant per DB. No lease takeover/epoch reset API. */
export interface AdmissionScope {databaseId:string;epoch:string;source:string;commit:string}
export interface AdmissionPermit extends AdmissionScope {requestId:string;owner:string}
export type AdmissionOutcome='SUCCESS'|'CAPACITY'|'UNCERTAIN';
export interface AdmissionAuthority {
 acquire(scope:AdmissionScope,requestId:string,now?:number):AdmissionPermit|Promise<AdmissionPermit>;
 complete(permit:AdmissionPermit,outcome:AdmissionOutcome):void|Promise<void>;
}
export const CLAIM_SQL="UPDATE admission SET state='INFLIGHT',request_id=?,owner=? WHERE database_id=? AND epoch=? AND source=? AND commit_sha=? AND state='READY' AND expires_at>? AND expires_at<=?";
export const COMPLETE_SQL="UPDATE admission SET state=? WHERE database_id=? AND epoch=? AND source=? AND commit_sha=? AND request_id=? AND owner=? AND state='INFLIGHT'";
export const outcomeState=(outcome:AdmissionOutcome)=>outcome==='SUCCESS'?'DONE':outcome==='CAPACITY'?'BLOCKED':'UNCERTAIN';
