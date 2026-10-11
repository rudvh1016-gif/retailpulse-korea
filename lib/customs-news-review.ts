import {hasNewsClearance,mayPublishNews,officialNewsUrl,publicNewsProjection,type NewsAttachment,type NewsStatus,type OfficialNews} from './airport-customs-news';
import {sha256} from './hash';

const reasons=['VERIFIED_DOCUMENT_CHANGED','RIGHTS_UNCONFIRMED','RIGHTS_WITHDRAWN','PREVIOUSLY_WITHDRAWN'] as const;
export type CollectionReviewReason=typeof reasons[number];
export interface CollectionCandidate {
 source:OfficialNews['source'];sourceId:string;title:string;url:string;
 publishedAt:string|null;modifiedAt?:string|null;status:NewsStatus;contentFingerprint:string;
 rights:{cleared:boolean;evidenceUrl?:string};
 attachments?:Omit<NewsAttachment,'reviewedAt'>[];attachmentListComplete?:boolean;
}
/** Only the latest compact observation is retained, never source HTML or bytes.
 * Observation time is not part of the candidate fingerprint. Holds are sticky:
 * another collector observation cannot approve or reopen the stored article. */
export interface CollectionReview {
 version:1;fingerprint:string;observedAt:string;candidate:CollectionCandidate;
 hold:boolean;reasons:CollectionReviewReason[];
}
export type StoredOfficialNews=OfficialNews&{collectionReview?:CollectionReview};

const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const string=(value:unknown,max:number)=>typeof value==='string'&&!!value.trim()&&value.length<=max;
const timestamp=(value:unknown)=>string(value,64)&&Number.isFinite(Date.parse(value as string));
const optional=(value:Record<string,unknown>,key:string,check:(item:unknown)=>boolean)=>!Object.prototype.hasOwnProperty.call(value,key)||check(value[key]);
const only=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).every(key=>keys.includes(key));
const digest=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function safeUrl(value:unknown):boolean {
 if(!string(value,2048))return false;
 try{const url=new URL(value as string);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port;}catch{return false;}
}
function validCandidate(value:unknown):value is CollectionCandidate {
 if(!object(value)||!only(value,['source','sourceId','title','url','publishedAt','modifiedAt','status','contentFingerprint','rights','attachments','attachmentListComplete'])
  ||!['airport','customs','law'].includes(value.source as string)||!string(value.sourceId,120)||!string(value.title,500)
  ||!safeUrl(value.url)||!officialNewsUrl(value as unknown as OfficialNews)||!(value.publishedAt===null||timestamp(value.publishedAt))
  ||!optional(value,'modifiedAt',item=>item===null||timestamp(item))||!['announced','proposed','corrected','withdrawn','review'].includes(value.status as string)
  ||!string(value.contentFingerprint,256)||!object(value.rights)||!only(value.rights,['cleared','evidenceUrl'])||typeof value.rights.cleared!=='boolean'
  ||!optional(value.rights,'evidenceUrl',safeUrl)||(value.rights.cleared&&!safeUrl(value.rights.evidenceUrl))
  ||!optional(value,'attachmentListComplete',item=>typeof item==='boolean'))return false;
 if(value.attachments!==undefined){
  if(!Array.isArray(value.attachments)||value.attachments.length>6)return false;
  const urls=new Set<string>();
  for(const attachment of value.attachments){
   if(!object(attachment)||!only(attachment,['url','name','review','sha256'])||!safeUrl(attachment.url)||!string(attachment.name,500)
    ||!['pending','verified'].includes(attachment.review as string)||!optional(attachment,'sha256',digest)||urls.has(attachment.url as string))return false;
   urls.add(attachment.url as string);
  }
 }
 return true;
}
/** Fail closed for unknown metadata versions or malformed holds. */
export function validCollectionReview(value:unknown):value is CollectionReview {
 return object(value)&&only(value,['version','fingerprint','observedAt','candidate','hold','reasons'])&&value.version===1&&digest(value.fingerprint)
  &&timestamp(value.observedAt)&&validCandidate(value.candidate)&&typeof value.hold==='boolean'&&Array.isArray(value.reasons)
  &&value.reasons.length<=reasons.length&&new Set(value.reasons).size===value.reasons.length
  &&value.reasons.every(reason=>reasons.includes(reason as CollectionReviewReason))&&value.hold===(value.reasons.length>0);
}
function compactCandidate(item:OfficialNews):CollectionCandidate {
 return {source:item.source,sourceId:item.sourceId,title:item.title,url:item.url,publishedAt:item.publishedAt,status:item.status,contentFingerprint:item.contentFingerprint,
  ...(item.modifiedAt!==undefined?{modifiedAt:item.modifiedAt}:{}),
  rights:{cleared:hasNewsClearance(item),...(item.clearance?.evidenceUrl?{evidenceUrl:item.clearance.evidenceUrl}:{})},
  ...(item.attachments!==undefined?{attachments:item.attachments.map(({url,name,review,sha256:hash})=>({url,name,review,...(hash?{sha256:hash}:{})})).sort((a,b)=>a.url.localeCompare(b.url)||a.name.localeCompare(b.name))}:{}),
  ...(item.attachmentListComplete!==undefined?{attachmentListComplete:item.attachmentListComplete}:{})};
}
function changedReviewedDocument(previous:OfficialNews,incoming:OfficialNews):boolean {
 return (previous.attachments??[]).some(document=>{
  if(document.review!=='verified')return false;
  const next=incoming.attachments?.find(value=>value.url===document.url);
  if(next&&next.name!==document.name)return true;
  if(incoming.attachmentListComplete===true&&!next)return true;
  // A bound byte observation can prove a difference. A matching URL/hash is
  // never treated as a fresh download or proof that current bytes are unchanged.
  return digest(document.sha256)&&digest(next?.sha256)&&next!.sha256!==document.sha256;
 });
}
function sameArticleEvidence(item:OfficialNews):boolean {
 if(!item.clearance)return false;
 try{return new URL(item.clearance.evidenceUrl).href===new URL(item.url).href;}catch{return false;}
}
export async function createCollectionReview(previous:StoredOfficialNews|null,incoming:OfficialNews):Promise<{record:StoredOfficialNews;blockPublication:boolean}>{
 if(previous&&(previous.source!==incoming.source||previous.sourceId!==incoming.sourceId))throw Error('NEWS_REVIEW_IDENTITY_MISMATCH');
 if(previous?.collectionReview!==undefined&&!validCollectionReview(previous.collectionReview))throw Error('NEWS_REVIEW_INVALID_PREVIOUS');
 if(!timestamp(incoming.receivedAt))throw Error('NEWS_REVIEW_INVALID_TIMESTAMP');
 const candidate=compactCandidate(incoming);
 if(!validCandidate(candidate))throw Error('NEWS_REVIEW_INVALID_CANDIDATE');
 const reviewReasons=new Set<CollectionReviewReason>(previous?.collectionReview?.reasons??[]);
 if(incoming.status==='withdrawn')reviewReasons.add('RIGHTS_WITHDRAWN');
 if(previous?.status==='withdrawn')reviewReasons.add('PREVIOUSLY_WITHDRAWN');
 if(previous&&changedReviewedDocument(previous,incoming))reviewReasons.add('VERIFIED_DOCUMENT_CHANGED');
 // No HTML mark does not revoke independently approved PDF/reprint evidence.
 if(previous&&hasNewsClearance(previous)&&sameArticleEvidence(previous)&&!hasNewsClearance(incoming))reviewReasons.add('RIGHTS_UNCONFIRMED');
 const orderedReasons=reasons.filter(reason=>reviewReasons.has(reason)),fingerprint=await sha256(candidate);
 const old=previous?.collectionReview;
 const collectionReview:CollectionReview=old&&old.fingerprint===fingerprint&&JSON.stringify(old.reasons)===JSON.stringify(orderedReasons)?old:
  {version:1,fingerprint,observedAt:incoming.receivedAt,candidate,hold:orderedReasons.length>0,reasons:orderedReasons};
 const record:StoredOfficialNews={...(previous??{...publicNewsProjection(incoming),status:'review' as const}),collectionReview};
 return {record,blockPublication:!mayPublishNews(record)};
}
