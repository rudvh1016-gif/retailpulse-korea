'use client';
import {useEffect,useRef} from 'react';
import type {LiveSummary} from './live-signals';
import type {Lang} from './retailpulse-data';
import type {AirportScope} from '../lib/airport-scope-preference';
import AirportCheckpointDeferred from './airport-checkpoint-deferred';
import {rankCurrentDepartureHallCheckpoints} from '../lib/airport-today-summary';
import {animateChoice} from './use-choice-motion';
import './home-checkpoint-waits.css';
import {CHECKPOINT_OFFICIAL_WAIT_URLS,homeCheckpointFallback} from '../lib/airport-home-wait';
import {kstStamp} from '../lib/demand-presentation';
import {checkpointMethodCopy,checkpointTimingCopy} from '../lib/checkpoint-method-copy';

/** Reuses the glance's existing summary and clock. No independent reads or polling. */
export function HomeCheckpointWaits({summary,now,lang,scope='all'}:{summary:LiveSummary|null|undefined;now:number;lang:Lang;scope?:AirportScope}){
 const root=useRef<HTMLElement>(null);
 // Concourse passengers use T1 departure checkpoints; all retains both terminals.
 const terminals:readonly ('T1'|'T2')[]=scope==='all'?['T1','T2']:[scope==='T2'?'T2':'T1'];
 const text={ko:{title:'현재 출국장',note:'현재 체크포인트 대기 관측 · 탑승 게이트 대기 아님',pending:'현재 출국장 관측을 확인하고 있습니다.',missing:'확인 가능한 현재 관측이 없습니다.'},en:{title:'Current departure halls',note:'Current checkpoint waits · not boarding-gate queues',pending:'Checking current departure-hall observations.',missing:'No current observations are available.'},zh:{title:'当前出境区',note:'当前安检口等候观测 · 非登机口等候',pending:'正在确认当前出境区观测。',missing:'暂无可确认的当前观测。'},ja:{title:'現在の出国場',note:'現在の検査場待ち時間・搭乗ゲートの待ち時間ではありません',pending:'現在の出国場観測を確認中です。',missing:'確認できる現在の観測がありません。'}}[lang];
 const rows=rankCurrentDepartureHallCheckpoints((summary?.airport?.congestion??[]).map(row=>({...row,waitTimeRaw:row.waitTimeRaw??null})));
 const fallbackCopy={
  ko:{prior:'마지막 관측',missing:'관측 시각 미확인',link:'공식 실시간 대기'},
  en:{prior:'Last observation',missing:'Observation time unavailable',link:'Official live wait'},
  zh:{prior:'最后观测',missing:'观测时间未确认',link:'官方实时等候'},
  ja:{prior:'最後の観測',missing:'観測時刻未確認',link:'公式のリアルタイム待ち時間'},
 }[lang];
 const fallbacks=summary===undefined?[]:terminals.flatMap(terminal=>{
  const fallback=homeCheckpointFallback(terminal,(rows[terminal]??[]).map(row=>({...row,freshness:row.freshness??'UNKNOWN'})),now);
  return fallback?[{terminal,...fallback}]:[];
 });
 const observationKey=(summary?.airport?.congestion??[]).map(row=>`${row.terminal}:${row.zone}:${row.observedAt}:${row.waitTimeRaw}:${row.waitTimeMinutes}:${row.freshness}`).join('|');
 useEffect(()=>{
  const node=root.current;if(!node||!window.IntersectionObserver)return;
  const stops:(()=>void)[]=[],observed=new Set<Element>();
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){stops.push(animateChoice(entry.target,[{opacity:.5},{opacity:1}],900));observer.unobserve(entry.target);}});
  const discover=()=>{for(const mark of node.querySelectorAll('.checkpoint-schematic-reading[data-state="current"][data-wait-level="very-busy"] strong'))if(!observed.has(mark)){observed.add(mark);observer.observe(mark);}};
  discover();
  const changed=new MutationObserver(discover);changed.observe(node,{subtree:true,childList:true,attributes:true,attributeFilter:['data-state','data-wait-level']});
  return()=>{observer.disconnect();changed.disconnect();stops.forEach(stop=>stop());};
 },[observationKey,scope]);
 return <section className="home-checkpoint-waits" ref={root} aria-labelledby="home-checkpoint-waits-title">
  <h2 data-heading="section" id="home-checkpoint-waits-title"><span className="heading-marker" aria-hidden="true"/>{text.title}</h2><p className="home-checkpoint-note">{text.note}. {checkpointMethodCopy(lang)} {checkpointTimingCopy(lang)}</p>
  {!summary?<p role="status">{summary===undefined?text.pending:text.missing}</p>:<div className="airport-checkpoint-schematics">{terminals.map(terminal=><AirportCheckpointDeferred key={terminal} terminal={terminal} rows={(rows[terminal]??[]).map(row=>({...row,freshness:row.freshness??'UNKNOWN'}))} now={now} lang={lang} showSeverity/>)}</div>}
  {fallbacks.map(({terminal,observedAt})=><p key={terminal} className="home-checkpoint-note" data-testid="home-checkpoint-official-fallback"><strong>{terminal}</strong>{' · '}{observedAt?<>{fallbackCopy.prior} <time dateTime={observedAt}>{kstStamp(observedAt)} KST</time></>:fallbackCopy.missing}{' · '}<a href={CHECKPOINT_OFFICIAL_WAIT_URLS[terminal]} target="_blank" rel="noopener noreferrer">{terminal} {fallbackCopy.link} ↗</a></p>)}
 </section>;
}
