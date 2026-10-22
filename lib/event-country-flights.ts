import {isExactDate} from './calendar-context.mjs';
import {monthlyMetric,type AirportFlightMonth} from './airport-monthly-flights';
import type {GlanceScope} from './airport-glance';

/** Already scoped/deduplicated by glanceFlights; never passenger or airline-nationality rows. */
export interface EventFlightContext {
 day:string;scope:GlanceScope;status:'READY'|'PARTIAL'|'LOADING'|'MISSING';
 countries:ReadonlyArray<{country:string|null;flights:number}>;
 baseline?:AirportFlightMonth;baselinePending?:boolean;
}
export function eventCountryFlights(context:EventFlightContext|undefined,country:string){
 const originContext=country==='KR';
 const validDay=Boolean(context&&isExactDate(context.day));
 const row=context?.countries.find(row=>row.country===country);
 const count=!originContext&&validDay&&context?.status==='READY'&&(row===undefined||Number.isSafeInteger(row.flights)&&row.flights>=0)?row?.flights??0:null;
 const baseline=context?.baseline,dates=baseline?.includedDays??[],month=baseline?.month??null;
 const validMonth=Boolean(month&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month));
 const expectedDays=validMonth?new Date(Date.UTC(Number(month!.slice(0,4)),Number(month!.slice(5)),0)).getUTCDate():0;
 const scope=context?.scope==='all'?'ALL':context?.scope;
 const counts=scope?baseline?.scopes[scope]:undefined;
 const validBaseline=!originContext&&validDay&&validMonth&&dates.length>0&&new Set(dates).size===dates.length&&dates.length<=expectedDays
  &&dates.every(date=>isExactDate(date)&&date.startsWith(`${month}-`)&&date<context!.day)
  &&counts&&Number.isSafeInteger(counts.destinationCountries[country]??0)&&(counts.destinationCountries[country]??0)>=0;
 // Keep the existing included-day denominator and absent-category=0 semantics.
 const mean=validBaseline?monthlyMetric(undefined,baseline,scope!,value=>value.destinationCountries[country]??0).previous:null;
 const delta=count!==null&&mean!==null?count-mean:null;
 return {country,originContext,count,month,mean,delta,percent:delta!==null&&mean!==null&&mean>0?delta/mean*100:null,
  days:validBaseline?dates.length:0,expectedDays,partial:validBaseline&&dates.length<expectedDays,
  start:validBaseline?[...dates].sort()[0]:null,end:validBaseline?[...dates].sort().at(-1):null};
}
