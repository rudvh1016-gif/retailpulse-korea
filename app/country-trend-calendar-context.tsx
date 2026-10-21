import type {CalendarEvent} from '../lib/calendar-context.mjs';
import {countryTrendCalendar,trendCalendarText} from '../lib/country-trend-calendar';
import type {FocusTrend} from './airport-focus-data';

export function CountryTrendCalendarContext({row,events,asOf}:{row:FocusTrend;events:readonly CalendarEvent[];asOf:string}){
 const last=row.points.at(-1);
 if(!asOf||!last||last.departures===null)return null;
 const {summary,details}=countryTrendCalendar(events,{country:row.code,selectedMonth:last.month,actualDataMonths:row.points.filter(point=>point.departures!==null).map(point=>point.month),asOf});
 if(!details.length)return null;
 const additional=details.filter(item=>!summary.includes(item));
 return <div className="focus-calendar-context">
  {summary.map(item=><p className="focus-source" key={`${item.country}-${item.eventId}`} data-calendar-role={item.role}>{trendCalendarText(item,{compact:true})}</p>)}
  <p className="focus-source">일정 참고 · 증감 원인 단정 불가 · 한국 일정은 출발지 기준</p>
  <details className="focus-source"><summary>관련 일정{additional.length?` ${additional.length}건 더 · `:'과 '}공식 근거</summary>
   {additional.map(item=><p key={`${item.country}-${item.eventId}`}>{trendCalendarText(item)} · <a href={item.sourceURL} target="_blank" rel="noreferrer">공식 원문 ↗</a><br/>확인일 {item.verifiedAt}</p>)}
   <p>한국 일정은 한국인 여객 통계가 아닙니다. 방학은 지역·학교별로 다릅니다.</p>
   {summary.map(item=><p key={`${item.country}-${item.eventId}`}>{item.title} · {item.start}–{item.end}{item.scope!=='national'?` · ${item.country==='KR'&&item.kind==='school_break'?'초등학교 방학기간 참고 · 개별 학교 예시':item.scopeLabel}`:''}{item.kind==='school_break'&&!item.title.endsWith(item.name)?` (${item.name})`:''} · <a href={item.sourceURL} target="_blank" rel="noreferrer">공식 원문 ↗</a> · 확인일 {item.verifiedAt}</p>)}
  </details>
 </div>;
}
