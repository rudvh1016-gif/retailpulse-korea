'use client';
import {useAirportFocusData} from './airport-focus-data';
import {ChangeRate} from './change-rate';
import {KoreanVacationContext} from './korean-vacation-context';
import type {Lang} from './retailpulse-data';
import {staffDepartureGateLines,type StaffDeparturePeak} from '../lib/airport-staff-peak';
import {flightHolidayContext,mergeBriefHolidays,planningHolidays,returnPlanningText} from '../lib/holiday-flight-brief';
import holidays from '../data/airport-focus-preview/holidays-summary.json';
import './airport-staff-briefing.css';
interface RouteChange {country:string;label:string;count:number;mean:number;delta:number;percent:number|null;month:string;days:number}
const number=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
export default function AirportStaffBriefing({lang,day,peak,changes,retrievedAt}:{lang:Lang;day:string;peak:StaffDeparturePeak;changes:RouteChange[];retrievedAt:string|null}){
 const calendar=useAirportFocusData();
 const events=mergeBriefHolidays(holidays.events,calendar.calendarEvents,calendar.calendarReplacementScopes);
 const ranked=[...changes].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
 const route=ranked.find(row=>flightHolidayContext(events,row,day,calendar.asOf))??ranked[0];
 const matched=route?flightHolidayContext(events,route,day,calendar.asOf):null;
 const dayMs=Date.parse(`${day}T00:00:00+09:00`),weekEnd=Number.isFinite(dayMs)?new Date(dayMs+7*86400000+9*3600000).toISOString().slice(0,10):'';
 const upcoming=matched?null:planningHolidays(events,day,weekEnd,calendar.asOf,new Map(changes.map(row=>[row.label,row.count])),1)[0];
 const event=matched?.event??upcoming;
 const time=retrievedAt&&Number.isFinite(Date.parse(retrievedAt))?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(retrievedAt)):null;
 const suffix=day?`?date=${encodeURIComponent(day)}`:'';
 return <div className="airport-staff-briefing">
  <div className="staff-brief-heading"><small>{day||'기준일 확인 중'} · 출발편 {time?`${time} KST 수집`:'수집 시각 확인 중'}</small></div>
  <div className="staff-brief-grid">
   <section><h3 data-heading="section"><span className="heading-marker" aria-hidden="true"/>01 시간·터미널</h3>{peak?<><p><b>{String(peak.hour).padStart(2,'0')}:00–{String(peak.endHour).padStart(2,'0')}:00</b> 출발 예정편 {number.format(peak.flights)}편으로 선택일 최다{peak.tiedHours>1?` (공동 ${peak.tiedHours}개 시간대)`:''}.</p>{staffDepartureGateLines(peak,lang).map(line=><p key={line}>{line}</p>)}</>:<p>확인된 출발편 자료가 없어 집중 시간과 게이트를 표시하지 않았습니다.</p>}<small>선택일 전체 예정편·확인된 게이트 기준. 고객 수나 매장 혼잡 예측은 아닙니다.</small><a href={`/${lang}/airport${suffix}`}>시간대·터미널 자세히 ↗</a></section>
   <section><h3 data-heading="section"><span className="heading-marker" aria-hidden="true"/>02 노선·휴일 준비</h3>{route?<><p><b>{route.label}행 {number.format(route.count)}편</b> · {route.month} 일평균 {number.format(route.mean)}편 대비 <ChangeRate value={route.percent} lang="ko"/>.</p>{matched&&<p>{matched.text} {matched.caution}</p>}</>:<p>비교 가능한 노선 자료를 확인 중입니다.</p>}{event?<><p>{event.countryLabel} {event.name} {event.start.slice(5)}–{event.end.slice(5)} · {event.scope}. {returnPlanningText(event)}.</p><small>공식 일정 확인 {event.verifiedAt} · <a href={event.sourceURL} target="_blank" rel="noreferrer">공식 출처 ↗</a></small></>:<small>해당 날짜·다음 7일에 검증된 대표 휴일 연결이 없습니다.</small>}<KoreanVacationContext day={day} asOf={calendar.asOf}/><small>노선 국가를 고객 국적으로 해석하지 않으며, 귀국객 집중을 확정한 예측이 아닙니다.</small><a href={`/${lang}/airport-countries${suffix}`}>국가별 흐름·휴일 맥락 ↗</a></section>
   <section><h3 data-heading="section"><span className="heading-marker" aria-hidden="true"/>03 품목별 확인</h3><p>구매 상품을 가져갈 <b>도착국</b>을 먼저 확인하고, 거주자 여부·연령 등 적용 조건에 맞는 안내를 열어보세요.</p><p>상품 총액·신고 대상·적용 조건을 먼저 확인하세요. 확인이 보류된 규정은 단정하지 않습니다.</p><details open><summary>패션·명품</summary><p>가방·의류·시계·주얼리 등은 일반물품 금액 한도와 개별 물품의 신고 기준을 확인하세요.</p></details><details><summary>화장품·향수</summary><p>일반물품 금액 한도와 함께 향수에 별도 수량 기준이 있는지 확인하세요.</p></details><details><summary>주류·담배</summary><p>연령·종류·도수·용량·개수 등 별도 조건을 해당 국가 안내에서 확인하세요.</p></details><small>국가별 공식 출처·확인 날짜·자동 확인 상태는 상세 안내에서 표시합니다.</small><a href={`/${lang}/airport-prepare${suffix}#arrival-allowances`}>도착국 반입 면세한도 ↗</a><a href={`/${lang}/airport-news`}>관세·면세 공식 소식 ↗</a></section>
  </div>
 </div>;
}
