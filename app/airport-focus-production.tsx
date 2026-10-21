'use client';
import {type ComponentProps,type ReactNode} from 'react';
import dynamic from 'next/dynamic';
import AirportGlance from './airport-glance-preview';
import type {AirportView as AirportViewComponent} from './airport-view';
const AirportView=dynamic(()=>import('./airport-view').then(module=>module.AirportView));
import {AirportSceneArtwork} from './airport-scene-model';
import {AirportRouteCountryPassengers,RoutePassengerPlacement} from './airport-route-country-passengers';
import {useAirportPassengerStats} from './airport-passenger-stats-client';
import {AirportFocusData,type FocusTrend} from './airport-focus-data';
import {CountryBriefing,CountryTrends,HolidayList,OverviewHeadline,StaffCalendarContext} from './airport-focus-preview';
import {previousMonth} from '../lib/calendar-context.mjs';
import {useLiveSummary} from './live-summary';
import {useOfficialCalendar} from './official-calendar-client';
import type {Lang} from './retailpulse-data';
const ArrivalAllowances=dynamic(()=>import('./arrival-allowances-preview'));
const majorRoutes=[['JP','일본'],['CN','중국'],['VN','베트남'],['US','미국'],['TW','대만'],['TH','태국'],['HK','홍콩'],['SG','싱가포르'],['PH','필리핀'],['MY','말레이시아'],['AU','호주'],['CA','캐나다']] as const;
function FocusLiveData({date,children}:{date?:string|null;children:ReactNode}){
 const officialCalendar=useOfficialCalendar();
 const summary=useLiveSummary(date??null),asOf=summary?.todayKst??'',requested=date?.slice(0,7)||asOf.slice(0,7)||null;
 const latest=useAirportPassengerStats(requested);
 const newest=latest.reply?.current.ROUTE_COUNTRY_PASSENGERS?.month??null;
 const months=[latest].flatMap(item=>[item.reply?.current.ROUTE_COUNTRY_PASSENGERS,item.reply?.previous.ROUTE_COUNTRY_PASSENGERS]).filter(item=>item!==undefined);
 const byMonth=new Map(months.map(item=>[item.month,item]));
 const expected:string[]=[];if(newest){let cursor:string|null=newest;for(let i=0;i<6&&cursor;i++){expected.unshift(cursor);cursor=previousMonth(cursor);}}
 const availableRoutes=majorRoutes.filter(([,label],index)=>index<6||months.some(item=>item.rows.some(row=>!row.aggregate&&row.label===label&&row.departures!==null)));
 const trends:FocusTrend[]=newest?availableRoutes.map(([code,label])=>({code,label,points:expected.map(month=>({month,departures:byMonth.get(month)?.rows.find(row=>!row.aggregate&&row.label===label)?.departures??null}))})):[];
 const checkedAt=months.map(item=>item.retrievedAt).sort().at(-1)??null;
 return <AirportFocusData.Provider value={{...officialCalendar,asOf,trends,checkedAt,preview:false,failed:summary===null||latest.failed}}>{children}</AirportFocusData.Provider>;
}
function go(lang:Lang,slug:string,date?:string|null){window.location.assign(`/${lang}/${slug}${date?`?date=${encodeURIComponent(date)}`:''}`);}
export function AirportFocusGlance(props:ComponentProps<typeof AirportGlance>){
 const {lang,selectedDate}=props;
 return <FocusLiveData date={selectedDate}><div className="airport-focus-shell airport-focus-operating"><AirportGlance {...props} published hideRepeatedFlightSummary hideRepeatedPassengerSummary artworkSrc="/images/airport-glance/approval-v2-1448.webp" artworkSrcSet={[480,960,1100,1200,1448].map(width=>`/images/airport-glance/approval-v2-${width}.webp ${width}w`).join(', ')} artworkSizes="(max-width:365px) calc(100vw - 28px), (max-width:820px) calc(100vw - 36px), (max-width:848px) calc(100vw - 48px), 800px" artworkNote="구조 이해를 위한 모형 · 항공기 위치는 실제 운항 현황이 아닙니다" overviewHeading={context=><OverviewHeadline context={context} onCountries={()=>go(lang,'airport-countries',selectedDate)} onPrepare={()=>go(lang,'airport-prepare')}/>} overviewExtras={<div className="focus-forward"><HolidayList onMore={()=>go(lang,'airport-prepare')}/><CountryTrends onMore={()=>go(lang,'airport-countries',selectedDate)}/><section className="focus-staff-links"><h2>근무 중 확인</h2><p>터미널·시간대 정보와 고객 안내에 필요한 공식 소식을 확인하세요.</p><a href={`/${lang}/airport${selectedDate?`?date=${encodeURIComponent(selectedDate)}`:''}`}>터미널·시간대 확인 ↗</a><a href={`/${lang}/airport-news`}>관세·면세 공식 소식 ↗</a><a href={`/${lang}/airport-prepare#arrival-allowances`}>도착국 반입 면세한도 ↗</a></section></div>}/></div></FocusLiveData>;
}
export function AirportFocusStatus(props:ComponentProps<typeof AirportViewComponent>){
 return <FocusLiveData date={props.date}><div className="airport-focus-shell airport-focus-operating"><AirportSceneArtwork.Provider value="/airport-models/approval-v3"><RoutePassengerPlacement.Provider value={<a className="focus-country-jump" href={`/${props.lang}/airport-countries${props.date?`?date=${props.date}`:''}`}>국가별 월 여객 비교는 국가별 흐름에서 보기 ↗</a>}><AirportView {...props} industryContext={<StaffCalendarContext onMore={()=>go(props.lang,'airport-prepare')}/>}/></RoutePassengerPlacement.Provider></AirportSceneArtwork.Provider></div></FocusLiveData>;
}
function CountryContents({lang,date}:{lang:Lang;date:string|null}){
 const today=useLiveSummary(date)?.todayKst??'',month=(date||today).slice(0,7);
 return <div className="airport-focus-shell airport-focus-operating"><div className="focus-detail"><h1>국가별 흐름</h1><p className="focus-lead">어느 노선의 흐름이 달라졌는지, 월별 실적으로 확인합니다.</p>{month&&<><CountryBriefing month={month}/><AirportRouteCountryPassengers lang={lang} month={month} terminal="all"/></>}<CountryTrends full/></div></div>;
}
export function AirportCountryFlow({lang,date}:{lang:Lang;date:string|null}){return <FocusLiveData date={date}><CountryContents lang={lang} date={date}/></FocusLiveData>;}
export function AirportPreparation({lang}:{lang:Lang}){return <FocusLiveData><div className="airport-focus-shell airport-focus-operating"><div className="focus-detail"><h1>미리 준비</h1><p className="focus-lead">다가오는 휴일과 공식 안내를 미리 확인하세요.</p><a className="focus-related" href="#arrival-allowances">도착국 반입 면세한도 보기 ↗</a><HolidayList full/><ArrivalAllowances/><a className="focus-related" href={`/${lang}/airport-news`}>관세·면세 공식 소식 확인 ↗</a></div></div></FocusLiveData>;}
