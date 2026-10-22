'use client';
import {useEffect,useId,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {useSelectionMotion} from './use-choice-motion';
import type {Lang} from './retailpulse-data';
import {compactPeople,flowSegments,kstDay,kstStamp,peopleRange,populationTicks,type FlowPoint,type PopulationRange} from '../lib/demand-presentation';
import {OUTLOOK_PILL,nearestIndex,outlookBand,outlookGrid,pillCenter} from '../lib/outlook-geometry';

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
 // Values read on the trailing edge, so the band starts on the text column.
 const left=10,right=width-40,top=32,bottom=184,plotWidth=right-left;
 const x=(time:number)=>left+(end===start ? 0.5 : (time-start)/(end-start))*plotWidth;
 const y=(value:number)=>bottom-value/ceiling*(bottom-top);
 const selectionLine=useRef<SVGGElement>(null),immediate=useRef(false),press=useRef<{pointer:number;x:number;y:number;moved:boolean}|null>(null);
 useSelectionMotion(selectionLine,active?x(active.time):NaN,selected??'',`${start}|${end}|${width}`,immediate);
 const ticks=populationTicks(start,end,plotWidth);
 const groups=flowSegments(forecasts);
 // Seoul usually publishes a narrow range (about 2,000 people): drawn as one solid ribbon, a wide one as a lighter band.
 const thickness=forecasts.map(p=>(p.populationMax-p.populationMin)/ceiling*(bottom-top)).sort((a,b)=>a-b);
 const narrow=(thickness[Math.floor(thickness.length/2)]??0)<7;
 const comparison=!current||!active?'':active.populationMax<current.populationMin?t('현재 확인된 인원 범위보다 감소 예상','Expected below the observed range','预计低于观测人数范围','観測人数の範囲より減少予想'):active.populationMin>current.populationMax?t('현재 확인된 인원 범위보다 증가 예상','Expected above the observed range','预计高于观测人数范围','観測人数の範囲より増加予想'):t('관측과 예상 범위가 겹칩니다.','Observed and forecast ranges overlap.','观测与预测范围重叠。','観測と予想の範囲が重なります。');
 const issued=[...new Set(forecasts.map(p=>p.issuedAt?`${kstStamp(p.issuedAt)} KST`:t('발표 시각 미제공','Issue time unavailable','未提供发布时间','発表時刻未提供')))];
 const choose=(at:string)=>{immediate.current=false;setSelected(at);};
 // Tap or drag on the drawing picks the nearest published hour; the buttons stay the keyboard path.
 const pick=(event:ReactPointerEvent<SVGSVGElement>,drag:boolean)=>{
  const box=event.currentTarget.getBoundingClientRect();
  const nearest=forecasts[nearestIndex(forecasts.map(p=>x(p.time)),(event.clientX-box.left)*(width/Math.max(1,box.width)))];
  if(!nearest||nearest.at===active?.at)return;
  if(drag){immediate.current=true;selectionLine.current?.getAnimations?.().forEach(animation=>animation.cancel());setSelected(nearest.at);}
  else choose(nearest.at);
 };
 const release=(event:ReactPointerEvent<SVGSVGElement>)=>{if(press.current?.pointer===event.pointerId)press.current=null;};
 const selection=active&&(()=>{
  const at=x(active.time),high=y(active.populationMax),low=y(active.populationMin),pill=pillCenter(at,width);
  // End dots far enough apart to read separately get white centres; a narrow range becomes one solid knob.
  const knob=low-high<12?' is-knob':'';
  return <g ref={selectionLine} className="outlook-active-range">
   <line className="outlook-guide" data-selected-guide={active.at} x1={at} x2={at} y1={OUTLOOK_PILL.top+OUTLOOK_PILL.height} y2={bottom}/>
   <g className="outlook-halo"><line className={knob.trim()||undefined} x1={at} x2={at} y1={high} y2={low}/><circle cx={at} cy={high} r="8"/><circle cx={at} cy={low} r="8"/></g>
   <line className={`outlook-capsule${knob}`} data-selected-range data-selected-at={active.at} x1={at} x2={at} y1={high} y2={low}/>
   <circle className="outlook-end" data-selected-end="max" cx={at} cy={high} r="6"/><circle className="outlook-end" data-selected-end="min" cx={at} cy={low} r="6"/>
   {!knob&&<><circle className="outlook-end-core" cx={at} cy={high} r="2.75"/><circle className="outlook-end-core" cx={at} cy={low} r="2.75"/></>}
   <g className="outlook-pill"><rect x={pill-OUTLOOK_PILL.width/2} y={OUTLOOK_PILL.top} width={OUTLOOK_PILL.width} height={OUTLOOK_PILL.height} rx={OUTLOOK_PILL.height/2}/><text x={pill} y={OUTLOOK_PILL.top+14} textAnchor="middle">{kstStamp(active.at).slice(6)}</text></g>
  </g>;
 })();
 return <section ref={container} className="population-outlook" aria-labelledby={`${id}-title`} data-testid="population-outlook">
  <div className="outlook-heading"><h3 data-heading="subsection" id={`${id}-title`}><span className="heading-marker" aria-hidden="true"/>{t('앞으로','Coming hours','未来时段','これから')}</h3><span>{t('예상','Forecast','预测','予想')}</span></div>
  {forecasts.length?<>
   <svg className="outlook-trend" viewBox={`0 0 ${width} 220`} data-ceiling={ceiling} data-domain-start={start} data-domain-end={end} data-plot={`${left} ${top} ${right} ${bottom}`} role="img" aria-label={t('서울시 공식 예상 인원 최소~최대 범위','Seoul official forecast minimum–maximum population','首尔官方预测最少至最多人数','ソウル市公式予想人数の最小～最大範囲')}
    onPointerDown={event=>{if(event.button!==0)return;press.current={pointer:event.pointerId,x:event.clientX,y:event.clientY,moved:false};event.currentTarget.setPointerCapture?.(event.pointerId);}}
    onPointerMove={event=>{const held=press.current;if(!held||held.pointer!==event.pointerId)return;const dx=Math.abs(event.clientX-held.x),dy=Math.abs(event.clientY-held.y);if(!held.moved&&(dx<6||dx<=dy))return;held.moved=true;pick(event,true);}}
    onPointerUp={event=>{const held=press.current;release(event);if(held?.pointer===event.pointerId&&!held.moved)pick(event,false);}}
    onPointerCancel={release} onLostPointerCapture={release}>
    <defs><linearGradient id={`${id}-fade`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={top} y2={bottom}><stop offset="0" stopColor="#5296ec" stopOpacity=".14"/><stop offset="1" stopColor="#5296ec" stopOpacity="0"/></linearGradient></defs>
    <g className="outlook-grid">{outlookGrid(ceiling,y).map(line=><g key={line.edge+line.value} data-edge={line.edge}><line x1={left} x2={right} y1={line.y} y2={line.y}/><text x={width-2} y={line.y+4} textAnchor="end">{line.value?compactPeople(line.value,lang):'0'}</text></g>)}</g>
    <g className={narrow?'outlook-band is-narrow':'outlook-band'}>{groups.map((group,index)=>{
     const band=outlookBand(group.map(p=>({x:x(p.time),upper:y(p.populationMax),lower:y(p.populationMin)})),bottom);
     return <g key={index} data-from={group[0].at} data-to={group.at(-1)!.at}>{band?<>
      <path className="outlook-fade" d={band.fade} fill={`url(#${id}-fade)`}/><path className="outlook-range" d={band.range}/><path className="outlook-edge outlook-max" d={band.upper}/><path className="outlook-edge outlook-min" d={band.lower}/>
     </>:<line className="outlook-edge outlook-lone" x1={x(group[0].time)} x2={x(group[0].time)} y1={y(group[0].populationMax)} y2={y(group[0].populationMin)}/>}</g>;
    })}</g>
    <g className="outlook-axis">{ticks.map(time=><text key={time} x={x(time)} y={bottom+18} textAnchor={time===start?'start':time===end?'end':'middle'}>{kstStamp(time).slice(6)}{kstStamp(time).slice(6)==='00:00'&&<tspan className="outlook-date" x={x(time)} dy="14">{kstStamp(time).slice(0,5)}</tspan>}</text>)}</g>
    {selection}
   </svg>
   <div className="outlook-selection" aria-live="polite">
    <span className="outlook-selection-label">{t('선택 시간의 예상 인구','Forecast population at selected time','所选时间的预测人口','選択時刻の予想人口')}</span>
    <strong className="outlook-selection-range">{peopleRange(active,lang)}<small>{t('명',' people','人','人')}</small></strong>
    <strong className="outlook-selection-time"><time dateTime={active.at}>{kstStamp(active.at)} KST</time></strong>
    <p>{comparison}</p>
   </div>
   <div className="outlook-times" role="group" aria-label={t('예상 시간 선택','Select forecast time','选择预测时间','予想時刻を選択')}>
    {forecasts.map(p=><button key={p.at} type="button" data-at={p.at} aria-pressed={active.at===p.at} onClick={()=>choose(p.at)}><strong>{kstStamp(p.at).slice(6)}</strong><small>{kstDay(p.at)===kstDay(now)?t('오늘','Today','今天','今日'):kstStamp(p.at).slice(0,5)}</small></button>)}
   </div>
   <p className="outlook-source">{t('서울시 공식 예상 · 발표','Seoul official forecast · issued','首尔官方预测 · 发布','ソウル市公式予想・発表')} {issued.join(' · ')}</p>
  </>:<p className="outlook-source">{t('공개된 앞으로의 예상이 없습니다.','No published upcoming forecast.','没有公开的未来预测。','公開された今後の予想はありません。')}</p>}
 </section>;
}
