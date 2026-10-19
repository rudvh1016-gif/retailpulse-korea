/** Offline preparation only. Feed availability never grants publication rights. */
export type NewsTopic='airport'|'customs'|'unclassified';
export type NewsStatus='announced'|'proposed'|'corrected'|'withdrawn'|'review';
export interface VerifiedNewsDate {date:string;evidence:string;verified:true}
/** Explicit item-level approval of this presentation; not inferred from RSS,
 * domain, or an agency-wide licence. Preserve the approved attribution text. */
export interface NewsClearance {evidenceUrl:string;confirmedAt:string;commercialReuse:true;requiredPresentation:true;deepLink:true;attribution:string}
export interface NewsFact {text:string;verifiedBySource:boolean}
export interface NewsAttachment {url:string;name:string;review:'pending'|'verified';sha256?:string;reviewedAt?:string}
export interface OfficialNews {
 /** RSS index only. This is not article reuse clearance or a KOGL claim. */
 presentation?:'official-rss-link';
 rssLinkEvidence?:{directoryUrl:string;feedUrl:string;verifiedAt:string};
 source:'airport'|'customs'|'law';sourceId:string;sourceName:string;title:string;url:string;
 publishedAt:string|null;receivedAt:string;status:NewsStatus;topic:NewsTopic;
 relevantToRetail:boolean;clearance?:NewsClearance;contentFingerprint:string;
 effectiveDate?:VerifiedNewsDate;deadline?:VerifiedNewsDate;
 facts:NewsFact[];changes:NewsFact[];audience:NewsFact[];attachmentNeedsReview:boolean;
 /** Official modification time, never ingestion time or a guessed effective date. */
 modifiedAt?:string|null;attachments?:NewsAttachment[];attachmentListComplete?:boolean;
}
export interface NewsArchive {current:OfficialNews;revisions:OfficialNews[]}
const topicWords=/관세|면세|보세|휴대품|통관|수출입|duty[ -]?free|customs/i;
export function classifyNews(source:OfficialNews['source'],title:string,confirmedText=''):NewsTopic {
 if(source==='airport')return 'airport';
 return topicWords.test(title+' '+confirmedText)?'customs':'unclassified';
}
export function verifiedDate(value:VerifiedNewsDate|undefined):string|null {
 if(!value?.verified||typeof value.evidence!=='string'||!value.evidence.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(value.date))return null;
 const parsed=new Date(value.date+'T00:00:00Z');
 return Number.isFinite(parsed.valueOf())&&parsed.toISOString().slice(0,10)===value.date?value.date:null;
}
const hosts={airport:'airport.kr',customs:'customs.go.kr',law:'law.go.kr'} as const;
export function officialNewsUrl(item:Pick<OfficialNews,'source'|'url'>):string|null {
 try{const url=new URL(item.url),host=hosts[item.source];return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&(url.hostname===host||url.hostname.endsWith('.'+host))?url.href:null;}catch{return null;}
}
export function hasNewsClearance(item:OfficialNews):boolean {
 const rights=item.clearance;
 return !!(rights?.commercialReuse===true&&rights.requiredPresentation===true&&rights.deepLink===true&&typeof rights.evidenceUrl==='string'&&rights.evidenceUrl.trim()&&typeof rights.attribution==='string'&&rights.attribution.trim()&&Number.isFinite(Date.parse(rights.confirmedAt))&&officialNewsUrl(item));
}
/** Rights review permits document preparation; it does not approve publication. */
export function mayPublishNews(item:OfficialNews&{collectionReview?:{hold:boolean}}):boolean {
 return ['announced','proposed','corrected'].includes(item.status)&&(item.presentation==='official-rss-link'?validRssLinkNews(item):hasNewsClearance(item))
  &&(item.collectionReview===undefined||item.collectionReview?.hold===false);
}
export function validRssLinkNews(item:OfficialNews):boolean {
 if(item.presentation!=='official-rss-link'||item.source!=='customs'||item.sourceName!=='관세청'||item.topic!=='customs'||!item.relevantToRetail
  ||item.status!=='announced'||!/^\d{1,12}$/.test(item.sourceId)||!item.title?.trim()||item.title.length>500
  ||!item.publishedAt||!Number.isFinite(Date.parse(item.publishedAt))||!officialNewsUrl(item)
  ||item.clearance!==undefined||item.effectiveDate!==undefined||item.deadline!==undefined||item.modifiedAt!==undefined
  ||item.attachments!==undefined||item.attachmentListComplete!==undefined||item.attachmentNeedsReview!==false
  ||![item.facts,item.changes,item.audience].every(value=>Array.isArray(value)&&value.length===0))return false;
 const evidence=item.rssLinkEvidence;
 if(evidence?.directoryUrl!=='https://www.customs.go.kr/kcs/selectBoardRssList.do?mi=7424'||!Number.isFinite(Date.parse(evidence.verifiedAt)))return false;
 try{
  const article=new URL(item.url),feed=new URL(evidence.feedUrl);
  return article.origin==='https://www.customs.go.kr'&&article.pathname==='/kcs/na/ntt/selectNttInfo.do'
   &&article.searchParams.get('nttSn')===item.sourceId&&/^[a-f0-9]{32}$/.test(article.searchParams.get('nttSnUrl')??'')
   &&feed.origin==='https://www.customs.go.kr'&&feed.pathname==='/kcs/selectBoardRss.do'&&!feed.username&&!feed.password&&!feed.port
   &&({1362:'15265',1364:'2895',1365:'3762',1366:'2897'} as Record<string,string>)[feed.searchParams.get('bbsId')??'']===feed.searchParams.get('mi');
 }catch{return false;}
}
function pick<T extends object,K extends keyof T>(value:T,keys:readonly K[]):Pick<T,K>{
 return Object.fromEntries(keys.filter(key=>Object.prototype.hasOwnProperty.call(value,key)).map(key=>[key,value[key]])) as Pick<T,K>;
}
/** Explicit public fields only, including nested values. Private collection
 * candidates and future storage metadata must never enter an API response. */
export function publicNewsProjection(item:OfficialNews):OfficialNews {
 const result=pick(item,['source','sourceId','sourceName','title','url','publishedAt','receivedAt','status','topic','relevantToRetail','clearance','contentFingerprint','effectiveDate','deadline','facts','changes','audience','attachmentNeedsReview','modifiedAt','attachments','attachmentListComplete','presentation','rssLinkEvidence']);
 if(result.rssLinkEvidence)result.rssLinkEvidence=pick(result.rssLinkEvidence,['directoryUrl','feedUrl','verifiedAt']);
 if(result.clearance)result.clearance=pick(result.clearance,['evidenceUrl','confirmedAt','commercialReuse','requiredPresentation','deepLink','attribution']);
 for(const key of ['effectiveDate','deadline'] as const)if(result[key])result[key]=pick(result[key],['date','evidence','verified']);
 for(const key of ['facts','changes','audience'] as const)result[key]=result[key].map(value=>pick(value,['text','verifiedBySource']));
 if(result.attachments)result.attachments=result.attachments.map(value=>pick(value,['url','name','review','sha256','reviewedAt']));
 return result;
}
/** Keep every received item, including unknown classification and restricted
 * articles. A changed permission or withdrawal is a revision, not a deletion. */
export function retainNews(previous:readonly NewsArchive[],incoming:readonly OfficialNews[]):NewsArchive[] {
 const records=new Map(previous.map(record=>[record.current.source+'|'+record.current.sourceId,record]));
 const fingerprint=(item:OfficialNews)=>JSON.stringify({...item,receivedAt:null,clearance:item.clearance?{...item.clearance,confirmedAt:null}:undefined,attachments:item.attachments?.map(a=>({...a,reviewedAt:null}))});
 for(const item of incoming){const key=item.source+'|'+item.sourceId,old=records.get(key);
  // Observing unchanged content again does not invent an official correction.
  const same=old&&fingerprint(old.current)===fingerprint(item);
  if(!same)records.set(key,{current:item,revisions:old?[...old.revisions,old.current]:[]});
 }
 return [...records.values()];
}
export function sortNews(items:readonly OfficialNews[],today:string):OfficialNews[] {
 const validToday=verifiedDate({date:today,evidence:'Caller calendar date',verified:true});
 const important=(item:OfficialNews)=>validToday&&item.relevantToRetail&&item.status!=='withdrawn'&&[verifiedDate(item.effectiveDate),verifiedDate(item.deadline)].some(date=>date!==null&&date>=validToday);
 const timestamp=(at:string|null)=>at&&Number.isFinite(Date.parse(at))?Date.parse(at):Number.NEGATIVE_INFINITY;
 return [...items].sort((a,b)=>Number(!!important(b))-Number(!!important(a))||(timestamp(b.publishedAt)-timestamp(a.publishedAt)||0)||a.source.localeCompare(b.source)||a.sourceId.localeCompare(b.sourceId));
}

