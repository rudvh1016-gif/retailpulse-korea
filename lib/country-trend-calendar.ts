import reviewedSchools from '../data/korean-school-vacations.json';
import {matchCalendarContext,type CalendarContext,type CalendarEvent,type CalendarQuery} from './calendar-context.mjs';

const countries=new Intl.DisplayNames(['ko'],{type:'region'});
export const calendarCountryName=(country:string)=>country==='KR'?'한국':countries.of(country)??country;
export function calendarEventTitle(event:Pick<CalendarEvent,'country'|'kind'|'name'>){
 const season=event.kind==='school_break'?event.name.match(/(?:여름|겨울|봄|가을)방학$/)?.[0]:undefined;
 return `${calendarCountryName(event.country)} ${event.kind==='public_holiday'?'공휴일 · ':''}${season??event.name}`;
}
export type TrendCalendarItem=CalendarContext & {name:string;title:string;scopeLabel:string;months:CalendarContext[]};
export function trendCalendarText(item:TrendCalendarItem,options:{compact?:boolean}={}){
 const compact=options.compact===true;
 const months=item.months.map(period=>`${period.month}${period.relation==='previous'?'(직전 월)':''}`).join('·');
 const dates=item.start===item.end?item.start:`${item.start}–${item.end}`;
 const scope=item.country==='KR'&&item.kind==='school_break'?'초등학교 방학기간 참고 · 개별 학교 예시':compact&&item.kind==='school_break'?'지역·학교별 일정 상이':item.scopeLabel;
 return `${compact?(item.relation==='previous'?'직전 월 · ':''):`${months} · `}${item.title} ${dates}${item.scope==='national'?'':` · ${scope}`}${!compact&&item.role==='origin'?' · 한국 출발지 참고':''}`;
}

/** Existing reviewed evidence only. Never infer a nationwide break, missing
 * month, next year's dates, passenger nationality, or a cause of a change. */
export function countryTrendCalendar(events:readonly CalendarEvent[],query:Omit<CalendarQuery,'includeOriginContext'|'includePreviousMonth'>,schools:readonly CalendarEvent[]=reviewedSchools.events as CalendarEvent[]){
 const schoolExamples=schools.filter(event=>event.country==='KR'&&event.kind==='school_break'&&event.scope!=='national');
 // Deduplicate identical evidence, not merely matching dates: regional and
 // institutional schedules with distinct applicability must remain separate.
 const seen=new Set<string>();
 const sourceEvents=[...events,...schoolExamples].filter(event=>{
  const key=JSON.stringify([event.country,event.kind,event.name,event.scope,event.region,event.start,event.end,event.sourceURL,event.verifiedAt,event.status,event.reviewValidUntil]);
  if(seen.has(key))return false;
  seen.add(key);
  return true;
 });
 const matched=matchCalendarContext(sourceEvents,{...query,includeOriginContext:true,includePreviousMonth:true}).details;
 const details:TrendCalendarItem[]=[];
 for(const item of matched){
  const existing=details.find(other=>other.eventId===item.eventId&&other.country===item.country);
  if(existing){existing.months.push(item);continue;}
  const event=sourceEvents.find(event=>event.id===item.eventId&&event.country===item.country&&event.start===item.start&&event.end===item.end&&event.sourceURL===item.sourceURL&&event.verifiedAt===item.verifiedAt)!;
  details.push({...item,name:event.name,title:calendarEventTitle(event),scopeLabel:item.scope==='national'?'전국':`${item.region} · ${item.scope==='institutional'?(item.kind==='school_break'?'해당 학교에만 적용':'해당 기관·대상에만 적용'):'해당 지역·대상에만 적용'}`,months:[item]});
 }
 // Combine only three reviewed consecutive Chuseok dates with identical provenance.
 // Substitutes and Sundays are separate events; missing dates are never inferred.
 for(const first of [...details]){
  if(first.country!=='KR'||first.kind!=='public_holiday'||first.scope!=='national'||first.name!=='추석 연휴'||first.start!==first.end)continue;
  const next=(offset:number)=>new Date(Date.parse(`${first.start}T00:00:00Z`)+offset*86400000).toISOString().slice(0,10);
  const peers=[first,...[1,2].map(offset=>details.find(item=>item.country==='KR'&&item.kind==='public_holiday'&&item.scope==='national'&&item.start===next(offset)&&item.end===item.start&&item.name===(offset===1?'추석':'추석 연휴')&&item.sourceURL===first.sourceURL&&item.verifiedAt===first.verifiedAt&&item.role===first.role))];
  if(peers.some(item=>!item))continue;
  first.end=peers[2]!.end;
  for(const item of peers.slice(1)){
   for(const month of item!.months)if(!first.months.some(existing=>existing.month===month.month))first.months.push(month);
   details.splice(details.indexOf(item!),1);
  }
 }
 const summary:TrendCalendarItem[]=[];
 for(const role of ['route','origin'] as const){
  const items=details.filter(item=>item.role===role);
  // Keep each country's school break visible beside its public holiday.
  const first=items[0],school=items.find(item=>item.kind==='school_break'),holiday=items.find(item=>item.kind==='public_holiday');
  summary.push(...[...new Set([first,school,holiday,...items].filter((item):item is TrendCalendarItem=>Boolean(item)))].slice(0,2));
 }
 return {summary,details};
}
