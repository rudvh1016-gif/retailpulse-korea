/** Reviewed-source fingerprint checker: no date publication or discovery. */
import {createHash} from 'node:crypto';
const source=(year,newsId,fileId,baselineSHA256)=>Object.freeze({id:`KR_ANNUAL_${year}`,country:'KR',year,articleURL:`https://www.korea.kr/briefing/pressReleaseView.do?newsId=${newsId}`,documentURL:`https://www.korea.kr/common/download.do?fileId=${fileId}&tblKey=GMN`,baselineSHA256,licence:'KOGL_TYPE_1_TEXT_ONLY',reviewedAt:'2026-10-21'});
export const APPROVED_NOTICE_SOURCES=Object.freeze([
 source(2026,'156738544','198321135','9c457ece149779eed0c2d717207d9daa564503261fedc6d47a26112471e018b4'),
 source(2027,'156768474','198497802','7f91729089b79610b3f5d4a392f8d4fff5cdd7f520e2d0bb8fd7eb9f59728560'),
]);
const day=86400000,sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const month=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date(at));
export function noticeCheckDecision(previous,now){
 const at=now.getTime();if(!Number.isFinite(at))throw Error('CLOCK_INVALID');
 if(previous?.accessBlocked)return 'SKIPPED_ACCESS_BLOCK';
 if(previous?.checkedAt){const last=Date.parse(previous.checkedAt);if(!Number.isFinite(last)||last>at)return 'REVIEW_CLOCK';if(previous.status==='ERROR'&&at-last<7*day)return 'SKIPPED_RETRY_COOLDOWN';}
 if(previous?.lastCompletedCheckAt){const completed=Date.parse(previous.lastCompletedCheckAt);if(!Number.isFinite(completed)||completed>at)return 'REVIEW_CLOCK';if(month(previous.lastCompletedCheckAt)===month(now))return 'SKIPPED_MONTHLY_GUARD';}
 return 'DUE';
}
/** Fingerprint equality says only that the reviewed document bytes are unchanged.
 * It does not verify a holiday or rule out a separate amendment. */
export function assessNoticeFingerprint(source,bytes,checkedAt,previous){
 if(!/^[a-f0-9]{64}$/.test(source.baselineSHA256)||!Number.isFinite(Date.parse(checkedAt)))throw Error('CONTRACT_INVALID');
 const observedSHA256=sha(bytes),changed=observedSHA256!==source.baselineSHA256;
 const requiresReview=changed||previous?.requiresReview===true;
 return {sourceId:source.id,country:source.country,sourceURL:source.articleURL,documentURL:source.documentURL,checkedAt,lastCompletedCheckAt:checkedAt,baselineSHA256:source.baselineSHA256,observedSHA256,status:requiresReview?'REVIEW_REQUIRED':'SOURCE_UNCHANGED',requiresReview,reason:changed?'APPROVED_DOCUMENT_CHANGED':requiresReview?'PRIOR_REVIEW_PENDING':'NO_BYTE_CHANGE_NOT_NEW_DATE_VERIFICATION',automaticDateIngestion:false,publicationEnabled:false};
}
async function boundedGet(url,fetchImpl){
 const response=await fetchImpl(url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'user-agent':'KORETAIL approved notice check (+https://koretaildata.com)'}});
 if(!response.ok)throw Error(`HTTP_${response.status}`);
 const reader=response.body?.getReader();if(!reader)throw Error('EMPTY_BODY');let total=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>1048576)throw Error('BODY_TOO_LARGE');chunks.push(value);}}catch(e){await reader.cancel();throw e;}
 return Buffer.concat(chunks,total);
}
export function validateKoreaNoticePage(source,bytes){
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('NOTICE_ENCODING_REVIEW_REQUIRED');}
 if(/captcha|access denied|접근이 차단/i.test(text))throw Error('NOTICE_BLOCK_PAGE');
 const titles=[...text.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(m=>m[1].replace(/<[^>]*>/g,'').trim());
 if(titles.length!==1||titles[0]!==`「${source.year}년 월력요항」 발표`)throw Error('NOTICE_TITLE_REVIEW_REQUIRED');
 if(!text.includes('open_type_01.png')||!text.includes('텍스트에 한하여 공공누리 제1유형'))throw Error('NOTICE_LICENCE_REVIEW_REQUIRED');
 const path=new URL(source.documentURL).pathname+new URL(source.documentURL).search;
 if(!text.replaceAll('&amp;','&').includes(`href="${path}"`))throw Error('NOTICE_ATTACHMENT_REVIEW_REQUIRED');
 return true;
}
/** Caller may persist only one returned metadata state per reviewed source.
 * No notices are sent; persistence and the existing scheduled task are separate. */
export async function checkApprovedNotices(previousStates=[],now=new Date(),fetchImpl=fetch){
 if(!Number.isFinite(now.getTime()))throw Error('CLOCK_INVALID');
 const previous=new Map(previousStates.map(s=>[s.sourceId,s]));let providerRequests=0;const results=[];
 const year=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric'}).format(now));
 for(const source of APPROVED_NOTICE_SOURCES){
  const before=previous.get(source.id),decision=noticeCheckDecision(before,now);
  if(Math.abs(year-source.year)>1){results.push({sourceId:source.id,status:'OUTSIDE_REVIEWED_YEARS',providerRequests:0});continue;}
  if(decision!=='DUE'){results.push({sourceId:source.id,status:decision,providerRequests:0});continue;}
  let requests=0;
  try{
   requests++;providerRequests++;validateKoreaNoticePage(source,await boundedGet(source.articleURL,fetchImpl));
   requests++;providerRequests++;const bytes=await boundedGet(source.documentURL,fetchImpl);
   if(bytes.length<4||bytes[0]!==0x50||bytes[1]!==0x4b||bytes[2]!==3||bytes[3]!==4)throw Error('DOCUMENT_NOT_HWPX_REVIEW_REQUIRED');
   results.push({...assessNoticeFingerprint(source,bytes,now.toISOString(),before),providerRequests:requests});
  }catch(e){const reason=e instanceof Error&&/^[A-Z0-9_]+$/.test(e.message)?e.message:'FETCH_OR_PARSE_FAILED',review=reason.includes('REVIEW_REQUIRED'),blocked=/^HTTP_(401|403|451)$/.test(reason)||reason==='NOTICE_BLOCK_PAGE';
   // Previous byte evidence remains; no canonical payload/verifiedAt is accepted or copied.
   results.push({sourceId:source.id,country:source.country,sourceURL:source.articleURL,documentURL:source.documentURL,checkedAt:now.toISOString(),lastCompletedCheckAt:review?now.toISOString():before?.lastCompletedCheckAt??null,baselineSHA256:source.baselineSHA256,observedSHA256:before?.observedSHA256??null,status:review||blocked?'REVIEW_REQUIRED':'ERROR',accessBlocked:blocked,requiresReview:review||blocked||before?.requiresReview===true,reason,providerRequests:requests,automaticDateIngestion:false,publicationEnabled:false});
  }
 }
 return {results,providerRequests,maximumProviderRequests:4,aiCalls:0,canonicalWrites:0,mode:'APPROVED_SOURCE_CHANGE_CHECK_ONLY'};
}
