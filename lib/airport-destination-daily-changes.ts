import {monthlyCategoryKeys,monthlyMetric,type AirportFlightMonth,type MonthScope} from './airport-monthly-flights';

/** Aircraft departures per actually included date; a missing month stays unavailable. */
export function destinationDailyChanges(current:AirportFlightMonth|undefined,previous:AirportFlightMonth|undefined,scope:MonthScope){
 return monthlyCategoryKeys(current,previous,scope,'destinationCountries').filter(country=>country!=='UNKNOWN').map(country=>{
  const pair=monthlyMetric(current,previous,scope,counts=>counts.destinationCountries[country]??0);
  const sides=Object.fromEntries((['EAST','CENTER','WEST','UNVERIFIED'] as const).map(side=>{
   const ready=(month:AirportFlightMonth|undefined)=>month?.scopes[scope].destinationSides?month:undefined;
   return [side,monthlyMetric(ready(current),ready(previous),scope,counts=>counts.destinationSides?.[country]?.[side]??0)];
  })) as Record<'EAST'|'CENTER'|'WEST'|'UNVERIFIED',ReturnType<typeof monthlyMetric>>;
  const delta=pair.current!==null&&pair.previous!==null?pair.current-pair.previous:null;
  const magnitude=Object.values(sides).reduce((sum,pair)=>sum+(pair.current!==null&&pair.previous!==null?Math.abs(pair.current-pair.previous):0),0);
  return {country,...pair,delta,sides,magnitude};
 }).sort((a,b)=>b.magnitude-a.magnitude||Math.abs(b.delta??0)-Math.abs(a.delta??0)||(b.current??0)-(a.current??0)||a.country.localeCompare(b.country));
}
