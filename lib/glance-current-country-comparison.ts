import {isValidKstDay,kstDayOf} from './kst';
import {previousFlightMonth,type AirportFlightMonth,type MonthScope} from './airport-monthly-flights';
import type {GlanceScope} from './airport-glance';
import type {GlanceWeekReference} from './glance-week-comparison';
export interface CountryDayChange{country:string;previous:number;current:number;delta:number}
type DayCounts={total:number;countries:readonly {country:string|null;flights:number}[]};
const count=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
/** One witnessed current-day schedule snapshot versus prior-month included-day
 * means. Unknown destinations stay separate; an absent category is not zero
 * when that side contains unclassified records. Nothing is persisted. */
export function currentCountryComparison(day:string,data:DayCounts|null,previous:AirportFlightMonth|undefined,scope:GlanceScope,
 payload:{basis?:string;serviceDateKst?:string;retrievedAt?:string|null;truncated?:boolean}|null,
 reference:GlanceWeekReference|null|undefined,nowIso:string){
 const unavailable={status:'UNAVAILABLE' as const,rows:[] as CountryDayChange[],unknownCurrent:0,unknownPrevious:0,days:null as number|null,previousDays:previous?.includedDays.length??null,retrievedAt:null as string|null};
 const snapshot=reference?.selectedFlightSnapshot,at=Date.parse(payload?.retrievedAt??''),now=Date.parse(nowIso);
 if(!isValidKstDay(day)||!Number.isFinite(now)||kstDayOf(nowIso)!==day||!data||!count(data.total)
  ||payload?.basis!=='COLLECTED_FLIGHT_RECORDS'||payload.serviceDateKst!==day||payload.truncated!==false
  ||!Number.isFinite(at)||at>now||kstDayOf(payload.retrievedAt!)!==day
  ||reference?.day!==day||snapshot?.day!==day||snapshot.provisional!==true||Date.parse(snapshot.retrievedAt)!==at
  ||reference.selectedFlights?.[scope]!==data.total||previous?.month!==previousFlightMonth(day.slice(0,7)))return unavailable;
 const days=previous.includedDays,counts=previous.scopes[scope==='all'?'ALL':scope as MonthScope];
 if(!days.length||new Set(days).size!==days.length||!days.every(d=>isValidKstDay(d)&&d.startsWith(previous.month+'-')&&d<day)
  ||!counts||!count(counts.total)||!Object.values(counts.destinationCountries).every(count)
  ||Object.values(counts.destinationCountries).reduce((a,b)=>a+b,0)!==counts.total
  ||!data.countries.every(row=>count(row.flights))||new Set(data.countries.map(row=>row.country)).size!==data.countries.length
  ||data.countries.reduce((n,row)=>n+row.flights,0)!==data.total)return unavailable;
 const current=new Map(data.countries.map(row=>[row.country,row.flights])),unknownCurrent=current.get(null)??0,unknownPrevious=counts.destinationCountries.UNKNOWN??0;
 const countries=new Set([...current.keys()].filter((key):key is string=>key!==null&&key!=='UNKNOWN').concat(Object.keys(counts.destinationCountries).filter(key=>key!=='UNKNOWN')));
 const rows:CountryDayChange[]=[];
 for(const country of countries){const a=current.get(country),b=counts.destinationCountries[country];
  if((a===undefined&&unknownCurrent>0)||(b===undefined&&unknownPrevious>0))continue;
  const before=(b??0)/days.length,value=a??0;rows.push({country,previous:before,current:value,delta:value-before});
 }
 return {status:'READY' as const,rows,unknownCurrent,unknownPrevious,days:1,previousDays:days.length,retrievedAt:snapshot.retrievedAt};
}
