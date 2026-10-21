import type {CalendarEvent} from '../lib/calendar-context.mjs';
import {countryTrendCalendar,trendCalendarText} from '../lib/country-trend-calendar';
import type {Lang} from './retailpulse-data';
import type {FocusTrend} from './airport-focus-data';

export function CountryTrendCalendarContext({row,events,asOf,lang='ko'}:{row:FocusTrend;events:readonly CalendarEvent[];asOf:string;lang?:Lang}){
 const last=row.points.at(-1);
 if(!asOf||!last||last.departures===null)return null;
 const {summary,details}=countryTrendCalendar(events,{country:row.code,selectedMonth:last.month,actualDataMonths:row.points.filter(point=>point.departures!==null).map(point=>point.month),asOf});
 if(!details.length)return null;
 const additional=details.filter(item=>!summary.includes(item));
 return <div className="focus-calendar-context">
  <p className="focus-source">일정 참고 · 증감 원인 단정 불가 · 한국 일정은 출발지 기준</p>
  <details className="focus-source" data-testid="monthly-calendar-reference"><summary style={{minHeight:44,boxSizing:'border-box',padding:'12px 0',cursor:'pointer'}}>{{ko:'비교 시기 참고 일정 · 공식 근거',en:'Comparison-period calendar · official sources',zh:'比较期间日程 · 官方依据',ja:'比較期間の日程・公式根拠'}[lang]}</summary>
   {summary.map(item=><p className="focus-source" key={`${item.country}-${item.eventId}`} data-calendar-role={item.role}>{trendCalendarText(item,{compact:true})}</p>)}
   {additional.map(item=><p key={`${item.country}-${item.eventId}`}>{trendCalendarText(item)} · <a href={item.sourceURL} target="_blank" rel="noreferrer">공식 원문 ↗</a><br/>확인일 {item.verifiedAt}</p>)}
   <p>한국 일정은 한국인 여객 통계가 아닙니다. 방학은 지역·학교별로 다릅니다.</p>
   {summary.map(item=><p key={`${item.country}-${item.eventId}`}>{item.title} · {item.start}–{item.end}{item.scope!=='national'?` · ${item.country==='KR'&&item.kind==='school_break'?'초등학교 방학기간 참고 · 개별 학교 예시':item.scopeLabel}`:''}{item.kind==='school_break'&&!item.title.endsWith(item.name)?<span style={{display:'block'}}>({item.name})</span>:null} · <a href={item.sourceURL} target="_blank" rel="noreferrer">공식 원문 ↗</a> · 확인일 {item.verifiedAt}</p>)}
  </details>
 </div>;
}
