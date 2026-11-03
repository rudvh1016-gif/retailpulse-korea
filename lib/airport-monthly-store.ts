import { AIRPORT_SIDES_VERSION } from './airport-sides';
import { DESTINATIONS_VERSION } from './airport-destinations';
import { dailyFlightProfile, profileOf, type DayProfile } from './airport-day-profile';
import { verifiedHalfHours } from './airport-flight-hours';
import { sha256 } from './hash';
import { isValidKstDay,shiftKstDay } from './kst';
import { AIRPORT_MONTH_VERSION, buildAirportFlightMonth, previousFlightMonth, type AirportMonthlyRollups, type MonthFlightRow } from './airport-monthly-flights';

export interface AirportCompositionRecord {day:string;payload:string;sourceHash:string}
export interface CompletedScan {from:string;to:string;startedAt:string}
export const MONTH_RAW_LIMIT=40000;
export const SHIFT_PROFILE_VERSION=1;
/** Hash count semantics without letting provenance-only updates cause writes. */
export async function compositionHash(payload:Record<string,unknown>) {
 const {all,byTerminal,...rest}=payload as Record<string,unknown>&{all?:Record<string,unknown>;byTerminal?:Record<string,Record<string,unknown>>};
 return sha256({...rest,...(all?{all:{...all,retrievedAt:null}}:{}),...(byTerminal?{byTerminal:Object.fromEntries(Object.entries(byTerminal).map(([key,value])=>[key,{...value,retrievedAt:null}]))}:{})});
}
export function rollupsOf(payload:unknown):AirportMonthlyRollups|null {
 const rollups=(payload as {monthlyRollups?:AirportMonthlyRollups}|null)?.monthlyRollups;
 return rollups?.version===AIRPORT_MONTH_VERSION&&Array.isArray(rollups.months)?rollups:null;
}
/** v1's included dates remain completion witnesses when upgrading to cross counts.
 * None of its counts or marginal totals are reused. */
export function monthlyCompletionDays(payload:unknown):string[]{
 const rollups=(payload as {monthlyRollups?:AirportMonthlyRollups}|null)?.monthlyRollups;
 if(!rollups||![1,AIRPORT_MONTH_VERSION].includes(rollups.version)||!Array.isArray(rollups.months)||!isValidKstDay(rollups.asOf))return [];
 return rollups.months.flatMap(month=>Array.isArray(month.includedDays)?month.includedDays.filter(day=>isValidKstDay(day)&&day.startsWith(month.month+'-')&&day<rollups.asOf):[]);
}
async function runPreparationWrite(statement:D1PreparedStatement,scope:'SHIFT_PROFILE'|'MONTH',confirmedWrites:number){
 let result:D1Result;
 try {result=await statement.run();}
 catch {
  // A rejected response does not prove whether this statement committed. Only
  // earlier confirmed writes are counted; a retry must reread the stored rows.
  // Do not retain the adapter error/cause, which may contain response secrets.
  throw Error(`AIRPORT_${scope}_WRITE_FAILED_AFTER_${confirmedWrites}_OUTCOME_UNKNOWN`);
 }
 if(result.success===false)throw Error(`AIRPORT_${scope}_WRITE_FAILED_AFTER_${confirmedWrites}`);
 return result;
}
/** Once per completed-date cutoff in the existing Actions job. Indexed retained
 * raw rows only, <=40,000 departures, no providers, new tables or cron. A
 * truncated range is rejected wholesale rather than published as a mean. */
export async function prepareAirportMonths(db:Pick<D1Database,'prepare'>,today:string,records:readonly AirportCompositionRecord[],scans:readonly CompletedScan[]) {
 const currentMonth=today.slice(0,7),priorMonth=previousFlightMonth(currentMonth);
 const parsed=records.flatMap(record=>{try{return [{...record,data:JSON.parse(record.payload) as Record<string,unknown>}];}catch{return [];}});
 const existing=parsed.map(record=>rollupsOf(record.data)).find(rollups=>rollups?.asOf===today&&rollups.sidesVersion===AIRPORT_SIDES_VERSION&&rollups.destinationsVersion===DESTINATIONS_VERSION&&rollups.shiftProfileVersion===SHIFT_PROFILE_VERSION);
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
 // A previously prepared included day retains its scan witness when the
 // bounded recent-run list ages out. Only that witness is reused: raw rows
 // and counts are always folded again under the current classification.
 const complete=new Set(parsed.flatMap(record=>[
  ...(profileOf(record.data)?.complete&&profileOf(record.data)?.day===record.day?[record.day]:[]),
  ...monthlyCompletionDays(record.data),
 ]));
 for(let day=priorMonth+'-01';day<today;day=shiftKstDay(day,1)){
  const end=Date.parse(shiftKstDay(day,1)+'T00:00:00+09:00');
  if(scans.some(scan=>scan.from<=day&&scan.to>=day&&Date.parse(scan.startedAt)>=end))complete.add(day);
 }
 // The daily collector rebuilds only 0..28 days. Reuse this already-bounded
 // monthly read for older existing profiles, without reading raw flights again
 // or creating synthetic days. Attach precision only when every existing
 // profile field still matches the raw reconstruction; otherwise keep the
 // original summary/profile intact and withhold that day's finer comparison.
 const byDay=new Map<string,MonthFlightRow[]>();
 for(const row of rows){const day=String(row.scheduledAt??'').slice(0,10);const found=byDay.get(day)??[];found.push(row);byDay.set(day,found);}
 const withoutPrecision=(profile:DayProfile)=>({...profile,...Object.fromEntries((['T1','T2','CONCOURSE'] as const).map(area=>{
  const rest={...profile[area]};delete rest.halfHours;return [area,rest];
 }))});
 let profileWrites=0;
 for(const record of parsed){
  const old=profileOf(record.data),dayRows=byDay.get(record.day);
  if(record.day<priorMonth+'-01'||record.day>=today||!complete.has(record.day)
   ||!old||old.day!==record.day||old.complete!==true||old.sidesVersion!==AIRPORT_SIDES_VERSION)continue;
  if(await compositionHash(record.data)!==record.sourceHash)continue;
  // With no raw rows, only an already-complete, fully zero profile can match
  // this reconstruction. Absence alone never creates a measured zero day.
  const fresh=dailyFlightProfile(dayRows??[],record.day,true);
  if(!(['T1','T2','CONCOURSE'] as const).every(area=>verifiedHalfHours(fresh[area]))
   ||await sha256(withoutPrecision(old))!==await sha256(withoutPrecision(fresh)))continue;
  const profile={...old,...Object.fromEntries((['T1','T2','CONCOURSE'] as const).map(area=>[area,{...old[area],halfHours:fresh[area].halfHours}]))};
  const data={...record.data,profile},hash=await compositionHash(data);
  if(hash===record.sourceHash)continue;
  const upgraded=await runPreparationWrite(db.prepare(`UPDATE airport_daily_composition SET payload=?,source_hash=?,calculated_at=? WHERE day=? AND source_hash=?`)
   .bind(JSON.stringify(data),hash,new Date().toISOString(),record.day,record.sourceHash),'SHIFT_PROFILE',profileWrites);
  const changes=Number(upgraded.meta?.changes??0);
  if(changes===0)return {status:'CONFLICT' as const,records:profileWrites,rawRows:rows.length};
  profileWrites+=changes;record.data=data;record.payload=JSON.stringify(data);record.sourceHash=hash;
 }
 const monthlyRollups:AirportMonthlyRollups={version:AIRPORT_MONTH_VERSION,shiftProfileVersion:SHIFT_PROFILE_VERSION,asOf:today,preparedAt:new Date().toISOString(),sidesVersion:AIRPORT_SIDES_VERSION,destinationsVersion:DESTINATIONS_VERSION,
  months:[currentMonth,priorMonth].map(month=>buildAirportFlightMonth(month,today,rows,complete))};
 const payload={...anchor.data,monthlyRollups},hash=await compositionHash(payload);
 const written=await runPreparationWrite(db.prepare(`UPDATE airport_daily_composition SET payload=?,source_hash=?,calculated_at=? WHERE day=? AND source_hash<>? AND source_hash=?`)
  .bind(JSON.stringify(payload),hash,new Date().toISOString(),anchor.day,hash,anchor.sourceHash),'MONTH',profileWrites);
 if(Number(written.meta?.changes??0)===0)return {status:'CONFLICT' as const,records:profileWrites,rawRows:rows.length};
 return {status:'PREPARED' as const,records:profileWrites+Number(written.meta?.changes??0),rawRows:rows.length};
}
