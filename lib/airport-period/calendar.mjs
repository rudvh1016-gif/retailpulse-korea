import {isExactDate} from '../calendar-context.mjs';
import {shift} from './analysis.mjs';

const sourceURL=value=>{try{return new URL(value).protocol==='https:';}catch{return false;}};
// Use the same reviewed/automatically refreshed facts as the preparation calendar.
// Flight observation dates never stand in for the calendar's verification date.
export function calendarEvents(calendar,asOf){
 if(!isExactDate(asOf)||!Array.isArray(calendar?.events))return [];
 return calendar.events.filter(e=>e.status==='verified'&&e.kind==='public_holiday'&&e.scope==='national'
  &&/^[A-Z]{2}$/.test(e.country)&&typeof e.name==='string'&&sourceURL(e.sourceURL)
  &&isExactDate(e.start)&&isExactDate(e.end)&&e.start<=e.end&&isExactDate(e.verifiedAt)&&e.verifiedAt<=asOf
  &&(!e.reviewValidUntil||(isExactDate(e.reviewValidUntil)&&e.reviewValidUntil>=asOf)));
}
export function periodCalendar(calendar,country,start,end,asOf){
 const events=calendarEvents(calendar,asOf).filter(e=>e.country===country&&e.start<=end&&e.end>=start);
 const dates=new Set(events.flatMap(e=>{
  const first=e.start<start?start:e.start,last=e.end>end?end:e.end;
  return Array.from({length:(Date.parse(last)-Date.parse(first))/86400000+1},(_,i)=>shift(first,i));
 }));
 const years=Array.from({length:Number(end.slice(0,4))-Number(start.slice(0,4))+1},(_,i)=>Number(start.slice(0,4))+i);
 const covered=years.every(year=>calendar?.calendarCoverage?.some(c=>c.country===country&&c.year===year&&c.scope==='national'&&isExactDate(c.verifiedAt)&&c.verifiedAt<=asOf));
 const source=calendar?.sources?.find(s=>s.country===country);
 const failed=['ERROR','STALE','NOT_COLLECTED','REVIEW_REQUIRED'].includes(source?.status)||calendar?.status==='UNAVAILABLE';
 // Positive last-good facts can survive a failed refresh; absence cannot become a negative claim.
 const status=events.length?'holiday':covered&&!failed?'no_holiday':'unknown';
 const workdays=[...new Set((calendar?.events??[]).filter(e=>e.country===country&&e.status==='verified'&&e.verifiedAt<=asOf
  &&(!e.reviewValidUntil||e.reviewValidUntil>=asOf)).flatMap(e=>e.makeupWorkdays??[]))].filter(d=>isExactDate(d)&&d>=start&&d<=end).sort();
 return {country,start,end,status,events,holidayDays:dates.size,workdays,refreshFailed:failed};
}
export function holidaySuggestions(calendar,rows,asOf){
 const groups=[];
 for(const event of calendarEvents(calendar,asOf).sort((a,b)=>a.start.localeCompare(b.start))){
  if(!rows.some(r=>r.country===event.country&&r.date>=event.start&&r.date<=event.end))continue;
  const previous=groups.findLast(g=>g.country===event.country);
  if(previous&&event.start<=shift(previous.end,1)){previous.end=event.end>previous.end?event.end:previous.end;previous.names.push(event.name);continue;}
  groups.push({country:event.country,start:event.start,end:event.end,names:[event.name]});
 }
 return groups.filter(g=>g.start!==g.end).sort((a,b)=>b.start.localeCompare(a.start)).slice(0,8).map(g=>{
  const span=(Date.parse(g.end)-Date.parse(g.start))/86400000+1,offset=Math.ceil(span/7)*7;
  return {...g,name:[...new Set(g.names)].join('·'),beforeStart:shift(g.start,-offset),beforeEnd:shift(g.end,-offset)};
 });
}
