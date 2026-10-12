import {selectQueueRepresentatives} from './airport-queue-representatives';
import type {QueueHeatReading} from './airport-queue-heat';
import {departureMap,type MapFlight,type MapFlightRow} from './airport-departure-map';
import {buildingZoneCounts} from './airport-zone-shares';
import {destinationDailyChanges} from './airport-destination-daily-changes';
import {monthlyMetric,previousFlightMonth,type AirportFlightMonth,type MonthScope} from './airport-monthly-flights';
export type GlanceScope='all'|'T1'|'CONCOURSE'|'T2';
export function glanceFlights(date:string,rows:readonly MapFlightRow[],scope:GlanceScope){
 const base={date,nextDate:date,window:{startMin:0,endMin:1440},rows};
 const whole=departureMap({...base,terminal:'T1',buildingScope:'all'});
 const selected=scope==='all'?whole:departureMap({...base,terminal:scope==='T2'?'T2':'T1',buildingScope:scope});
 const hours=Array<number>(24).fill(0),start=Date.parse(`${date}T00:00:00+09:00`);
 for(const flight of selected.flights){const hour=Math.floor((Date.parse(flight.scheduledAt)-start)/3_600_000);if(hour>=0&&hour<24)hours[hour]++;}
 const countryCounts=new Map<string|null,number>();
 for(const flight of selected.flights){const country=flight.destination?.country??null;countryCounts.set(country,(countryCounts.get(country)??0)+1);}
 const countries=[...countryCounts].map(([country,flights])=>({country,flights})).sort((a,b)=>b.flights-a.flights||(a.country??'').localeCompare(b.country??''));
 return {departures:selected.flights,countries,total:selected.flights.length,hours,buildings:buildingZoneCounts(whole),unverifiedBuilding:whole.unknownBuilding};
}
export function glanceCountryRanking(current:AirportFlightMonth|undefined,previous:AirportFlightMonth|undefined,scope:MonthScope){
 return destinationDailyChanges(current,previous,scope)
  .filter(row=>row.percent!==null&&Number.isFinite(row.percent)&&row.previous!==null&&row.previous>0&&row.current!==null)
  .sort((a,b)=>b.percent!-a.percent!||(b.current??0)-(a.current??0)||a.country.localeCompare(b.country)).slice(0,5);
}

/** Same freshness, duplicate and closed-reading contract as the detailed checkpoint view. */
export function glanceLongestWait(rows:QueueHeatReading[],now:number){
 const longest=selectQueueRepresentatives(rows.filter(row=>row.terminal==='T1'||row.terminal==='T2'),now).items[0];
 return longest&&longest.minutes>0?longest:null;
}
/** Published departure times only. The current partial hour excludes already elapsed flights. */
export function glanceUpcoming(date:string,flights:readonly {scheduledAt:string}[],now:number){
 const midnight=Date.parse(`${date}T00:00:00+09:00`);if(!Number.isFinite(now)||!Number.isFinite(midnight))return null;
 const hours=Array<number>(24).fill(0);
 for(const row of flights){const at=Date.parse(row.scheduledAt),hour=Math.floor((at-midnight)/3_600_000);if(at>=now&&hour>=0&&hour<24)hours[hour]++;}
 const maximum=Math.max(...hours);if(maximum===0)return null;
 const hour=hours.indexOf(maximum);return {startMin:Math.max(hour*60,Math.floor((now-midnight)/60_000)),endMin:(hour+1)*60,flights:maximum,tied:hours.filter(value=>value===maximum).length>1};
}

/** Whole selected-day departures versus the prior month's included-day mean, in the same scope. */
export function glanceDayComparison(day:string,total:number|null,previous:AirportFlightMonth|undefined,scope:MonthScope){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||previous?.month!==previousFlightMonth(day.slice(0,7))||total===null||!Number.isFinite(total)||total<0)return null;
 const mean=monthlyMetric(undefined,previous,scope,counts=>counts.total).previous;
 if(mean===null||!Number.isFinite(mean)||mean<=0)return null;
 return {mean,delta:total-mean,percent:(total/mean-1)*100,days:previous.includedDays.length};
}

/** Zone summary uses the first future window; next-day coverage is never invented. */
export function glanceFutureWindow(day:string,flights:readonly MapFlight[],now:number,hours:1|3|6){
 if(!Number.isFinite(now)||new Date(now+9*3_600_000).toISOString().slice(0,10)!==day)return null;
 const midnight=Date.parse(`${day}T00:00:00+09:00`),end=Math.min(now+hours*3_600_000,midnight+86_400_000);
 const selected=flights.filter(row=>{const at=Date.parse(row.scheduledAt);return at>=now&&at<end;});
 const buildings=buildingZoneCounts({flights:selected}),countries=new Map<string|null,number>();
 for(const row of selected){const code=row.destination?.country??null;countries.set(code,(countries.get(code)??0)+1);}
 const zones=(['T1','CONCOURSE','T2'] as const).flatMap(building=>(['WEST','CENTER','EAST'] as const).map(side=>({building,side,flights:buildings[building][side]})));
 const maximum=Math.max(0,...zones.map(row=>row.flights));
 return {start:now,end,clipped:end<now+hours*3_600_000,total:selected.length,buildings,leaders:zones.filter(row=>row.flights===maximum&&maximum>0).map(zone=>{
  const destinations=new Map<string|null,number>();for(const flight of selected){if(flight.building!==zone.building||flight.side!==zone.side)continue;const code=flight.destination?.country??null;destinations.set(code,(destinations.get(code)??0)+1);}
  return {...zone,share:zone.flights/selected.length*100,countries:[...destinations].map(([country,flights])=>({country,flights})).sort((a,b)=>b.flights-a.flights||(a.country??'').localeCompare(b.country??''))};
 }),unknownBuilding:selected.filter(row=>row.building==='UNKNOWN').length,countries:[...countries].map(([country,flights])=>({country,flights})).sort((a,b)=>b.flights-a.flights||(a.country??'').localeCompare(b.country??''))};
}

/** Adjacent equal-length windows in one verified day response; rank increases in flights, never percentages. */
export function glanceDestinationIncrease(day:string,flights:readonly MapFlight[]|null,now:number,hours:1|3|6,recordsReady:boolean){
 const midnight=Date.parse(`${day}T00:00:00+09:00`),middle=now+hours*3_600_000,end=now+2*hours*3_600_000;
 if(!recordsReady||flights===null||![1,3,6].includes(hours)||!Number.isFinite(now)||!Number.isFinite(midnight)||now<midnight||now>=midnight+86_400_000)return {status:'UNAVAILABLE' as const};
 if(end>midnight+86_400_000)return {status:'MIDNIGHT' as const};
 const counts=new Map<string|null,{before:number;after:number}>();let beforeTotal=0,afterTotal=0;
 for(const flight of flights){const at=Date.parse(flight.scheduledAt);if(!(at>=now&&at<end))continue;
  const country=flight.destination?.country??null,row=counts.get(country)??{before:0,after:0};
  if(at<middle){row.before++;beforeTotal++;}else{row.after++;afterTotal++;}counts.set(country,row);
 }
 const rows=[...counts].filter((entry):entry is [string,{before:number;after:number}]=>entry[0]!==null).map(([country,counts])=>({country,...counts,delta:counts.after-counts.before})).sort((a,b)=>b.delta-a.delta||b.after-a.after||a.country.localeCompare(b.country));
 const maximum=Math.max(0,...rows.map(row=>row.delta)),unknown=counts.get(null)??{before:0,after:0};
 return {status:'READY' as const,start:now,middle,end,beforeTotal,afterTotal,rows,leaders:rows.filter(row=>row.delta===maximum&&maximum>0),unknown};
}
