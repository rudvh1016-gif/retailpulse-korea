'use client';
import {useEffect,useId,useRef,useState} from 'react';
import type {Lang} from './retailpulse-data';
import {compactPeople,flowSegments,kstDay,kstStamp,peopleRange,populationTicks,type FlowPoint,type PopulationRange} from '../lib/demand-presentation';

/** Forecast-only view. Every bound and timestamp comes from the existing summary. */
export function PopulationOutlook({points,current,lang,now}:{points:FlowPoint[];current:PopulationRange|null;lang:Lang;now:number}) {
 const id=useId(),[selected,setSelected]=useState<string|null>(null);
 const container=useRef<HTMLElement>(null),[width,setWidth]=useState(640);
 useEffect(()=>{
  if(!container.current)return;
  const observer=new ResizeObserver(([entry])=>setWidth(Math.max(240,Math.round(entry.contentRect.width))));
  observer.observe(container.current);return()=>observer.disconnect();
 },[]);
 const forecasts=points.filter(p=>p.kind==='forecast');
 const active=forecasts.find(p=>p.at===selected)??forecasts[0];
 const t=(ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
 const start=forecasts[0]?.time??0,end=forecasts.at(-1)?.time??start;
 const ceiling=Math.max(1,current?.populationMax??0,...forecasts.map(p=>p.populationMax));
 const left=46,right=width-14,top=32,bottom=244,plotWidth=right-left;
 const x=(time:number)=>left+(end===start ? 0.5 : (time-start)/(end-start))*plotWidth;
 const y=(value:number)=>bottom-value/ceiling*(bottom-top);
 const ticks=populationTicks(start,end,plotWidth);
 const groups=flowSegments(forecasts);
 const comparison=!current||!active?'':active.populationMax<current.populationMin?t('현재 확인된 인원 범위보다 감소 예상','Expected below the observed range','预计低于观测人数范围','観測人数の範囲より減少予想'):active.populationMin>current.populationMax?t('현재 확인된 인원 범위보다 증가 예상','Expected above the observed range','预计高于观测人数范围','観測人数の範囲より増加予想'):t('관측과 예상 범위가 겹칩니다.','Observed and forecast ranges overlap.','观测与预测范围重叠。','観測と予想の範囲が重なります。');
 const issued=[...new Set(forecasts.map(p=>p.issuedAt?`${kstStamp(p.issuedAt)} KST`:t('발표 시각 미제공','Issue time unavailable','未提供发布时间','発表時刻未提供')))];
 return <section ref={container} className="population-outlook" aria-labelledby={`${id}-title`} data-testid="population-outlook">
  <div className="outlook-heading"><h3 id={`${id}-title`}>{t('앞으로','Coming hours','未来时段','これから')}</h3><span>{t('예상','Forecast','预测','予想')}</span></div>
  {forecasts.length?<>
   <svg className="outlook-trend" viewBox={`0 0 ${width} 292`} data-ceiling={ceiling} data-domain-start={start} data-domain-end={end} role="img" aria-label={t('서울시 공식 예상 인원 최소~최대 범위','Seoul official forecast minimum–maximum population','首尔官方预测最少至最多人数','ソウル市公式予想人数の最小～最大範囲')}>
    <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="#e5ebef"/><line x1={left} x2={right} y1={top} y2={top} stroke="#edf1f4"/>
    <text x={left-8} y={top+4} textAnchor="end">{compactPeople(ceiling,lang)}</text><text x={left-8} y={bottom+4} textAnchor="end">0</text>
    {groups.map((group,index)=>{const upper=group.map(p=>`${x(p.time)},${y(p.populationMax)}`).join(' '),lower=group.map(p=>`${x(p.time)},${y(p.populationMin)}`).join(' ');return <g key={index}>
     {group.length>1?<><polygon points={`${upper} ${[...group].reverse().map(p=>`${x(p.time)},${y(p.populationMin)}`).join(' ')}`} fill="#8fb4cc" fillOpacity=".45"/><polyline points={upper} fill="none" stroke="#6494b3" strokeWidth="1.2" strokeDasharray="3 2"/><polyline points={lower} fill="none" stroke="#8ab0c8" strokeWidth=".8" strokeDasharray="3 2"/></>:<line x1={x(group[0].time)} x2={x(group[0].time)} y1={y(group[0].populationMax)} y2={y(group[0].populationMin)} stroke="#6494b3" strokeWidth="3"/>}
    </g>;})}
    {ticks.map(time=><text key={time} x={x(time)} y={bottom+18} textAnchor={time===start?'start':time===end?'end':'middle'}>{kstStamp(time).slice(6)}</text>)}
    {forecasts.filter(p=>kstStamp(p.at).slice(6)==='00:00').map(p=><g key={p.at}><line x1={x(p.time)} x2={x(p.time)} y1={top-4} y2={bottom} stroke="#dee6eb" strokeDasharray="2 3"/><text x={Math.min(right-34,x(p.time)+4)} y="18">{kstStamp(p.at).slice(0,5)}</text></g>)}
    {active&&<><line x1={x(active.time)} x2={x(active.time)} y1={y(active.populationMax)-7} y2={bottom} stroke="#7598ad" strokeOpacity=".45"/><line data-selected-range x1={x(active.time)} x2={x(active.time)} y1={y(active.populationMax)} y2={y(active.populationMin)} stroke="#497f9f" strokeWidth="3.5" strokeLinecap="round"/></>}
   </svg>
   <div className="outlook-selection" aria-live="polite"><strong>{kstStamp(active.at)} KST</strong><span>{t('예상','Forecast','预测','予想')} {peopleRange(active,lang)}</span><p>{comparison}</p></div>
   <div className="outlook-times" role="group" aria-label={t('예상 시간 선택','Select forecast time','选择预测时间','予想時刻を選択')}>
    {forecasts.map(p=><button key={p.at} type="button" aria-pressed={active.at===p.at} onClick={()=>setSelected(p.at)}><strong>{kstStamp(p.at).slice(6)}</strong><small>{kstDay(p.at)===kstDay(now)?t('오늘','Today','今天','今日'):kstStamp(p.at).slice(0,5)}</small></button>)}
   </div>
   <p className="outlook-source">{t('서울시 공식 예상 · 발표','Seoul official forecast · issued','首尔官方预测 · 发布','ソウル市公式予想・発表')} {issued.join(' · ')}</p>
  </>:<p className="outlook-source">{t('공개된 앞으로의 예상이 없습니다.','No published upcoming forecast.','没有公开的未来预测。','公開された今後の予想はありません。')}</p>}
 </section>;
}
