import type {ReactNode} from 'react';
import type {BriefHoliday} from '../lib/holiday-flight-brief';
import type {Lang} from './retailpulse-data';
import {briefHoliday,briefReturnText,briefText} from '../lib/brief-localization';
import {CountryFlag} from './airport-country-flag';
import {EventCountryFlights,EventCountryFlightBasis} from './event-country-flights';
import type {EventFlightContext} from '../lib/event-country-flights';

const locales={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'} as const;
function EventDate({date,lang}:{date:string;lang:Lang}){
 // Holidays are civil dates, not instants: keep their weekday independent of the viewer's timezone.
 const weekday=new Intl.DateTimeFormat(locales[lang],{weekday:'long',timeZone:'Asia/Seoul'}).format(new Date(`${date}T12:00:00+09:00`));
 return <time className="focus-event-date" dateTime={date} translate="no">{date.slice(5).replace('-','/')}<small className="focus-event-weekday">({weekday})</small></time>;
}

/** A route-country metric belongs inside its matching country, not after the list. */
export function PreparationEvent({event,children,flights,planning=false,lang='ko'}:{event:BriefHoliday;children?:ReactNode;flights?:EventFlightContext;planning?:boolean;lang?:Lang}){
 const label=briefHoliday(event,lang);
 // Keep partial-day exclusions visible; only shorten the exact reviewed source wording.
 const turkeyScope='공화국 기념일. 전날 10월 28일 오후 1시부터 휴일이나 이 카드에는 온종일인 29일만 표시합니다.';
 const timing=event.scope===turkeyScope?(lang==='ja'?'10/28 13時から祝日 · 表示は10/29のみ':briefText(lang,'10/28 13시부터 휴일 · 표시는 10/29만','Holiday starts 10/28 at 13:00 · only 10/29 shown','假期自10/28 13:00开始 · 仅显示10/29')):/오전|오후|반일|시간|\d{1,2}:\d{2}|\d+시|half.day|partial.day/i.test(event.scope)?label.scope:null;
 return <div className="focus-event-row focus-preparation-event" data-country={event.country}>
  <h4><b className="focus-event-country"><CountryFlag code={event.countryLabel==='괌'?'GU':event.countryLabel==='사이판'?'MP':event.country}/>{label.country}:</b> {label.name}</h4>
  {event.type==='bank_holiday'&&<small className="focus-event-scope">{lang==='ja'?'(金融機関)':briefText(lang,'(금융기관)','(Financial institutions)','(金融机构)')}</small>}
  <div className="focus-event-dates"><EventDate date={event.start} lang={lang}/>{event.end!==event.start&&<>–<wbr/><EventDate date={event.end} lang={lang}/></>}</div>
  {!planning&&flights&&<EventCountryFlights country={event.country} label={event.countryLabel} context={flights} lang={lang}/>}
  {timing&&<small className="focus-event-timing">{timing}</small>}
  {children}
  <details className="focus-event-details">
   <summary>{planning&&flights?({ko:'일정 상세·선택일 항공편 참고',en:'Date details & selected-day flight reference',zh:'日程详情及所选日期航班参考',ja:'日程の詳細・選択日の便数参考'} as const)[lang]:lang==='ja'?'日程の詳細':briefText(lang,'일정 상세','Date details','日程详情')}</summary>
   {planning&&flights&&<><p className="focus-planning-flight-note">{({ko:'선택일 항공편 참고 · 행사일 예측 아님',en:'Selected-day flight reference · not an event-day forecast',zh:'所选日期航班参考 · 非活动日期预测',ja:'選択日の便数参考・行事日の予測ではありません'} as const)[lang]}</p><EventCountryFlights country={event.country} label={event.countryLabel} context={flights} lang={lang}/></>}
   {flights&&<EventCountryFlightBasis country={event.country} label={event.countryLabel} context={flights} lang={lang}/>}
   <small className="focus-holiday-gloss">({label.meaning})</small>
   <small className="focus-event-row">{label.scope}</small>
   <small className="focus-event-row">{briefReturnText(event,lang)}</small>
   <a href={event.sourceURL} target="_blank" rel="noreferrer">{briefText(lang,'공식 일정 ↗','Official dates ↗','官方日程 ↗')}</a>
  </details>
 </div>;
}
