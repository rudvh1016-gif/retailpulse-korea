import {mayPublishNews,verifiedDate,type OfficialNews,type VerifiedNewsDate} from './airport-customs-news';
/** Human/source document review bound to exact article, official attachment and
 * bytes. Never accept a title-only association or turn publication into effect. */
export interface CustomsDocumentReview {
 articleId:string;attachmentUrl:string;sha256:string;reviewedAt:string;
 confirmedText:string;facts:readonly string[];
 effectiveDate?:VerifiedNewsDate;deadline?:VerifiedNewsDate;
}
export async function applyCustomsDocumentReview(item:OfficialNews,review:CustomsDocumentReview,bytes:Uint8Array):Promise<OfficialNews>{
 const attachment=item.attachments?.find(value=>value.url===review.attachmentUrl);
 if(item.source!=='customs'||!mayPublishNews(item)||item.sourceId!==review.articleId||!attachment||bytes.length>4*1024*1024||!bytes.length
  ||!Number.isFinite(Date.parse(review.reviewedAt))||!review.confirmedText.trim()||review.confirmedText.length>40000||review.facts.length>6
  ||review.facts.some(text=>!text.trim()||text.length>600||!review.confirmedText.includes(text)))throw Error('NEWS_DOCUMENT_REVIEW_UNBOUND');
 const digest=await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes)),hash=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
 if(hash!==review.sha256)throw Error('NEWS_DOCUMENT_HASH_MISMATCH');
 const checkDate=(date:VerifiedNewsDate|undefined,role:RegExp)=>{if(!date)return undefined;if(!verifiedDate(date)||!role.test(date.evidence)||!review.confirmedText.includes(date.evidence)||!date.evidence.includes(date.date))throw Error('NEWS_DOCUMENT_DATE_UNVERIFIED');return date;};
 const effectiveDate=checkDate(review.effectiveDate,/시행|효력|적용/),deadline=checkDate(review.deadline,/마감|기한|접수/);
 const attachments=item.attachments!.map(value=>value.url===attachment.url?{...value,review:'verified' as const,sha256:hash,reviewedAt:review.reviewedAt}:value);
 const facts=[...item.facts];for(const text of review.facts)if(!facts.some(fact=>fact.text===text))facts.push({text,verifiedBySource:true});
 if(facts.length>12)throw Error('NEWS_DOCUMENT_FACT_LIMIT');
 return {...item,attachments,facts,attachmentNeedsReview:attachments.some(value=>value.review!=='verified'),
  ...(effectiveDate?{effectiveDate}:{}),...(deadline?{deadline}:{})};
}
