import {parseCustomsRss,prepareCustomsNews,customsArticleIdentity,customsPublishedAt,type CustomsFeedItem} from './customs-news-adapter';
import {storeCollectedNews,blockStoredOfficialNews,storeCustomsRssLink,storedOfficialNews} from './airport-customs-news-store';
import {applyCustomsDocumentReview,observeCustomsDocumentVersion,type CustomsDocumentReview} from './customs-news-document-review';
import {type OfficialNews,type NewsAttachment} from './airport-customs-news';
import {sha256} from './hash';
const ORIGIN='https://www.customs.go.kr';
export const CUSTOMS_NEWS_COLLECTION_REVIEWED=false;
/** Separate OFF gate: preparing this path does not authorize production publication. */
export const CUSTOMS_RSS_LINK_PUBLICATION_REVIEWED=false;
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
 * Every non-image document remains pending until a bound review is supplied;
 * unparsed formats and overflow never imply that all documents were reviewed. */
export function customsArticleMetadata(html:string){
 const field=(label:string)=>plain(html.match(new RegExp('<th[^>]*>'+label+'</th>\\s*<td[^>]*>([\\s\\S]*?)</td>','i'))?.[1]??'');
 // Quoted examples and inert content are not rendered attachment containers.
 const source=html.replace(/<!--[\s\S]*?(?:-->|$)/g,'')
  .replace(/<[a-z][\w:-]*(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi,tag=>tag.replace(/"[^"]*"|'[^']*'/g,value=>value.replace(/</g,'&lt;').replace(/>/g,'&gt;')))
  .replace(/<(script|style|template|textarea|title)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,'');
 const attributes=(tag:string)=>{
  const values=new Map<string,string>();
  for(const attribute of tag.matchAll(/\s+([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)){
   const name=attribute[1].toLowerCase();
   if(values.has(name))return new Map<string,string>();
   values.set(name,decode(attribute[2]??attribute[3]??attribute[4]??''));
  }
  return values;
 };
 const anchors=(value:string)=>[...value.matchAll(/<a\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)].map(match=>attributes(match[0]));
 const document=(values:Map<string,string>)=>{
  const href=values.get('href'),name=values.get('title')?.replace(/\s+다운로드$/,'').trim();
  if(!href||!name)return null;
  try{const url=new URL(href,ORIGIN);if(url.origin!==ORIGIN||url.username||url.password||url.pathname!=='/common/nttFileDownload.do'||!/^[a-f0-9]{32}$/.test(url.searchParams.get('fileKey')??''))return null;
   return {url:url.href,name,key:url.searchParams.get('fileKey')!};
  }catch{return null;}
 };
 // Saved provider HTML uses exactly one closed attachment row and list_file UL.
 // A missing/truncated/unknown region is not evidence that documents disappeared.
 // External markup markers are escaped parser tokens, never rendered product copy.
 const rows=[...source.matchAll(/<tr\b[^>]*>\s*<th\b[^>]*>\s*\uCCA8\uBD80\uD30C\uC77C\s*<\/th>\s*<td\b[^>]*>\s*(<ul\b[^>]*>)([\s\S]*?)<\/ul>\s*<\/td>\s*<\/tr>/gi)];
 const list=rows.length===1?rows[0]:undefined;
 let attachmentsComplete=!!list&&attributes(list[1]).get('class')?.split(/\s+/).includes('list_file')===true;
 if(list){
  const entries=[...list[2].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
  if(list[2].replace(/<li\b[^>]*>[\s\S]*?<\/li>/gi,'').trim())attachmentsComplete=false;
  for(const entry of entries){
   const links=anchors(entry[1]),documents=links.map(document).filter(value=>value!==null);
   if(documents.length!==1||entry[1].replace(/<a\b(?:[^"'<>]|"[^"]*"|'[^']*')*>[\s\S]*?<\/a>/gi,'').trim())attachmentsComplete=false;
   for(const values of links){
    if(document(values))continue;
    const bound=documents[0];
    const preview=bound&&values.get('href')==='#viewer'&&values.get('class')?.split(/\s+/).includes('btnFile_view')
     &&values.get('onclick')===`viewer('/streamdocs/v4/documents/view/tnnf/${bound.key}')`
     &&values.get('title')===`${bound.name} 바로보기(새창으로 열립니다.)`;
    if(!preview)attachmentsComplete=false;
   }
  }
  if(/\uCCA8\uBD80\uD30C\uC77C|list_file|nttFileDownload|다운로드|\bdownload\b/i.test(source.replace(list[0],'')))attachmentsComplete=false;
 }
 const attachments:NewsAttachment[]=[],attachmentUrls=new Map<string,string>();
 for(const values of anchors(source)){
  const parsed=document(values);if(!parsed)continue;
  const {url,name}=parsed;
  if(attachmentUrls.has(url)){if(attachmentUrls.get(url)!==name)attachmentsComplete=false;continue;}
  attachmentUrls.set(url,name);
  if(/\.(png|jpe?g|gif|webp|svg|bmp|tiff?)$/i.test(name))continue;
  if(attachments.length<6)attachments.push({url,name,review:'pending'});else attachmentsComplete=false;
 }
 const modifiedAt=customsPublishedAt(field('수정일').replace(/\./g,'-'));
 return {namedAuthor:field('작성자')||undefined,modifiedAt,attachments,attachmentsComplete};
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
/** Explicit offline review of a rights withdrawal in this exact source response.
 * A missing licence mark alone is not evidence that earlier permission was revoked. */
export interface CustomsWithdrawalReview {
 articleId:string;evidenceUrl:string;sourceFingerprint:string;quote:string;reviewedAt:string;rightsWithdrawn:true;
}
export async function customsWithdrawalFingerprint(html:string){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(html));
 return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function reviewedWithdrawal(item:CustomsFeedItem,html:string,reviews:readonly CustomsWithdrawalReview[]){
 if(!reviews.length)return false;
 const review=reviews[0],quote=typeof review.quote==='string'?plain(review.quote):'';
 const role=/(?:공개|게시|재사용|이용\s*허락|사용\s*허락|저작권|라이선스)[^.!?\n]{0,120}(?:철회|중단|취소|금지)|(?:reuse|licen[cs]e|permission|publication)[^.!?\n]{0,120}(?:withdrawn|revoked|suspended|prohibited)/i;
 const articleText=plain(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,''));
 if(reviews.length!==1||review.rightsWithdrawn!==true||review.articleId!==item.id||review.evidenceUrl!==item.url
  ||!customsArticleIdentity(item,html)||!quote||quote.length>1200||!role.test(quote)||!articleText.includes(quote)
  ||typeof review.reviewedAt!=='string'||!Number.isFinite(Date.parse(review.reviewedAt))
  ||review.sourceFingerprint!==await customsWithdrawalFingerprint(html))throw Error('NEWS_WITHDRAWAL_REVIEW_UNBOUND');
 return true;
}
/** Prepared Node collector, never scheduled or called by visitor requests.
 * activation is for offline fixture tests; the production entrypoint does not override review. */
export async function collectCustomsNews(db:Pick<D1Database,'prepare'|'batch'>,options:{fetchImpl?:typeof fetch;now?:()=>Date;activation?:boolean;metadataLinks?:boolean;documentReviews?:readonly {review:CustomsDocumentReview;bytes:Uint8Array}[];withdrawalReviews?:readonly CustomsWithdrawalReview[]}={}){
 if(!(options.activation??CUSTOMS_NEWS_COLLECTION_REVIEWED))return {state:'DORMANT',requests:0,currentChanges:0,revisionChanges:0,reviewChanges:0,blockedChanges:0};
 const fetchImpl=options.fetchImpl??fetch,now=options.now??(()=>new Date());let requests=0;
 const read=async(url:string)=>{if(++requests>28)throw Error('NEWS_REQUEST_LIMIT');return boundedText(await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{accept:'application/xml,text/html'}}));};
 const queues:CustomsFeedItem[][]=[],feedUrls=new Map<string,string>();
 // Reserve the eight index reads before sharing the twenty article reads fairly.
 for(const board of BOARDS){
  const feedUrl=`${ORIGIN}/kcs/selectBoardRss.do?mi=${board.rssMi}&bbsId=${board.id}`;
  const feed=parseCustomsRss(await read(feedUrl));
  const links=officialCustomsLinks(await read(`${ORIGIN}/kcs/na/ntt/selectNttList.do?bbsId=${board.id}&mi=${board.mi}`));
  queues.push(feed.flatMap(item=>{
   const key=links.get(item.id);if(!key)return [];
   const url=new URL(item.url);url.searchParams.set('nttSnUrl',key);if(!feedUrls.has(item.id))feedUrls.set(item.id,feedUrl);return [{...item,url:url.href}];
  }));
 }
 const seen=new Set<string>();let articleReads=0,currentChanges=0,revisionChanges=0,reviewChanges=0,blockedChanges=0;
 while(articleReads<20){
  let selected=false;
  for(const queue of queues){
   while(queue.length&&seen.has(queue[0].id))queue.shift();
   const item=queue.shift();if(!item)continue;
   selected=true;seen.add(item.id);articleReads++;
   const html=await read(item.url);
   const withdrawn=await reviewedWithdrawal(item,html,(options.withdrawalReviews??[]).filter(review=>review.articleId===item.id));
   // Commit the publication block before parsing, candidate storage or another request.
   if(withdrawn)blockedChanges+=await blockStoredOfficialNews(db,'customs',item.id);
   if(!customsArticleIdentity(item,html)){if(articleReads>=20)break;continue;}
   const metadata=customsArticleMetadata(html);
   const prepared=await prepareCustomsNews(item,html,now().toISOString(),{deepLinkVerified:true,namedAuthor:metadata.namedAuthor});
   let reviewed:OfficialNews={...prepared,topic:airportCustomsScope(item.title),modifiedAt:metadata.modifiedAt,attachments:metadata.attachments,attachmentListComplete:metadata.attachmentsComplete,attachmentNeedsReview:metadata.attachments.length>0||!metadata.attachmentsComplete};
   if(withdrawn)reviewed={...reviewed,status:'withdrawn'};
   if(options.metadataLinks??CUSTOMS_RSS_LINK_PUBLICATION_REVIEWED){
    const previous=await storedOfficialNews(db,'customs',item.id);
    if(!withdrawn&&reviewed.topic==='customs'&&item.publishedAt){
     const link:OfficialNews={source:'customs',sourceId:item.id,sourceName:'관세청',title:item.title,url:item.url,publishedAt:item.publishedAt,
      receivedAt:reviewed.receivedAt,status:'announced',topic:'customs',relevantToRetail:true,presentation:'official-rss-link',
      rssLinkEvidence:{directoryUrl:ORIGIN+'/kcs/selectBoardRssList.do?mi=7424',feedUrl:feedUrls.get(item.id)!,verifiedAt:reviewed.receivedAt},
      contentFingerprint:await sha256({id:item.id,title:item.title,url:item.url,publishedAt:item.publishedAt}),facts:[],changes:[],audience:[],attachmentNeedsReview:false};
     const saved=await storeCustomsRssLink(db,link);
     if(saved){currentChanges+=saved.currentChanges;revisionChanges+=saved.revisionChanges;if(articleReads>=20)break;continue;}
    }else if(previous?.presentation==='official-rss-link'){
     // An observed loss of relevance/date is not a transport outage. Do not
     // keep presenting the old link as if the current source still matched.
     blockedChanges+=await blockStoredOfficialNews(db,'customs',item.id);
    }
   }
   const documents=(options.documentReviews??[]).filter(document=>document.review.articleId===item.id);
   let versionError:unknown;
   for(const document of documents){
    try{reviewed=await observeCustomsDocumentVersion(reviewed,document.review,document.bytes);}
    catch(error){versionError??=error;continue;}
    // Preserve every proven change before a later observation can replace its SHA.
    const observed=await storeCollectedNews(db,reviewed);
    currentChanges+=observed.currentChanges;revisionChanges+=observed.revisionChanges;reviewChanges+=observed.reviewChanges;blockedChanges+=observed.blockedChanges;
   }
   if(versionError)throw versionError;
   for(const document of documents)reviewed=await applyCustomsDocumentReview(reviewed,document.review,document.bytes);
   // Keep each observed candidate even if a later provider response fails.
   const stored=await storeCollectedNews(db,reviewed);
   currentChanges+=stored.currentChanges;revisionChanges+=stored.revisionChanges;reviewChanges+=stored.reviewChanges;blockedChanges+=stored.blockedChanges;
   if(articleReads>=20)break;
  }
  if(!selected)break;
 }
 return {state:'PREPARED_COLLECTION',requests,currentChanges,revisionChanges,reviewChanges,blockedChanges};
}

