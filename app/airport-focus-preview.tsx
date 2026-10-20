'use client';
/** Approval-only composition. No production menu, collector or API behavior changes. */
import {useState} from 'react';
import {useBottomNavigationViewport} from './use-bottom-navigation-viewport';
import {useGlassNavigation} from './use-glass-navigation';
import {NavigationIcon} from './navigation-icon';
import './glass-navigation.css';
import {useSearchParams} from 'next/navigation';
import dynamic from 'next/dynamic';
import AirportGlancePreview,{type GlanceOverviewContext} from './airport-glance-preview';
import {AirportSceneArtwork} from './airport-scene-model';
import {AirportRouteCountryPassengers,RoutePassengerPlacement} from './airport-route-country-passengers';
import {useAirportPassengerStats} from './airport-passenger-stats-client';
import {ChangeRate} from './change-rate';
import type {Lang,Terminal} from './retailpulse-data';
import type {AirportSection} from './airport-view';
import type {IndustryId} from '../lib/industry-guidance';
import holidays from '../data/airport-focus-preview/holidays.json';
import {AirportFocusData,useAirportFocusData,type FocusTrend} from './airport-focus-data';
import calendar from '../data/airport-focus-preview/calendar-context.json';
import {compareHolidayPeriod,describeHolidayPeriod} from '../lib/holiday-period-comparison.mjs';
import {matchCalendarContext,previousMonth,type CalendarEvent} from '../lib/calendar-context.mjs';
import './airport-focus-preview.css';
const ArrivalAllowancesPreview=dynamic(()=>import('./arrival-allowances-preview'));
const AirportView=dynamic(()=>import('./airport-view').then(module=>module.AirportView));
const number=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
const flag=(code:string)=>['JP','CN','US','VN'].includes(code)?`/images/airport-flags/${code}.webp`:`/images/airport-flags/fallback/${code.toLowerCase()}.svg`;
type Tab='home'|'status'|'countries'|'prepare'|'more';
const tabs:Array<[Tab,string]>=[['home','한눈에'],['status','공항 현황'],['countries','국가별 흐름'],['prepare','미리 준비'],['more','더보기']];
function CountryFlag({code}:{code:string}){if(!'CN JP US VN AE AT AU BN CA CH CZ DE DK ES ET FI FR GB GE GU HK HU ID IN IT KG KH KZ LA LK MM MN MO MP MX MY NL NP NZ PH PL PT QA SG TH TM TR TW UZ'.split(' ').includes(code))return <span className="focus-country-code" aria-hidden="true">{code}</span>;return <img src={flag(code)} width="24" height="24" alt="" decoding="async"/>;}
export function HolidayList({full=false,onMore}:{full?:boolean;onMore?:()=>void}){
 const {asOf}=useAirportFocusData();
 const [country,setCountry]=useState('all');
 if(!asOf)return <p role="status">공식 기준 날짜를 확인하지 못해 휴일 목록을 표시하지 않았습니다.</p>;
 const selected=holidays.events.filter(event=>event.isRepresentative!==false&&event.end>=asOf&&Date.parse(event.start)-Date.parse(asOf)<(full?90:30)*86400000&&(country==='all'||event.countryLabel===country)).sort((a,b)=>a.start.localeCompare(b.start)).slice(0,full?undefined:3);
 return <section className="focus-calendar" id="focus-holidays"><div className="focus-section-heading"><div><h2>{full?'국가별 공식 휴일':'다가오는 국가별 휴일'}</h2><p>{full?'확인한 날짜와 적용 대상을 함께 봅니다.':'앞으로 30일, 먼저 확인할 일정'}</p></div>{onMore&&<button onClick={onMore}>90일 일정 보기 ↗</button>}</div>{full&&<label className="focus-country-filter">국가·지역 <select value={country} onChange={event=>setCountry(event.target.value)}><option value="all">전체</option>{[...new Set(holidays.events.map(event=>event.countryLabel))].sort((a,b)=>a.localeCompare(b,'ko')).map(label=><option key={label} value={label}>{label}</option>)}</select></label>}<ol>{selected.map(event=>{const days=Math.round((Date.parse(event.start)-Date.parse(asOf))/86400000);return <li key={event.id}><CountryFlag code={event.countryLabel==='괌'?'GU':event.countryLabel==='사이판'?'MP':event.country}/><div><strong>{event.countryLabel} <span>{event.name}</span></strong><p>{event.dateLabel_ko} · {event.scope}</p><p className="focus-holiday-meaning">{event.description_ko}</p>{!full&&event.cardSummary_ko&&<small>{event.cardSummary_ko}</small>}{full&&<details className="focus-holiday-conditions"><summary>{event.connectionStatus_ko}</summary><p>{event.connectionNote_ko}</p>{event.restConditions_ko.map(condition=><small key={condition}>{condition}</small>)}</details>}{full&&<small>{event.verificationMethod.toLowerCase().includes('rule')?'법정 고정일 기준':event.verificationMethod.toLowerCase().includes('index')?'공식 안내 대조':'공식 연간 일정 확인'}</small>}{full&&event.notes&&<small>{event.notes}</small>}<a href={event.sourceURL} target="_blank" rel="noreferrer">공식 날짜 확인 ↗</a></div><span className="focus-day-count">{days<0?'진행 중':days===0?'오늘':`D−${days}`}</span></li>;})}</ol><p className="focus-travel-note">입출국 집중 시점은 휴일만으로 확인할 수 없습니다.</p><small className="focus-source">일정 기준 {asOf} · 공식 자료 확인 {holidays.asOfKST} · 현지 달력 날짜 · 60개 국가·지역의 대표 공휴일 확인<br/>에티오피아 일정은 확인 중입니다. 국가별 모든 휴일을 확인한 목록은 아닙니다.</small></section>;
}
function MonthlyLineChart({row}:{row:FocusTrend}){
 const values=row.points.flatMap(point=>point.departures===null?[]:[point.departures]);
 if(!values.length)return <p>월별 자료 확인 중</p>;
 const low=Math.max(0,Math.floor(Math.min(...values)*0.9/10000)*10000),high=Math.max(low+10000,Math.ceil(Math.max(...values)*1.1/10000)*10000);
 const y=(value:number)=>130-(value-low)/(high-low)*104;
 const ticks=[low,(low+high)/2,high];
 return <figure className="focus-line-chart"><svg viewBox="0 0 320 166" role="img" aria-label={`${row.label} 4월부터 9월까지 월 출발 여객. 세로축 ${number.format(low)}명부터 ${number.format(high)}명.`}>
 {ticks.map(tick=><g key={tick}><line x1="48" x2="304" y1={y(tick)} y2={y(tick)} stroke="#e3e8ed" strokeWidth="1"/><text x="40" y={y(tick)+3} textAnchor="end" className="focus-chart-tick">{`${number.format(tick/10000)}만`}</text></g>)}
 {row.points.map((point,i)=>{const x=48+i*51.2,previous=row.points[i-1];return <g key={point.month}><text x={x} y="154" textAnchor="middle" className="focus-chart-tick">{`${Number(point.month.slice(5))}월`}</text>{point.departures!==null&&<>{previous?.departures!==null&&previous?.departures!==undefined&&<line x1={48+(i-1)*51.2} y1={y(previous.departures)} x2={x} y2={y(point.departures)} stroke="#28445f" strokeWidth="2" strokeLinecap="round"/>}<circle cx={x} cy={y(point.departures)} r="3.5" fill="white" stroke="#28445f" strokeWidth="2"><title>{`${point.month} ${number.format(point.departures)}명`}</title></circle></>}</g>;})}</svg><figcaption>세로축 {number.format(low)}–{number.format(high)}명 · 국가별 범위 다름</figcaption></figure>;
}
function TrendSummary({row}:{row:FocusTrend}){
 const last=row.points.at(-1),prev=row.points.at(-2);
 if(last?.departures===null||last?.departures===undefined||prev?.departures===null||prev?.departures===undefined||previousMonth(last.month)!==prev.month)return <p className="focus-trend-summary">최근 월 비교 자료가 일부 없어 연속 변화를 판단하지 않습니다.</p>;
 const difference=last.departures-prev.departures,direction=Math.sign(difference);let streak=0,priorStreak=0;
 for(let i=row.points.length-1;i>0;i--){const a=row.points[i],b=row.points[i-1];if(a.departures===null||b.departures===null||previousMonth(a.month)!==b.month||Math.sign(a.departures-b.departures)!==direction)break;streak++;}
 if(direction!==0&&streak===1)for(let i=row.points.length-2;i>0;i--){const a=row.points[i],b=row.points[i-1];if(a.departures===null||b.departures===null||previousMonth(a.month)!==b.month||Math.sign(a.departures-b.departures)!==-direction)break;priorStreak++;}
 const rate=prev.departures>0?Math.abs(difference/prev.departures*100):null;
 const verb=direction>0?'증가':'감소';
 return <div className="focus-trend-context" data-country={row.code}><p className="focus-trend-summary">{priorStreak>1?<><b>{Number(row.points[row.points.length-1-priorStreak].month.slice(5))}–{Number(prev.month.slice(5))}월 {priorStreak}개월 연속 {direction>0?'감소':'증가'}</b>한 뒤, </>:streak>1&&direction!==0?<><b>{streak}개월 연속 {verb}</b>했습니다. </>:null}{Number(last.month.slice(5))}월은 전월보다 {direction===0?<b>여객 수가 같습니다.</b>:<><b>{number.format(Math.abs(difference))}명{rate!==null?<>(<ChangeRate value={direction*rate} lang="ko"/>)</>:null}</b> {direction>0?'늘었습니다':'줄었습니다'}.</>}</p><CalendarContext row={row}/></div>;
}
function CalendarContext({row}:{row:FocusTrend}){
 const {asOf}=useAirportFocusData();
 const last=row.points.at(-1);if(!last||last.departures===null)return null;
 const matched=matchCalendarContext(calendar.events.map(event=>({...event,region:event.region??undefined})) as CalendarEvent[],{country:row.code,selectedMonth:last.month,actualDataMonths:row.points.filter(point=>point.departures!==null).map(point=>point.month),asOf:asOf,includePreviousMonth:true});
 if(!matched.details.length)return <RecentCalendarContext country={row.code}/>;
 const current=matched.details.find(item=>item.relation==='selected'),school=matched.details.find(item=>item.relation==='previous'&&item.kind==='school_break');
 const summary=[...new Map([current,school,...matched.summary].filter(item=>item!==undefined).map(item=>[item.eventId,item])).values()].slice(0,2);
 const text=(item:typeof matched.details[number])=>`${Number(item.month.slice(5))}월${item.relation==='previous'?'(직전 월)':''}: ${item.scope==='national'?'':`${item.region} · `}${calendar.events.find(event=>event.id===item.eventId)?.name} ${item.start.slice(5).replace('-','/')}~${item.end.slice(5).replace('-','/')}`;
 return <div className="focus-calendar-context">{summary.map(item=><p className="focus-source" key={item.eventId}>{text(item)}</p>)}<p className="focus-source">같은 시기의 일정입니다. 여객 증감의 원인으로 확인된 것은 아닙니다.</p><details className="focus-source"><summary>관련 일정과 공식 근거</summary>{matched.details.map(item=><p key={`${item.eventId}-${item.month}`}>{text(item)} · <a href={item.sourceURL} target="_blank" rel="noreferrer">공식 원문 ↗</a><br/>확인일 {item.verifiedAt}</p>)}</details><RecentCalendarContext country={row.code}/></div>;
}
function RecentCalendarContext({country}:{country:string}){
 const {asOf}=useAirportFocusData();
 const event=calendar.events.filter(item=>item.country===country&&item.kind==='public_holiday'&&item.status==='verified'&&item.start.slice(0,7)===asOf.slice(0,7)&&item.verifiedAt<=asOf).sort((a,b)=>b.end.localeCompare(a.end))[0];
 if(!event||country==='KR'||country==='OTHER')return null;
 const phase=describeHolidayPeriod(event,asOf);
 const comparison=Number(asOf.slice(8))===1?null:compareHolidayPeriod([],{country,metric:'departure_flights',scope:'ALL',month:asOf.slice(0,7),start:`${asOf.slice(0,7)}-01`,end:new Date(Date.parse(`${asOf}T00:00:00Z`)-86400000).toISOString().slice(0,10),asOf:asOf,holiday:event});
 return <details className="focus-source focus-recent-calendar"><summary>최근 일정 · {asOf} 기준</summary><p>{event.name} · {event.scope==='national'?'전국 공휴일':event.region}<br/>{phase.text}</p>{phase.phase==='ended'&&comparison?.status==='unavailable'&&<p>해당 휴일과 같은 달의 다른 완료일 출발편 비교는 일별 자료 확인 후 표시합니다.</p>}<a href={event.sourceURL} target="_blank" rel="noreferrer">공식 일정 ↗</a><p>휴일 종료일은 인천공항 출국 집중일을 뜻하지 않습니다.</p></details>;
}
export function StaffCalendarContext({onMore}:{onMore:()=>void}){
 const {asOf}=useAirportFocusData();if(!asOf)return null;
 const day=new Date(`${asOf}T00:00:00Z`),weekday=(day.getUTCDay()+6)%7;
 const start=new Date(day.getTime()-weekday*86400000).toISOString().slice(0,10),end=new Date(day.getTime()+(6-weekday)*86400000).toISOString().slice(0,10);
 const events=holidays.events.filter(event=>event.isRepresentative!==false&&event.start<=end&&event.end>=start).slice(0,2);
 if(!events.length)return null;
 return <section className="focus-staff-calendar"><h3>이번 주 공식 일정</h3><small>{start}–{end} · {holidays.asOfKST} 확인본</small>{events.map(event=><p key={event.id}><b>{event.countryLabel}: {event.name}</b> {event.dateLabel_ko}<br/><small>{event.scope} · {describeHolidayPeriod(event,asOf).text}</small></p>)}<button onClick={onMore}>국가별 일정과 적용 대상 보기 ↗</button><small>일정만으로 고객 국적·매출·출국 집중 시점을 판단하지 않습니다.</small></section>;
}
function OriginCalendarContext(){
 const {trends,asOf}=useAirportFocusData();
 const month=trends[0]?.points.at(-1)?.month;if(!month)return null;
 const events=matchCalendarContext(calendar.events.map(event=>({...event,region:event.region??undefined})) as CalendarEvent[],{country:'KR',selectedMonth:month,actualDataMonths:[month],asOf:asOf,includeOriginContext:true}).details;
 if(!events.length)return null;
 return <details className="focus-source"><summary>한국 출발지 일정 · {month}</summary>{events.map(item=><p key={item.eventId}>{calendar.events.find(event=>event.id===item.eventId)?.name} {item.start} · <a href={item.sourceURL} target="_blank" rel="noreferrer">공식 원문 ↗</a></p>)}<p>출발지 달력 참고이며 한국인 여객 수나 증감 원인을 뜻하지 않습니다.</p></details>;
}
export function CountryTrends({full=false,onMore}:{full?:boolean;onMore?:()=>void}){
 const {trends,checkedAt,failed}=useAirportFocusData();
 const rows=full?trends:trends.slice(0,3);const start=rows[0]?.points[0]?.month,end=rows[0]?.points.at(-1)?.month;
 return <section className="focus-trends" id="focus-country-trends"><div className="focus-section-heading"><div><h2>{full?'노선 국가별 월 여객':'한 달의 변화일까, 이어지는 흐름일까'}</h2><p>최근 6개월 출발 여객 · {start&&end?`${start}–${end}`:failed?'불러오기 실패':'자료 확인 중'}</p></div>{onMore&&<button onClick={onMore}>국가별 흐름 보기 ↗</button>}</div><div className="focus-trend-grid">{rows.map(row=>{const last=row.points.at(-1),prev=row.points.at(-2);const rate=last?.departures!==null&&last?.departures!==undefined&&prev?.departures? (last.departures/prev.departures-1)*100:null;return <article key={row.code}><div className="focus-trend-top"><CountryFlag code={row.code}/><h3>{row.label}</h3><span>{last?`${Number(last.month.slice(5))}월`:''}</span></div><strong className="focus-trend-value">{last?.departures===null||last?.departures===undefined?'자료 없음':number.format(last.departures)}<small>명</small></strong><p>전월 대비 <ChangeRate value={rate} lang="ko"/></p><MonthlyLineChart row={row}/><TrendSummary row={row}/>{full&&<table className="focus-month-values"><caption className="sr-only">{row.label} 월별 출발 여객과 전월비</caption><thead><tr><th>월</th><th>출발 여객</th><th>전월비</th></tr></thead><tbody>{row.points.map((point,index)=>{const previous=row.points[index-1];const change=point.departures!==null&&previous?.departures!==null&&previous?.departures!==undefined&&previous.departures>0&&previousMonth(point.month)===previous.month?(point.departures/previous.departures-1)*100:null;return <tr key={point.month}><th scope="row">{point.month}</th><td>{point.departures===null?'자료 없음':`${number.format(point.departures)}명`}</td><td>{change===null?<small>비교자료 없음</small>:<ChangeRate value={change} lang="ko"/>}</td></tr>;})}</tbody></table>}</article>;})}</div><OriginCalendarContext/><small className="focus-source">인천국제공항공사 공식 월 실적 · {checkedAt?`${checkedAt.slice(0,10)} 수집본`:'자료 확인 중'}<br/>국가별 독립 축 · 노선 국가 기준이며 승객 국적이 아닙니다. 과거 실적은 향후 증가를 보장하지 않습니다.</small></section>;
}
export function CountryBriefing({month}:{month:string}){
 const {reply}=useAirportPassengerStats(month);
 const current=reply?.current.ROUTE_COUNTRY_PASSENGERS,previous=reply?.previous.ROUTE_COUNTRY_PASSENGERS;
 const prior=new Map((previous?.rows??[]).filter(row=>!row.aggregate).map(row=>[row.label,row.departures]));
 const rows=(current?.rows??[]).filter(row=>!row.aggregate&&row.departures!==null&&prior.get(row.label)!==null&&prior.get(row.label)!==undefined).sort((a,b)=>b.departures!-a.departures!).slice(0,3);
 return <section className="focus-country-brief" aria-label="국가별 핵심 브리핑"><h2>최근 공개 월, 먼저 볼 변화</h2><small>{reply?.previousMonth??'전월 확인 중'} → {reply?.month??'최근 월 확인 중'} · 노선 국가별 공식 출발 여객</small>{rows.length?<ul>{rows.map(row=>{const before=prior.get(row.label)!,difference=row.departures!-before,rate=before>0?difference/before*100:null;return <li key={row.label}><b>{row.label} {number.format(row.departures!)}명</b>. 전월보다 {difference===0?'여객 수가 같습니다.':<><b>{number.format(Math.abs(difference))}명</b>{rate!==null?<>(<ChangeRate value={rate} lang="ko"/>)</>:null} {difference>0?'늘었습니다':'줄었습니다'}.</>}</li>;})}</ul>:<p>같은 기준의 월별 비교 자료를 확인하고 있습니다.</p>}</section>;
}
function PreparationBrief({onMore,onCountries}:{onMore:()=>void;onCountries:()=>void}){
 const {asOf}=useAirportFocusData();
 const {reply}=useAirportPassengerStats(asOf?asOf.slice(0,7):null);
 if(!asOf)return <p role="status">공식 기준 날짜를 확인하고 있습니다.</p>;
 const anchor=new Date(`${asOf}T00:00:00Z`),weekday=(anchor.getUTCDay()+6)%7;
 const weekStart=new Date(anchor);weekStart.setUTCDate(anchor.getUTCDate()+7-weekday);
 const weekEnd=new Date(weekStart);weekEnd.setUTCDate(weekStart.getUTCDate()+6);
 const monthStart=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+1,1));
 const monthEnd=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+2,0));
 const iso=(date:Date)=>date.toISOString().slice(0,10),short=(date:Date)=>`${date.getUTCMonth()+1}/${date.getUTCDate()}`;
 const counts=new Map((reply?.current.ROUTE_COUNTRY_PASSENGERS?.rows??[]).filter(row=>!row.aggregate&&row.departures!==null).map(row=>[row.label,row.departures!]));
 const pick=(start:Date,end:Date)=>{
  const candidates=holidays.events.filter(event=>event.isRepresentative!==false&&event.type==='public_holiday'&&!event.conditional&&event.start<=iso(end)&&event.end>=iso(start)&&counts.has(event.countryLabel));
  candidates.sort((a,b)=>(counts.get(b.countryLabel)!-counts.get(a.countryLabel)!)||a.start.localeCompare(b.start));
  const used=new Set<string>();return candidates.filter(event=>{if(used.has(event.countryLabel))return false;used.add(event.countryLabel);return true;}).slice(0,2);
 };
 const weeks=pick(weekStart,weekEnd),months=pick(monthStart,monthEnd);
 const lead=months[0],current=lead?counts.get(lead.countryLabel):undefined;
 const before=lead?reply?.previous.ROUTE_COUNTRY_PASSENGERS?.rows.find(row=>!row.aggregate&&row.label===lead.countryLabel)?.departures:null;
 const difference=current!==undefined&&before!==undefined&&before!==null?current-before:null;
 const trend=lead&&current!==undefined?`${reply?.month} ${lead.countryLabel} 노선 출발 여객 ${number.format(current)}명${difference!==null?difference===0?', 전월과 같습니다.':`, 전월보다 ${number.format(Math.abs(difference))}명 ${difference>0?'늘었습니다':'줄었습니다'}.`:'.'}`:'비교할 월별 실적을 확인하고 있습니다.';
 const describe=(events:typeof weeks)=>events.length?events.map(event=><span className="focus-event-row" key={event.id}><b>{event.countryLabel}:</b> {event.name} {event.dateLabel_ko}</span>):'확인된 대표 일정을 대조하고 있습니다.';
 return <section className="focus-preparation-brief" aria-label="다음 주와 다음 달 준비"><div><h3>다음 주 <small>{short(weekStart)}–{short(weekEnd)}</small></h3><p>{describe(weeks)}</p><small>행사·입고 일정과 겹치는 날짜를 대조하세요.</small></div><div><h3>다음 달 <small>{short(monthStart)}–{short(monthEnd)}</small></h3><p>{describe(months)}</p><small>{lead&&difference!==null&&before?<>{Number(reply?.month?.slice(5))}월 {lead.countryLabel} 노선 출발 여객, 전월비 <ChangeRate value={difference/before*100} lang="ko"/>.</>:trend} <button className="focus-planning-link" onClick={onCountries}>월간계획 검토 ↗</button></small></div><details className="focus-planning-basis"><summary>일정 기준 · 자세히 보기</summary><small className="focus-source">준비 기준 {asOf} KST · 휴일은 현지 날짜 · {reply?.month??'최근 공개 월'} 노선 출발 여객 규모순 대표 일정 · 미래 여객 예측 아님</small><button className="focus-planning-link" onClick={onMore}>전체 일정 보기 ↗</button></details></section>;
}
function SelectedCountryChanges({context}:{context:GlanceOverviewContext}){
 const rows=context.selectedCountryChanges??[];
 if(!rows.length)return null;
 return <div className="focus-selected-country-changes"><h3>오늘 주목할 변화</h3>{rows.map(row=><p key={row.country}>{row.label}행 <b>{row.count}편</b>, {Number(row.month.slice(5))}월 일평균보다 약 {Math.round(Math.abs(row.delta))}편 {row.delta>0?'많음':'적음'} (<ChangeRate value={row.percent} lang="ko"/>).</p>)}<small>{context.day} · {context.scope==='all'?'공항 전체':context.scope} · {rows[0].month} 포함 {rows[0].days}일 일평균 대비</small></div>;
}
export function OverviewHeadline({context,onCountries,onPrepare}:{context:GlanceOverviewContext;onCountries:()=>void;onPrepare:()=>void}){
 return <section className="focus-report" aria-label="선택일 핵심 변화"><div className="focus-report-title"><h2>출근 후 30초 확인</h2></div><h3 className="focus-today-title">오늘 확인 <small>{context.day||'자료 확인 중'} 기준</small></h3><div className="focus-report-lines"><p className="focus-passenger-parts">예상 출국객 {context.passengers===null?'확인 중':`${number.format(context.passengers)}명`} + 예상 환승객 {context.transferPassengers===null?'확인 중':`${number.format(context.transferPassengers)}명`}</p><p><b className="focus-passenger-total">= 단순합계 {context.referenceSum===null?'확인 중':`${number.format(context.referenceSum)}명`}</b></p><p className="focus-passenger-comparison">(전월 일평균 대비: 비교자료 확인 필요)</p><p>출발 예정편 <b>{context.flights===null?'확인 중':`${number.format(context.flights)}편`}</b>{context.flightBaseline&&<> · {context.flightBaseline.previous?'전월':'확보 기간'} 일평균보다 <b>{number.format(Math.abs(context.flightBaseline.delta))}편 {context.flightBaseline.delta===0?'차이 없음':context.flightBaseline.delta>0?'많음':'적음'}</b> (<ChangeRate value={context.flightBaseline.percent} lang="ko"/>).</>}</p></div><SelectedCountryChanges context={context}/><PreparationBrief onMore={onPrepare} onCountries={onCountries}/><details className="focus-report-basis"><summary>숫자 비교 기준</summary><small>예상 출국객 {context.passengers===null?'확인 중':number.format(context.passengers)}명 + 예상 환승객 {context.transferPassengers===null?'확인 중':number.format(context.transferPassengers)}명. 환승은 도착 기준 예보이며, 중복을 제거한 공식 총출국객 수가 아닙니다. 합산 비교자료 부족 · 현재 검수자료 기준.</small><small>{context.flightBaseline?`항공편: ${context.flightBaseline.start}–${context.flightBaseline.end} · ${context.flightBaseline.days}일 일평균 ${number.format(context.flightBaseline.mean)}편 대비`:'비교 가능한 일평균 자료 확인 중'} · 항공편 수는 승객 수가 아닙니다.</small></details></section>;
}
export default function AirportFocusPreview({lang='ko',previewMetrics}:{lang?:Lang;previewMetrics:{trends:FocusTrend[];checkedAt:string}}){
 const searchParams=useSearchParams();
 const requestedView=searchParams.get('view');
 const [prepareTarget,setPrepareTarget]=useState(searchParams.get('section')??'');
 const initialTab:Tab=tabs.some(([id])=>id===requestedView)?requestedView as Tab:'home';
 const [tab,setTab]=useState<Tab>(initialTab),[date,setDate]=useState<string|null>('2026-10-19');
 const [terminal,setTerminal]=useState<Terminal>('all'),[concourse,setConcourse]=useState(false),[section,setSection]=useState<AirportSection>('now'),[industry,setIndustry]=useState<IndustryId>('beauty');
 const bottomNavigationRef=useBottomNavigationViewport();
 useGlassNavigation(bottomNavigationRef,tab);
 const navIcons:Record<Tab,string>={home:'airport-glance',status:'airport',countries:'where-to',prepare:'today',more:'more'};
 const select=(next:Tab,target='')=>{setPrepareTarget(target);setTab(next);window.scrollTo({top:0,behavior:'instant'});};
 return <AirportFocusData.Provider value={{asOf:holidays.asOfKST,trends:previewMetrics.trends,checkedAt:previewMetrics.checkedAt,preview:true,failed:false}}><div className="airport-focus-shell"><a href="#focus-main" className="sr-only">본문으로 이동</a><header className="focus-header"><a href={`/${lang}`} className="focus-brand">KORETAIL</a><span>공항의 오늘과 다음</span><small>승인 전 시안</small></header><nav className="focus-navigation" aria-label="공항 주요 메뉴">{tabs.map(([id,label])=><button key={id} onClick={()=>select(id)} aria-current={tab===id?'page':undefined}>{label}</button>)}</nav><div className="app focus-mobile-navigation"><nav ref={bottomNavigationRef} className="bottom-nav glass-nav" aria-label="공항 주요 메뉴" style={{gridTemplateColumns:'repeat(5,minmax(0,1fr))'}}><span className="glass-nav-indicator" aria-hidden="true"/>{tabs.map(([id,label])=><a key={id} href={`/${lang}/airport-focus-preview?view=${id}`} className={tab===id?'active':''} aria-current={tab===id?'page':undefined} aria-label={label} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();select(id);}}><NavigationIcon name={navIcons[id]}/><span>{label}</span></a>)}</nav></div><main id="focus-main"><p className="focus-preview-note">승인 전 시안 · 10월 19일 실제 공항 자료 재현. 10월 20일 자료는 검수 환경에서 불러오지 못했습니다. 월별 흐름·휴일은 10월 20일 확인본입니다.</p>{tab==='home'&&<AirportGlancePreview lang={lang} published hideRepeatedFlightSummary hideRepeatedPassengerSummary selectedDate={date} onDateChange={setDate} artworkSrc="/images/airport-glance/approval-v2-1448.webp" artworkSrcSet={[480,960,1100,1200,1448].map(width=>`/images/airport-glance/approval-v2-${width}.webp ${width}w`).join(', ')} artworkNote="구조 이해를 위한 모형 · 항공기 위치는 실제 운항 현황이 아닙니다" overviewHeading={context=><OverviewHeadline context={context} onCountries={()=>select('countries')} onPrepare={()=>select('prepare')}/>} overviewExtras={<div className="focus-forward"><HolidayList onMore={()=>select('prepare')}/><CountryTrends onMore={()=>select('countries')}/><section className="focus-staff-links"><h2>근무 중 확인</h2><p>터미널·시간대 정보와 고객 안내에 필요한 공식 소식을 확인하세요.</p><button onClick={()=>select('status')}>터미널·시간대 확인 ↗</button><a href={`/${lang}/airport-news`}>관세·면세 공식 소식 ↗</a><button onClick={()=>select('prepare','arrival')}>도착국 반입 면세한도 ↗</button></section></div>}/>}{tab==='status'&&<AirportSceneArtwork.Provider value="/airport-models/approval-v3"><RoutePassengerPlacement.Provider value={<button className="focus-country-jump" onClick={()=>select('countries')}>국가별 월 여객 비교는 국가별 흐름에서 보기 ↗</button>}><AirportView lang={lang} terminal={terminal} setTerminal={setTerminal} concourse={concourse} setConcourse={setConcourse} section={section} setSection={setSection} date={date} setDate={setDate} industry={industry} setIndustry={setIndustry} industryContext={<StaffCalendarContext onMore={()=>select('prepare')}/>}/></RoutePassengerPlacement.Provider></AirportSceneArtwork.Provider>} {tab==='countries'&&<div className="focus-detail"><h1>국가별 흐름</h1><p className="focus-lead">어느 노선의 흐름이 달라졌는지, 월별 실적으로 확인합니다.</p><CountryBriefing month={(date??'2026-10-19').slice(0,7)}/><AirportRouteCountryPassengers lang={lang} month={(date??'2026-10-19').slice(0,7)} terminal="all"/><CountryTrends full/></div>}{tab==='prepare'&&<div className="focus-detail"><h1>미리 준비</h1><p className="focus-lead">다가오는 휴일과 공식 안내를 미리 확인하세요.</p><button className="focus-related" onClick={()=>{setPrepareTarget('arrival');document.getElementById('arrival-allowances')?.scrollIntoView({block:'start',behavior:'instant'});}}>도착국 반입 면세한도 보기 ↗</button><HolidayList full/><ArrivalAllowancesPreview scrollOnMount={prepareTarget==='arrival'}/><a className="focus-related" href={`/${lang}/airport-news`}>관세·면세 공식 소식 확인 ↗</a></div>}{tab==='more'&&<div className="focus-detail"><h1>더보기</h1><p className="focus-lead">서울 자료와 기존 기능은 그대로 유지합니다.</p><div className="focus-more-links"><a href={`/${lang}/where-to`}>서울 한눈에 ↗</a><a href={`/${lang}/myeongdong`}>서울 4개 상권 ↗</a><a href={`/${lang}/consumption`}>소비 흐름 ↗</a><a href={`/${lang}/more`}>출처·자료 한계 및 설정 ↗</a></div></div>}</main><footer className="focus-footer">KORETAIL · 공식 자료를 읽기 쉽게, 판단은 근거와 함께.</footer></div></AirportFocusData.Provider>;
}
