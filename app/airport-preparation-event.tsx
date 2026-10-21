import type {ReactNode} from 'react';
import type {BriefHoliday} from '../lib/holiday-flight-brief';
import type {Lang} from './retailpulse-data';
import {briefHoliday,briefReturnText,briefText} from '../lib/brief-localization';
import {CountryFlag} from './airport-country-flag';

const locales={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'} as const;
function EventDate({date,lang}:{date:string;lang:Lang}){
 // Holidays are civil dates, not instants: keep their weekday independent of the viewer's timezone.
 const weekday=new Intl.DateTimeFormat(locales[lang],{weekday:'long',timeZone:'Asia/Seoul'}).format(new Date(`${date}T12:00:00+09:00`));
 return <time className="focus-event-date" dateTime={date} translate="no">{date.slice(5).replace('-','/')}<small className="focus-event-weekday">({weekday})</small></time>;
}

/** A route-country metric belongs inside its matching country, not after the list. */
export function PreparationEvent({event,children,lang='ko'}:{event:BriefHoliday;children?:ReactNode;lang?:Lang}){
 const label=briefHoliday(event,lang);
 return <span className="focus-event-row" data-country={event.country}>
  <b className="focus-event-country"><CountryFlag code={event.countryLabel==='괌'?'GU':event.countryLabel==='사이판'?'MP':event.country}/>{label.country}:</b> {label.name} <EventDate date={event.start} lang={lang}/>{event.end!==event.start&&<>–<wbr/><EventDate date={event.end} lang={lang}/></>}
  <small className="focus-holiday-gloss">({label.meaning})</small>
  <small className="focus-event-row">{label.scope}</small>
  <small className="focus-event-row">{briefReturnText(event,lang)} · <a href={event.sourceURL} target="_blank" rel="noreferrer">{briefText(lang,'공식 일정 ↗','Official dates ↗','官方日程 ↗')}</a></small>
  {children}
 </span>;
}
