import {selectQueueRepresentatives} from './airport-queue-representatives';
import type {QueueHeatReading} from './airport-queue-heat';
import {departureMap,type MapFlightRow} from './airport-departure-map';
import {buildingZoneCounts} from './airport-zone-shares';
import {destinationDailyChanges} from './airport-destination-daily-changes';
import type {AirportFlightMonth,MonthScope} from './airport-monthly-flights';
export type GlanceScope='all'|'T1'|'T2';
export function glanceFlights(date:string,rows:readonly MapFlightRow[],scope:GlanceScope){
 const base={date,nextDate:date,window:{startMin:0,endMin:1440},rows};
 const whole=departureMap({...base,terminal:'T1',buildingScope:'all'});
 const selected=scope==='all'?whole:departureMap({...base,terminal:scope});
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
