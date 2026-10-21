'use client';
import {createContext,useContext,useEffect,useState} from 'react';
import type {DailyObservation} from '../lib/holiday-period-comparison.mjs';
import {CountryFlag} from './airport-country-flag';
import {ChangeRate} from './change-rate';
import {useAirportFocusData,type FocusTrend} from './airport-focus-data';
import {useAirportPassengerStats} from './airport-passenger-stats-client';
import calendar from '../data/airport-focus-preview/calendar-context.json';
import {compareHolidayPeriod,describeHolidayPeriod} from '../lib/holiday-period-comparison.mjs';
import {previousMonth,type CalendarEvent} from '../lib/calendar-context.mjs';
import {kstDayOf} from '../lib/kst';
import {CountryTrendCalendarContext} from './country-trend-calendar-context';
import {calendarCountryName,calendarEventTitle} from '../lib/country-trend-calendar';
import MonthlyLineChart from './airport-monthly-line-chart';
import './airport-monthly-line-chart.css';
const CountryDailyHistory=createContext<DailyObservation[]>([]);
function useCountryDailyHistory(asOf:string){
 const [state,setState]=useState<{date:string;rows:DailyObservation[]}|null>(null);
 useEffect(()=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf))return;const controller=new AbortController();let active=true;const timeout=setTimeout(()=>controller.abort(),15000);
 void fetch(`/api/live/airport-days?date=${encodeURIComponent(asOf)}`,{signal:controller.signal}).then(async response=>{if(!response.ok)return;const reply=await response.json();if(active&&reply.mode==='airport-days'&&reply.date===asOf&&Array.isArray(reply.countryDays))setState({date:asOf,rows:reply.countryDays});}).catch(()=>{}).finally(()=>clearTimeout(timeout));
 return()=>{active=false;clearTimeout(timeout);controller.abort();};
 },[asOf]);return state?.date===asOf?state.rows:[];
}
const number=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
function monthsBefore(month:string|null,count:number):string|null{let cursor=month;for(let i=0;i<count&&cursor;i++)cursor=previousMonth(cursor);return cursor;}
function TrendSummary({row}:{row:FocusTrend}){
 const last=row.points.at(-1),prev=row.points.at(-2);
 if(last?.departures===null||last?.departures===undefined||prev?.departures===null||prev?.departures===undefined||previousMonth(last.month)!==prev.month)return <div className="focus-trend-context" data-country={row.code}><p className="focus-trend-summary">최근 월 비교 자료가 일부 없어 연속 변화를 판단하지 않습니다.</p><CalendarContext row={row}/></div>;
 const difference=last.departures-prev.departures,direction=Math.sign(difference);let streak=0,priorStreak=0;
 for(let i=row.points.length-1;i>0;i--){const a=row.points[i],b=row.points[i-1];if(a.departures===null||b.departures===null||previousMonth(a.month)!==b.month||Math.sign(a.departures-b.departures)!==direction)break;streak++;}
 if(direction!==0&&streak===1)for(let i=row.points.length-2;i>0;i--){const a=row.points[i],b=row.points[i-1];if(a.departures===null||b.departures===null||previousMonth(a.month)!==b.month||Math.sign(a.departures-b.departures)!==-direction)break;priorStreak++;}
 const rate=prev.departures>0?Math.abs(difference/prev.departures*100):null;
 const verb=direction>0?'증가':'감소';
 return <div className="focus-trend-context" data-country={row.code}><p className="focus-trend-summary">{priorStreak>1?<><b>{Number(row.points[row.points.length-1-priorStreak].month.slice(5))}–{Number(prev.month.slice(5))}월 {priorStreak}개월 연속 {direction>0?'감소':'증가'}</b>한 뒤, </>:streak>1&&direction!==0?<><b>{streak}개월 연속 {verb}</b>했습니다. </>:null}{Number(last.month.slice(5))}월은 전월보다 {direction===0?<b>여객 수가 같습니다.</b>:<><b>{number.format(Math.abs(difference))}명{rate!==null?<>(<ChangeRate value={direction*rate} lang="ko"/>)</>:null}</b> {direction>0?'늘었습니다':'줄었습니다'}.</>}</p><CalendarContext row={row}/></div>;
}
function CalendarContext({row}:{row:FocusTrend}){
 const {asOf,calendarEvents}=useAirportFocusData();
 const events=calendarEvents??calendar.events.map(event=>({...event,region:event.region??undefined})) as CalendarEvent[];
 if(!asOf)return null;
 const last=row.points.at(-1);if(!last||last.departures===null)return null;
 return <><CountryTrendCalendarContext row={row} events={events} asOf={asOf}/><RecentCalendarContext country={row.code}/></>;
}
function RecentCalendarContext({country}:{country:string}){
 const {asOf,calendarEvents}=useAirportFocusData(),dailyRows=useContext(CountryDailyHistory);
 const events=calendarEvents??calendar.events.map(event=>({...event,region:event.region??undefined})) as CalendarEvent[];
 const event=events.filter(item=>item.country===country&&item.kind==='public_holiday'&&item.status==='verified'&&item.start.slice(0,7)===asOf.slice(0,7)&&item.verifiedAt<=asOf).sort((a,b)=>b.end.localeCompare(a.end))[0];
 if(!event||country==='KR'||country==='OTHER')return null;
 const phase=describeHolidayPeriod(event,asOf);
 const comparison=Number(asOf.slice(8))===1?null:compareHolidayPeriod(dailyRows.filter(row=>row.country===country),{country,metric:'departure_flights',scope:'ALL',month:asOf.slice(0,7),start:`${asOf.slice(0,7)}-01`,end:new Date(Date.parse(`${asOf}T00:00:00Z`)-86400000).toISOString().slice(0,10),asOf:asOf,holiday:event});
 return <details className="focus-source focus-recent-calendar"><summary>최근 {calendarCountryName(country)} 일정 · {asOf} 기준</summary><p>{calendarEventTitle(event)} · {event.scope==='national'?'전국 공휴일':event.region}<br/>{phase.text}</p>{comparison?.status==='available'&&<p>{calendarEventTitle(event)} 기간 확인된 {comparison.holiday.sampleDays}/{comparison.holiday.expectedDays}일 일평균 {number.format(comparison.holiday.mean!)}편 · 나머지 {Number(asOf.slice(5,7))}월 완료일 중 확인된 {comparison.nonHoliday.sampleDays}/{comparison.nonHoliday.expectedDays}일 일평균 {number.format(comparison.nonHoliday.mean!)}편{comparison.percentDifference!==null&&<> 대비 <ChangeRate value={comparison.percentDifference} lang="ko"/></>}.<br/>출발편 기준 · 여객 수 아님 · {comparison.window.start}–{comparison.window.effectiveEnd}{(comparison.holiday.coverage!==1||comparison.nonHoliday.coverage!==1)&&' · 일부 날짜 미확인, 확보일 평균 비교'}</p>}{phase.phase==='ended'&&comparison?.status==='unavailable'&&<p>해당 휴일과 같은 달의 다른 완료일 출발편 비교는 일별 자료 확인 후 표시합니다.</p>}<a href={event.sourceURL} target="_blank" rel="noreferrer">공식 일정 ↗</a><p>휴일 종료일은 인천공항 출국 집중일을 뜻하지 않습니다.</p></details>;
}
export default function CountryTrends({full=false,onMore}:{full?:boolean;onMore?:()=>void}){
 const context=useAirportFocusData(),dailyRows=useCountryDailyHistory(context.preview?'':context.asOf),newest=context.trends[0]?.points.at(-1)?.month??null;
 const middleMonth=context.preview?null:monthsBefore(newest,2),oldestMonth=context.preview?null:monthsBefore(newest,4);
 const middle=useAirportPassengerStats(middleMonth),oldest=useAirportPassengerStats(oldestMonth);
 const history=[middle,oldest].flatMap(item=>[item.reply?.current.ROUTE_COUNTRY_PASSENGERS,item.reply?.previous.ROUTE_COUNTRY_PASSENGERS]).filter(item=>item!==undefined);
 const byMonth=new Map(history.map(item=>[item.month,item]));
 const trends=context.preview?context.trends:context.trends.map(row=>({...row,points:row.points.map(point=>({...point,departures:byMonth.get(point.month)?.rows.find(item=>!item.aggregate&&item.label===row.label)?.departures??point.departures}))}));
 const checkedAt=[context.checkedAt,...history.map(item=>item.retrievedAt)].filter((value):value is string=>Boolean(value)).sort().at(-1)??null;
 const failed=context.failed||middle.failed||oldest.failed;
 const loading=Boolean((middleMonth&&!middle.reply&&!middle.failed)||(oldestMonth&&!oldest.reply&&!oldest.failed));
 const rows=full?trends:trends.slice(0,3);const start=rows[0]?.points[0]?.month,end=rows[0]?.points.at(-1)?.month;
 return <CountryDailyHistory.Provider value={dailyRows}><section className="focus-trends" id="focus-country-trends"><div className="focus-section-heading"><div><h2>{full?'노선 국가별 월 여객':'한 달의 변화일까, 이어지는 흐름일까'}</h2><p>최근 6개월 출발 여객 · {start&&end?`${start}–${end}`:failed?'자료를 불러오지 못했어요':'자료 확인 중'}</p></div>{onMore&&<button onClick={onMore}>국가별 흐름 보기 ↗</button>}</div><div className="focus-trend-grid">{rows.map(row=>{const last=row.points.at(-1),prev=row.points.at(-2);const rate=last?.departures!==null&&last?.departures!==undefined&&prev?.departures? (last.departures/prev.departures-1)*100:null;return <article key={row.code}><div className="focus-trend-top"><CountryFlag code={row.code}/><h3>{row.label}</h3><span>{last?`${Number(last.month.slice(5))}월`:''}</span></div><strong className="focus-trend-value">{last?.departures===null||last?.departures===undefined?'자료 없음':number.format(last.departures)}<small>명</small></strong><p>전월 대비 <ChangeRate value={rate} lang="ko"/></p><>{loading?<p className="focus-history-loading" role="status">이전 월 자료를 확인하고 있습니다.</p>:<><MonthlyLineChart row={row}/><TrendSummary row={row}/></>}</>{full&&!loading&&<table className="focus-month-values"><caption className="sr-only">{row.label} 월별 출발 여객과 전월비</caption><thead><tr><th>월</th><th>출발 여객</th><th>전월비</th></tr></thead><tbody>{row.points.map((point,index)=>{const previous=row.points[index-1];const change=point.departures!==null&&previous?.departures!==null&&previous?.departures!==undefined&&previous.departures>0&&previousMonth(point.month)===previous.month?(point.departures/previous.departures-1)*100:null;return <tr key={point.month}><th scope="row">{point.month}</th><td>{point.departures===null?'자료 없음':`${number.format(point.departures)}명`}</td><td>{change===null?<small>비교자료 없음</small>:<ChangeRate value={change} lang="ko"/>}</td></tr>;})}</tbody></table>}</article>;})}</div><small className="focus-source">인천국제공항공사 공식 월 실적 · {checkedAt?`${kstDayOf(checkedAt)}에 수집한 자료예요.`:'자료 수집일을 확인하지 못했어요.'}<br/>국가별 독립 축 · 노선 국가 기준이며 승객 국적이 아닙니다. 과거 실적은 향후 증가를 보장하지 않습니다.</small></section></CountryDailyHistory.Provider>;
}
