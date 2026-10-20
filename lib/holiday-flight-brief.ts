import {isExactDate} from './calendar-context.mjs';
import type {CalendarEvent} from './calendar-context.mjs';

/** Calendar dates describe a planning checkpoint, never a modelled return peak. */
export interface BriefHoliday {
 id:string;country:string;countryLabel:string;name:string;start:string;end:string;
 type:string;scope:string;conditional?:boolean;isRepresentative?:boolean;
 sourceURL?:string;verifiedAt?:string;reviewValidUntil?:string;
 calendarScope?:string;region?:string|null;
}
export interface CountryFlightChange {
 country:string;delta:number;count:number;mean:number;days:number;
}
export function mergeBriefHolidays(seed:readonly BriefHoliday[],events:readonly CalendarEvent[]|undefined,replacements:readonly {country:string;year:number;scope:string}[]=[]):BriefHoliday[]{
 if(!events)return [...seed];
 const kept=seed.filter(event=>!replacements.some(scope=>event.country===scope.country&&event.calendarScope===scope.scope&&Number(event.start.slice(0,4))===scope.year));
 const names=new Intl.DisplayNames(['ko'],{type:'region'});
 for(const event of events){
  if(event.status!=='verified'||event.kind!=='public_holiday')continue;
  if(kept.some(row=>row.country===event.country&&row.start===event.start&&row.end===event.end&&row.calendarScope===event.scope&&(!event.region||row.region===event.region)))continue;
  kept.push({id:event.id,country:event.country,countryLabel:names.of(event.country)??event.country,
   name:event.name,start:event.start,end:event.end,type:event.kind,scope:event.scope==='national'?'전국 공휴일':event.region??'적용 대상 확인 필요',
   calendarScope:event.scope,region:event.region,isRepresentative:true,conditional:false,
   sourceURL:event.sourceURL,verifiedAt:event.verifiedAt,reviewValidUntil:event.reviewValidUntil});
 }
 return kept;
}
function usable(event:BriefHoliday,asOf:string){
 return isExactDate(asOf)&&isExactDate(event.start)&&isExactDate(event.end)&&event.start<=event.end
  &&event.type==='public_holiday'&&event.isRepresentative!==false&&!event.conditional
  &&isExactDate(event.verifiedAt)&&event.verifiedAt!<=asOf
  &&(!event.reviewValidUntil||(isExactDate(event.reviewValidUntil)&&event.reviewValidUntil>=asOf))
  &&Boolean(event.sourceURL?.startsWith('https://'))&&/^[A-Z]{2}$/.test(event.country);
}
export function activeCountryHolidays(events:readonly BriefHoliday[],country:string,day:string,asOf:string){
 if(!isExactDate(day)||!isExactDate(asOf)||country==='KR')return [];
 return events.filter(event=>usable(event,asOf)&&event.country===country&&event.start<=day&&event.end>=day)
  .sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
}
/** Matching dates + observed route difference are association, not causal proof. */
export function flightHolidayContext(events:readonly BriefHoliday[],change:CountryFlightChange,day:string,asOf:string){
 if(![change.delta,change.count,change.mean,change.days].every(Number.isFinite)
  ||change.count<0||change.mean<=0||change.days<1)return null;
 const event=activeCountryHolidays(events,change.country,day,asOf)[0];
 if(!event)return null;
 const movement=change.delta>0?'출발편 증가':change.delta<0?'출발편 감소':'출발편은 비교 일평균과 같음';
 return {event,text:`${event.name} 기간과 맞물려 ${movement}.`,caution:'휴일과 겹치는 현상이며 증감 원인이 확인된 것은 아닙니다.'};
}
export function planningHolidays(events:readonly BriefHoliday[],start:string,end:string,asOf:string,routeCounts:ReadonlyMap<string,number>,limit=2){
 if(![start,end,asOf].every(isExactDate)||start>end)return [];
 const candidates=events.filter(event=>usable(event,asOf)&&event.country!=='KR'&&event.start<=end&&event.end>=start);
 candidates.sort((a,b)=>(routeCounts.get(b.countryLabel)??0)-(routeCounts.get(a.countryLabel)??0)||a.start.localeCompare(b.start));
 const countries=new Set<string>();
 return candidates.filter(event=>{if(countries.has(event.country))return false;countries.add(event.country);return true;}).slice(0,limit);
}
/** Only the officially known end date is a checkpoint; no invented +/- days. */
export function returnPlanningText(event:BriefHoliday){
 return `${Number(event.end.slice(5,7))}/${Number(event.end.slice(8))} ${event.name} 종료 · 귀국 준비: 인천→${event.countryLabel} 출발편 확인`;
}
export function endingHolidays(events:readonly BriefHoliday[],day:string,asOf:string,routeCounts:ReadonlyMap<string,number>,limit=2){
 return planningHolidays(events,day,day,asOf,routeCounts,events.length).filter(event=>event.end===day).slice(0,limit);
}
