import type {Lang} from './retailpulse-data';
import type {PreparationEvent} from '../lib/preparation-calendar';
import {chineseText} from '../lib/chinese-ui';

export function preparationDescription(event:PreparationEvent,lang:Lang){
 const text=chineseText(lang,event.description_ko),end=text.search(/[.!?。！？]/);
 return {meaning:end<0?text:text.slice(0,end),qualification:end<0?'':text.slice(end+1).trim()};
}

/** Display essential applicability and sources, not the stored research log. */
export function PreparationEventSource({event,lang,className}:{event:PreparationEvent;lang:Lang;className?:string}){
 const adjusted=event.scope==='전국 조정 휴무 구간',description=preparationDescription(event,lang);
 // Preserve operationally meaningful workday exceptions, never the surrounding
 // page numbers, parser status or calendar-conversion research notes.
 const workdays=adjusted?event.notes.match(/보충근무일 \d{4}-\d{2}-\d{2}(?:, \d{4}-\d{2}-\d{2})* \(휴일 아님\)/)?.[0]:undefined;
 return <details className={className}>
  <summary>{chineseText(lang,'적용 대상·공식 출처')}</summary>
  <p>{chineseText(lang,event.scope)}</p>
  {description.qualification&&<p>{description.qualification}</p>}
  {workdays&&<p>{chineseText(lang,workdays)}</p>}
  {event.kind==='major_event'&&<p>{chineseText(lang,event.connectionNote_ko)}</p>}
  {event.displayConditions_ko?.map(condition=><p key={condition}>{chineseText(lang,condition)}</p>)}
  {event.restConditions_ko.map(condition=><p key={condition}>{chineseText(lang,condition)}</p>)}
  <p>{chineseText(lang,'공식 자료 확인 ')}{chineseText(lang,event.verifiedAt)} · <a href={event.sourceURL} target="_blank" rel="noreferrer">{chineseText(lang,'공식 날짜 확인 ↗')}</a></p>
 </details>;
}
