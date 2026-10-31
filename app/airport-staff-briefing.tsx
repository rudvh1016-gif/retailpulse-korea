'use client';
import {chineseText} from '../lib/chinese-ui';
import {useAirportFocusData} from './airport-focus-data';
import {StaffRouteHoliday,type StaffRouteChange} from './airport-staff-route-holiday';
import {KoreanVacationContext} from './korean-vacation-context';
import type {Lang} from './retailpulse-data';
import {staffDepartureGateLines,type StaffDeparturePeak} from '../lib/airport-staff-peak';
import {flightHolidayContext,mergeBriefHolidays,planningHolidays} from '../lib/holiday-flight-brief';
import holidays from '../data/airport-focus-preview/holidays-summary.json';
import type {EventFlightContext} from '../lib/event-country-flights';
import './airport-staff-briefing.css';
const number=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
export default function AirportStaffBriefing({lang,day,peak,changes,flights,retrievedAt}:{lang:Lang;day:string;peak:StaffDeparturePeak;changes:StaffRouteChange[];flights:EventFlightContext;retrievedAt:string|null}){
 const calendar=useAirportFocusData();
 const events=mergeBriefHolidays(holidays.events,calendar.calendarEvents,calendar.calendarReplacementScopes);
 const ranked=[...changes].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
 const route=ranked.find(row=>flightHolidayContext(events,row,day,calendar.asOf))??ranked[0];
 const matched=route?flightHolidayContext(events,route,day,calendar.asOf):null;
 const dayMs=Date.parse(`${day}T00:00:00+09:00`),weekEnd=Number.isFinite(dayMs)?new Date(dayMs+7*86400000+9*3600000).toISOString().slice(0,10):'';
 const upcoming=matched?null:planningHolidays(events,day,weekEnd,calendar.asOf,new Map(flights.countries.filter(row=>row.country).map(row=>[new Intl.DisplayNames(['ko'],{type:'region'}).of(row.country!)??row.country!,row.flights])),1)[0];
 const event=matched?.event??upcoming;
 const time=retrievedAt&&Number.isFinite(Date.parse(retrievedAt))?new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(retrievedAt)):null;
 const suffix=day?`?date=${encodeURIComponent(day)}`:'';
 return <div className="airport-staff-briefing">
  <div className="staff-brief-heading"><small>{chineseText(lang,day||'기준일 확인 중')}{chineseText(lang," · 출발편 ")}{chineseText(lang,time?`${time} KST 수집`:'수집 시각 확인 중')}</small></div>
  <div className="staff-brief-grid">
   <section><h3 data-heading="subsection" className="airport-flow-item-title"><span className="heading-marker" aria-hidden="true"/><span className="airport-flow-check" aria-hidden="true">✓</span>{chineseText(lang,"시간·터미널")}</h3>{peak?<><p><b>{chineseText(lang,String(peak.hour).padStart(2,'0'))}:00 ~ {chineseText(lang,String(peak.endHour).padStart(2,'0'))}:00</b>{chineseText(lang," 출발 예정편 ")}{chineseText(lang,number.format(peak.flights))}{chineseText(lang,lang==='en'?' flights, the selected-day peak':'편으로 선택일 최다')}{chineseText(lang,peak.tiedHours>1?` (공동 ${peak.tiedHours}개 시간대)`:'')}.</p>{staffDepartureGateLines(peak,lang).map(line=>{const label=line.match(/^(T1|T2|탑승동|Concourse|卫星厅|搭乗棟) /)?.[1];return label?<p className="staff-gate-summary" key={line}><strong><span aria-hidden="true">· </span><span className="staff-terminal-label" data-terminal={label==='T1'?'T1':label==='T2'?'T2':'CONCOURSE'}>{chineseText(lang,label)}</span>{chineseText(lang,line.slice(label.length))}</strong></p>:<p key={line}>{chineseText(lang,line)}</p>})}</>:<p>{chineseText(lang,"확인된 출발편 자료가 없어 집중 시간과 게이트를 표시하지 않았습니다.")}</p>}<small>{chineseText(lang,"선택일 전체 예정편·확인된 게이트 기준 · 승객 수 아님")}</small><a href={`/${lang}/airport${suffix}`}>{chineseText(lang,"시간대·터미널 자세히 ↗")}</a></section>
   <section><h3 data-heading="subsection" className="airport-flow-item-title"><span className="heading-marker" aria-hidden="true"/><span className="airport-flow-check" aria-hidden="true">✓</span>{chineseText(lang,"노선·휴일 준비")}</h3><StaffRouteHoliday route={route} event={event} flights={flights} day={day} lang={lang}><KoreanVacationContext lang={lang} day={day} asOf={calendar.asOf}/></StaffRouteHoliday><a href={`/${lang}/airport-countries${suffix}`}>{chineseText(lang,"국가별 흐름·휴일 맥락 ↗")}</a></section>
  </div>
 </div>;
}
