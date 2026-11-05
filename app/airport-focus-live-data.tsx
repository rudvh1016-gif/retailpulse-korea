'use client';
import type {ReactNode} from 'react';
import {AirportFocusData,type FocusTrend} from './airport-focus-data';
import {selectHomeMonthlyCountries,homeMonthlyCountryTrends} from '../lib/home-monthly-countries';
import {previousMonth} from '../lib/calendar-context.mjs';
import {useLiveSummary} from './live-summary';
import {useOfficialCalendar} from './official-calendar-client';
import {useAirportPassengerStats} from './airport-passenger-stats-client';
const majorRoutes=[['JP','일본'],['CN','중국'],['VN','베트남'],['US','미국'],['TW','대만'],['TH','태국'],['HK','홍콩'],['SG','싱가포르'],['PH','필리핀'],['MY','말레이시아'],['AU','호주'],['CA','캐나다']] as const;
export function FocusLiveData({date,children,home=false}:{date?:string|null;children:ReactNode;home?:boolean}){
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
