/** Stored observations only. This module cannot call upstreams or replace legal facts. */
export type AllowanceObservation={sourceId:string;jurisdiction:string;url:string;state:string;checkedAt:string;sourceSha256:string|null;reason:string|null;lastGood:{semanticHash:string;verifiedAt:string|null}};
type Store=Pick<D1Database,'prepare'|'batch'>;
type Row={source_id:string;jurisdiction:string;source_url:string;state:string;checked_at:string;source_sha256:string|null;reason:string|null;last_good_hash:string;last_good_verified_at:string|null;next_check_at:string};
const states=new Set(['UNCHANGED_SOURCE','NUMERIC_TEMPLATE_VERIFIED','SOURCE_CHANGED_REVIEW_REQUIRED','BASELINE_REVIEW_REQUIRED','COLLECTION_BLOCKED','COLLECTION_FAILED']);
const hash=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const date=(s:unknown)=>typeof s==='string'&&Number.isFinite(Date.parse(s));
export async function readAllowanceObservations(db:Pick<D1Database,'prepare'>):Promise<Row[]>{
 const result=await db.prepare('SELECT source_id,jurisdiction,source_url,state,checked_at,source_sha256,reason,last_good_hash,last_good_verified_at,next_check_at FROM customs_allowance_observations ORDER BY source_id LIMIT 24').all<Row>();
 if(!result.success||!result.results)throw Error('CUSTOMS_ALLOWANCE_READ_FAILED');
 return result.results;
}
/** CAS prevents stale, repeated, and concurrent runs from overwriting a newer observation. */
export async function storeAllowanceObservation(db:Store,item:AllowanceObservation,nextCheckAt:string,previous:Row|null){
 if(!/^[A-Z]{2}-\d{2}$/.test(item.sourceId)||item.jurisdiction!==item.sourceId.slice(0,2)||!states.has(item.state)||!date(item.checkedAt)||!date(nextCheckAt)||Date.parse(nextCheckAt)<=Date.parse(item.checkedAt)||!hash(item.lastGood.semanticHash)||item.sourceSha256!==null&&!hash(item.sourceSha256)||item.url.length>2048||!item.url.startsWith('https://')||item.reason!==null&&!/^[A-Z0-9_]{1,80}$/.test(item.reason))throw Error('CUSTOMS_ALLOWANCE_INVALID_OBSERVATION');
 if(previous&&Date.parse(previous.checked_at)>=Date.parse(item.checkedAt))return 0;
 const values=[item.jurisdiction,item.url,item.state,item.checkedAt,item.sourceSha256,item.reason,item.lastGood.semanticHash,item.lastGood.verifiedAt,nextCheckAt];
 const statement=previous?db.prepare(`UPDATE customs_allowance_observations SET jurisdiction=?,source_url=?,state=?,checked_at=?,source_sha256=?,reason=?,last_good_hash=?,last_good_verified_at=?,next_check_at=? WHERE source_id=? AND checked_at=?`).bind(...values,item.sourceId,previous.checked_at):db.prepare(`INSERT INTO customs_allowance_observations(source_id,jurisdiction,source_url,state,checked_at,source_sha256,reason,last_good_hash,last_good_verified_at,next_check_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id) DO NOTHING`).bind(item.sourceId,...values);
 const results=await db.batch([statement]);const result=results[0];
 if(results.length!==1||!result.success||!Number.isSafeInteger(result.meta?.changes))throw Error('CUSTOMS_ALLOWANCE_WRITE_UNMEASURED');
 return Number(result.meta!.changes);
}
export function allowanceStatusProjection(rows:Row[],now=new Date()){
 const countries=[...new Set(rows.map(row=>row.jurisdiction))].map(id=>{
  const entries=rows.filter(row=>row.jurisdiction===id);
  const state=entries.some(row=>Date.parse(row.next_check_at)+86400000<now.getTime())?'STALE':entries.some(row=>row.state==='SOURCE_CHANGED_REVIEW_REQUIRED')?'REVIEW_REQUIRED':entries.some(row=>row.state==='COLLECTION_FAILED'||row.state==='COLLECTION_BLOCKED')?'CHECK_UNAVAILABLE':entries.some(row=>row.state==='BASELINE_REVIEW_REQUIRED')?'BASELINE_REQUIRED':entries.some(row=>row.state==='NUMERIC_TEMPLATE_VERIFIED')?'NUMERIC_VERIFIED':'SOURCE_UNCHANGED';
  // A blocked access review did not make an HTTP request. The current-row store
  // cannot reconstruct earlier successes after a failure; never invent that date.
  const accessReviewRequired=entries.every(row=>row.state==='COLLECTION_BLOCKED'&&row.reason==='ACCESS_REVIEW_REQUIRED');
  const lastSuccessfulCheckAt=entries.every(row=>['UNCHANGED_SOURCE','NUMERIC_TEMPLATE_VERIFIED'].includes(row.state))?entries.map(row=>row.checked_at).sort()[0]:null;
  return {id,state,lastCheckedAt:entries.map(row=>row.checked_at).sort()[0],nextCheckAt:entries.map(row=>row.next_check_at).sort()[0],sourceCount:entries.length,accessReviewRequired,lastSuccessfulCheckAt,regulationChangeConfirmed:false};
 });
 // A changed source hash is review evidence, never confirmation of a legal change.
 const reviewNotices=rows.filter(row=>row.state==='SOURCE_CHANGED_REVIEW_REQUIRED'&&hash(row.source_sha256)&&hash(row.last_good_hash)&&date(row.checked_at)&&Date.parse(row.checked_at)<=now.getTime()&&Date.parse(row.next_check_at)+86400000>=now.getTime()).map(row=>({sourceId:row.source_id,country:row.jurisdiction,sourceHash:row.source_sha256,baselineHash:row.last_good_hash,checkedAt:row.checked_at}));
 return {status:rows.length?'STORED':'MISSING',cadenceHours:24,automaticLegalInterpretation:false,countries,reviewNotices};
}
