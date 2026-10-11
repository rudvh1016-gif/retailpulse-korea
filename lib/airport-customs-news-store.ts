import {mayPublishNews,publicNewsProjection,sortNews,type OfficialNews} from './airport-customs-news';
import {createCollectionReview,validCollectionReview,type StoredOfficialNews} from './customs-news-review';
import {sha256} from './hash';
type Store=Pick<D1Database,'prepare'|'batch'>;
const MAX_PAYLOAD=8192;
export function officialNewsSemanticHash(item:OfficialNews){
 const projected=publicNewsProjection(item);
 return sha256({...projected,receivedAt:null,clearance:projected.clearance?{...projected.clearance,confirmedAt:null}:null,attachments:projected.attachments?.map(a=>({...a,reviewedAt:null}))});
}
export function validStoredNews(value:unknown):value is StoredOfficialNews{
 if(!value||typeof value!=='object')return false;
 const item=value as StoredOfficialNews;
 return ['airport','customs','law'].includes(item.source)&&typeof item.sourceId==='string'&&item.sourceId.length<=120&&item.sourceId.length>0
  &&typeof item.title==='string'&&item.title.length>0&&item.title.length<=500&&typeof item.url==='string'&&typeof item.sourceName==='string'
  &&['airport','customs','unclassified'].includes(item.topic)&&['announced','proposed','corrected','withdrawn','review'].includes(item.status)
  &&(item.publishedAt===null||typeof item.publishedAt==='string'&&Number.isFinite(Date.parse(item.publishedAt)))
  &&typeof item.receivedAt==='string'&&Number.isFinite(Date.parse(item.receivedAt))&&typeof item.contentFingerprint==='string'
  &&typeof item.attachmentNeedsReview==='boolean'&&typeof item.relevantToRetail==='boolean'
  &&(item.modifiedAt==null||typeof item.modifiedAt==='string'&&Number.isFinite(Date.parse(item.modifiedAt)))
  &&(item.attachmentListComplete==null||typeof item.attachmentListComplete==='boolean')
  &&(!item.attachments||Array.isArray(item.attachments)&&item.attachments.length<=6&&item.attachments.every(a=>a&&typeof a.name==='string'&&a.name.length<=500&&['pending','verified'].includes(a.review)&&typeof a.url==='string'&&a.url.startsWith('https://www.customs.go.kr/common/nttFileDownload.do?fileKey=')))
  &&[item.facts,item.changes,item.audience].every(list=>Array.isArray(list)&&list.length<=12&&list.every(fact=>fact&&typeof fact.text==='string'&&fact.text.length<=1200&&typeof fact.verifiedBySource==='boolean'))
  &&(item.collectionReview===undefined||validCollectionReview(item.collectionReview));
}
export async function storedOfficialNews(db:Pick<D1Database,'prepare'>,source:OfficialNews['source'],id:string){
 const row=await db.prepare('SELECT payload FROM official_news_current WHERE source=? AND source_id=?').bind(source,id).first<{payload:string}>();
 if(!row)return null;try{const item:unknown=JSON.parse(row.payload);return validStoredNews(item)?item:null;}catch{return null;}
}
/** Atomic batch protects revisions from concurrent writers. Repeated observation
 * clocks do not change canonical rows or invent an official correction. */
export async function storeOfficialNews(db:Store,incoming:readonly OfficialNews[]){
 if(incoming.length>20||incoming.some(item=>!validStoredNews(item)))throw Error('NEWS_INVALID_BATCH');
 const unique=new Map(incoming.map(item=>[item.source+'|'+item.sourceId,item]));
 const statements:D1PreparedStatement[]=[];
 for(const item of unique.values()){
  const payload=JSON.stringify(publicNewsProjection(item));if(new TextEncoder().encode(payload).length>MAX_PAYLOAD)throw Error('NEWS_PAYLOAD_LIMIT');
  const hash=await officialNewsSemanticHash(item);
  statements.push(db.prepare(`INSERT INTO official_news_revision(source,source_id,semantic_hash,payload,received_at)
   SELECT source,source_id,semantic_hash,json_remove(payload,'$.collectionReview'),received_at FROM official_news_current
   WHERE source=? AND source_id=? AND semantic_hash<>?`).bind(item.source,item.sourceId,hash));
  statements.push(db.prepare(`INSERT INTO official_news_current(source,source_id,topic,published_at,may_publish,semantic_hash,payload,received_at)
   VALUES (?,?,?,?,?,?,?,?)
   ON CONFLICT(source,source_id) DO UPDATE SET topic=excluded.topic,published_at=excluded.published_at,
    may_publish=excluded.may_publish,semantic_hash=excluded.semantic_hash,payload=excluded.payload,received_at=excluded.received_at
   WHERE official_news_current.semantic_hash<>excluded.semantic_hash`)
   .bind(item.source,item.sourceId,item.topic,item.publishedAt,mayPublishNews(item)?1:0,hash,payload,item.receivedAt));
 }
 if(!statements.length)return {currentChanges:0,revisionChanges:0};
 const results=await db.batch(statements);
 measuredChanges(results,statements.length);
 return {currentChanges:results.filter((_,i)=>i%2===1).reduce((n,r)=>n+(r.meta?.changes??0),0),revisionChanges:results.filter((_,i)=>i%2===0).reduce((n,r)=>n+(r.meta?.changes??0),0)};
}
/** Indexed, bounded stored read only. Unknown topics and restricted records stay private. */
export async function readOfficialNews(db:Pick<D1Database,'prepare'>,today:string){
 const result=await db.prepare('SELECT payload FROM official_news_current WHERE may_publish=1 AND topic IN (\'airport\',\'customs\') ORDER BY published_at DESC LIMIT 50').all<{payload:string}>();
 if(!result.success||!result.results)throw Error('NEWS_READ_FAILED');
 const items:OfficialNews[]=[];
 for(const row of result.results){try{const item:unknown=JSON.parse(row.payload);if(validStoredNews(item)&&mayPublishNews(item))items.push(publicNewsProjection(item));}catch{/* Invalid stored content is never presented. */}}
 return sortNews(items,today);
}

function measuredChanges(results:readonly D1Result[],expected:number):number {
 if(results.length!==expected)throw Error('NEWS_WRITE_UNMEASURED');
 let total=0;
 for(const result of results) {
  const changes=result.meta?.changes;
  if(!result.success||typeof changes!=='number'||!Number.isSafeInteger(changes)||changes<0)throw Error('NEWS_WRITE_UNMEASURED');
  total+=changes;
 }
 return total;
}

/** Only call after article-bound withdrawal/document-change verification.
 * This small, idempotent safety write cannot be blocked by revision/payload caps.
 * It never removes the previously approved text or grants publication again. */
export async function blockStoredOfficialNews(db:Store,source:OfficialNews['source'],id:string,expected?:{hash:string;payload:string}):Promise<number> {
 if(!['airport','customs','law'].includes(source)||!id||id.length>120)throw Error('NEWS_INVALID_IDENTITY');
 const sql='UPDATE official_news_current SET may_publish=0 WHERE source=? AND source_id=? AND may_publish=1';
 const statement=expected?db.prepare(sql+' AND semantic_hash=? AND payload=?').bind(source,id,expected.hash,expected.payload):db.prepare(sql).bind(source,id);
 const results=await db.batch([statement]);
 return measuredChanges(results,1);
}

/** Collection updates private review metadata, never the approved canonical
 * fields/hash/clock/history. CAS includes the exact payload and public flag:
 * a competing review or manual publication cannot be silently overwritten. */
export async function storeCollectedNews(db:Store,incoming:OfficialNews) {
 if(!validStoredNews(incoming)||incoming.source!=='customs')throw Error('NEWS_INVALID_COLLECTION');
 const row=await db.prepare('SELECT payload,semantic_hash,may_publish FROM official_news_current WHERE source=? AND source_id=?').bind(incoming.source,incoming.sourceId).first<{payload:string;semantic_hash:string;may_publish:number}>();
 let previous:StoredOfficialNews|null=null;
 if(row) {
  const parsed:unknown=JSON.parse(row.payload);
  if(!validStoredNews(parsed)||await officialNewsSemanticHash(parsed)!==row.semantic_hash)throw Error('NEWS_EXISTING_CONTENT_CONFLICT');
  previous=parsed;
 }
 const {record,blockPublication}=await createCollectionReview(previous,incoming);
 const blockedChanges=blockPublication&&row?await blockStoredOfficialNews(db,incoming.source,incoming.sourceId,{hash:row.semantic_hash,payload:row.payload}):0;
 if(blockPublication&&row?.may_publish===1&&blockedChanges!==1)throw Error('NEWS_REVIEW_CONFLICT');
 const payload=JSON.stringify(record);
 if(!validStoredNews(record)||new TextEncoder().encode(payload).length>MAX_PAYLOAD)throw Error('NEWS_REVIEW_PAYLOAD_LIMIT');
 if(!row) {
  // A new collected article remains a private candidate, even with valid rights.
  const hash=await officialNewsSemanticHash(record);
  const results=await db.batch([db.prepare(`INSERT INTO official_news_current(source,source_id,topic,published_at,may_publish,semantic_hash,payload,received_at)
   VALUES (?,?,?,?,0,?,?,?) ON CONFLICT(source,source_id) DO NOTHING`).bind(record.source,record.sourceId,record.topic,record.publishedAt,hash,payload,record.receivedAt)]);
  if(measuredChanges(results,1)!==1)throw Error('NEWS_REVIEW_CONFLICT');
  return {currentChanges:1,revisionChanges:0,reviewChanges:1,blockedChanges};
 }
 if(payload===row.payload)return {currentChanges:0,revisionChanges:0,reviewChanges:0,blockedChanges};
 const expectedPublic=blockPublication?0:row.may_publish;
 const results=await db.batch([db.prepare(`UPDATE official_news_current SET payload=?
  WHERE source=? AND source_id=? AND semantic_hash=? AND payload=? AND may_publish=?`).bind(payload,incoming.source,incoming.sourceId,row.semantic_hash,row.payload,expectedPublic)]);
 if(measuredChanges(results,1)!==1)throw Error('NEWS_REVIEW_CONFLICT');
 return {currentChanges:0,revisionChanges:0,reviewChanges:1,blockedChanges};
}
