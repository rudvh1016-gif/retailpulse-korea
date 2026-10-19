import {writeFile} from 'node:fs/promises';
import {parseCustomsRss,customsArticleIdentity,prepareCustomsNews} from '../lib/customs-news-adapter';
import {officialCustomsLinks,airportCustomsScope} from '../lib/customs-news-collector';

// Diagnostic only: no credentials, database, publication, schedule or UI changes.
if(process.env.RPK_CUSTOMS_SOURCE_PROBE!=='true')throw Error('CUSTOMS_PROBE_NOT_ENABLED');
const origin='https://www.customs.go.kr';
const boards=[{id:1362,mi:2891,rssMi:15265},{id:1364,mi:2895,rssMi:2895},{id:1365,mi:2896,rssMi:3762},{id:1366,mi:2897,rssMi:2897}];
let requests=0;
const read=async(url:string)=>{
 if(++requests>28)throw Error('REQUEST_LIMIT');
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{accept:'application/xml,text/html'}});
 if(!response.ok)throw Error('HTTP_'+response.status);
 const reader=response.body?.getReader();if(!reader)throw Error('EMPTY_BODY');
 let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1024*1024){await reader.cancel();throw Error('RESPONSE_LIMIT');}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
};
const results:Array<{board:number;rssItems:number;matchedLinks:number;verifiedArticles:number;relevantTypeOneArticles:number;relatedArticles:number;typeOneArticles:number;articleChecks:Array<{id:string;related:boolean;typeOneImage:boolean;typeOneLink:boolean;rightsBlock:boolean;cleared:boolean}>;error?:string}>=[];
for(const board of boards){
 const result={board:board.id,rssItems:0,matchedLinks:0,verifiedArticles:0,relevantTypeOneArticles:0,relatedArticles:0,typeOneArticles:0,articleChecks:[] as {id:string;related:boolean;typeOneImage:boolean;typeOneLink:boolean;rightsBlock:boolean;cleared:boolean}[],error:undefined as string|undefined};
 try{
  const feed=parseCustomsRss(await read(`${origin}/kcs/selectBoardRss.do?mi=${board.rssMi}&bbsId=${board.id}`));result.rssItems=feed.length;
  const links=officialCustomsLinks(await read(`${origin}/kcs/na/ntt/selectNttList.do?bbsId=${board.id}&mi=${board.mi}`));
  const matched=feed.filter(item=>links.has(item.id));result.matchedLinks=matched.length;
  if(feed.length&&!matched.length)throw Error('ARTICLE_LINK_CONTRACT');
  for(const item of matched.slice(0,5)){
   const url=new URL(item.url);url.searchParams.set('nttSnUrl',links.get(item.id)!);const linked={...item,url:url.href};
   const html=await read(linked.url);if(!customsArticleIdentity(linked,html))throw Error('ARTICLE_IDENTITY_CONTRACT');
   result.verifiedArticles++;
   const prepared=await prepareCustomsNews(linked,html,new Date().toISOString(),{deepLinkVerified:true});
   const related=airportCustomsScope(item.title)==='customs';
   if(related)result.relatedArticles++;
   if(prepared.clearance)result.typeOneArticles++;
   if(prepared.clearance&&related)result.relevantTypeOneArticles++;
   result.articleChecks.push({id:item.id,related,typeOneImage:/new_img_opentype01\.png/.test(html),typeOneLink:/licenseType1\.do/.test(html),rightsBlock:/codeView01/.test(html),cleared:!!prepared.clearance});
  }
 }catch(error){result.error=error instanceof Error?error.message.slice(0,120):'UNKNOWN_FAILURE';}
 results.push(result);
}
const report={checkedAt:new Date().toISOString(),mode:'READ_ONLY_SOURCE_PROBE',requests,databaseWrites:0,publicationChanges:0,results};
await writeFile('customs-source-probe.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(results.some(result=>result.error))process.exitCode=1;
