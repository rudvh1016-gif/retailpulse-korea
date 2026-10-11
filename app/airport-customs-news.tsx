'use client';
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {mayPublishNews,officialNewsUrl,sortNews,verifiedDate,type OfficialNews} from '../lib/airport-customs-news';
import {airportNewsCopy,airportNewsDetailCopy} from '../lib/airport-customs-news-copy';
import type {Lang} from './retailpulse-data';
import './airport-customs-news.css';
import {AirportNewsMark} from './airport-news-mark';
export {AirportNewsMark} from './airport-news-mark';

/** The caller must supply verified,
 * rights-cleared records; no fixtures, provider fetches or AI-generated facts. */
const published=(at:string|null,lang:Lang)=>at&&Number.isFinite(Date.parse(at))?new Intl.DateTimeFormat({ko:'ko-KR',en:'en',zh:'zh-CN',ja:'ja-JP'}[lang],{timeZone:'Asia/Seoul',year:'numeric',month:'short',day:'numeric'}).format(new Date(at)):airportNewsCopy[lang].publicationUnknown;
/** Only the item's reviewed evidence can supply an alternative official text. */
function officialReprint(item:OfficialNews):string|null {
 try{const url=new URL(item.clearance?.evidenceUrl??'');return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&(url.hostname==='korea.kr'||url.hostname==='www.korea.kr')&&url.pathname==='/briefing/pressReleaseView.do'&&/^\d+$/.test(url.searchParams.get('newsId')??'')?url.href:null;}catch{return null;}
}
/** Break a long verified fact at its first sentence; keep every source word. */
function paragraphs(text:string):string[] {
 const sentences=[...new Intl.Segmenter('ko',{granularity:'sentence'}).segment(text)].map(part=>part.segment.trim());
 return text.length>100&&sentences.length>1?[sentences[0],sentences.slice(1).join(' ')]:[text];
}
function attachmentFormat(name:string):string|null {return name.match(/\.(pdf|hwpx?|docx?|xlsx?|zip)$/i)?.[1].toUpperCase()??null;}
export function AirportCustomsNews({items,today,lang='ko',onBack,syncUrl=false,suppressEmpty=false}:{items:readonly OfficialNews[];today:string;lang?:Lang;onBack?:()=>void;syncUrl?:boolean;suppressEmpty?:boolean}){
 const copy={...airportNewsCopy[lang],...airportNewsDetailCopy[lang]};
 const allowed=sortNews(items.filter(mayPublishNews),today),initial=allowed.some(item=>item.topic==='airport')?'airport':allowed.some(item=>item.topic==='customs')?'customs':'airport';
 const [selectedTopic,setTopic]=useState<'airport'|'customs'|null>(null);
 const [selectedKey,setSelectedKey]=useState<string|null>(null);
 const subscribe=useCallback((notify:()=>void)=>{window.addEventListener('hashchange',notify);window.addEventListener('popstate',notify);return()=>{window.removeEventListener('hashchange',notify);window.removeEventListener('popstate',notify);};},[]);
 const hash=useSyncExternalStore(subscribe,()=>syncUrl?location.hash:'',()=>'');
 const parts=hash.match(/^#\/(airport|customs)(?:\/([^/]+))?$/);let urlKey:string|null=null;
 try{urlKey=parts?.[2]?decodeURIComponent(parts[2]):null;}catch{/* Bad deep links never select an article. */}
 const topic=(parts?.[1] as 'airport'|'customs'|undefined)??selectedTopic??initial;
 const selected=allowed.find(item=>item.source+'|'+item.sourceId===(syncUrl?urlKey:selectedKey)&&item.topic===topic)??null;
 const navigate=(next:'airport'|'customs',key:string|null=null)=>{setTopic(next);setSelectedKey(key);const fragment='#/'+next+(key?'/'+encodeURIComponent(key):'');if(syncUrl&&location.hash!==fragment){window.history.pushState(null,'',fragment);window.dispatchEvent(new HashChangeEvent('hashchange'));}};
 const tabs=useRef<Array<HTMLButtonElement|null>>([]),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(selected&&!dialog.current?.open)dialog.current?.showModal();else if(!selected&&dialog.current?.open)dialog.current.close();},[selected]);
 const rows=allowed.filter(item=>item.topic===topic);
 const facts=(title:string,values:OfficialNews['facts'])=>values.some(value=>value.verifiedBySource&&value.text.trim())?<section className="airport-news-facts"><h3>{title}</h3>{values.filter(value=>value.verifiedBySource&&value.text.trim()).flatMap(value=>paragraphs(value.text)).map((text,index)=><p className="airport-provider-text" lang="ko" key={index}>{text}</p>)}</section>:null;
 const reprint=selected?officialReprint(selected):null;
 const rightsEvidence=selected?reprint??officialNewsUrl({source:selected.source,url:selected.clearance?.evidenceUrl??''}):null;
 return <section className="airport-news" lang={lang==='zh'?'zh-CN':lang} aria-labelledby="airport-news-title">
  <header><div><h1 id="airport-news-title">{copy.title}</h1><p>{copy.intro}</p></div>{onBack&&<button type="button" onClick={onBack}>{copy.back}</button>}</header>
  <div className="airport-news-tabs" role="tablist" aria-label={copy.tabs}>
   {(['airport','customs'] as const).map((value,index)=><button key={value} type="button" ref={element=>{tabs.current[index]=element;}} role="tab" id={'news-tab-'+value} aria-controls="airport-news-list" aria-selected={topic===value} tabIndex={topic===value?0:-1} onClick={()=>navigate(value)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?1:1-index;navigate((['airport','customs'] as const)[next]);tabs.current[next]?.focus();}}}><AirportNewsMark topic={value}/>{copy[value]}</button>)}
  </div>
  <div id="airport-news-list" role="tabpanel" aria-labelledby={'news-tab-'+topic}>
   {rows.length?<ul className="airport-news-list">{rows.map(item=><li key={item.source+'|'+item.sourceId}><button type="button" className="airport-news-row" onClick={()=>navigate(topic,item.source+'|'+item.sourceId)}><span className="airport-news-meta"><span>{copy[item.topic==='airport'?'airport':'customs']}</span><span>{copy.status[item.status]}</span></span><h2 className="airport-provider-text" lang="ko">{item.title}</h2><span className="airport-news-meta"><span>{copy.published}: <time dateTime={item.publishedAt??undefined}>{published(item.publishedAt,lang)}</time></span><span className="airport-provider-text" lang="ko">{item.sourceName}</span></span>{(verifiedDate(item.effectiveDate)||verifiedDate(item.deadline))&&<span className="airport-news-dates">{verifiedDate(item.effectiveDate)&&`${copy.effective} ${verifiedDate(item.effectiveDate)}`}{verifiedDate(item.effectiveDate)&&verifiedDate(item.deadline)?' · ':''}{verifiedDate(item.deadline)&&`${copy.deadline} ${verifiedDate(item.deadline)}`}</span>}</button></li>)}</ul>:!suppressEmpty&&<p role="status">{copy.empty}</p>}
  </div>
  <dialog ref={dialog} className="airport-news-detail" aria-labelledby="airport-news-detail-title" onClose={()=>{if(selected)navigate(topic);}} onCancel={event=>{event.preventDefault();navigate(topic);}}>{selected&&<>
   <div className="airport-news-detail-top"><span>{copy.status[selected.status]}</span><button type="button" onClick={()=>navigate(topic)}>{copy.close}</button></div>
   <h2 id="airport-news-detail-title" className="airport-provider-text" lang="ko">{selected.title}</h2>
   <div className="airport-news-source-links"><a href={officialNewsUrl(selected)??undefined} target="_blank" rel="noopener noreferrer">{copy.original} <span aria-hidden="true">↗</span></a>{reprint&&<a href={reprint} target="_blank" rel="noopener noreferrer">{copy.reprint} <span aria-hidden="true">↗</span></a>}</div>
   <p className="airport-news-detail-meta"><span>{copy.published}: <time dateTime={selected.publishedAt??undefined}>{published(selected.publishedAt,lang)}</time></span><span className="airport-provider-text" lang="ko">{selected.sourceName}</span></p>
   {selected.modifiedAt&&Number.isFinite(Date.parse(selected.modifiedAt))&&<p className="airport-news-detail-meta">{copy.modified}: {published(selected.modifiedAt,lang)}</p>}
   {facts(copy.facts,selected.facts)}{facts(copy.changes,selected.changes)}{facts(copy.audience,selected.audience)}
   {(verifiedDate(selected.effectiveDate)||verifiedDate(selected.deadline))&&<p className="airport-news-effective">{verifiedDate(selected.effectiveDate)&&`${copy.effective}: ${verifiedDate(selected.effectiveDate)}`}{verifiedDate(selected.effectiveDate)&&verifiedDate(selected.deadline)?' · ':''}{verifiedDate(selected.deadline)&&`${copy.deadline}: ${verifiedDate(selected.deadline)}`}</p>}
   {!!selected.attachments?.length&&<section className="airport-news-documents"><h3>{copy.attachments}</h3><ul>{selected.attachments.map((attachment,index)=>{const url=officialNewsUrl({source:selected.source,url:attachment.url});return <li key={attachment.url}>{url?<a href={url} target="_blank" rel="noopener noreferrer" aria-label={`${attachment.name} — ${attachment.review==='verified'?copy.documentVerified:copy.documentPending}`} title={attachment.name}>{attachmentFormat(attachment.name)??`${copy.attachment} ${index+1}`} <span aria-hidden="true">↗</span></a>:<span className="airport-provider-text" lang="ko">{attachment.name}</span>}<span>{attachment.review==='verified'?copy.documentVerified:copy.documentPending}</span></li>;})}</ul>{reprint&&<p className="airport-news-document-note">{copy.reprintHelp} <a href={reprint} target="_blank" rel="noopener noreferrer">{copy.reprint} <span aria-hidden="true">↗</span></a></p>}</section>}
   {selected.attachmentNeedsReview&&!selected.attachments?.length&&<p className="airport-news-document-note">{copy.documentPending}</p>}
   <p className="airport-provider-text airport-news-attribution" lang="ko">{selected.clearance?.attribution.split(/(https:\/\/[^\s]+)/g).map((part,index)=>part===selected.url?<a key={index} href={officialNewsUrl(selected)??undefined} target="_blank" rel="noopener noreferrer">{copy.original}</a>:part===selected.clearance?.evidenceUrl&&rightsEvidence?<a key={index} href={rightsEvidence} target="_blank" rel="noopener noreferrer">{copy.rightsEvidence}</a>:part)}</p>
  </>}</dialog>
 </section>;
}
