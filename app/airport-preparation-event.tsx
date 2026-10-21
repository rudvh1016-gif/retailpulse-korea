import type {ReactNode} from 'react';
import type {BriefHoliday} from '../lib/holiday-flight-brief';
import {returnPlanningText} from '../lib/holiday-flight-brief';
import {CountryFlag} from './airport-country-flag';

/** A route-country metric belongs inside its matching country, not after the list. */
export function PreparationEvent({event,children}:{event:BriefHoliday;children?:ReactNode}){
 return <span className="focus-event-row" data-country={event.country}>
  <b className="focus-event-country"><CountryFlag code={event.countryLabel==='괌'?'GU':event.countryLabel==='사이판'?'MP':event.country}/>{event.countryLabel}:</b> {event.name} {event.start.slice(5).replace('-','/')}–{event.end.slice(5).replace('-','/')}
  <small className="focus-holiday-gloss">({event.meaning_ko||event.scope})</small>
  <small className="focus-event-row">{event.scope}</small>
  <small className="focus-event-row">{returnPlanningText(event)} · <a href={event.sourceURL} target="_blank" rel="noreferrer">공식 일정 ↗</a></small>
  {children}
 </span>;
}
