'use client';
import {useEffect,useRef,useState} from 'react';
import {mayPublishNews,officialNewsUrl,sortNews,verifiedDate,type OfficialNews} from '../lib/airport-customs-news';
import {airportNewsCopy} from '../lib/airport-customs-news-copy';
import type {Lang} from './retailpulse-data';
import './airport-customs-news.css';

/** Prepared UI, not mounted or published. The caller must supply verified,
 * rights-cleared records; no fixtures, provider fetches or AI-generated facts. */
export function AirportNewsMark({topic='airport'}:{topic?:'airport'|'customs'}){
 return <svg viewBox="0 0 48 40" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M27 4h13v29H27zM31 12h5m-5 5h5m-5 5h5"/>{topic==='airport'?<path d="m4 21 8-3 5-12 3 1-2 11 7 4-1 3-8-2-4 9-3-1 2-10-7 2z"/>:<><path d="M5 15h16v19H5zM5 15l8-8 8 8M9 21h8m-8 5h8"/><path d="m32 28 3 3 7-8" stroke="#4696bd"/></>}</svg>;
}
const published=(at:string|null,lang:Lang)=>at&&Number.isFinite(Date.parse(at))?new Intl.DateTimeFormat({ko:'ko-KR',en:'en',zh:'zh-CN',ja:'ja-JP'}[lang],{timeZone:'Asia/Seoul',year:'numeric',month:'short',day:'numeric'}).format(new Date(at)):airportNewsCopy[lang].publicationUnknown;
export function AirportCustomsNews({items,today,lang='ko',onBack}:{items:readonly OfficialNews[];today:string;lang?:Lang;onBack?:()=>void}){
 const copy=airportNewsCopy[lang];
 const allowed=sortNews(items.filter(mayPublishNews),today),initial=allowed.some(item=>item.topic==='airport')?'airport':allowed.some(item=>item.topic==='customs')?'customs':'airport';
 const [selectedTopic,setTopic]=useState<'airport'|'customs'|null>(null),topic=selectedTopic??initial;
 const [selectedKey,setSelectedKey]=useState<string|null>(null),selected=allowed.find(item=>item.source+'|'+item.sourceId===selectedKey)??null;
 const tabs=useRef<Array<HTMLButtonElement|null>>([]),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(selected&&!dialog.current?.open)dialog.current?.showModal();else if(!selected&&dialog.current?.open)dialog.current.close();},[selected]);
 const rows=allowed.filter(item=>item.topic===topic);
 const facts=(title:string,values:OfficialNews['facts'])=><section><h3>{title}</h3>{values.some(value=>value.verifiedBySource)?<ul>{values.filter(value=>value.verifiedBySource).map((value,index)=><li className="airport-provider-text" lang="ko" key={index}>{value.text}</li>)}</ul>:<p>{copy.unknown}</p>}</section>;
 return <section className="airport-news" lang={lang==='zh'?'zh-CN':lang} aria-labelledby="airport-news-title">
  <header><AirportNewsMark/><div><h1 id="airport-news-title">{copy.title}</h1><p>{copy.intro}</p></div>{onBack&&<button type="button" onClick={onBack}>{copy.back}</button>}</header>
  <div className="airport-news-tabs" role="tablist" aria-label={copy.tabs}>
   {(['airport','customs'] as const).map((value,index)=><button key={value} type="button" ref={element=>{tabs.current[index]=element;}} role="tab" id={'news-tab-'+value} aria-controls="airport-news-list" aria-selected={topic===value} tabIndex={topic===value?0:-1} onClick={()=>setTopic(value)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?1:1-index;setTopic((['airport','customs'] as const)[next]);tabs.current[next]?.focus();}}}><AirportNewsMark topic={value}/>{copy[value]}</button>)}
  </div>
  <div id="airport-news-list" role="tabpanel" aria-labelledby={'news-tab-'+topic}>
   {rows.length?<ul className="airport-news-list">{rows.map(item=><li key={item.source+'|'+item.sourceId}><button type="button" className="airport-news-row" onClick={()=>setSelectedKey(item.source+'|'+item.sourceId)}><span className="airport-news-meta"><span>{copy[item.topic==='airport'?'airport':'customs']}</span><span>{copy.status[item.status]}</span>{item.attachmentNeedsReview&&<span>{copy.document}</span>}</span><h2 className="airport-provider-text" lang="ko">{item.title}</h2><span className="airport-news-meta"><time dateTime={item.publishedAt??undefined}>{published(item.publishedAt,lang)}</time><span className="airport-provider-text" lang="ko">{item.sourceName}</span></span>{(verifiedDate(item.effectiveDate)||verifiedDate(item.deadline))&&<span className="airport-news-dates">{verifiedDate(item.effectiveDate)&&`${copy.effective} ${verifiedDate(item.effectiveDate)}`}{verifiedDate(item.effectiveDate)&&verifiedDate(item.deadline)?' · ':''}{verifiedDate(item.deadline)&&`${copy.deadline} ${verifiedDate(item.deadline)}`}</span>}</button></li>)}</ul>:<p role="status">{copy.empty}</p>}
  </div>
  <dialog ref={dialog} className="airport-news-detail" aria-labelledby="airport-news-detail-title" onClose={()=>setSelectedKey(null)} onCancel={()=>setSelectedKey(null)}>{selected&&<>
   <button type="button" onClick={()=>setSelectedKey(null)}>{copy.close}</button><p>{copy.status[selected.status]} · {published(selected.publishedAt,lang)} · <span className="airport-provider-text" lang="ko">{selected.sourceName}</span></p><h2 id="airport-news-detail-title" className="airport-provider-text" lang="ko">{selected.title}</h2>
   {facts(copy.facts,selected.facts)}{facts(copy.changes,selected.changes)}{facts(copy.audience,selected.audience)}
   <p>{copy.effective}: {verifiedDate(selected.effectiveDate)??copy.dateUnknown}{verifiedDate(selected.deadline)&&` · ${copy.deadline}: ${verifiedDate(selected.deadline)}`}</p>
   {selected.attachmentNeedsReview&&<p>{copy.documentUnknown}</p>}
   <p className="airport-provider-text airport-news-attribution" lang="ko">{selected.clearance?.attribution}</p>
   <a href={officialNewsUrl(selected)??undefined} target="_blank" rel="noopener noreferrer">{copy.original}</a>
  </>}</dialog>
 </section>;
}
