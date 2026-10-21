import reviewed from '../data/korean-school-vacations.json';
import {isExactDate,isExactMonth,matchCalendarContext,type CalendarEvent} from './calendar-context.mjs';

export type KoreanVacationQuery = {asOf:string;country?:string} & (
 | {day:string;selectedMonth?:never;actualDataMonths?:never}
 | {day?:never;selectedMonth:string;actualDataMonths:readonly string[]}
);
export const KOREAN_VACATION_CAUTION='한국 방학 기간, 해외여행 수요 참고 · 학교별 일정 상이; 증가 원인 확정 아님';

/** One reviewed school's example, NOT nationwide vacation coverage or a
 * Korean-nationality passenger series. Fixed civil dates never recur yearly.
 * No match means unknown/unmatched, never evidence that all schools are open. */
export function koreanSchoolVacations(query:KoreanVacationQuery,events:readonly CalendarEvent[]=reviewed.events as CalendarEvent[]){
 if(!isExactDate(query.asOf))return [];
 if(query.country!==undefined&&(!/^[A-Z]{2}$/.test(query.country)||['KR','OTHER'].includes(query.country)))return [];
 const day=query.day;
 if(day!==undefined&&!isExactDate(day))return [];
 const month=day?.slice(0,7)??query.selectedMonth;
 const actualDataMonths=day?[month!]:query.actualDataMonths;
 if(!isExactMonth(month)||!actualDataMonths?.every(isExactMonth))return [];
 const schools=events.filter(event=>event.country==='KR'&&event.kind==='school_break'&&event.scope!=='national');
 const matches=matchCalendarContext(schools,{country:query.country??'KR',selectedMonth:month,actualDataMonths,asOf:query.asOf,includeOriginContext:true,includePreviousMonth:day===undefined,kind:'school_break'}).details;
 return (day?matches.filter(item=>item.start<=day&&item.end>=day):matches).map(item=>({...item,name:schools.find(event=>event.id===item.eventId)!.name}));
}
