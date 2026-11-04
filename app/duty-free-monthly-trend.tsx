'use client';
import {readStoredJson} from '../lib/read-stored-json';
import {useEffect,useId,useRef,useState} from 'react';
import {UiLineIcon} from './ui-line-icon';
import type {Lang} from './retailpulse-data';
import {validDutyFreeRecent,type DutyFreeRecent} from '../lib/duty-free-recent';
import {kstExchangeDate,nextKstExchangeMidnight} from '../lib/duty-free-exchange';
const copy={
 ko:{title:'최근 7일 환율 그래프 보기',expand:'펼치기',collapse:'접기',loading:'자료 확인 중…',failed:'최근 환율 조회 실패',missing:'자료 없음',choose:'그래프에서 날짜를 선택하세요'},
 en:{title:'View the last 7 days of exchange rates',expand:'Expand',collapse:'Collapse',loading:'Loading…',failed:'Recent rates could not be loaded',missing:'No data',choose:'Select a date on the chart'},
 zh:{title:'查看最近7天汇率图',expand:'展开',collapse:'收起',loading:'正在读取…',failed:'近期汇率读取失败',missing:'暂无数据',choose:'在图表中选择日期'},
 ja:{title:'直近7日間の為替グラフを見る',expand:'開く',collapse:'閉じる',loading:'読み込み中…',failed:'直近の為替を取得できません',missing:'データなし',choose:'グラフで日付を選択してください'}
};
export function DutyFreeMonthlyTrend({lang}:{lang:Lang}){
 const words=copy[lang],id=useId(),dragging=useRef(false);
 const [open,setOpen]=useState(false),[data,setData]=useState<DutyFreeRecent|null>(null),[failed,setFailed]=useState(false),[active,setActive]=useState<number|null>(null),[refresh,setRefresh]=useState(0);
 useEffect(()=>{if(!open)return;const controller=new AbortController();
  const timer=setTimeout(()=>{setData(null);setFailed(false);setActive(null);setRefresh(value=>value+1);},nextKstExchangeMidnight(Date.now())-Date.now()+10);
  readStoredJson<unknown>('/api/live/duty-free-exchange/recent',{signal:controller.signal,cache:'no-store'}).then(value=>{if(!validDutyFreeRecent(value)||value.asOfDateKst!==kstExchangeDate(Date.now()))throw Error('INVALID_DATA');if(!controller.signal.aborted)setData(value);}).catch(()=>{if(!controller.signal.aborted)setFailed(true);});
  return()=>{controller.abort();clearTimeout(timer);};
 },[open,refresh]);
 const number=new Intl.NumberFormat(({ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'})[lang],{minimumFractionDigits:2,maximumFractionDigits:2});
 const values=data?.days.flatMap(row=>row.krwPerUsd===null?[]:[row.krwPerUsd])??[];
 const low=values.length?Math.max(0,Math.floor((Math.min(...values)-5)/10)*10):0,high=values.length?Math.max(low+10,Math.ceil((Math.max(...values)+5)/10)*10):10;
 const x=(i:number)=>48+i*256/6,y=(value:number)=>130-(value-low)/(high-low)*80;
 const label=(i:number)=>{const row=data!.days[i];return `${row.date} · ${row.krwPerUsd===null?words.missing:number.format(row.krwPerUsd)+' KRW / USD'}`;};
 const select=(clientX:number,element:HTMLDivElement)=>{if(!data)return;const bounds=element.getBoundingClientRect();setActive(Math.max(0,Math.min(6,Math.round((((clientX-bounds.left)/bounds.width)*332-48)/256*6))));};
 const chosen=active===null?null:data?.days[active];
 return <section className="duty-free-monthly duty-free-recent">
  <button type="button" data-disclosure-trigger className="duty-free-monthly-toggle" aria-expanded={open} aria-controls={id} onClick={()=>{setOpen(!open);setData(null);setFailed(false);setActive(null);dragging.current=false;}}><UiLineIcon kind="chart"/><span className="duty-free-monthly-title">{words.title}</span><span className="duty-free-monthly-state">{open?words.collapse:words.expand}</span></button>
  {open&&<div id={id}>
   {!data&&<p className="prep-note" role="status">{failed?words.failed:words.loading}</p>}
   {data&&<figure className="duty-free-monthly-chart">
    {values.length===0&&<p role="status">{words.missing}</p>}
    <div className="duty-free-monthly-plot duty-free-recent-plot" role="slider" tabIndex={0} aria-label={words.title} aria-valuemin={0} aria-valuemax={6} aria-valuenow={active??6} aria-valuetext={active===null?words.choose:label(active)} aria-describedby={`${id}-readout`}
     onFocus={()=>setActive(current=>current??6)} onPointerDown={event=>{dragging.current=true;event.currentTarget.setPointerCapture(event.pointerId);select(event.clientX,event.currentTarget);}}
     onPointerMove={event=>{if(dragging.current||event.pointerType==='mouse')select(event.clientX,event.currentTarget);}} onPointerLeave={event=>{if(!dragging.current&&event.currentTarget!==document.activeElement)setActive(null);}} onPointerUp={()=>{dragging.current=false;}} onPointerCancel={()=>{dragging.current=false;setActive(null);}} onLostPointerCapture={()=>{dragging.current=false;}} onBlur={()=>{setActive(null);dragging.current=false;}}
     onKeyDown={event=>{const current=active??6,next=event.key==='ArrowRight'?Math.min(6,current+1):event.key==='ArrowLeft'?Math.max(0,current-1):event.key==='Home'?0:event.key==='End'?6:null;if(next!==null){event.preventDefault();setActive(next);}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setActive(null);}}}>
     {chosen&&<div className="duty-free-recent-tooltip" role="tooltip" style={{left:`clamp(0px, calc(${x(active!)/332*100}% - 80px), calc(100% - 160px))`}}>
      <div className="duty-free-tooltip-date"><time dateTime={chosen.date}>{chosen.date}</time><span>KST</span></div>
      <div className="duty-free-tooltip-value">{chosen.krwPerUsd===null?<strong>{words.missing}</strong>:<><strong>{number.format(chosen.krwPerUsd)}</strong><span> KRW / USD</span></>}</div>
     </div>}
     <svg viewBox="0 0 332 178" aria-hidden="true" focusable="false">
      {values.length>0&&[low,(low+high)/2,high].map(tick=><g key={tick}><line x1="48" x2="304" y1={y(tick)} y2={y(tick)} stroke="#e3e8ed" strokeWidth=".75"/><text x="40" y={y(tick)+3} textAnchor="end">{Math.round(tick).toLocaleString(lang)}</text></g>)}
      {active!==null&&<line className="duty-free-recent-guide" x1={x(active)} x2={x(active)} y1="42" y2="139"/>}
      {data.days.map((row,i)=>{const previous=data.days[i-1];return <g key={row.date}>
       <text x={x(i)} y="158" textAnchor="middle" className={active===i?'duty-free-recent-date-active':undefined}>{row.date.slice(5)}</text>
       {row.krwPerUsd!==null?<>
        {previous?.krwPerUsd!==null&&previous?.krwPerUsd!==undefined&&<line data-rate-segment x1={x(i-1)} y1={y(previous.krwPerUsd)} x2={x(i)} y2={y(row.krwPerUsd)} stroke="#28445f" strokeWidth="1.25"/>}
        <circle data-rate-date={row.date} cx={x(i)} cy={y(row.krwPerUsd)} r={active===i?4:2.5} fill="white" stroke="#28445f" strokeWidth="1.25"/>
       </>:<text x={x(i)} y="130" textAnchor="middle">—</text>}
      </g>;})}
     </svg>
    </div>
    <p id={`${id}-readout`} className="duty-free-month-readout" aria-live="polite">{active===null?words.choose:label(active)}</p>
    <figcaption>{data.start} ~ {data.end} KST · {data.observedDays}/7 · KRW / USD{data.missingDates.length?` · ${data.missingDates.length} ${({ko:'일 누락',en:'days missing',zh:'天缺失',ja:'日欠測'})[lang]}`:''}</figcaption>
   </figure>}
  </div>}
 </section>;
}
