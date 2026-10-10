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
export function mayPublishNews(item:OfficialNews):boolean {
 const rights=item.clearance;
 return !!(rights?.commercialReuse===true&&rights.requiredPresentation===true&&rights.deepLink===true&&typeof rights.evidenceUrl==='string'&&rights.evidenceUrl.trim()&&typeof rights.attribution==='string'&&rights.attribution.trim()&&Number.isFinite(Date.parse(rights.confirmedAt))&&officialNewsUrl(item));
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
