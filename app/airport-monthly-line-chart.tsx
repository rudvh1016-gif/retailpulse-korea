'use client';
import {chineseText} from '../lib/chinese-ui';

import {useEffect,useId,useRef,useState,type KeyboardEvent,type PointerEvent as ReactPointerEvent} from 'react';
import {nearestMonthlyPoint} from '../lib/monthly-chart-pointer';
import type {Lang} from './retailpulse-data';
import type {FocusTrend} from './airport-focus-data';

const number=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0});
const width=332,height=178;

export default function MonthlyLineChart({row,lang='ko'}:{row:FocusTrend;lang?:Lang}){
 const [activeMonth,setActiveMonth]=useState<string|null>(null);
 const [pinned,setPinned]=useState(false);
 const chart=useRef<HTMLDivElement>(null);
 const targets=useRef<Array<HTMLButtonElement|null>>([]);
 const tooltipId=useId();
 const drag=useRef<{id:number;x:number;y:number;moving:boolean}|null>(null);
 const suppressClick=useRef(false);
 const values=row.points.flatMap(point=>point.departures===null?[]:[point.departures]);
 const activeIndex=row.points.findIndex(point=>point.month===activeMonth);
 const active=row.points[activeIndex];

 useEffect(()=>{
  if(!activeMonth)return;
  const dismiss=(event:PointerEvent)=>{if(!chart.current?.contains(event.target as Node)){setActiveMonth(null);setPinned(false);}};
  const escape=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape'){drag.current=null;setActiveMonth(null);setPinned(false);}};
  if(pinned)document.addEventListener('pointerdown',dismiss);
  document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};
 },[activeMonth,pinned]);

 if(!values.length)return <p>{chineseText(lang,"월별 자료 확인 중")}</p>;
 const low=Math.max(0,Math.floor(Math.min(...values)*0.9/10000)*10000);
 const high=Math.max(low+10000,Math.ceil(Math.max(...values)*1.1/10000)*10000);
 const x=(index:number)=>48+index*256/Math.max(1,row.points.length-1);
 // Nearest-month regions meet at their midpoint and cover the whole plot.
 // A 44px cap left untouchable gaps along the visible line on wider charts.
 const boundary=(index:number)=>index===0?0:index===row.points.length?width:(x(index-1)+x(index))/2;
 const y=(value:number)=>130-(value-low)/(high-low)*104;
 const monthLabel=(month:string)=>`${Number(month.slice(5))}월`;
 const readout=(point:FocusTrend['points'][number])=>`${monthLabel(point.month)} · ${point.departures===null?'자료 없음':`${number.format(point.departures)}명`}`;
 const move=(event:KeyboardEvent<HTMLButtonElement>,index:number)=>{
  if(event.key==='Escape'){event.preventDefault();setActiveMonth(null);setPinned(false);return;}
  const next=event.key==='ArrowRight'?Math.min(row.points.length-1,index+1):event.key==='ArrowLeft'?Math.max(0,index-1):event.key==='Home'?0:event.key==='End'?row.points.length-1:null;
  if(next!==null){event.preventDefault();targets.current[next]?.focus();}
 };

 const selectAt=(event:ReactPointerEvent<HTMLDivElement>)=>{
  const bounds=event.currentTarget.getBoundingClientRect();
  const index=nearestMonthlyPoint(event.clientX,bounds.left,bounds.width,row.points.length);
  if(index!==null){setActiveMonth(row.points[index].month);setPinned(true);}
 };
 const endDrag=(event:ReactPointerEvent<HTMLDivElement>,cancelled=false)=>{
  if(drag.current?.id!==event.pointerId)return;
  if(cancelled){setActiveMonth(null);setPinned(false);}
  else if(drag.current.moving)selectAt(event);
  drag.current=null;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 };

 return <figure className="focus-line-chart focus-interactive-line-chart">
  <div ref={chart} className="focus-month-plot" role="group" aria-label={chineseText(lang,`${row.label} 월별 출발 여객`)}
   onPointerDown={event=>{
    if(!event.isPrimary||event.button!==0||drag.current)return;
    suppressClick.current=false;
    drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,moving:false};
    selectAt(event);
   }}
   onPointerMove={event=>{
    const current=drag.current;if(!current||current.id!==event.pointerId)return;
    if(!current.moving){
     const dx=Math.abs(event.clientX-current.x),dy=Math.abs(event.clientY-current.y);
     if(dx<4||dx<=dy)return;
     current.moving=true;suppressClick.current=true;
     event.currentTarget.setPointerCapture(event.pointerId);
    }
    selectAt(event);
   }}
   onPointerUp={event=>endDrag(event)} onPointerCancel={event=>endDrag(event,true)}
   onLostPointerCapture={event=>{if(event.target===event.currentTarget&&drag.current?.id===event.pointerId)drag.current=null;}}
   onClickCapture={event=>{if(suppressClick.current&&event.detail!==0){event.preventDefault();event.stopPropagation();suppressClick.current=false;}}}
   onPointerLeave={event=>{if(event.pointerType==='mouse'&&drag.current&&!drag.current.moving)drag.current=null;if(!drag.current&&event.pointerType!=='touch'&&!pinned&&!chart.current?.contains(document.activeElement))setActiveMonth(null);}}
   onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)){setActiveMonth(null);setPinned(false);}}}>
   <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
    {[low,(low+high)/2,high].map(tick=><g key={tick}>
     <line x1="48" x2="304" y1={y(tick)} y2={y(tick)} stroke="#e3e8ed" strokeWidth="0.75" vectorEffect="non-scaling-stroke"/>
     <text x="40" y={y(tick)+3} textAnchor="end" className="focus-chart-tick">{chineseText(lang,`${number.format(tick/10000)}만`)}</text>
    </g>)}
    {row.points.map((point,index)=>{
     const previous=row.points[index-1],selected=activeMonth===point.month;
     return <g key={point.month} data-month={point.month}>
      <text x={x(index)} y="158" textAnchor="middle" className="focus-chart-tick" data-selected={selected}>{chineseText(lang,monthLabel(point.month))}</text>
      {point.departures!==null&&<>
       {previous?.departures!==null&&previous?.departures!==undefined&&<line className="focus-month-line" x1={x(index-1)} y1={y(previous.departures)} x2={x(index)} y2={y(point.departures)} stroke="#28445f" strokeWidth="1.25" vectorEffect="non-scaling-stroke" strokeLinecap="round"/>}
       <circle className="focus-month-point" cx={x(index)} cy={y(point.departures)} r="2.5" fill="white" stroke="#28445f" strokeWidth="1.25" vectorEffect="non-scaling-stroke" data-selected={selected}/>
       <circle className="focus-month-halo" cx={x(index)} cy={y(point.departures)} r="6" fill="none" stroke="#28445f" strokeWidth="0.75" vectorEffect="non-scaling-stroke" data-selected={selected}/>
      </>}
     </g>;
    })}
   </svg>
   {row.points.map((point,index)=><button key={point.month} ref={node=>{targets.current[index]=node;}} type="button"
    className="focus-month-target" style={{left:`${boundary(index)/width*100}%`,width:`${(boundary(index+1)-boundary(index))/width*100}%`}} data-month={point.month}
    aria-label={chineseText(lang,`${row.label} ${point.month.slice(0,4)}년 ${readout(point)}`)} aria-pressed={activeMonth===point.month}
    aria-describedby={activeMonth===point.month?tooltipId:undefined}
    onPointerEnter={event=>{if(event.pointerType!=='touch'&&!drag.current)setActiveMonth(point.month);}}
    onFocus={()=>setActiveMonth(point.month)} onClick={()=>{setActiveMonth(point.month);setPinned(true);}}
    onKeyDown={event=>move(event,index)}><span className="sr-only">{chineseText(lang,monthLabel(point.month))}{lang==='en'?' passenger count':chineseText(lang," 여객 수 확인")}</span></button>)}
   {active&&<div id={tooltipId} role="tooltip" className="focus-month-tooltip"
    style={{left:`clamp(8px, calc(${x(activeIndex)/width*100}% - 76px), calc(100% - 160px))`,top:`max(0px, calc(${(active.departures===null?100:y(active.departures))/height*100}% - 38px))`}}>{chineseText(lang,readout(active))}</div>}
  </div>
  <figcaption>{chineseText(lang,"세로축 ")}{chineseText(lang,number.format(low))}–{chineseText(lang,number.format(high))}{chineseText(lang,"명 · 국가별 범위 다름")}</figcaption>
 </figure>;
}
