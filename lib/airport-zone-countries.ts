import type {MapFlight} from './airport-departure-map';
export interface ZoneCountry {country:string|null;flights:number}
export function zoneCountries(flights:readonly MapFlight[]) {
  return (['WEST','CENTER','EAST','UNVERIFIED'] as const).map(side=>{
    const rows=flights.filter(f=>f.side===side);const counts=new Map<string|null,number>();
    for(const flight of rows){const key=flight.destination?.country??null;counts.set(key,(counts.get(key)??0)+1);}
    const countries=[...counts].map(([country,flights])=>({country,flights})).sort((a,b)=>b.flights-a.flights||(a.country??'').localeCompare(b.country??''));
    const known=countries.filter(row=>row.country!==null);
    const threshold=known[2]?.flights??0;
    return {side,total:rows.length,countries,unknown:countries.find(row=>row.country===null)?.flights??0,leaders:known.filter((row,index)=>index<3||row.flights===threshold)};
  });
}
