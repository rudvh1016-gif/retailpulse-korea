'use client';
import { useEffect, useState } from 'react';
import type { Lang } from './retailpulse-data';
import { activeDutyFreeVendors, DUTY_FREE_CACHE_KEY, dutyFreeDatedPresentation, dutyFreeReadDelay, dutyFreeSources, kstExchangeDate, mergeDutyFreeSnapshot, nextKstExchangeMidnight, shiftExchangeDate, validDutyFreeSnapshot, type DutyFreeExchangeSnapshot } from '../lib/duty-free-exchange';
import './airport-duty-free-exchange.css';

const copy = {
  ko: {title:'면세환율',today:'오늘',pending:'오늘 환율 확인 중',previous:'어제 환율',next:'내일 환율',checked:'확인',source:'공식 출처',shilla:'신라',internet:'인터넷점 참고',missing:'확인된 환율 없음',nextMissing:'공식 출처에서 내일 적용일이 명시된 환율만 표시합니다.',failed:'최근 수집 실패',attempt:'수집 시도',readFailed:'새 자료 조회 실패. 확인된 환율과 확인 시각을 유지합니다.',caution:'인터넷점 표시 환율입니다. 공항 현장 매장의 동일 적용 여부는 확인되지 않았으며, 최종 결제 금액은 달라질 수 있습니다.'},
  en: {title:'Duty-free exchange',today:'Today',pending:'Checking today’s rate',previous:'Yesterday’s rate',next:'Tomorrow’s rate',checked:'Checked',source:'Official source',shilla:'Shilla',internet:'Online-shop reference',missing:'No verified rate',nextMissing:'Tomorrow is shown only when the official source explicitly dates its application.',failed:'Latest collection failed',attempt:'Attempt',readFailed:'Refresh failed. Verified rates and check times are retained.',caution:'Displayed online-shop rates. The same rate at airport stores is unverified; the final payment may differ.'},
  zh: {title:'免税汇率',today:'今天',pending:'正在确认今日汇率',previous:'昨日汇率',next:'明日汇率',checked:'确认',source:'官方来源',shilla:'新罗',internet:'网上店参考',missing:'暂无确认汇率',nextMissing:'仅显示官方来源明确注明明日适用日期的汇率。',failed:'最近采集失败',attempt:'采集时间',readFailed:'新数据读取失败，保留已确认汇率及确认时间。',caution:'网上店显示汇率。尚未确认机场实体店是否适用相同汇率，最终支付金额可能不同。'},
  ja: {title:'免税レート',today:'今日',pending:'今日のレートを確認中',previous:'昨日のレート',next:'翌日のレート',checked:'確認',source:'公式出典',shilla:'新羅',internet:'オンライン店の参考',missing:'確認済みレートなし',nextMissing:'公式出典に翌日の適用日が明記されたレートのみ表示します。',failed:'直近の収集に失敗',attempt:'収集時刻',readFailed:'更新できません。確認済みレートと確認時刻を保持しています。',caution:'オンライン店の表示レートです。空港実店舗での同率適用は未確認で、最終決済額は異なる場合があります。'},
} as const;
const locales={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'} as const;

// The header always follows the current KST day, independently of the airport date filter.
export function AirportDutyFreeExchange({lang}:{lang:Lang;date:string|null}) {
  const [now,setNow]=useState<number|null>(null);
  const [snapshot,setSnapshot]=useState<DutyFreeExchangeSnapshot|null>(null);
  const [readFailed,setReadFailed]=useState(false);
  const [expanded,setExpanded]=useState<'previous'|'next'|null>(null);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>,rollover:ReturnType<typeof setTimeout>;
    let disposed=false,inFlight=false,lastRequestAt=0,failures=0,midnightReads=0,readDay=kstExchangeDate(Date.now());
    let retained:DutyFreeExchangeSnapshot|null=null,controller:AbortController|null=null;
    const at=Date.now();
    try {
      const raw=localStorage.getItem(DUTY_FREE_CACHE_KEY);
      const cached=raw&&raw.length<=16_384?JSON.parse(raw):null;
      if(validDutyFreeSnapshot(cached)) {
        retained=mergeDutyFreeSnapshot(null,cached,at);queueMicrotask(()=>{if(!disposed)setSnapshot(retained);});
      }
    }catch{/* Private browsing or corrupt cache cannot prevent the stored API read. */}
    const hasToday=()=>dutyFreeDatedPresentation(retained,Date.now()).some(row=>row.current);
    const schedule=()=>{
      clearTimeout(timer);
      if(disposed||document.visibilityState!=='visible')return;
      const current=Date.now();
      timer=setTimeout(()=>void refresh(true),Math.min(dutyFreeReadDelay(current,hasToday(),failures,midnightReads),nextKstExchangeMidnight(current)-current+50));
    };
    const armRollover=()=>{
      clearTimeout(rollover);
      if(disposed)return;
      rollover=setTimeout(()=>{
        setNow(Date.now());midnightReads=0;readDay=kstExchangeDate(Date.now());
        armRollover();void refresh(true);
      },nextKstExchangeMidnight(Date.now())-Date.now()+50);
    };
    const refresh=async(force=false)=>{
      const current=Date.now();if(disposed)return;setNow(current);
      const day=kstExchangeDate(current),dayChanged=kstExchangeDate(lastRequestAt)!==day;
      if(readDay!==day){midnightReads=0;readDay=day;}
      if(document.visibilityState!=='visible'||inFlight||(!force&&!dayChanged&&current-lastRequestAt<5*60_000)){schedule();return;}
      if(!hasToday()&&current-(nextKstExchangeMidnight(current)-86_400_000)<15*60_000)midnightReads++;
      lastRequestAt=current;inFlight=true;
      const requestController=new AbortController();controller=requestController;
      const timeout=setTimeout(()=>requestController.abort(),12_000);
      try {
        const response=await fetch('/api/live/duty-free-exchange',{signal:requestController.signal});
        if(!response.ok)throw new Error('rate_read_failed');
        const data:unknown=await response.json();
        if(!validDutyFreeSnapshot(data))throw new Error('rate_shape_invalid');
        const sources=data.sources.filter(source=>activeDutyFreeVendors.some(vendor=>vendor===source.vendor));
        if(sources.length!==activeDutyFreeVendors.length||sources.some(source=>source.errorCode==='STORAGE_UNAVAILABLE'))throw new Error('rate_storage_unavailable');
        retained=mergeDutyFreeSnapshot(retained,{...data,sources},Date.now());failures=0;
        if(!disposed) {
          setSnapshot(retained);setReadFailed(false);
          try{localStorage.setItem(DUTY_FREE_CACHE_KEY,JSON.stringify(retained));}catch{/* Retain in memory if persistence is unavailable. */}
        }
      }catch{failures++;if(!disposed)setReadFailed(true);}
      finally{clearTimeout(timeout);inFlight=false;if(!disposed)setNow(Date.now());schedule();}
    };
    armRollover();void refresh(true);
    const focused=()=>void refresh();
    const visible=()=>{if(document.visibilityState==='visible')void refresh();else clearTimeout(timer);};
    window.addEventListener('focus',focused);document.addEventListener('visibilitychange',visible);
    return()=>{disposed=true;clearTimeout(timer);clearTimeout(rollover);controller?.abort();window.removeEventListener('focus',focused);document.removeEventListener('visibilitychange',visible);};
  },[]);
  const rows=now===null?[]:dutyFreeDatedPresentation(snapshot,now);
  const today=now===null?null:kstExchangeDate(now);
  const current=rows.find(row=>row.current);
  const selected=rows.find(row=>row.serviceDateKst===(today&&shiftExchangeDate(today,expanded==='previous'?-1:1)));
  const words=copy[lang],source=snapshot?.sources.find(row=>row.vendor==='shilla');
  const number=new Intl.NumberFormat(locales[lang],{minimumFractionDigits:2,maximumFractionDigits:2});
  const clock=new Intl.DateTimeFormat(locales[lang],{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const rate=(value:number)=><>1 USD <span className="duty-free-rate-equals">=</span> <span className="duty-free-rate-value">{number.format(value)}{lang==='ko'?'원':' KRW'}</span></>;
  return <aside className="airport-duty-free-exchange" data-testid="airport-duty-free-exchange" data-state={current?'VERIFIED_TODAY':'TODAY_PENDING'} aria-label={words.title}>
    <details className="duty-free-rate-sources" onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}>
      <summary><span className="duty-free-rate-line" aria-live="polite"><strong>{words.title}</strong>{current?<span className="duty-free-rate" data-testid="duty-free-rate">{rate(current.krwPerUnit)}</span>:<span className="prep-note">{words.pending}</span>}</span></summary>
      <div className="duty-free-rate-detail">
        <p className="prep-note">{words.internet} · {words.source} <a href={dutyFreeSources.shilla} target="_blank" rel="noopener noreferrer">{words.shilla}</a></p>
        <p className="prep-note">{words.today} · {today}</p>
        {current&&<p className="prep-note">{words.checked} <time dateTime={current.verifiedAt}>{clock.format(new Date(current.verifiedAt))} KST</time></p>}
        {readFailed&&<p className="prep-note" role="status">{words.readFailed}</p>}
        {(source?.lastAttemptStatus==='ERROR'||source?.lastAttemptStatus==='BLOCKED')&&<p className="prep-note">{words.failed}{source.lastAttemptAt&&Number.isFinite(Date.parse(source.lastAttemptAt))&&<> · {words.attempt} <time dateTime={source.lastAttemptAt}>{clock.format(new Date(source.lastAttemptAt))} KST</time></>}</p>}
        <div className="duty-free-day-actions">{(['previous','next'] as const).map(day=><button type="button" key={day} aria-expanded={expanded===day} aria-controls="duty-free-selected-day" onClick={()=>setExpanded(expanded===day?null:day)}>{words[day]}</button>)}</div>
        {expanded&&<div id="duty-free-selected-day" data-testid="duty-free-selected-day">
          <p>{words[expanded]} · {today&&shiftExchangeDate(today,expanded==='previous'?-1:1)}</p>
          {selected?<><p className="duty-free-rate">{rate(selected.krwPerUnit)}</p><p className="prep-note">{words.checked} <time dateTime={selected.verifiedAt}>{clock.format(new Date(selected.verifiedAt))} KST</time></p></>:<p className="prep-note">{words.missing}</p>}
          {expanded==='next'&&<p className="prep-note">{words.nextMissing}</p>}
        </div>}
        <p className="prep-note">{words.caution}</p>
      </div>
    </details>
  </aside>;
}
