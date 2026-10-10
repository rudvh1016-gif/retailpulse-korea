import { AIRPORT_SIDES_VERSION } from './airport-sides';
import { DESTINATIONS_VERSION } from './airport-destinations';
import { profileOf } from './airport-day-profile';
import { sha256 } from './hash';
import { shiftKstDay } from './kst';
import { AIRPORT_MONTH_VERSION, buildAirportFlightMonth, previousFlightMonth, type AirportMonthlyRollups, type MonthFlightRow } from './airport-monthly-flights';

export interface AirportCompositionRecord {day:string;payload:string;sourceHash:string}
export interface CompletedScan {from:string;to:string;startedAt:string}
export const MONTH_RAW_LIMIT=40000;
/** Hash count semantics without letting provenance-only updates cause writes. */
export async function compositionHash(payload:Record<string,unknown>) {
 const {all,byTerminal,...rest}=payload as Record<string,unknown>&{all?:Record<string,unknown>;byTerminal?:Record<string,Record<string,unknown>>};
 return sha256({...rest,...(all?{all:{...all,retrievedAt:null}}:{}),...(byTerminal?{byTerminal:Object.fromEntries(Object.entries(byTerminal).map(([key,value])=>[key,{...value,retrievedAt:null}]))}:{})});
}
export function rollupsOf(payload:unknown):AirportMonthlyRollups|null {
 const rollups=(payload as {monthlyRollups?:AirportMonthlyRollups}|null)?.monthlyRollups;
 return rollups?.version===AIRPORT_MONTH_VERSION&&Array.isArray(rollups.months)?rollups:null;
}
/** Once per completed-date cutoff in the existing Actions job. Indexed retained
 * raw rows only, <=40,000 departures, no providers, new tables or cron. A
 * truncated range is rejected wholesale rather than published as a mean. */
export async function prepareAirportMonths(db:Pick<D1Database,'prepare'>,today:string,records:readonly AirportCompositionRecord[],scans:readonly CompletedScan[]) {
 const currentMonth=today.slice(0,7),priorMonth=previousFlightMonth(currentMonth);
 const parsed=records.flatMap(record=>{try{return [{...record,data:JSON.parse(record.payload) as Record<string,unknown>}];}catch{return [];}});
 const existing=parsed.map(record=>rollupsOf(record.data)).find(rollups=>rollups?.asOf===today&&rollups.sidesVersion===AIRPORT_SIDES_VERSION&&rollups.destinationsVersion===DESTINATIONS_VERSION);
 if(existing)return {status:'UNCHANGED' as const,records:0,rawRows:0};
 // An ordinary daily row remains the anchor. No synthetic date keys.
 const anchor=parsed.filter(record=>record.day<=today).sort((a,b)=>b.day.localeCompare(a.day))[0];
 if(!anchor)return {status:'NO_ANCHOR' as const,records:0,rawRows:0};
 const raw=await db.prepare(`SELECT physical_flight_id AS physicalFlightId,terminal,flight_number AS operatingFlight,
  retrieved_at AS retrievedAt,gate,scheduled_at AS scheduledAt,status,airport_code AS airportCode
  FROM airport_flights WHERE direction='departure' AND scheduled_at>=? AND scheduled_at<?
  AND physical_flight_id IS NOT NULL ORDER BY scheduled_at LIMIT 40001`).bind(priorMonth+'-01',today).all<MonthFlightRow>();
 if(raw.success===false)throw Error('AIRPORT_MONTH_SOURCE_READ_FAILED');
 const rows=raw.results??[];
 if(rows.length>MONTH_RAW_LIMIT)return {status:'LIMIT' as const,records:0,rawRows:rows.length};
 const complete=new Set(parsed.flatMap(record=>profileOf(record.data)?.complete?[record.day]:[]));
 for(let day=priorMonth+'-01';day<today;day=shiftKstDay(day,1)){
  const end=Date.parse(shiftKstDay(day,1)+'T00:00:00+09:00');
  if(scans.some(scan=>scan.from<=day&&scan.to>=day&&Date.parse(scan.startedAt)>=end))complete.add(day);
 }
 const monthlyRollups:AirportMonthlyRollups={version:AIRPORT_MONTH_VERSION,asOf:today,sidesVersion:AIRPORT_SIDES_VERSION,destinationsVersion:DESTINATIONS_VERSION,
  months:[currentMonth,priorMonth].map(month=>buildAirportFlightMonth(month,today,rows,complete))};
 const payload={...anchor.data,monthlyRollups},hash=await compositionHash(payload);
 const written=await db.prepare(`UPDATE airport_daily_composition SET payload=?,source_hash=?,calculated_at=? WHERE day=? AND source_hash<>?`)
  .bind(JSON.stringify(payload),hash,new Date().toISOString(),anchor.day,hash).run();
 return {status:'PREPARED' as const,records:Number(written.meta?.changes??0),rawRows:rows.length};
}
