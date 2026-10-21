'use client';
import {useEffect,useState,type RefObject} from 'react';
import {referenceChangeNotices,type ReferenceChangeNotice} from '../lib/reference-change-notices';
import {requestOfficialCalendar} from './official-calendar-client';

export function ReferenceChangeNoticeItems({notices,calendarHref,allowanceHref,onNavigate}:{notices:ReferenceChangeNotice[];calendarHref:string;allowanceHref:string;onNavigate?:()=>void}){
 if(!notices.length)return null;
 const format=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
 return <div className="reference-change-notices" aria-live="polite" aria-atomic="false">{notices.map(notice=><section key={notice.id} data-change-id={notice.id}>
  <div><h3>[공지] {notice.title}</h3><p>{notice.body}</p><small>{notice.timeLabel} <time dateTime={notice.checkedAt}>{format.format(new Date(notice.checkedAt))}</time> KST</small></div>
  <a href={notice.topic==='calendar'?calendarHref:allowanceHref} onClick={onNavigate}>{notice.topic==='calendar'?'일정·공식 출처 보기':'적용 조건·수치 보기'} →</a>
 </section>)}</div>;
}

/** Fetch the existing, cached read APIs once per genuine dialog opening.
 * Reopening after the existing week-hide deadline receives a fresh read. No timer, upstream fetch, storage write or modal reopening. */
export default function ReferenceChangeNotices({dialog,calendarHref,allowanceHref,onNavigate}:{dialog:RefObject<HTMLDialogElement|null>;calendarHref:string;allowanceHref:string;onNavigate:()=>void}){
 const [notices,setNotices]=useState<ReferenceChangeNotice[]>([]);
 useEffect(()=>{
  const node=dialog.current;if(!node)return;
  const controller=new AbortController();let wasOpen=false,generation=0;
  const load=()=>{
   if(!node.open){wasOpen=false;return;}
   if(wasOpen)return;wasOpen=true;const current=++generation;setNotices([]);
   const read=(path:string)=>fetch(path,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])}).then(response=>response.ok?response.json():null).catch(()=>null);
   void Promise.all([requestOfficialCalendar().catch(()=>null),read('/api/airport/allowance-status')]).then(([calendar,allowance])=>{if(!controller.signal.aborted&&current===generation)setNotices(referenceChangeNotices(calendar,allowance));});
  };
  const observer=new MutationObserver(load);observer.observe(node,{attributes:true,attributeFilter:['open']});load();
  return()=>{controller.abort();observer.disconnect();};
 },[dialog]);
 return <ReferenceChangeNoticeItems notices={notices} calendarHref={calendarHref} allowanceHref={allowanceHref} onNavigate={onNavigate}/>;
}
