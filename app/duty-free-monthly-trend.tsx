'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {UiLineIcon} from './ui-line-icon';
import type {Lang} from './retailpulse-data';
import {validDutyFreeMonthly,type DutyFreeMonthly,type DutyFreeMonth} from '../lib/duty-free-exchange-monthly';

const copy={
 ko:{expand:'펼치기',collapse:'접기',limit:'확보한 날짜 평균',title:'최근 6개월 환율 그래프 보기',loading:'자료 확인 중…',failed:'월평균 자료 조회 실패',missing:'자료 없음',progress:'수집 중',days:'관측일',note:'신라 인터넷점 · 1 USD 기준 원화. 저장된 관측일만 평균하며, 없는 날짜는 채우지 않습니다.',axis:'세로축',asOf:'자료 기준일',archive:'과거 원문 근거',archiveNote:'공식 사이트 보관본 관측치를 포함합니다. 한 달 전체 평균이나 하루 종일 적용된 환율은 아닙니다.'},
 en:{expand:'Expand',collapse:'Collapse',limit:'Observed-date averages',title:'View the last 6 months of exchange rates',loading:'Loading…',failed:'Monthly rates could not be loaded',missing:'No data',progress:'In progress',days:'Observed days',note:'Shilla online shop · KRW per USD. Averages use stored observed days only; missing dates are not filled.',axis:'Y-axis',asOf:'Data through',archive:'Archived source evidence',archiveNote:'Includes archived official-site observations, not full-month averages or verified all-day rates.'},
 zh:{expand:'展开',collapse:'收起',limit:'已获日期平均',title:'查看近6个月汇率图表',loading:'正在读取…',failed:'月均汇率读取失败',missing:'暂无数据',progress:'收集中',days:'观测天数',note:'新罗网上免税店 · 每美元韩元。仅对已保存的观测日求平均，不填补缺失日期。',axis:'纵轴',asOf:'数据截至',archive:'历史原文依据',archiveNote:'含官方网站存档观测值，并非完整月均值或全天适用汇率。'},
 ja:{expand:'開く',collapse:'閉じる',limit:'確認できた日の平均',title:'直近6か月の為替グラフを見る',loading:'確認中…',failed:'月平均データを取得できません',missing:'データなし',progress:'収集中',days:'観測日数',note:'新羅オンライン店 · 1 USDあたりKRW。保存済みの観測日のみで平均し、欠測日は補いません。',axis:'縦軸',asOf:'データ基準日',archive:'保存された原文の根拠',archiveNote:'公式サイトの保存版の観測値を含みます。月全体の平均や終日適用レートではありません。'}
};
const locales={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'};
export function DutyFreeMonthlyTrend({lang}:{lang:Lang}) {
 const words=copy[lang],id=useId(),targets=useRef<Array<HTMLButtonElement|null>>([]);
 const [open,setOpen]=useState(false),[data,setData]=useState<DutyFreeMonthly|null>(null),[failed,setFailed]=useState(false),[active,setActive]=useState<number|null>(null);
 // Fetch only after the explicitly requested second button, once per mounted panel. No polling/retries.
 const requested=useRef(false);
 useEffect(()=>{
  if(!open||requested.current)return;
  requested.current=true;
  const controller=new AbortController();let disposed=false,settled=false;
  const timeout=setTimeout(()=>controller.abort(),12000);
  void (async()=>{try{
   const response=await fetch('/api/live/duty-free-exchange/monthly',{signal:controller.signal});
   if(!response.ok)throw new Error('read');
   const result:unknown=await response.json();
   if(!validDutyFreeMonthly(result))throw new Error('shape');
   if(!disposed)setData(result);
  }catch{if(!disposed)setFailed(true);}finally{settled=true;clearTimeout(timeout);}})();
  return()=>{disposed=true;clearTimeout(timeout);controller.abort();if(!settled)requested.current=false;};
 },[open]);
 const number=new Intl.NumberFormat(locales[lang],{minimumFractionDigits:2,maximumFractionDigits:2});
 const values=data?.months.flatMap(row=>row.averageKrwPerUsd===null?[]:[row.averageKrwPerUsd])??[];
 const low=values.length?Math.max(0,Math.floor((Math.min(...values)-5)/10)*10):0;
 const high=values.length?Math.max(low+10,Math.ceil((Math.max(...values)+5)/10)*10):10;
 const x=(index:number)=>48+index*256/5,y=(value:number)=>130-(value-low)/(high-low)*104;
 const label=(row:DutyFreeMonth)=>`${row.month} · ${row.averageKrwPerUsd===null?words.missing:`${number.format(row.averageKrwPerUsd)} KRW / USD`} · ${words.days} ${row.observedDays}/${row.calendarDays}${row.inProgress?` · ${words.progress}`:''}`;
 return <section className="duty-free-monthly">
  <button type="button" data-disclosure-trigger className="duty-free-monthly-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}><UiLineIcon kind="chart"/><span className="duty-free-monthly-title">{words.title}<small>{words.limit}</small></span><span className="duty-free-monthly-state">{open?words.collapse:words.expand}<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false" style={{transform:open?"rotate(180deg)":undefined}}><path d="m2 4 4 4 4-4"/></svg></span></button>
  {open&&<div id={id}>
   {!data&&<p className="prep-note" role="status">{failed?words.failed:words.loading}</p>}
   {data&&values.length===0&&<p className="prep-note" role="status">{words.missing}</p>}
   {data&&<figure className="duty-free-monthly-chart">
    <div className="duty-free-monthly-plot" role="group" aria-label={words.title} onPointerLeave={event=>{if(event.pointerType!=='touch'&&!event.currentTarget.contains(document.activeElement))setActive(null);}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setActive(null);}}>
     <svg viewBox="0 0 332 178" aria-hidden="true" focusable="false">
      {values.length>0&&[low,(low+high)/2,high].map(tick=><g key={tick}><line x1="48" x2="304" y1={y(tick)} y2={y(tick)} stroke="#e3e8ed" strokeWidth="0.75" vectorEffect="non-scaling-stroke"/><text x="40" y={y(tick)+3} textAnchor="end">{tick}</text></g>)}
      {data.months.map((row,index)=>{const previous=data.months[index-1];return <g key={row.month}>
       <text x={x(index)} y="158" textAnchor="middle">{row.month.slice(5)}</text>
       {row.averageKrwPerUsd!==null?<>
        {previous?.averageKrwPerUsd!==null&&previous?.averageKrwPerUsd!==undefined&&<line x1={x(index-1)} y1={y(previous.averageKrwPerUsd)} x2={x(index)} y2={y(row.averageKrwPerUsd)} stroke="#28445f" strokeWidth="1.25" vectorEffect="non-scaling-stroke" strokeLinecap="round"/>}
        <circle cx={x(index)} cy={y(row.averageKrwPerUsd)} r="2.5" fill="white" stroke="#28445f" strokeWidth="1.25" vectorEffect="non-scaling-stroke"/>
        {active===index&&<circle cx={x(index)} cy={y(row.averageKrwPerUsd)} r="6" fill="none" stroke="#28445f" strokeWidth="0.75" vectorEffect="non-scaling-stroke"/>}
       </>:<text x={x(index)} y="130" textAnchor="middle">—</text>}
      </g>;})}
     </svg>
     {data.months.map((row,index)=><button key={row.month} type="button" ref={node=>{targets.current[index]=node;}} className="duty-free-month-target" style={{left:`${x(index)/332*100}%`}} aria-label={label(row)} aria-pressed={active===index} aria-describedby={active===index?`${id}-readout`:undefined}
      onPointerEnter={event=>{if(event.pointerType!=='touch')setActive(index);}} onFocus={()=>setActive(index)} onClick={()=>setActive(index)} onKeyDown={event=>{
       if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setActive(null);return;}
       const next=event.key==='ArrowRight'?Math.min(5,index+1):event.key==='ArrowLeft'?Math.max(0,index-1):event.key==='Home'?0:event.key==='End'?5:null;
       if(next!==null){event.preventDefault();targets.current[next]?.focus();}
      }}><span className="sr-only">{label(row)}</span></button>)}
    </div>
    <p id={`${id}-readout`} className="duty-free-month-readout" aria-live="polite">{active!==null?label(data.months[active]):label(data.months[5])}</p>
    <figcaption>{values.length>0&&<>{words.axis} {number.format(low)}–{number.format(high)} KRW · </>}{words.asOf} {data.asOfDateKst} KST</figcaption>
    <ul className="duty-free-month-list">{data.months.map(row=><li key={row.month}>{label(row)}</li>)}</ul>
   </figure>}
   <p className="prep-note">{words.note}</p>
   {!!data?.archive?.used.length&&<details className="prep-note duty-free-archive"><summary><span>{words.archive}<span data-disclosure-meta> · {data.archive.used.length}</span></span></summary>
    <p>{words.archiveNote}</p>
    <ul>{data.archive.used.map(row=><li key={row.observedDateKst}>{row.observedDateKst} · {number.format(row.krwPerUsd)} KRW / USD · {row.provenance.map((source,index)=><span key={source.archiveUrl}>{index>0?' · ':''}<a href={source.archiveUrl} target="_blank" rel="noreferrer">{source.capturedAt} UTC</a></span>)}</li>)}</ul>
   </details>}

  </div>}
 </section>;
}
