'use client';
import {useMemo,useState} from 'react';
import type {Lang} from './retailpulse-data';

import {destinationDailyChanges} from '../lib/airport-destination-daily-changes';
import {mainBuildingMonth} from '../lib/airport-monthly-building';
import {monthlyMetric,previousFlightMonth,type AirportFlightMonth,type AirportMonthlyRollups,type MonthScope} from '../lib/airport-monthly-flights';
import './airport-country-flights.css';
import {useLiveSummary} from './live-summary';
import {usePreparedMonth} from './use-prepared-month';

type Reply={status:string;month:string;months?:string[];calculatedAt?:string|null;data:AirportMonthlyRollups|null};
type Sort='volume'|'increase'|'decrease';
type CountryRow=ReturnType<typeof destinationDailyChanges>[number];
const scopes:[MonthScope,string][]=[['ALL','전체'],['T1','T1 본관'],['CONCOURSE','탑승동'],['T2','T2']];
const sideLabels={EAST:'동편',CENTER:'중앙',WEST:'서편',UNVERIFIED:'위치 미확인'};
const sculptedFlags=new Set(['CN','JP','US','VN']);
const svgFlags=new Set('AE AT AU BN CA CH CZ DE DK ES ET FI FR GB GE GU HK HU ID IN IT KG KH KR KZ LA LK MM MN MO MP MX MY NL NP NZ PH PL PT QA SG TH TM TR TW UZ'.split(' '));
function Flag({country}:{country:string}){const src=sculptedFlags.has(country)?`/images/airport-flags/${country}.webp`:svgFlags.has(country)?`/images/airport-flags/fallback/${country.toLowerCase()}.svg`:null;return src?<img src={src} width="22" height="22" alt=""/>:<span className="cfp-flag-code" aria-hidden="true">{country}</span>;}
const formatters=[new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1}),new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2})];
const fmt=(value:number|null|undefined)=>value===null||value===undefined||!Number.isFinite(value)?'—':formatters[value!==0&&Math.abs(value)<.1?1:0].format(value);
const monthLabel=(value:string)=>`${Number(value.slice(5))}월`;
const scopeLabel=(value:MonthScope)=>scopes.find(([key])=>key===value)?.[1]??value;
function periodLabel(month:AirportFlightMonth|undefined){if(!month)return '자료 없음';const included=month.includedDays,short=(day:string)=>`${Number(day.slice(5,7))}.${Number(day.slice(8))}`;return included.length?`${short(included[0])}–${short(included.at(-1)!)} · ${included.length}일 포함`:'포함 날짜 없음';}
function countryName(country:string,names:Intl.DisplayNames){if(country==='KR')return '국내 목적지';try{return names.of(country)??country;}catch{return country;}}

export function formatFlightChangeRate(value:number|null|undefined){
 if(value==null||!Number.isFinite(value))return '—';
 if(value===0)return '0%';
 const magnitude=Math.abs(value)<.05?'<0.1':new Intl.NumberFormat('ko-KR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(Math.abs(value));
 return `${value>0?'+':'△'}${magnitude}%`;
}
function FlightChangeRate({value}:{value:number|null}){
 const valid=value!==null&&Number.isFinite(value),direction=!valid||value===0?'neutral':value>0?'up':'down';
 const magnitude=valid&&value!==0?(Math.abs(value)<.05?'0.1% 미만':new Intl.NumberFormat('ko-KR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(Math.abs(value))+'%'):'';
 const spoken=!valid?'증감률 자료 없음':value===0?'증감률 0%, 변동 없음':`${magnitude} ${value>0?'증가':'감소'}`;
 return <span className="change-rate cfp-rate" data-direction={direction} role="img" aria-label={spoken}>{formatFlightChangeRate(value)}</span>;
}

function FlightCountChange({delta}:{delta:number|null;format?:unknown;lang?:Lang}){return <span className="change-rate" data-direction={delta===null||delta===0?'neutral':delta>0?'up':'down'}>{delta===null?'—':(delta>0?'+':delta<0?'△':'')+fmt(Math.abs(delta))}</span>;}
export function orderCountryFlights(rows:CountryRow[],sort:Sort){return [...rows].sort((a,b)=>{
 const tie=(b.current??-1)-(a.current??-1)||a.country.localeCompare(b.country);
 if(sort==='increase')return (b.delta??-Infinity)-(a.delta??-Infinity)||tie;
 if(sort==='decrease')return (a.delta??Infinity)-(b.delta??Infinity)||tie;
 return tie;
});}

/** Saved public departure records. Reuses the same aggregation and T1-building split as AirportMonthlyFlights. */
export default function CountryFlightPanel({lang='ko',date=null}:{lang?:Lang;date?:string|null}){
 const summary=useLiveSummary(date);const capturedDay=date??summary?.todayKst??'';
 const requestMonth=capturedDay.slice(0,7);
 const [scope,setScope]=useState<MonthScope>('ALL'),[chosenMonth,setMonth]=useState<string|null>(null),[sort,setSort]=useState<Sort>('volume'),[query,setQuery]=useState(''),[expanded,setExpanded]=useState(false);
 const request=usePreparedMonth<Reply>(requestMonth,`/api/live/airport-months?month=${requestMonth}`,requestMonth,capturedDay),reply=request.reply,failed=request.failed;
 const month=chosenMonth??requestMonth;
 const names=useMemo(()=>new Intl.DisplayNames([lang],{type:'region'}),[lang]);
 const months=reply?.status==='READY'&&Array.isArray(reply.data?.months)?reply.data.months:[];
 const choices=months.filter(m=>months.some(p=>p.month===previousFlightMonth(m.month)&&p.includedDays.length>0)&&m.includedDays.length>0).map(m=>m.month).sort().reverse();
 const storedCurrent=months.find(m=>m.month===month),storedPrevious=months.find(m=>m.month===previousFlightMonth(month));
 const current=scope==='T1'?mainBuildingMonth(storedCurrent):storedCurrent,previous=scope==='T1'?mainBuildingMonth(storedPrevious):storedPrevious;
 const ready=Boolean(current?.includedDays.length&&previous?.includedDays.length);
 const allRows=ready?destinationDailyChanges(current,previous,scope):[];
 const rows=orderCountryFlights(allRows,sort).filter(r=>!query.trim()||`${countryName(r.country,names)} ${r.country}`.toLowerCase().includes(query.trim().toLowerCase()));
 const visible=expanded||query.trim()?rows:rows.slice(0,8);
 const total=monthlyMetric(current,previous,scope,c=>c.total);
 const leader=orderCountryFlights(allRows.filter(r=>(r.delta??0)>0),'increase')[0],decliner=orderCountryFlights(allRows.filter(r=>(r.delta??0)<0),'decrease')[0];
 const maximum=Math.max(1,...allRows.flatMap(r=>[r.current??0,r.previous??0]));
 const unknown=monthlyMetric(current,previous,scope,c=>c.destinationCountries.UNKNOWN??0);
 const changeScope=(next:MonthScope)=>{setScope(next);setExpanded(false);};
 const changeSort=(next:Sort)=>{setSort(next);setExpanded(false);};
 const searchCountry=(country:string)=>{setQuery(countryName(country,names));setExpanded(false);};
 return <section className="cfp-panel" aria-label="국가별 출발 항공편 비교">
  <div className="cfp-controls"><div className="cfp-scopes" role="group" aria-label="항공편 터미널 선택">{scopes.map(([key,label])=><button type="button" key={key} aria-pressed={scope===key} onClick={()=>changeScope(key)}>{label}</button>)}</div>{choices.length>1?<label className="cfp-month">비교 월 <select value={month} onChange={e=>{setMonth(e.target.value);setExpanded(false);}}>{choices.map(value=><option key={value} value={value}>{value}</option>)}</select></label>:<span className="cfp-month">{month} 수집분 · 전월과 비교</span>}</div>
  {!ready?<p className="cfp-empty" role="status">{!reply&&!failed?'국가별 항공편 집계를 불러오는 중입니다':'이 범위에서 비교할 수 있는 두 달의 저장 자료가 없습니다. 없는 날짜를 0편으로 계산하지 않습니다'}</p>:<>
   <div className="cfp-intro"><div><p className="cfp-kicker">{scopeLabel(scope)} · {previous?.month} → {current?.month}</p><h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>어느 나라행이 늘고 줄었나요?</h2><p>목적지별 <strong>하루 평균 출발편</strong></p></div><div className="cfp-total"><span>{scope==='ALL'?'공항 전체':scopeLabel(scope)+' 전체'} · 편/일</span><strong>{fmt(total.previous)} <i aria-hidden="true">→</i> {fmt(total.current)}</strong><FlightChangeRate value={total.percent}/></div></div>
   <p className="cfp-periods"><span><i className="cfp-swatch cfp-before"/>{previous?.month} · {periodLabel(previous)}</span><span><i className="cfp-swatch cfp-after"/>{current?.month} · {periodLabel(current)}</span></p>
   <p className="cfp-coverage-note">{current?.month===requestMonth?'진행 중인 달 · ':''}포함일 기준 평균 · 요일·휴일 구성 차이 있음</p>
   <div className="cfp-quick-find" aria-label="변화가 큰 목적지">{leader&&<button type="button" onClick={()=>searchCountry(leader.country)}><span>가장 큰 증가</span><b>{countryName(leader.country,names)}</b><FlightCountChange delta={leader.delta} format={fmt} lang={lang}/><small>편/일</small></button>}{decliner&&<button type="button" onClick={()=>searchCountry(decliner.country)}><span>가장 큰 감소</span><b>{countryName(decliner.country,names)}</b><FlightCountChange delta={decliner.delta} format={fmt} lang={lang}/><small>편/일</small></button>}</div>
   <div className="cfp-list-tools"><label>보기 순서 <select aria-label="국가별 항공편 보기 순서" value={sort} onChange={e=>changeSort(e.target.value as Sort)}><option value="volume">편수 많은 순</option><option value="increase">증가 큰 순</option><option value="decrease">감소 큰 순</option></select></label><label className="cfp-search"><span>국가 찾기</span><input type="search" aria-label="목적지 국가 찾기" placeholder="예: 일본, 중국, JP" value={query} onChange={e=>{setQuery(e.target.value);setExpanded(false);}}/>{query&&<button type="button" onClick={()=>setQuery('')}>지우기</button>}</label></div>
   <p className="cfp-list-basis" role="status">{rows.length===0?'일치하는 목적지가 없습니다':`${rows.length}개 목적지 중 ${visible.length}개 표시 · 막대와 숫자 단위: 편/일`}</p>
   <ul className="cfp-list" id="cfp-country-list">{visible.map(row=><li key={row.country} data-country={row.country}>
    <div className="cfp-country-heading"><h3><Flag country={row.country}/>{countryName(row.country,names)}</h3><div className="cfp-country-change"><b><FlightCountChange delta={row.delta} format={fmt} lang={lang}/><small>편/일</small></b><FlightChangeRate value={row.percent}/></div></div>
    <div className="cfp-bars" aria-label={`${countryName(row.country,names)}, ${monthLabel(previous!.month)} ${fmt(row.previous)}편/일, ${monthLabel(current!.month)} ${fmt(row.current)}편/일`}>
     {[{month:previous!.month,value:row.previous},{month:current!.month,value:row.current}].map((p,i)=><div className="cfp-bar-row" key={p.month} data-period={i?'current':'previous'}><span>{monthLabel(p.month)}</span><span className="cfp-track" aria-hidden="true"><i style={{width:`${(p.value??0)/maximum*100}%`}}/></span><strong>{fmt(p.value)}</strong></div>)}
    </div>
    {row.previous===0&&<p className="cfp-zero-note">전월 평균 0편 · 증감률은 계산하지 않습니다</p>}
    <details className="cfp-zone-detail"><summary>동편·중앙·서편 상세</summary><table><thead><tr><th>구역</th><th>{monthLabel(previous!.month)}</th><th>{monthLabel(current!.month)}</th><th>증감</th></tr></thead><tbody>{(['EAST','CENTER','WEST','UNVERIFIED'] as const).map(side=><tr key={side}><th>{sideLabels[side]}</th><td>{fmt(row.sides[side].previous)}</td><td>{fmt(row.sides[side].current)}</td><td><FlightCountChange delta={row.sides[side].previous!==null&&row.sides[side].current!==null?row.sides[side].current!-row.sides[side].previous!:null} format={fmt} lang={lang}/></td></tr>)}</tbody></table><p>각 구역 일평균 편수입니다. 위치 미확인도 합계에 포함합니다</p></details>
   </li>)}</ul>
   {!query&&rows.length>8&&<button className="cfp-expand" type="button" aria-controls="cfp-country-list" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'상위 8개만 보기':`목적지 ${rows.length}개 모두 보기`}</button>}
   <p className="cfp-use">담당 터미널 · 국가별 증가·감소 순위</p>
   <p className="cfp-limits">항공편 기준 · 여객·승객 국적·매출 추정 아님</p>
   <details className="cfp-method"><summary>포함 날짜·집계 기준 보기</summary><p>원래 공항현황의 국가별 항공편 계산식을 그대로 사용했습니다. 월 합계가 아닌 실제 포함 날짜당 평균을 비교합니다. 취소편과 공동운항 중복은 원 집계에서 제외됐습니다</p><p>T1 본관은 저장된 T1 합계에서 같은 날짜의 탑승동 편수를 제외한 값입니다. 탑승동은 별도 범위이며, 국가별 공식 여객 통계를 터미널로 나눈 값이 아닙니다</p><p>목적지 미정: {fmt(unknown.previous)} → {fmt(unknown.current)}편/일. 미정 항공편은 국가 목록에서 제외하고 전체 합계에는 포함합니다</p>{[previous!,current!].map(m=><div key={m.month}><p><b>{m.month}</b> · {m.includedDays.length}/{m.eligibleDays}일 포함 · 제외 {m.excludedDays.length}일</p><p>{m.includedDays.join(', ')}</p>{m.excludedDays.length>0&&<p>제외: {m.excludedDays.map(x=>x.day).join(', ')}</p>}</div>)}<p>저장 집계 기준: {reply?.data?.asOf} · 계산 시각: {reply?.calculatedAt??'—'}</p></details>
  </>}
 </section>;
}
