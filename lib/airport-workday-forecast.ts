import { minutesOf, type BusinessHours, type PrepTerminal } from './business-hours';
import { kstDay } from './demand-presentation';

const HOUR=3_600_000;
type Hour={targetStartAt:string;targetEndAt:string;expectedPassengers:number};
type ForecastSummary={serviceDateKst:string;airport:{
 serviceDateKst:string|null;
 forecastCoverage?:{byTerminal?:Record<string,string>};
 passengerForecastTimelineByTerminal?:Record<string,readonly Hour[]>;
}};

export function tomorrowKst(now:string):string|null {
 const time=Date.parse(now);
 return Number.isFinite(time)?kstDay(time+24*HOUR):null;
}

/** COMPLETE A5 departures, same terminal/date, with all intersecting whole bands represented. */
export function forecastForTomorrowShift(day:string,terminal:PrepTerminal,hours:BusinessHours,summary?:ForecastSummary|null){
 if(summary?.serviceDateKst!==day||summary.airport.serviceDateKst!==day
  ||summary.airport.forecastCoverage?.byTerminal?.[terminal]!=='COMPLETE')return null;
 const midnight=Date.parse(day+'T00:00:00+09:00'),open=minutesOf(hours.open),close=minutesOf(hours.close);
 if(!Number.isFinite(midnight)||open===null||close===null||close<open)return null;
 const startHour=open===close?0:Math.floor(open/60),endHour=open===close?24:Math.ceil(close/60);
 if(endHour-startHour<2)return null;
 const timeline=summary.airport.passengerForecastTimelineByTerminal?.[terminal];
 if(!Array.isArray(timeline))return null;
 const bands=new Map<number,Hour>();
 for(const band of timeline){
  if(!band||typeof band.targetStartAt!=='string'||typeof band.targetEndAt!=='string')return null;
  const start=Date.parse(band.targetStartAt),end=Date.parse(band.targetEndAt),hour=(start-midnight)/HOUR;
  if(!(start<midnight+endHour*HOUR&&end>midnight+startHour*HOUR))continue;
  if(!Number.isInteger(hour)||hour<startHour||hour>=endHour||end-start!==HOUR||bands.has(hour)
   ||!Number.isFinite(band.expectedPassengers)||band.expectedPassengers<0)return null;
  bands.set(hour,band);
 }
 const ranked:Hour[]=[];
 for(let hour=startHour;hour<endHour;hour++){
  const band=bands.get(hour);
  if(!band)return null;
  ranked.push(band);
 }
 const counts=ranked.map(band=>band.expectedPassengers),most=Math.max(...counts),least=Math.min(...counts);
 if(most===least)return null;
 return {busiest:ranked.filter(band=>band.expectedPassengers===most),quietest:ranked.filter(band=>band.expectedPassengers===least)};
}
