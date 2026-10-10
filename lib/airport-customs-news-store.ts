import {mayPublishNews,sortNews,type OfficialNews} from './airport-customs-news';
import {sha256} from './hash';
type Store=Pick<D1Database,'prepare'|'batch'>;
const MAX_PAYLOAD=8192;
export function validStoredNews(value:unknown):value is OfficialNews{
 if(!value||typeof value!=='object')return false;
 const item=value as OfficialNews;
 return ['airport','customs','law'].includes(item.source)&&typeof item.sourceId==='string'&&item.sourceId.length<=120&&item.sourceId.length>0
  &&typeof item.title==='string'&&item.title.length>0&&item.title.length<=500&&typeof item.url==='string'&&typeof item.sourceName==='string'
  &&['airport','customs','unclassified'].includes(item.topic)&&['announced','proposed','corrected','withdrawn','review'].includes(item.status)
  &&(item.publishedAt===null||typeof item.publishedAt==='string'&&Number.isFinite(Date.parse(item.publishedAt)))
  &&typeof item.receivedAt==='string'&&Number.isFinite(Date.parse(item.receivedAt))&&typeof item.contentFingerprint==='string'
  &&typeof item.attachmentNeedsReview==='boolean'&&typeof item.relevantToRetail==='boolean'
  &&(item.modifiedAt==null||typeof item.modifiedAt==='string'&&Number.isFinite(Date.parse(item.modifiedAt)))
  &&(item.attachmentListComplete==null||typeof item.attachmentListComplete==='boolean')
  &&(!item.attachments||Array.isArray(item.attachments)&&item.attachments.length<=6&&item.attachments.every(a=>a&&typeof a.name==='string'&&a.name.length<=500&&['pending','verified'].includes(a.review)&&typeof a.url==='string'&&a.url.startsWith('https://www.customs.go.kr/common/nttFileDownload.do?fileKey=')))
  &&[item.facts,item.changes,item.audience].every(list=>Array.isArray(list)&&list.length<=12&&list.every(fact=>fact&&typeof fact.text==='string'&&fact.text.length<=1200&&typeof fact.verifiedBySource==='boolean'));
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
  const payload=JSON.stringify(item);if(new TextEncoder().encode(payload).length>MAX_PAYLOAD)throw Error('NEWS_PAYLOAD_LIMIT');
  const hash=await sha256({...item,receivedAt:null,clearance:item.clearance?{...item.clearance,confirmedAt:null}:null,attachments:item.attachments?.map(a=>({...a,reviewedAt:null}))});
  statements.push(db.prepare(`INSERT INTO official_news_revision(source,source_id,semantic_hash,payload,received_at)
   SELECT source,source_id,semantic_hash,payload,received_at FROM official_news_current
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
 if(results.some(result=>!result.success||typeof result.meta?.changes!=='number'))throw Error('NEWS_WRITE_UNMEASURED');
 return {currentChanges:results.filter((_,i)=>i%2===1).reduce((n,r)=>n+(r.meta?.changes??0),0),revisionChanges:results.filter((_,i)=>i%2===0).reduce((n,r)=>n+(r.meta?.changes??0),0)};
}
/** Indexed, bounded stored read only. Unknown topics and restricted records stay private. */
export async function readOfficialNews(db:Pick<D1Database,'prepare'>,today:string){
 const result=await db.prepare('SELECT payload FROM official_news_current WHERE may_publish=1 AND topic IN (\'airport\',\'customs\') ORDER BY published_at DESC LIMIT 50').all<{payload:string}>();
 if(!result.success||!result.results)throw Error('NEWS_READ_FAILED');
 const items:OfficialNews[]=[];
 for(const row of result.results){try{const item:unknown=JSON.parse(row.payload);if(validStoredNews(item)&&mayPublishNews(item))items.push(item);}catch{/* Invalid stored content is never presented. */}}
 return sortNews(items,today);
}
