/** Prepared by the existing collector, never by a visitor's Worker request. */
import { boardingAreaOf, gateSideOf } from './airport-sides';
import { destinationOf } from './airport-destinations';
import { lookupAirline } from './airline-country';
import { operatingDesignator, type AirlineRankingFlightRow } from './airline-ranking';
import type { ProfileRow } from './airport-day-profile';
import { shiftKstDay } from './kst';

export const AIRPORT_MONTH_VERSION = 1;
export const MONTH_SCOPES = ['ALL', 'T1', 'T2', 'CONCOURSE', 'UNKNOWN'] as const;
export type MonthScope = typeof MONTH_SCOPES[number];
export type MonthFlightRow = ProfileRow & AirlineRankingFlightRow;
export interface MonthCounts {
 total:number; sides:Record<'EAST'|'WEST'|'CENTER'|'UNVERIFIED',number>;
 airlines:Record<string,number>; registrationCountries:Record<string,number>; destinationCountries:Record<string,number>;
}
export interface AirportFlightMonth {
 month:string; from:string; through:string|null; eligibleDays:number; includedDays:string[];
 excludedDays:Array<{day:string;reason:'NO_RAW'|'NO_COMPLETION_EVIDENCE'|'LIMIT'}>;
 cancelled:number; airlineNames:Record<string,string|null>; scopes:Record<MonthScope,MonthCounts>;
}
export interface AirportMonthlyRollups {
 version:number; asOf:string; preparedAt?:string; sidesVersion:string; destinationsVersion:string; months:AirportFlightMonth[];
}
export function previousFlightMonth(month:string) {
 return new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7))-2,1)).toISOString().slice(0,7);
}
export function nextFlightMonth(month:string) {
 return new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1)).toISOString().slice(0,7);
}
const empty=():MonthCounts=>({total:0,sides:{EAST:0,WEST:0,CENTER:0,UNVERIFIED:0},airlines:{},registrationCountries:{},destinationCountries:{}});
const increment=(map:Record<string,number>,key:string|null|undefined)=>{const k=key||'UNKNOWN';map[k]=(map[k]??0)+1;};
/** Absence of a profile does not imply absence of raw records. A covering
 * successful post-day scan (or an existing complete profile) is still required.
 * "Complete" here witnesses the stored scan, not actual operations completeness. */
export function buildAirportFlightMonth(month:string,today:string,rows:readonly MonthFlightRow[],completeDays:ReadonlySet<string>,limitedDays:ReadonlySet<string>=new Set()):AirportFlightMonth {
 const from=month+'-01',end=shiftKstDay(nextFlightMonth(month)+'-01',-1),through=end<today?end:today>from?shiftKstDay(today,-1):null;
 const result:AirportFlightMonth={month,from,through,eligibleDays:0,includedDays:[],excludedDays:[],cancelled:0,airlineNames:{},scopes:Object.fromEntries(MONTH_SCOPES.map(scope=>[scope,empty()])) as Record<MonthScope,MonthCounts>};
 const byDay=new Map<string,Map<string,MonthFlightRow>>();
 for(const row of rows){const day=String(row.scheduledAt??'').slice(0,10),id=String(row.physicalFlightId??'');if(!id||day<from||!through||day>through)continue;
  const records=byDay.get(day)??new Map<string,MonthFlightRow>(),old=records.get(id);
  if(!old||row.retrievedAt>old.retrievedAt)records.set(id,row);byDay.set(day,records);
 }
 if(!through)return result;
 for(let day=from;day<=through;day=shiftKstDay(day,1)){
  result.eligibleDays++;const records=byDay.get(day);
  const reason=limitedDays.has(day)?'LIMIT':!records?.size?'NO_RAW':!completeDays.has(day)?'NO_COMPLETION_EVIDENCE':null;
  if(reason){result.excludedDays.push({day,reason});continue;}result.includedDays.push(day);
  for(const row of records!.values()){
   if(String(row.status??'')==='cancelled'){result.cancelled++;continue;}
   const area=boardingAreaOf(row),side=gateSideOf(area,row.gate);
   const airline=operatingDesignator(row.operatingFlight),registry=lookupAirline(airline),destination=destinationOf(row.airportCode==null?null:String(row.airportCode));
   result.airlineNames[airline??'UNKNOWN']=registry?.name??null;
   // T1 includes its concourse. The separate CONCOURSE scope remains visible;
   // it is never silently assigned to the east/west main-building denominator.
   const scopes:MonthScope[]=['ALL',area];if(area==='CONCOURSE')scopes.push('T1');
   for(const scope of scopes){const counts=result.scopes[scope];counts.total++;
    counts.sides[scope==='T1'&&area==='CONCOURSE'?'UNVERIFIED':side]++;
    increment(counts.airlines,airline);increment(counts.registrationCountries,registry?.country);increment(counts.destinationCountries,destination?.country);
   }
  }
 }
 return result;
}
/** A missing month/day is never a measured zero. */
export function monthlyMetric(current:AirportFlightMonth|undefined,previous:AirportFlightMonth|undefined,scope:MonthScope,key:(counts:MonthCounts)=>number){
 const value=(month:AirportFlightMonth|undefined)=>month?.includedDays.length?key(month.scopes[scope])/month.includedDays.length:null;
 const now=value(current),before=value(previous);
 return {current:now,previous:before,percent:now!==null&&before!==null&&before>0?(now/before-1)*100:null};
}
export function monthlyCategoryKeys(current:AirportFlightMonth|undefined,previous:AirportFlightMonth|undefined,scope:MonthScope,kind:'airlines'|'registrationCountries'|'destinationCountries') {
 return [...new Set([...Object.keys(current?.scopes[scope][kind]??{}),...Object.keys(previous?.scopes[scope][kind]??{})])]
  .sort((a,b)=>(current?.scopes[scope][kind][b]??0)-(current?.scopes[scope][kind][a]??0)||a.localeCompare(b));
}
