import {departureMap,type MapFlightRow} from './airport-departure-map';
import {lookupAirline} from './airline-country';
import {mainBuildingMonth} from './airport-monthly-building';
import {MONTH_SCOPES,type AirportFlightMonth,type MonthCounts,type MonthScope} from './airport-monthly-flights';
import {currentCountryComparison} from './glance-current-country-comparison';
import type {GlanceWeekReference} from './glance-week-comparison';
import {isValidKstDay} from './kst';
import {destinationDailyChanges} from './airport-destination-daily-changes';

const empty=():MonthCounts=>({total:0,sides:{EAST:0,WEST:0,CENTER:0,UNVERIFIED:0},airlines:{},registrationCountries:{},destinationCountries:{},destinationSides:{}});
const add=(map:Record<string,number>,key:string|null)=>{const code=key||'UNKNOWN';map[code]=(map[code]??0)+1;};
const integer=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
function validCounts(counts:MonthCounts|undefined){
 if(!counts||!integer(counts.total)||!counts.sides||!(['EAST','WEST','CENTER','UNVERIFIED'] as const).every(side=>integer(counts.sides[side]))
  ||![counts.sides,counts.airlines,counts.registrationCountries,counts.destinationCountries].every(values=>values&&Object.values(values).every(integer)&&Object.values(values).reduce((a,b)=>a+b,0)===counts.total))return false;
 if(counts.destinationSides){
  for(const [country,total] of Object.entries(counts.destinationCountries)){
   const cross=counts.destinationSides[country];
   if(total>0&&(!cross||!Object.values(cross).every(integer)||Object.values(cross).reduce((a,b)=>a+b,0)!==total))return false;
  }
  for(const side of ['EAST','WEST','CENTER','UNVERIFIED'] as const){
   const values=Object.values(counts.destinationSides).map(cross=>cross[side]);
   if(!values.every(integer)||values.reduce((a,b)=>a+b,0)!==counts.sides[side])return false;
  }
 }
 return true;
}
/** A display-only one-day period. Never persists or marks today's month closed.
 * All scopes must match the same fully paginated snapshot used by the home. */
export function currentFlightPeriod(day:string,payload:{basis?:string;serviceDateKst?:string;retrievedAt?:string|null;truncated?:boolean;flights:readonly MapFlightRow[]}|null,reference:GlanceWeekReference|null|undefined,previous:AirportFlightMonth|undefined,nowIso:string){
 if(!isValidKstDay(day)||!payload||!Array.isArray(payload.flights)||!previous||!Array.isArray(previous.includedDays)||!Array.isArray(previous.excludedDays)
  ||previous.from!==previous.month+'-01'||!previous.through||!isValidKstDay(previous.through)||!previous.through.startsWith(previous.month+'-')
  ||previous.eligibleDays!==(Date.parse(previous.through)-Date.parse(previous.from))/86400000+1
  ||previous.includedDays.length+previous.excludedDays.length!==previous.eligibleDays
  ||!previous.airlineNames||!integer(previous.cancelled)||!previous.scopes||!MONTH_SCOPES.every(scope=>validCounts(previous.scopes[scope])))return null;
 const coverage=[...previous.includedDays,...previous.excludedDays.map(row=>row?.day)];
 if(new Set(coverage).size!==previous.eligibleDays||!coverage.every(date=>isValidKstDay(date)&&date>=previous.from&&date<=previous.through!))return null;
 const map=departureMap({date:day,nextDate:day,terminal:'T1',buildingScope:'all',window:{startMin:0,endMin:1440},rows:payload.flights});
 const period:AirportFlightMonth={month:day.slice(0,7),from:day,through:day,eligibleDays:1,includedDays:[day],excludedDays:[],cancelled:map.cancelled,airlineNames:{},scopes:Object.fromEntries(MONTH_SCOPES.map(scope=>[scope,empty()])) as Record<MonthScope,MonthCounts>};
 for(const flight of map.flights){
  const airline=flight.airline,registry=lookupAirline(airline),country=flight.destination?.country??null;
  period.airlineNames[airline??'UNKNOWN']=registry?.name??null;
  const scopes:MonthScope[]=['ALL',flight.building];if(flight.building==='CONCOURSE')scopes.push('T1');
  for(const scope of scopes){
   const counts=period.scopes[scope],side=scope==='T1'&&flight.building==='CONCOURSE'?'UNVERIFIED':flight.side;
   counts.total++;counts.sides[side]++;add(counts.airlines,airline);add(counts.registrationCountries,registry?.country??null);add(counts.destinationCountries,country);
   const cross=counts.destinationSides![country??'UNKNOWN']??={EAST:0,WEST:0,CENTER:0,UNVERIFIED:0};cross[side]++;
  }
 }
 const currentMain=mainBuildingMonth(period),previousMain=mainBuildingMonth(previous);
 if(!currentMain||!previousMain)return null;
 const comparableCountries={} as Record<'ALL'|'T1'|'T2'|'CONCOURSE',string[]>;
 for(const scope of ['ALL','T1','T2','CONCOURSE'] as const){
  const counts=currentMain.scopes[scope],before=previousMain.scopes[scope];
  if(!validCounts(counts)||!validCounts(before))return null;
  const countries=Object.entries(counts.destinationCountries).map(([country,flights])=>({country:country==='UNKNOWN'?null:country,flights}));
  const comparison=currentCountryComparison(day,{total:counts.total,countries},previousMain,scope==='ALL'?'all':scope,payload,reference,nowIso);
  if(comparison.status!=='READY')return null;
  comparableCountries[scope]=comparison.rows.map(row=>row.country);
 }
 return {period,collectedAt:payload.retrievedAt!,comparableCountries};
}

/** Keep every observed country in the full detail list. Unclassified records
 * prevent an absent country from becoming an invented zero in either period. */
export function currentDestinationChanges(current:AirportFlightMonth|undefined,previous:AirportFlightMonth|undefined,scope:MonthScope){
 return destinationDailyChanges(current,previous,scope).map(row=>{
  const missing=(period:AirportFlightMonth|undefined)=>period?.scopes[scope].destinationCountries[row.country]===undefined&&(period?.scopes[scope].destinationCountries.UNKNOWN??0)>0;
  const a=missing(current),b=missing(previous);
  if(!a&&!b)return row;
  const sides=Object.fromEntries(Object.entries(row.sides).map(([key,value])=>[key,{...value,current:a?null:value.current,previous:b?null:value.previous,percent:null}])) as typeof row.sides;
  return {...row,current:a?null:row.current,previous:b?null:row.previous,percent:null,delta:null,sides};
 });
}
