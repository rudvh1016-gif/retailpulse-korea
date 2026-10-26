'use client';
import {AirportGlanceInsights,AirportCountryInsights} from './airport-period-insights';
import {MonthlyAirportScope} from './monthly-airport-scope';
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
import './preparation-calendar.css';
import {PreparationArrivalLink} from './preparation-arrival-link';
import {selectHomeMonthlyCountries,homeMonthlyCountryTrends} from '../lib/home-monthly-countries';
import {previousMonth} from '../lib/calendar-context.mjs';
import {useLiveSummary} from './live-summary';
import {useOfficialCalendar} from './official-calendar-client';
import type {Lang} from './retailpulse-data';
import {airportFocusCopy} from './airport-focus-copy';
const ArrivalAllowances=dynamic(()=>import('./arrival-allowances-preview'));
const majorRoutes=[['JP','일본'],['CN','중국'],['VN','베트남'],['US','미국'],['TW','대만'],['TH','태국'],['HK','홍콩'],['SG','싱가포르'],['PH','필리핀'],['MY','말레이시아'],['AU','호주'],['CA','캐나다']] as const;
function FocusLiveData({date,children,home=false}:{date?:string|null;children:ReactNode;home?:boolean}){
 const officialCalendar=useOfficialCalendar();
 const summary=useLiveSummary(date??null),asOf=summary?.todayKst??'',requested=date?.slice(0,7)||asOf.slice(0,7)||null;
 const latest=useAirportPassengerStats(requested);
 const newest=latest.reply?.current.ROUTE_COUNTRY_PASSENGERS?.month??null;
 const months=[latest].flatMap(item=>[item.reply?.current.ROUTE_COUNTRY_PASSENGERS,item.reply?.previous.ROUTE_COUNTRY_PASSENGERS]).filter(item=>item!==undefined);
 const byMonth=new Map(months.map(item=>[item.month,item]));
 const expected:string[]=[];if(newest){let cursor:string|null=newest;for(let i=0;i<6&&cursor;i++){expected.unshift(cursor);cursor=previousMonth(cursor);}}
 const availableRoutes=majorRoutes.filter(([,label],index)=>index<6||months.some(item=>item.rows.some(row=>!row.aggregate&&row.label===label&&row.departures!==null)));
 const trends:FocusTrend[]=newest?availableRoutes.map(([code,label])=>({code,label,points:expected.map(month=>({month,departures:byMonth.get(month)?.rows.find(row=>!row.aggregate&&row.label===label)?.departures??null}))})):[];
 const homeMonthlySelection=home?selectHomeMonthlyCountries(latest.reply?.current.ROUTE_COUNTRY_PASSENGERS,requested,asOf):undefined;
 const homeTrends=homeMonthlySelection?homeMonthlyCountryTrends(homeMonthlySelection,months):undefined;
 const checkedAt=months.map(item=>item.retrievedAt).sort().at(-1)??null;
 return <AirportFocusData.Provider value={{...officialCalendar,asOf,trends,homeMonthlySelection,homeTrends,checkedAt,preview:false,failed:summary===null||latest.failed}}>{children}</AirportFocusData.Provider>;
}
function go(lang:Lang,slug:string,date?:string|null){window.location.assign(`/${lang}/${slug}${date?`?date=${encodeURIComponent(date)}`:''}`);}
export function AirportFocusGlance(props:ComponentProps<typeof AirportGlance>){
 const {lang,selectedDate}=props;
 const copy=airportFocusCopy(lang);
 return <AirportGlanceInsights lang={lang} date={selectedDate}><FocusLiveData date={selectedDate} home><div className="airport-focus-shell airport-focus-operating"><AirportGlance {...props} hideTitle={lang==='ko'} published hideRepeatedFlightSummary hideRepeatedPassengerSummary artworkSrc="/images/airport-glance/approval-v2-1448.webp" artworkSrcSet={[480,960,1100,1200,1448].map(width=>`/images/airport-glance/approval-v2-${width}.webp ${width}w`).join(', ')} artworkSizes="(max-width:365px) calc(100vw - 28px), (max-width:820px) calc(100vw - 36px), (max-width:848px) calc(100vw - 48px), 800px" artworkNote={copy.model} overviewHeading={context=><OverviewHeadline lang={lang} context={context} onCountries={()=>go(lang,'airport-countries',selectedDate)} onPrepare={()=>go(lang,'airport-prepare')}/>} trailingContent={<div className="glance-overview-extras"><div className="focus-forward"><CountryTrends lang={lang} onMore={()=>go(lang,'airport-countries',selectedDate)}/></div></div>} overviewExtras={<div className="focus-forward"><HolidayList onMore={()=>go(lang,'airport-prepare')}/><section className="focus-staff-links"><h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>{copy.staff}</h2><p>{copy.staffHelp}</p><a href={`/${lang}/airport${selectedDate?`?date=${encodeURIComponent(selectedDate)}`:''}`}>{copy.terminal}</a><a href={`/${lang}/airport-news`}>{copy.news}</a><a href={`/${lang}/airport-prepare#arrival-allowances`}>{copy.allowances}</a></section></div>}/></div></FocusLiveData></AirportGlanceInsights>;
}
export function AirportFocusStatus(props:ComponentProps<typeof AirportViewComponent>){
 const copy=airportFocusCopy(props.lang);
 return <FocusLiveData date={props.date}><div className="airport-focus-shell airport-focus-operating"><AirportSceneArtwork.Provider value="/airport-models/approval-v3"><RoutePassengerPlacement.Provider value={<a className="focus-country-jump" href={`/${props.lang}/airport-countries${props.date?`?date=${props.date}`:''}`}>{copy.countryJump}</a>}><AirportView {...props} industryContext={<StaffCalendarContext onMore={()=>go(props.lang,'airport-prepare')}/>}/></RoutePassengerPlacement.Provider></AirportSceneArtwork.Provider></div></FocusLiveData>;
}
function CountryContents({lang,date}:{lang:Lang;date:string|null}){
 const copy=airportFocusCopy(lang);
 const today=useLiveSummary(date)?.todayKst??'',month=(date||today).slice(0,7);
 return <div className="airport-focus-shell airport-focus-operating"><div className="focus-detail">{lang!=='ko'&&<h1 data-heading="page"><span className="heading-marker" aria-hidden="true"/>{({ko:'T1 + T2 국가별 흐름',en:'T1 + T2 Route-country trends',zh:'T1 + T2 航线国家趋势',ja:'T1 + T2 路線国別の推移'})[lang]}</h1>}<MonthlyAirportScope lang={lang}/><p className="focus-lead">{copy.countriesHelp}</p>{month&&<><CountryBriefing month={month}/><AirportRouteCountryPassengers lang={lang} month={month} terminal="all"/></>}<CountryTrends full lang={lang}/></div></div>;
}
export function AirportCountryFlow({lang,date}:{lang:Lang;date:string|null}){return <AirportCountryInsights lang={lang} date={date}><FocusLiveData date={date}><CountryContents lang={lang} date={date}/></FocusLiveData></AirportCountryInsights>;}
export function AirportPreparation({lang}:{lang:Lang}){const copy=airportFocusCopy(lang);return <FocusLiveData><div className="airport-focus-shell airport-focus-operating"><div className="focus-detail"><h1 data-heading="page"><span className="heading-marker" aria-hidden="true"/>{copy.prepare}</h1><p className="focus-lead">{copy.prepareHelp}</p><PreparationArrivalLink/><HolidayList full/><ArrivalAllowances/><a className="focus-related" href={`/${lang}/airport-news`}>{copy.newsMore}</a></div></div></FocusLiveData>;}

