import {classifyNews,type OfficialNews} from './airport-customs-news';
import {sha256} from './hash';
export interface CustomsFeedItem {id:string;title:string;url:string;publishedAt:string|null}
const LIMIT=1024*1024;
function bounded(value:string){if(value.length>LIMIT||/<!DOCTYPE|<!ENTITY/i.test(value))throw Error('Unsupported or oversized official feed');}
function text(value:string){return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(?:amp|quot|apos|lt|gt|ldquo|rdquo|nbsp);/g,entity=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&ldquo;':'“','&rdquo;':'”','&nbsp;':' '})[entity]??entity).trim();}
/** Customs RSS uses a local Korean clock without an offset. Never let the host timezone decide it. */
export function customsPublishedAt(value:string):string|null{
 const match=value.trim().match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.\d{1,3})?$/);
 if(!match)return null;
 const local=match[1]+'T'+match[2],instant=new Date(local+'+09:00');
 return Number.isFinite(instant.valueOf())&&new Date(instant.valueOf()+9*3600000).toISOString().slice(0,19)===local?instant.toISOString():null;
}
export function parseCustomsRss(xml:string):CustomsFeedItem[]{
 bounded(xml);if(!/<rss\b/i.test(xml))throw Error('Not an RSS document');
 const items:CustomsFeedItem[]=[],seen=new Set<string>();
 for(const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){
  if(items.length>=100)throw Error('Too many feed items');
  const tag=(name:string)=>text(match[1].match(new RegExp('<'+name+'[^>]*>([\\s\\S]*?)</'+name+'>','i'))?.[1]??'');
  let url:URL;try{url=new URL(tag('link'));}catch{continue;}
  if(!['http:','https:'].includes(url.protocol)||url.hostname!=='www.customs.go.kr'||url.username||url.password||url.port||url.pathname!=='/kcs/na/ntt/selectNttInfo.do')continue;
  const id=url.searchParams.get('nttSn'),title=tag('title');
  if(!id||!/^\d{1,12}$/.test(id)||!title||title.length>500||seen.has(id))continue;
  url.protocol='https:';seen.add(id);items.push({id,title,url:url.href,publishedAt:customsPublishedAt(tag('pubDate'))});
 }
 return items;
}
function hidden(html:string,name:string){return [...html.matchAll(/<input\b[^>]*>/gi)].map(m=>m[0]).filter(tag=>new RegExp('\\bname=["\']'+name+'["\']').test(tag)).map(tag=>tag.match(/\bvalue=["']([^"']*)["']/)?.[1]).find(Boolean);}
/** A normal official article response, not an RSS entry or generic footer,
 * must bind KOGL type 1 to this exact title and article id. Other items stay private. */
export function customsTypeOneEvidence(item:CustomsFeedItem,html:string):string|null{
 bounded(html.replace(/<!doctype\s+html\s*>/i,''));if(hidden(html,'nttSn')!==item.id)return null;
 const block=html.match(/<div\b[^>]*class=["']codeView01["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
 if(!block||!/new_img_opentype01\.png/.test(block)||!/https?:\/\/(?:www\.)?kogl\.or\.kr\/info\/licenseType1\.do/.test(block))return null;
 const titles=[...block.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map(m=>text(m[1]).replace(/^[“”"\s]+|[“”"\s]+$/g,''));
 return titles.includes(item.title)?'https://www.kogl.or.kr/info/licenseType1.do':null;
}
export async function prepareCustomsNews(item:CustomsFeedItem,articleHtml:string,receivedAt:string,options:{deepLinkVerified:boolean;namedAuthor?:string}):Promise<OfficialNews>{
 if(!Number.isFinite(Date.parse(receivedAt)))throw Error('Invalid received timestamp');
 const licence=customsTypeOneEvidence(item,articleHtml),key=hidden(articleHtml,'nttSnUrl');
 const url=new URL(item.url);if(key&&/^[a-f0-9]{32}$/.test(key))url.searchParams.set('nttSnUrl',key);
 const attribution=['관세청',options.namedAuthor,item.publishedAt?.slice(0,4),item.title,url.href,licence].filter(Boolean).join(' · ');
 return {source:'customs',sourceId:item.id,sourceName:'관세청',title:item.title,url:url.href,publishedAt:item.publishedAt,receivedAt,status:'review',topic:classifyNews('customs',item.title),relevantToRetail:false,
  ...(licence&&key&&options.deepLinkVerified?{clearance:{evidenceUrl:url.href,confirmedAt:receivedAt,commercialReuse:true as const,requiredPresentation:true as const,deepLink:true as const,attribution}}:{}),
  contentFingerprint:await sha256({title:item.title,publishedAt:item.publishedAt,licence,articleId:hidden(articleHtml,'nttSn'),key}),facts:[],changes:[],audience:[],attachmentNeedsReview:true};
}
