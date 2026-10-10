'use client';
import {useEffect,useRef,useState} from 'react';
import {mayPublishNews,officialNewsUrl,sortNews,verifiedDate,type OfficialNews} from '../lib/airport-customs-news';
import './airport-customs-news.css';

/** Prepared UI, not mounted or published. The caller must supply verified,
 * rights-cleared records; no fixtures, provider fetches or AI-generated facts. */
export function AirportNewsMark({topic='airport'}:{topic?:'airport'|'customs'}){
 return <svg viewBox="0 0 48 40" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M27 4h13v29H27zM31 12h5m-5 5h5m-5 5h5"/>{topic==='airport'?<path d="m4 21 8-3 5-12 3 1-2 11 7 4-1 3-8-2-4 9-3-1 2-10-7 2z"/>:<><path d="M5 15h16v19H5zM5 15l8-8 8 8M9 21h8m-8 5h8"/><path d="m32 28 3 3 7-8" stroke="#4696bd"/></>}</svg>;
}
const statusNames={announced:'공식 발표',proposed:'행정예고',corrected:'공식 정정',withdrawn:'철회',review:'원문 확인필요'};
const published=(at:string|null)=>at&&Number.isFinite(Date.parse(at))?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'short',day:'numeric'}).format(new Date(at)):'발표일 확인필요';
export function AirportCustomsNews({items,today,onBack}:{items:readonly OfficialNews[];today:string;onBack?:()=>void}){
 const allowed=sortNews(items.filter(mayPublishNews),today),initial=allowed.some(item=>item.topic==='airport')?'airport':allowed.some(item=>item.topic==='customs')?'customs':'airport';
 const [selectedTopic,setTopic]=useState<'airport'|'customs'|null>(null),topic=selectedTopic??initial;
 const [selectedKey,setSelectedKey]=useState<string|null>(null),selected=allowed.find(item=>item.source+'|'+item.sourceId===selectedKey)??null;
 const tabs=useRef<Array<HTMLButtonElement|null>>([]),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(selected&&!dialog.current?.open)dialog.current?.showModal();else if(!selected&&dialog.current?.open)dialog.current.close();},[selected]);
 const rows=allowed.filter(item=>item.topic===topic);
 const facts=(title:string,values:OfficialNews['facts'])=><section><h3>{title}</h3>{values.some(value=>value.verifiedBySource)?<ul>{values.filter(value=>value.verifiedBySource).map((value,index)=><li key={index}>{value.text}</li>)}</ul>:<p>원문 확인필요</p>}</section>;
 return <section className="airport-news" aria-labelledby="airport-news-title">
  <header><AirportNewsMark/><div><h1 id="airport-news-title">인천공항·관세 뉴스</h1><p>공식 발표와 확인된 적용 일정</p></div>{onBack&&<button type="button" onClick={onBack}>돌아가기</button>}</header>
  <div className="airport-news-tabs" role="tablist" aria-label="뉴스 분류">
   {(['airport','customs'] as const).map((value,index)=><button key={value} type="button" ref={element=>{tabs.current[index]=element;}} role="tab" id={'news-tab-'+value} aria-controls="airport-news-list" aria-selected={topic===value} tabIndex={topic===value?0:-1} onClick={()=>setTopic(value)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?1:1-index;setTopic((['airport','customs'] as const)[next]);tabs.current[next]?.focus();}}}><AirportNewsMark topic={value}/>{value==='airport'?'인천공항':'관세·면세'}</button>)}
  </div>
  <div id="airport-news-list" role="tabpanel" aria-labelledby={'news-tab-'+topic}>
   {rows.length?<ul className="airport-news-list">{rows.map(item=><li key={item.source+'|'+item.sourceId}><button type="button" className="airport-news-row" onClick={()=>setSelectedKey(item.source+'|'+item.sourceId)}><span className="airport-news-meta"><span>{item.topic==='airport'?'인천공항':'관세·면세'}</span><span>{statusNames[item.status]}</span>{item.attachmentNeedsReview&&<span>문서 내용 확인필요</span>}</span><h2>{item.title}</h2><span className="airport-news-meta"><time dateTime={item.publishedAt??undefined}>{published(item.publishedAt)}</time><span>{item.sourceName}</span></span>{(verifiedDate(item.effectiveDate)||verifiedDate(item.deadline))&&<span className="airport-news-dates">{verifiedDate(item.effectiveDate)&&`시행일 ${verifiedDate(item.effectiveDate)}`}{verifiedDate(item.effectiveDate)&&verifiedDate(item.deadline)?' · ':''}{verifiedDate(item.deadline)&&`마감 ${verifiedDate(item.deadline)}`}</span>}</button></li>)}</ul>:<p role="status">확인된 공개 가능 자료가 없어 목록을 제공하지 않습니다.</p>}
  </div>
  <dialog ref={dialog} className="airport-news-detail" aria-labelledby="airport-news-detail-title" onClose={()=>setSelectedKey(null)} onCancel={()=>setSelectedKey(null)}>{selected&&<>
   <button type="button" onClick={()=>setSelectedKey(null)}>닫기</button><p>{statusNames[selected.status]} · {published(selected.publishedAt)} · {selected.sourceName}</p><h2 id="airport-news-detail-title">{selected.title}</h2>
   {facts('확인된 핵심 내용',selected.facts)}{facts('변경사항',selected.changes)}{facts('적용 대상',selected.audience)}
   <p>시행일: {verifiedDate(selected.effectiveDate)??'확인필요'}{verifiedDate(selected.deadline)&&` · 마감: ${verifiedDate(selected.deadline)}`}</p>
   {selected.attachmentNeedsReview&&<p>문서 내용을 확인하지 못했습니다. 원문을 확인하세요.</p>}
   <p className="airport-news-attribution">{selected.clearance?.attribution}</p>
   <a href={officialNewsUrl(selected)??undefined} target="_blank" rel="noopener noreferrer">공식 원문 보기</a>
  </>}</dialog>
 </section>;
}
