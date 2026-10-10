import {parseCustomsRss,prepareCustomsNews,customsTypeOneEvidence,customsArticleIdentity,customsPublishedAt,type CustomsFeedItem} from './customs-news-adapter';
import {storeOfficialNews,storedOfficialNews} from './airport-customs-news-store';
import {applyCustomsDocumentReview,type CustomsDocumentReview} from './customs-news-document-review';
import {type OfficialNews,type NewsAttachment} from './airport-customs-news';
const ORIGIN='https://www.customs.go.kr';
export const CUSTOMS_NEWS_COLLECTION_REVIEWED=false;
const BOARDS=[{id:1362,mi:2891,rssMi:15265},{id:1364,mi:2895,rssMi:2895},{id:1365,mi:2896,rssMi:3762},{id:1366,mi:2897,rssMi:2897}] as const;
const decode=(value:string)=>value.replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g,e=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '})[e]??e);
const plain=(value:string)=>decode(value.replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim();
/** This airport news surface is not a general customs press-release feed.
 * Preserve unrelated cleared material privately, never use it to fill an empty tab. */
export function airportCustomsScope(title:string):OfficialNews['topic']{
 return /면세|보세판매장|휴대품|여행자|인천.*공항|공항.*세관|입국장|출국장|해외직구|전자상거래.*통관/i.test(title)?'customs':'unclassified';
}
export function officialCustomsLinks(html:string){
 if(html.length>1024*1024)throw Error('NEWS_HTML_LIMIT');
 const links=new Map<string,string>();
 for(const match of html.matchAll(/<a\b[^>]*>/gi)){
  const tag=match[0],id=tag.match(/\bdata-id=["'](\d{1,12})["']/)?.[1],key=tag.match(/\bdata-url=["']([a-f0-9]{32})["']/)?.[1];
  if(id&&key&&/\bnttInfoBtn\b/.test(tag))links.set(id,key);
 }
 return links;
}
/** Attachment links come from this verified article only. Images are excluded;
 * PDF/HWPX content remains pending until a bound document review is supplied. */
export function customsArticleMetadata(html:string){
 const field=(label:string)=>plain(html.match(new RegExp('<th[^>]*>'+label+'</th>\\s*<td[^>]*>([\\s\\S]*?)</td>','i'))?.[1]??'');
 const attachments:NewsAttachment[]=[];
 for(const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']+)["'][^>]*>/gi)){
  const name=decode(match[2]).replace(/ 다운로드$/,'');if(!/\.(pdf|hwpx)$/i.test(name))continue;
  try{const url=new URL(decode(match[1]),ORIGIN);if(url.origin!==ORIGIN||url.pathname!=='/common/nttFileDownload.do'||!/^[a-f0-9]{32}$/.test(url.searchParams.get('fileKey')??''))continue;
   if(!attachments.some(a=>a.url===url.href))attachments.push({url:url.href,name,review:'pending'});
  }catch{/* Unverified link stays unavailable. */}
 }
 const modifiedAt=customsPublishedAt(field('수정일').replace(/\./g,'-'));
 return {namedAuthor:field('작성자')||undefined,modifiedAt,attachments:attachments.slice(0,6)};
}
async function boundedText(response:Response){
 if(!response.ok)throw Error('NEWS_HTTP_'+response.status);
 if(response.headers.get('content-length')&&Number(response.headers.get('content-length'))>1024*1024)throw Error('NEWS_RESPONSE_LIMIT');
 const reader=response.body?.getReader();if(!reader)throw Error('NEWS_EMPTY_BODY');
 const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1024*1024){await reader.cancel();throw Error('NEWS_RESPONSE_LIMIT');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
/** Prepared Node collector, never scheduled or called by visitor requests.
 * activation is for offline fixture tests; the production entrypoint does not override review. */
export async function collectCustomsNews(db:Pick<D1Database,'prepare'|'batch'>,options:{fetchImpl?:typeof fetch;now?:()=>Date;activation?:boolean;documentReviews?:readonly {review:CustomsDocumentReview;bytes:Uint8Array}[]}={}){
 if(!(options.activation??CUSTOMS_NEWS_COLLECTION_REVIEWED))return {state:'DORMANT',requests:0,currentChanges:0,revisionChanges:0};
 const fetchImpl=options.fetchImpl??fetch,now=options.now??(()=>new Date());let requests=0;
 const read=async(url:string)=>{if(++requests>28)throw Error('NEWS_REQUEST_LIMIT');return boundedText(await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{accept:'application/xml,text/html'}}));};
 const incoming:OfficialNews[]=[];const seen=new Set<string>();let articleReads=0;
 for(const board of BOARDS){
  const feed=parseCustomsRss(await read(`${ORIGIN}/kcs/selectBoardRss.do?mi=${board.rssMi}&bbsId=${board.id}`));
  const links=officialCustomsLinks(await read(`${ORIGIN}/kcs/na/ntt/selectNttList.do?bbsId=${board.id}&mi=${board.mi}`));
  for(const item of feed){
   if(articleReads>=20)break;if(seen.has(item.id))continue;
   const key=links.get(item.id);if(!key)continue;seen.add(item.id);
   const url=new URL(item.url);url.searchParams.set('nttSnUrl',key);
   articleReads++;const html=await read(url.href),verified=!!customsTypeOneEvidence(item,html);
   if(!verified){
    // A normal article losing its mark removes the previously cleared public
    // row. Retain only its previously authorised payload as audit evidence.
    if(customsArticleIdentity(item,html)){const previous=await storedOfficialNews(db,'customs',item.id);if(previous?.clearance)incoming.push({...previous,clearance:undefined,receivedAt:now().toISOString()});}
    continue;
   }
   const metadata=customsArticleMetadata(html),boundItem:CustomsFeedItem={...item,url:url.href};
   const prepared=await prepareCustomsNews(boundItem,html,now().toISOString(),{deepLinkVerified:true,namedAuthor:metadata.namedAuthor});
   let reviewed:OfficialNews={...prepared,topic:airportCustomsScope(item.title),modifiedAt:metadata.modifiedAt,attachments:metadata.attachments,attachmentNeedsReview:metadata.attachments.length>0};
   for(const document of options.documentReviews??[])if(document.review.articleId===item.id)reviewed=await applyCustomsDocumentReview(reviewed,document.review,document.bytes);
   incoming.push(reviewed);
  }
 }
 return {state:'PREPARED_COLLECTION',requests,...await storeOfficialNews(db,incoming)};
}
