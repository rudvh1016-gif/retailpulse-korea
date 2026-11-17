/** Read-only local reconciliation. Never grants/reset/retries and never opens remote credentials. */
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {CANARY_WRITERS} from './canary-collector';
export function reconcileCanary(path:string,databaseId:string){
 const db=new DatabaseSync(path,{readOnly:true});
 try{
  const grant=db.prepare('SELECT database_id,epoch,source,commit_sha,expires_at,state,request_id FROM admission WHERE database_id=?').get(databaseId);
  if(!grant)return {verdict:'HOLD',reason:'NO_AUTHORITY_RECORD',eligibleForReapproval:false};
  if(!CANARY_WRITERS.includes(grant.source as typeof CANARY_WRITERS[number]))return {verdict:'HOLD',reason:'OUT_OF_SCOPE_SOURCE',eligibleForReapproval:false};
  const source=String(grant.source),family=source==='weather'?'WEATHER':source==='airport_passenger_forecast'?'A5':null;
  let publication:unknown=null;
  try{publication=family?db.prepare('SELECT family,checked_at FROM recovery_forecast_publications WHERE family=?').get(family):db.prepare('SELECT source,published_at FROM recovery_public_snapshots WHERE source=?').get(source);}catch{/* Missing schema/evidence remains unknown. */}
  return {verdict:'MANUAL_REVIEW_REQUIRED',eligibleForReapproval:false,grant,publication:publication??null,required:['confirm prior runner dead and all remote writes settled','compare exact source receipt and validated publication payload','verify original data unchanged, Free headroom and current reviewed main','owner separately approves exact next scope; no automatic reset']};
 }finally{db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [flag,path,id]=process.argv.slice(2);
 if(flag!=='--local'||!path||!id)throw Error('usage: reconcile-canary.ts --local EXISTING_SQLITE DATABASE_ID');
 console.log(JSON.stringify(reconcileCanary(path,id)));
}
