'use client';
import {useEffect,useRef} from 'react';
import type {LiveSummary} from './live-signals';
import type {Lang} from './retailpulse-data';
import AirportCheckpointDeferred from './airport-checkpoint-deferred';
import {rankCurrentDepartureHallCheckpoints} from '../lib/airport-today-summary';
import {animateChoice} from './use-choice-motion';
import './home-checkpoint-waits.css';
import {checkpointMethodCopy,checkpointTimingCopy} from '../lib/checkpoint-method-copy';

/** Reuses the glance's existing summary and clock. No independent reads or polling. */
export function HomeCheckpointWaits({summary,now,lang}:{summary:LiveSummary|null|undefined;now:number;lang:Lang}){
 const root=useRef<HTMLElement>(null);
 const text={ko:{title:'현재 출국장',note:'현재 체크포인트 대기 관측 · 탑승 게이트 대기 아님',pending:'현재 출국장 관측을 확인하고 있습니다.',missing:'확인 가능한 현재 관측이 없습니다.'},en:{title:'Current departure halls',note:'Current checkpoint waits · not boarding-gate queues',pending:'Checking current departure-hall observations.',missing:'No current observations are available.'},zh:{title:'当前出境区',note:'当前安检口等候观测 · 非登机口等候',pending:'正在确认当前出境区观测。',missing:'暂无可确认的当前观测。'},ja:{title:'現在の出国場',note:'現在の検査場待ち時間・搭乗ゲートの待ち時間ではありません',pending:'現在の出国場観測を確認中です。',missing:'確認できる現在の観測がありません。'}}[lang];
 const rows=rankCurrentDepartureHallCheckpoints((summary?.airport?.congestion??[]).map(row=>({...row,waitTimeRaw:row.waitTimeRaw??null})));
 const observationKey=(summary?.airport?.congestion??[]).map(row=>`${row.terminal}:${row.zone}:${row.observedAt}:${row.waitTimeRaw}:${row.waitTimeMinutes}:${row.freshness}`).join('|');
 useEffect(()=>{
  const node=root.current;if(!node||!window.IntersectionObserver)return;
  const stops:(()=>void)[]=[],observed=new Set<Element>();
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){stops.push(animateChoice(entry.target,[{opacity:.5},{opacity:1}],900));observer.unobserve(entry.target);}});
  const discover=()=>{for(const mark of node.querySelectorAll('.checkpoint-schematic-reading[data-state="current"][data-wait-level="very-busy"] strong'))if(!observed.has(mark)){observed.add(mark);observer.observe(mark);}};
  discover();
  const changed=new MutationObserver(discover);changed.observe(node,{subtree:true,childList:true,attributes:true,attributeFilter:['data-state','data-wait-level']});
  return()=>{observer.disconnect();changed.disconnect();stops.forEach(stop=>stop());};
 },[observationKey]);
 return <section className="home-checkpoint-waits" ref={root} aria-labelledby="home-checkpoint-waits-title">
  <h2 data-heading="section" id="home-checkpoint-waits-title"><span className="heading-marker" aria-hidden="true"/>{text.title}</h2><p className="home-checkpoint-note">{text.note}. {checkpointMethodCopy(lang)} {checkpointTimingCopy(lang)}</p>
  {!summary?<p role="status">{summary===undefined?text.pending:text.missing}</p>:<div className="airport-checkpoint-schematics">{(['T1','T2'] as const).map(terminal=><AirportCheckpointDeferred key={terminal} terminal={terminal} rows={(rows[terminal]??[]).map(row=>({...row,freshness:row.freshness??'UNKNOWN'}))} now={now} lang={lang} showSeverity/>)}</div>}
 </section>;
}
