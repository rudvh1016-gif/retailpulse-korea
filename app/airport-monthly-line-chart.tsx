'use client';

import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import type {FocusTrend} from './airport-focus-data';

const number=new Intl.NumberFormat('ko-KR');
const width=332,height=178;

export default function MonthlyLineChart({row}:{row:FocusTrend}){
 const [activeMonth,setActiveMonth]=useState<string|null>(null);
 const [pinned,setPinned]=useState(false);
 const chart=useRef<HTMLDivElement>(null);
 const targets=useRef<Array<HTMLButtonElement|null>>([]);
 const tooltipId=useId();
 const values=row.points.flatMap(point=>point.departures===null?[]:[point.departures]);
 const activeIndex=row.points.findIndex(point=>point.month===activeMonth);
 const active=row.points[activeIndex];

 useEffect(()=>{
  if(!activeMonth)return;
  const dismiss=(event:PointerEvent)=>{if(!chart.current?.contains(event.target as Node)){setActiveMonth(null);setPinned(false);}};
  const escape=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape'){setActiveMonth(null);setPinned(false);}};
  if(pinned)document.addEventListener('pointerdown',dismiss);
  document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};
 },[activeMonth,pinned]);

 if(!values.length)return <p>월별 자료 확인 중</p>;
 const low=Math.max(0,Math.floor(Math.min(...values)*0.9/10000)*10000);
 const high=Math.max(low+10000,Math.ceil(Math.max(...values)*1.1/10000)*10000);
 const x=(index:number)=>48+index*256/Math.max(1,row.points.length-1);
 // Stay within adjacent month centers without changing the existing chart grid.
 const targetWidth=`clamp(24px, ${256/(width*Math.max(1,row.points.length-1))*100}%, 44px)`;
 const y=(value:number)=>130-(value-low)/(high-low)*104;
 const monthLabel=(month:string)=>`${Number(month.slice(5))}월`;
 const readout=(point:FocusTrend['points'][number])=>`${monthLabel(point.month)} · ${point.departures===null?'자료 없음':`${number.format(point.departures)}명`}`;
 const move=(event:KeyboardEvent<HTMLButtonElement>,index:number)=>{
  if(event.key==='Escape'){event.preventDefault();setActiveMonth(null);setPinned(false);return;}
  const next=event.key==='ArrowRight'?Math.min(row.points.length-1,index+1):event.key==='ArrowLeft'?Math.max(0,index-1):event.key==='Home'?0:event.key==='End'?row.points.length-1:null;
  if(next!==null){event.preventDefault();targets.current[next]?.focus();}
 };

 return <figure className="focus-line-chart focus-interactive-line-chart">
  <div ref={chart} className="focus-month-plot" role="group" aria-label={`${row.label} 월별 출발 여객`}
   onPointerLeave={event=>{if(event.pointerType!=='touch'&&!pinned&&!chart.current?.contains(document.activeElement))setActiveMonth(null);}}
   onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)){setActiveMonth(null);setPinned(false);}}}>
   <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
    {[low,(low+high)/2,high].map(tick=><g key={tick}>
     <line x1="48" x2="304" y1={y(tick)} y2={y(tick)} stroke="#e3e8ed" strokeWidth="0.75" vectorEffect="non-scaling-stroke"/>
     <text x="40" y={y(tick)+3} textAnchor="end" className="focus-chart-tick">{`${number.format(tick/10000)}만`}</text>
    </g>)}
    {row.points.map((point,index)=>{
     const previous=row.points[index-1],selected=activeMonth===point.month;
     return <g key={point.month} data-month={point.month}>
      <text x={x(index)} y="158" textAnchor="middle" className="focus-chart-tick" data-selected={selected}>{monthLabel(point.month)}</text>
      {point.departures!==null&&<>
       {previous?.departures!==null&&previous?.departures!==undefined&&<line className="focus-month-line" x1={x(index-1)} y1={y(previous.departures)} x2={x(index)} y2={y(point.departures)} stroke="#28445f" strokeWidth="1.25" vectorEffect="non-scaling-stroke" strokeLinecap="round"/>}
       <circle className="focus-month-point" cx={x(index)} cy={y(point.departures)} r="2.5" fill="white" stroke="#28445f" strokeWidth="1.25" vectorEffect="non-scaling-stroke" data-selected={selected}/>
       <circle className="focus-month-halo" cx={x(index)} cy={y(point.departures)} r="6" fill="none" stroke="#28445f" strokeWidth="0.75" vectorEffect="non-scaling-stroke" data-selected={selected}/>
      </>}
     </g>;
    })}
   </svg>
   {row.points.map((point,index)=><button key={point.month} ref={node=>{targets.current[index]=node;}} type="button"
    className="focus-month-target" style={{left:`${x(index)/width*100}%`,width:targetWidth}} data-month={point.month}
    aria-label={`${row.label} ${point.month.slice(0,4)}년 ${readout(point)}`} aria-pressed={activeMonth===point.month}
    aria-describedby={activeMonth===point.month?tooltipId:undefined}
    onPointerEnter={event=>{if(event.pointerType!=='touch')setActiveMonth(point.month);}}
    onFocus={()=>setActiveMonth(point.month)} onClick={()=>{setActiveMonth(point.month);setPinned(true);}}
    onKeyDown={event=>move(event,index)}><span className="sr-only">{monthLabel(point.month)} 여객 수 확인</span></button>)}
   {active&&<div key={active.month} id={tooltipId} role="tooltip" className="focus-month-tooltip"
    style={{left:`clamp(8px, calc(${x(activeIndex)/width*100}% - 76px), calc(100% - 160px))`,top:`max(0px, calc(${(active.departures===null?100:y(active.departures))/height*100}% - 38px))`}}>{readout(active)}</div>}
  </div>
  <figcaption>세로축 {number.format(low)}–{number.format(high)}명 · 국가별 범위 다름</figcaption>
 </figure>;
}
