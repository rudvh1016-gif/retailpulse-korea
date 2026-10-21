'use client';
/** Approval-only composition. No production menu, collector or API behavior changes. */
import {useState,useEffect,useRef} from 'react';
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
import {PassengerBriefComparison} from './airport-brief-comparison';
import {PreparationEvent} from './airport-preparation-event';
import type {Lang,Terminal} from './retailpulse-data';
import type {AirportSection} from './airport-view';
import type {IndustryId} from '../lib/industry-guidance';
import holidays from '../data/airport-focus-preview/holidays-summary.json';
import {AirportFocusData,useAirportFocusData,type FocusTrend} from './airport-focus-data';
import {flightHolidayContext,planningHolidays,returnPlanningText,mergeBriefHolidays} from '../lib/holiday-flight-brief';
import {describeHolidayPeriod} from '../lib/holiday-period-comparison.mjs';
import './airport-focus-preview.css';
const ArrivalAllowancesPreview=dynamic(()=>import('./arrival-allowances-preview'));
const AirportView=dynamic(()=>import('./airport-view').then(module=>module.AirportView));
const number=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});

type Tab='home'|'status'|'countries'|'prepare'|'more';
const tabs:Array<[Tab,string]>=[['home','한눈에'],['status','공항 현황'],['countries','국가별 흐름'],['prepare','미리 준비'],['more','더보기']];

function useBriefHolidays(){
 const {calendarEvents,calendarReplacementScopes}=useAirportFocusData();
 return mergeBriefHolidays(holidays.events,calendarEvents,calendarReplacementScopes);
}
function CalendarPlaceholder(){return <section id="focus-holidays" className="focus-calendar" aria-busy="true"><div className="focus-section-heading"><div><h2>다가오는 국가별 휴일</h2><p>공식 일정 자료를 준비하고 있습니다.</p></div></div></section>;}
const DetailedHolidayList=dynamic(()=>import('./airport-focus-holidays'),{ssr:false,loading:CalendarPlaceholder});
export function HolidayList(props:{full?:boolean;onMore?:()=>void}){
 const [ready,setReady]=useState(Boolean(props.full)),host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(props.full||ready||!host.current)return;
  if(!('IntersectionObserver' in window)){const frame=requestAnimationFrame(()=>setReady(true));return()=>cancelAnimationFrame(frame);}
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setReady(true);observer.disconnect();}},{rootMargin:'240px'});
  observer.observe(host.current);return()=>observer.disconnect();
 },[props.full,ready]);
 return <div ref={host} className="focus-calendar-deferred">{props.full||ready?<DetailedHolidayList {...props}/>:<CalendarPlaceholder/>}</div>;
}
export function StaffCalendarContext({onMore}:{onMore:()=>void}){
 const events=useBriefHolidays();
 const {asOf}=useAirportFocusData();if(!asOf)return null;
 const day=new Date(`${asOf}T00:00:00Z`),weekday=(day.getUTCDay()+6)%7;
 const start=new Date(day.getTime()-weekday*86400000).toISOString().slice(0,10),end=new Date(day.getTime()+(6-weekday)*86400000).toISOString().slice(0,10);
 const currentEvents=planningHolidays(events,start,end,asOf,new Map());
 if(!currentEvents.length)return null;
 return <section className="focus-staff-calendar"><h3>이번 주 공식 일정</h3><small>{start}–{end} · 국가별 공식 일정</small>{currentEvents.map(event=><p key={event.id}><b>{event.countryLabel}: {event.name}</b> {event.start}–{event.end}<br/><small>{event.scope} · {describeHolidayPeriod(event,asOf).text} · 확인 {event.verifiedAt}</small></p>)}<button onClick={onMore}>국가별 일정과 적용 대상 보기 ↗</button><small>일정만으로 고객 국적·매출·출국 집중 시점을 판단하지 않습니다.</small></section>;
}
function TrendsPlaceholder(){return <section className="focus-trends" id="focus-country-trends" aria-busy="true"><div className="focus-section-heading"><div><h2>한 달의 변화일까, 이어지는 흐름일까</h2><p>월별 공식 여객 자료를 준비하고 있습니다.</p></div></div></section>;}
const DetailedCountryTrends=dynamic(()=>import('./airport-focus-trends'),{ssr:false,loading:TrendsPlaceholder});
export function CountryTrends(props:{full?:boolean;onMore?:()=>void}){
 const [ready,setReady]=useState(Boolean(props.full)),host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(props.full||ready||!host.current)return;
  if(!('IntersectionObserver' in window)){const frame=requestAnimationFrame(()=>setReady(true));return()=>cancelAnimationFrame(frame);}
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setReady(true);observer.disconnect();}},{rootMargin:'240px'});
  observer.observe(host.current);return()=>observer.disconnect();
 },[props.full,ready]);
 return <div ref={host}>{props.full||ready?<DetailedCountryTrends {...props}/>:<TrendsPlaceholder/>}</div>;
}
export function CountryBriefing({month}:{month:string}){
 const {reply}=useAirportPassengerStats(month);
 const current=reply?.current.ROUTE_COUNTRY_PASSENGERS,previous=reply?.previous.ROUTE_COUNTRY_PASSENGERS;
 const prior=new Map((previous?.rows??[]).filter(row=>!row.aggregate).map(row=>[row.label,row.departures]));
 const rows=(current?.rows??[]).filter(row=>!row.aggregate&&row.departures!==null&&prior.get(row.label)!==null&&prior.get(row.label)!==undefined).sort((a,b)=>b.departures!-a.departures!).slice(0,3);
 return <section className="focus-country-brief" aria-label="국가별 핵심 브리핑"><h2>최근 공개 월, 먼저 볼 변화</h2>{reply?.month&&/^\d{4}-(0[1-9]|1[0-2])$/.test(reply.month)&&<p className="focus-country-reference-month"><strong>{reply.month.slice(0,4)}년 {Number(reply.month.slice(5))}월 기준</strong></p>}<small>{reply?.previousMonth??'전월 확인 중'} → {reply?.month??'최근 월 확인 중'} · 노선 국가별 공식 출발 여객</small>{rows.length?<ul>{rows.map(row=>{const before=prior.get(row.label)!,difference=row.departures!-before,rate=before>0?difference/before*100:null;return <li key={row.label}><b>{row.label} {number.format(row.departures!)}명</b>. 전월보다 {difference===0?'여객 수가 같습니다.':<><b>{number.format(Math.abs(difference))}명</b>{rate!==null?<>(<ChangeRate value={rate} lang="ko"/>)</>:null} {difference>0?'늘었습니다':'줄었습니다'}.</>}</li>;})}</ul>:<p>같은 기준의 월별 비교 자료를 확인하고 있습니다.</p>}</section>;
}
function PreparationBrief({onMore,onCountries}:{onMore:()=>void;onCountries:()=>void}){
 const events=useBriefHolidays();
 const {asOf}=useAirportFocusData();
 const {reply}=useAirportPassengerStats(asOf?asOf.slice(0,7):null);
 if(!asOf)return <section className="focus-preparation-brief" aria-label="다음 주와 다음 달 준비" aria-busy="true">{['다음 주','다음 달'].map((label,index)=><div key={label}><h3>{label} <small>기준일 확인 중</small></h3><p><span className="focus-event-row">공식 일정 확인 중</span><span className="focus-event-row" aria-hidden="true">&nbsp;</span></p><small>{index===0?'행사·입고 일정과 겹치는 날짜를 대조하세요.':'비교할 월별 실적을 확인하고 있습니다.'}</small></div>)}<details className="focus-planning-basis"><summary>일정 기준 · 자세히 보기</summary><small>공식 기준 날짜 확인 중</small></details></section>;
 const anchor=new Date(`${asOf}T00:00:00Z`),weekday=(anchor.getUTCDay()+6)%7;
 const weekStart=new Date(anchor);weekStart.setUTCDate(anchor.getUTCDate()+7-weekday);
 const weekEnd=new Date(weekStart);weekEnd.setUTCDate(weekStart.getUTCDate()+6);
 const monthStart=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+1,1));
 const monthEnd=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+2,0));
 const iso=(date:Date)=>date.toISOString().slice(0,10),short=(date:Date)=>`${date.getUTCMonth()+1}/${date.getUTCDate()}`;
 const counts=new Map((reply?.current.ROUTE_COUNTRY_PASSENGERS?.rows??[]).filter(row=>!row.aggregate&&row.departures!==null).map(row=>[row.label,row.departures!]));
 const pick=(start:Date,end:Date)=>planningHolidays(events,iso(start),iso(end),asOf,counts);
 const weeks=pick(weekStart,weekEnd),months=pick(monthStart,monthEnd);
 const lead=months[0],current=lead?counts.get(lead.countryLabel):undefined;
 const before=lead?reply?.previous.ROUTE_COUNTRY_PASSENGERS?.rows.find(row=>!row.aggregate&&row.label===lead.countryLabel)?.departures:null;
 const difference=current!==undefined&&before!==undefined&&before!==null?current-before:null;
 const trend=lead&&current!==undefined?`${reply?.month} ${lead.countryLabel} 노선 출발 여객 ${number.format(current)}명${difference!==null?difference===0?', 전월과 같습니다.':`, 전월보다 ${number.format(Math.abs(difference))}명 ${difference>0?'늘었습니다':'줄었습니다'}.`:'.'}`:'비교할 월별 실적을 확인하고 있습니다.';
 const monthlyTrend=<>{lead&&difference!==null&&before?<>{Number(reply?.month?.slice(5))}월 {lead.countryLabel} 노선 출발 여객, 전월비 <ChangeRate value={difference/before*100} lang="ko"/>.</>:trend} <button className="focus-planning-link" onClick={onCountries}>월간계획 검토 ↗</button></>;
 const describe=(events:typeof weeks,monthly=false)=>events.length?events.map(event=><PreparationEvent key={event.id} event={event}>{monthly&&event.id===lead?.id&&<small className="focus-country-month-trend">{monthlyTrend}</small>}</PreparationEvent>):<><span className="focus-event-row">확인된 대표 일정을 대조하고 있습니다.</span><span className="focus-event-row" aria-hidden="true">&nbsp;</span></>;
 return <section className="focus-preparation-brief" aria-label="다음 주와 다음 달 준비"><div><h3>다음 주 <small>{short(weekStart)}–{short(weekEnd)}</small></h3><p>{describe(weeks)}</p><small>귀국객 집중일 예측이 아닌, 공식 휴일 종료일 기준 준비입니다.</small></div><div><h3>다음 달 <small>{short(monthStart)}–{short(monthEnd)}</small></h3><p>{describe(months,true)}</p>{!lead&&<small>{monthlyTrend}</small>}</div><details className="focus-planning-basis"><summary>일정 기준 · 자세히 보기</summary><small className="focus-source">준비 기준 {asOf} KST · 휴일은 현지 날짜 · {reply?.month??'최근 공개 월'} 노선 출발 여객 규모순 대표 일정 · 귀국은 인천에서 해당 국가로 출발하는 흐름 · 휴일만으로 집중일·여객 국적을 확정하지 않음</small><button className="focus-planning-link" onClick={onMore}>전체 일정 보기 ↗</button></details></section>;
}
function SelectedCountryChanges({context}:{context:GlanceOverviewContext}){
 const events=useBriefHolidays();
 const {asOf}=useAirportFocusData();
 const title=context.day&&asOf&&context.day!==asOf?'선택일 주목할 변화':'오늘 주목할 변화';
 const rows=context.selectedCountryChanges??[];
 if(!rows.length)return <div className="focus-selected-country-changes" aria-busy={context.flights===null}><h3>{title}</h3><p>{context.flights===null?'노선별 비교 자료 확인 중':'표시할 비교 항목이 없습니다.'}</p><p aria-hidden="true">&nbsp;</p><small>{context.day||'기준일 확인 중'} · 선택한 공항 범위 기준</small></div>;
 return <div className="focus-selected-country-changes"><h3>{title}</h3>{rows.map(row=>{const related=flightHolidayContext(events,row,context.day,asOf);return <p key={row.country}>{row.label}행 <b>{row.count}편</b>, {Number(row.month.slice(5))}월 일평균보다 약 {Math.round(Math.abs(row.delta))}편 {row.delta>0?'많음':'적음'} (<ChangeRate value={row.percent} lang="ko"/>).{related&&<small className="focus-event-row">{related.text} {related.event.scope}. {returnPlanningText(related.event)}. <a href={related.event.sourceURL} target="_blank" rel="noreferrer">공식 일정 ↗</a><br/>{related.caution}</small>}</p>;})}<small>{context.day} · {context.scope==='all'?'공항 전체':context.scope} · {rows[0].month} 포함 {rows[0].days}일 일평균 대비</small></div>;
}
function TodayReturnContext({context}:{context:GlanceOverviewContext}){
 const events=useBriefHolidays();
 const {asOf}=useAirportFocusData();
 if(!asOf||!context.day)return null;
 const counts=new Map((context.selectedCountryChanges??[]).map(row=>[row.label,row.count]));
 const ending=planningHolidays(events,context.day,context.day,asOf,counts);
 if(!ending.length)return null;
 return <div className="focus-selected-country-changes" aria-label="오늘 귀국 준비"><h3>{context.day===asOf?'오늘 귀국 준비':'선택일 귀국 준비'}</h3>{ending.map(event=><p key={event.id}>{returnPlanningText(event)}. <small>{event.scope}</small> <a href={event.sourceURL} target="_blank" rel="noreferrer">공식 일정 ↗</a></p>)}<small>공식 휴일 종료일 기준입니다. 귀국객 집중일이나 승객 국적을 확정한 예측은 아닙니다.</small></div>;
}
export function OverviewHeadline({context,onCountries,onPrepare}:{context:GlanceOverviewContext;onCountries:()=>void;onPrepare:()=>void}){
 const {asOf}=useAirportFocusData();
 return <section className="focus-report" aria-label="선택일 핵심 변화"><div className="focus-report-title"><h2>출근 후 30초 확인</h2></div><h3 className="focus-today-title">{context.day&&asOf&&context.day!==asOf?'선택일 확인':'오늘 확인'} <small>{context.day||'자료 확인 중'} 기준</small></h3><div className="focus-report-lines"><p className="focus-passenger-parts">예상 출국객 {context.passengers===null?'확인 중':`${number.format(context.passengers)}명`} + 예상 환승객 {context.transferPassengers===null?'확인 중':`${number.format(context.transferPassengers)}명`}</p><p><b className="focus-passenger-total">= 단순합계 {context.referenceSum===null?'확인 중':`${number.format(context.referenceSum)}명`}</b></p><PassengerBriefComparison total={context.referenceSum} day={context.day} baseline={context.passengerBaseline}/><p>출발 예정편 <b>{context.flights===null?'확인 중':`${number.format(context.flights)}편`}</b>{context.flightBaseline&&<> · {context.flightBaseline.previous?'전월':'확보 기간'} 일평균보다 <b>{number.format(Math.abs(context.flightBaseline.delta))}편 {context.flightBaseline.delta===0?'차이 없음':context.flightBaseline.delta>0?'많음':'적음'}</b> (<ChangeRate value={context.flightBaseline.percent} lang="ko"/>).</>}</p></div><SelectedCountryChanges context={context}/><TodayReturnContext context={context}/><PreparationBrief onMore={onPrepare} onCountries={onCountries}/><details className="focus-report-basis"><summary>숫자 비교 기준</summary><small>예상 출국객 {context.passengers===null?'확인 중':number.format(context.passengers)}명 + 예상 환승객 {context.transferPassengers===null?'확인 중':number.format(context.transferPassengers)}명. 환승은 도착 기준 예보이며, 중복을 제거한 공식 총출국객 수가 아닙니다. 선택일 하루 합계 ÷ 1일과 비교합니다. {context.passengerBaseline?.status==='COMPLETE'?`${context.passengerBaseline.start}–${context.passengerBaseline.end} 전체 ${context.passengerBaseline.completeDays}일의 같은 합산 기준 일평균`:`전월은 같은 합산 기준의 전체 달력일로 나눕니다. 누락일을 0으로 계산하지 않습니다.${context.passengerBaseline?.missingDates.length?` 미확인 날짜: ${context.passengerBaseline.missingDates.join(', ')}`:''}`}.</small><small>{context.flightBaseline?`항공편: ${context.flightBaseline.start}–${context.flightBaseline.end} · ${context.flightBaseline.days}일 일평균 ${number.format(context.flightBaseline.mean)}편 대비`:'비교 가능한 일평균 자료 확인 중'} · 항공편 수는 승객 수가 아닙니다.</small></details></section>;
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
