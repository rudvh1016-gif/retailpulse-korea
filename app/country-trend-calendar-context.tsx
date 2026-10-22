import type {CalendarEvent} from '../lib/calendar-context.mjs';
import {calendarCountryName,countryTrendCalendar} from '../lib/country-trend-calendar';
import type {Lang} from './retailpulse-data';
import type {FocusTrend} from './airport-focus-data';

export function CountryTrendCalendarContext({row,events,asOf,lang='ko'}:{row:FocusTrend;events:readonly CalendarEvent[];asOf:string;lang?:Lang}){
 const last=row.points.at(-1);
 if(!asOf||!last||last.departures===null)return null;
 const {details}=countryTrendCalendar(events,{country:row.code,selectedMonth:last.month,actualDataMonths:row.points.filter(point=>point.departures!==null).map(point=>point.month),asOf});
 if(!details.length)return null;
 // Dates are primary comparison context, not optional evidence. Never rank-cut them.
 const visible=details;
 const eventName=(item:typeof details[number])=>item.title.slice(calendarCountryName(item.country).length+1).replace(/^공휴일 · /,'');
 return <div className="focus-calendar-context">
  <p className="focus-source">일정 참고 · 증감 원인 단정 불가 · 한국 일정은 출발지 기준</p>
  {(['route','origin'] as const).map(role=><div key={role} data-calendar-role={role}>
   {visible.filter(item=>item.role===role).map(item=>{
    const index=details.indexOf(item)+1;
    const name=eventName(item);
    const scope=item.kind==='school_break'?'학교별 상이 · 예시':item.scope==='national'?'':item.region?.includes('연방공무원')?'연방공무원':item.region?.includes('금융기관')?'금융기관':item.region;
    return <p className="focus-source" key={index}>
     <span aria-hidden="true">{String.fromCodePoint(...[...item.country].map(char=>127397+char.charCodeAt(0)))}</span> {calendarCountryName(item.country)} · <b>{name}</b> {item.start}{item.start!==item.end?`–${item.end}`:''}{scope?` · ${scope}`:''}{item.relation==='previous'?' · 직전 월':''}
    </p>;
   })}
  </div>)}
  <details className="focus-source" data-testid="monthly-calendar-reference"><summary style={{minHeight:44,boxSizing:'border-box',padding:'12px 0',cursor:'pointer'}}>{{ko:'일정 근거',en:'Comparison-period calendar · official sources',zh:'比较期间日程 · 官方依据',ja:'比較期間の日程・公式根拠'}[lang]}</summary>
   <p>한국 일정은 한국인 여객 통계가 아닙니다. 방학은 지역·학교별로 다릅니다.</p>
   <ul>{details.map((item,index)=><li key={index}>
    {calendarCountryName(item.country)} · <b>{eventName(item)}</b> {item.start}{item.start!==item.end?`–${item.end}`:''}{item.relation==='previous'?' · 직전 월':''}<br/>
    {item.months.map(period=>period.month).join(' · ')} · {item.country==='KR'&&item.kind==='school_break'?'초등학교 방학기간 참고 · 개별 학교 예시':item.scopeLabel}
    {item.kind==='school_break'&&item.country!=='KR'?` · ${item.name}`:''}
    {item.role==='origin'?' · 한국 출발지 참고':''}
    {' · '}<a href={item.sourceURL} target="_blank" rel="noreferrer">공식 원문 ↗</a> · 확인일 {item.verifiedAt}
   </li>)}</ul>
  </details>
 </div>;
}
