'use client';

import {useEffect,useId,useMemo,useRef,useState} from 'react';
import type {Lang} from './retailpulse-data';
import {PopulationRangeMaterial} from './population-range-material';
import {compactPeople,flowSegments,kstDay,kstStamp,peopleRange,populationTicks,type FlowPoint} from '../lib/demand-presentation';

type CopyKey='flow'|'observed'|'forecast'|'now'|'timeSelect'|'noFlow'|'noHistory'|'missing'|'noForecast'|'issued'|'unknownIssue'|'details'|'rangeNote'|'source';
type Copy=Record<CopyKey,Record<Lang,string>>;
const words={
 all:{ko:'관측부터 전체',en:'Full timeline',zh:'完整时间线',ja:'全期間'},
 future:{ko:'앞으로 확대',en:'Upcoming hours',zh:'放大未来',ja:'今後を拡大'},
 observed:{ko:'관측 범위',en:'Observed range',zh:'观测范围',ja:'観測範囲'},
 forecast:{ko:'예측 범위',en:'Forecast range',zh:'预测范围',ja:'予測範囲'},
 previous:{ko:'이전 시각',en:'Previous time',zh:'上一时刻',ja:'前の時刻'},
 next:{ko:'다음 시각',en:'Next time',zh:'下一时刻',ja:'次の時刻'},
 time:{ko:'시각 · KST',en:'Time · KST',zh:'时间 · KST',ja:'時刻 · KST'},
 kind:{ko:'구분',en:'Type',zh:'类型',ja:'区分'},
 range:{ko:'인구 범위',en:'Population range',zh:'人口范围',ja:'人口範囲'},
 guide:{ko:'실선은 관측, 점선은 예측의 최소·최대입니다. 선은 수집된 시각 사이를 이으며 연속 측정값은 아닙니다.',en:'Solid bounds show observed minima and maxima; dashed bounds show forecasts. Lines join sampled times, not continuous measurements.',zh:'实线表示观测最小值和最大值，虚线表示预测。连线连接采样时刻，不代表连续测量。',ja:'実線は観測、破線は予測の最小・最大値です。線は取得時刻を結び、連続測定値ではありません。'},
 gaps:{ko:'30분을 넘는 관측 공백과 확인된 결측은 연결하지 않습니다. 관측·예측과 서로 다른 발표의 예측도 분리합니다.',en:'Observation gaps over 30 minutes and known missing values stay separate, as do observations, forecasts and different forecast issues.',zh:'超过30分钟的观测间隔及已知缺失值不连接。观测、预测和不同批次预测分别显示。',ja:'30分を超える観測間隔と確認済みの欠測は結びません。観測・予測と異なる発表の予測も分離します。'},
} as const;
const key=(point:FlowPoint)=>`${point.kind}:${point.at}`;

export function PopulationFlowChart({points,lang,now,copy}:{points:FlowPoint[];lang:Lang;now:number;copy:Copy}){
 const id=useId(),figure=useRef<HTMLElement>(null);
 const [width,setWidth]=useState(640),[mode,setMode]=useState<'all'|'future'>('all'),[selected,setSelected]=useState<string|null>(null);
 useEffect(()=>{
  if(!figure.current)return;
  const observer=new ResizeObserver(([entry])=>setWidth(Math.max(240,Math.round(entry.contentRect.width))));
  observer.observe(figure.current);return()=>observer.disconnect();
 },[]);
 const forecasts=useMemo(()=>points.filter(point=>point.kind==='forecast'),[points]);
 const observed=useMemo(()=>points.filter(point=>point.kind==='observed'),[points]);
 const visible=mode==='future'&&forecasts.length?forecasts:points;
 const rows=useMemo(()=>flowSegments(visible),[visible]);
 const latest=observed.at(-1);
 const active=visible.find(point=>key(point)===selected)??(visible.includes(latest!)?latest:visible[0]);
 const activeIndex=active?visible.indexOf(active):-1;
 const min=visible[0]?.time??0,max=visible.at(-1)?.time??0;
 const domainStart=mode==='future'&&forecasts.length?Math.min(now,min):min===max?min-1_800_000:min;
 const domainEnd=max===domainStart?max+1_800_000:max;
 const left=46,right=width-14,plotWidth=right-left,top=32,bottom=244;
 const x=(time:number)=>left+Math.max(0,Math.min(1,(time-domainStart)/(domainEnd-domainStart)))*plotWidth;
 const ceiling=Math.max(1,...visible.map(point=>point.populationMax))*1.1;
 const y=(value:number)=>bottom-value/ceiling*(bottom-top);
 const path=(segment:FlowPoint[],bound:'populationMin'|'populationMax')=>segment.map((point,index)=>`${index?'L':'M'}${x(point.time)},${y(point[bound])}`).join(' ');
 const ticks=populationTicks(domainStart,domainEnd,plotWidth);
 const unit={ko:'명',en:' people',zh:'人',ja:'人'}[lang];
 const valueText=active?`${kstStamp(active.time)} KST · ${copy[active.kind==='forecast'?'forecast':'observed'][lang]} ${peopleRange(active,lang)}${unit}`:'';
 const midnights:number[]=[];
 for(let time=Math.floor((domainStart+9*3_600_000)/86_400_000)*86_400_000-9*3_600_000+86_400_000;time<domainEnd;time+=86_400_000)midnights.push(time);
 function selectAt(clientX:number,rect:{left:number;width:number}){
  if(!visible.length)return;
  const time=domainStart+Math.max(0,Math.min(1,((clientX-rect.left)/rect.width*width-left)/plotWidth))*(domainEnd-domainStart);
  const nearest=visible.reduce((best,point)=>Math.abs(point.time-time)<Math.abs(best.time-time)?point:best);
  setSelected(key(nearest));
 }
 return <figure ref={figure} className="population-flow population-flow-connected" aria-labelledby={`${id}-title`}>
  <div className="flow-head"><figcaption id={`${id}-title`}>{copy.flow[lang]}</figcaption><span className="flow-legend-unit">{unit.trim()} · KST</span></div>
  {!active?<p className="demand-empty">{copy.noFlow[lang]}</p>:<>
   <div className="flow-view-controls" role="group" aria-label={copy.flow[lang]}>
    <button type="button" aria-pressed={mode==='all'||!forecasts.length} onClick={()=>setMode('all')}>{words.all[lang]}</button>
    <button type="button" aria-pressed={mode==='future'&&!!forecasts.length} disabled={!forecasts.length} onClick={()=>setMode('future')}>{words.future[lang]}</button>
   </div>
   <div className="flow-legend"><span><i className="observed"/>{words.observed[lang]}</span><span><i className="forecast"/>{words.forecast[lang]}</span></div>
   <output className="flow-readout" aria-live="polite" htmlFor={`${id}-time`} aria-label={valueText}>
    <span className="flow-readout-meta"><span className="flow-selected-time">{kstStamp(active.time)} · {copy[active.kind==='forecast'?'forecast':'observed'][lang]}</span><small>{kstDay(active.time)} · KST</small></span>
    <strong>{peopleRange(active,lang)}{unit}</strong>
   </output>
   <svg className="population-chart" viewBox={`0 0 ${width} 292`} aria-hidden="true" data-domain-start={domainStart} data-domain-end={domainEnd} data-ceiling={ceiling}
    onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);selectAt(event.clientX,event.currentTarget.getBoundingClientRect());}}
    onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))selectAt(event.clientX,event.currentTarget.getBoundingClientRect());}}
    onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}>
    {[0,ceiling/2,ceiling].map(value=><g key={value}><line className="flow-grid" x1={left} x2={right} y1={y(value)} y2={y(value)}/><text className="flow-y-label" x={left-8} y={y(value)+4} textAnchor="end">{compactPeople(Math.round(value),lang)}</text></g>)}
    {midnights.map(time=><line key={time} className="flow-day-boundary" x1={x(time)} x2={x(time)} y1={top} y2={bottom}/>)}
    {rows.map((segment,index)=><g key={index} className={`flow-${segment[0].kind}`} data-range-times={segment.map(point=>point.time).join(',')}>
     <PopulationRangeMaterial segment={segment} x={x} y={y}/>
     {segment.length>1?<><path className="flow-range" d={`${path(segment,'populationMax')} ${[...segment].reverse().map(point=>`L${x(point.time)},${y(point.populationMin)}`).join(' ')} Z`}/><path className="flow-bound" d={path(segment,'populationMax')}/><path className="flow-bound flow-lower-bound" d={path(segment,'populationMin')}/></>:<line className="flow-bound flow-interval" x1={x(segment[0].time)} x2={x(segment[0].time)} y1={y(segment[0].populationMin)} y2={y(segment[0].populationMax)}/>}
    </g>)}
    {now>=domainStart&&now<=domainEnd&&<g className="flow-now"><line x1={x(now)} x2={x(now)} y1={top-4} y2={bottom}/><text x={Math.max(left+22,Math.min(right-22,x(now)))} y="18" textAnchor="middle">{copy.now[lang]}</text></g>}
    {selected&&<g className="flow-selection"><line x1={x(active.time)} x2={x(active.time)} y1={top-4} y2={bottom}/></g>}
    <g className={`flow-${active.kind} flow-marker`}><circle cx={x(active.time)} cy={y(active.populationMax)} r="2.6"/></g>
    {ticks.map(time=><text className="flow-tick" data-time={time} key={time} x={x(time)} y={bottom+18} textAnchor={time===domainStart?'start':time===domainEnd?'end':'middle'}><tspan x={x(time)}>{kstStamp(time).slice(6)}</tspan>{kstDay(time)!==kstDay(domainStart)&&kstStamp(time).slice(6)==='00:00'&&<tspan className="flow-tick-date" x={x(time)} dy="18">{Number(kstDay(time).slice(5,7))}/{Number(kstDay(time).slice(8))}</tspan>}</text>)}
   </svg>
   <div className="flow-time-control">
    <button type="button" aria-label={words.previous[lang]} disabled={activeIndex===0} onClick={()=>setSelected(key(visible[activeIndex-1]))}>‹</button>
    <div><label htmlFor={`${id}-time`}>{copy.timeSelect[lang]}</label><select id={`${id}-time`} value={key(active)} aria-describedby={`${id}-reading`} onChange={event=>setSelected(event.target.value)}>{visible.map(point=><option key={key(point)} value={key(point)}>{kstStamp(point.time)} · {copy[point.kind==='forecast'?'forecast':'observed'][lang]}</option>)}</select></div>
    <button type="button" aria-label={words.next[lang]} disabled={activeIndex===visible.length-1} onClick={()=>setSelected(key(visible[activeIndex+1]))}>›</button>
   </div>
   <span id={`${id}-reading`} className="sr-only">{valueText}</span>
   <div className="flow-time-extent"><span>{kstStamp(min)} KST</span><span>{kstStamp(max)} KST</span></div>
  </>}
  <div className="flow-notes">
   {observed.length===1&&<p className="flow-note">{copy.noHistory[lang]}</p>}
   {!observed.length&&<p className="flow-note">{copy.missing[lang]}</p>}
   {forecasts.length?<p className="flow-note">{copy.forecast[lang]} · {kstStamp(forecasts[0].at)}–{kstStamp(forecasts.at(-1)!.at)} KST<br/>{[...new Set(forecasts.map(point=>point.issuedAt?`${copy.issued[lang]} ${kstStamp(point.issuedAt)} KST`:copy.unknownIssue[lang]))].join(' · ')}</p>:<p className="flow-note">{copy.noForecast[lang]}</p>}
  </div>
  {!!points.length&&<details className="flow-material-note"><summary>{copy.details[lang]}</summary><p>{words.guide[lang]}</p><p>{words.gaps[lang]}</p><p>{copy.rangeNote[lang]}</p><p>{copy.source[lang]}</p>
   <div className="flow-table-wrap"><table><thead><tr><th scope="col">{words.time[lang]}</th><th scope="col">{words.kind[lang]}</th><th scope="col">{words.range[lang]}</th></tr></thead><tbody>{points.map(point=><tr key={key(point)}><th scope="row">{kstStamp(point.time)}</th><td>{copy[point.kind==='forecast'?'forecast':'observed'][lang]}</td><td>{peopleRange(point,lang)}{unit}</td></tr>)}</tbody></table></div>
  </details>}
 </figure>;
}
