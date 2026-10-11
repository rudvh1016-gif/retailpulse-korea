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
 return {total:selected.flights.length,hours,buildings:buildingZoneCounts(whole),unverifiedBuilding:whole.unknownBuilding};
}
export function glanceCountryRanking(current:AirportFlightMonth|undefined,previous:AirportFlightMonth|undefined,scope:MonthScope){
 return destinationDailyChanges(current,previous,scope)
  .filter(row=>row.percent!==null&&Number.isFinite(row.percent)&&row.previous!==null&&row.previous>0&&row.current!==null)
  .sort((a,b)=>b.percent!-a.percent!||(b.current??0)-(a.current??0)||a.country.localeCompare(b.country)).slice(0,5);
}
