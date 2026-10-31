import {isValidKstDay,kstDayOf,shiftKstDay} from './kst';
import type {GlanceScope} from './airport-glance';
import type {ReferenceScope} from './passenger-reference-month';
type FlightTotals=Record<GlanceScope,number>|null;
export interface GlanceWeekReference {
 day:string;previousDay:string;
 passengers:Record<ReferenceScope,number|null>;
 flights:FlightTotals;selectedFlights:FlightTotals;
 /** A fully paginated current-day schedule scan, not a final operations count. */
 selectedFlightSnapshot?:{day:string;retrievedAt:string;provisional:true};
}
const count=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;

/** Two single-day counts, never daily-mean units. Both dates must be exact;
 * Historical baselines require a post-day scan. A witnessed current-day
 * schedule snapshot is provisional; matching displayed totals remain mandatory. */
export function glanceWeekChange(total:number|null,day:string,reference:GlanceWeekReference|null|undefined,scope:GlanceScope,kind:'people'|'flights',nowIso=new Date().toISOString()){
 if(!count(total)||!isValidKstDay(day)||reference?.day!==day||reference.previousDay!==shiftKstDay(day,-7))return null;
 if(kind==='flights'&&reference.selectedFlightSnapshot){
  const snapshot=reference.selectedFlightSnapshot,at=Date.parse(snapshot.retrievedAt),now=Date.parse(nowIso);
  if(!Number.isFinite(now)||snapshot.provisional!==true||snapshot.day!==day||kstDayOf(nowIso)!==day||!Number.isFinite(at)||at>now||kstDayOf(snapshot.retrievedAt)!==day)return null;
 }
 const previous=kind==='people'?reference.passengers?.[scope==='all'?'all':scope==='T2'?'T2':'T1']:reference.flights?.[scope];
 if(!count(previous)||(kind==='flights'&&reference.selectedFlights?.[scope]!==total))return null;
 const delta=total-previous;
 return {previous,delta,percent:previous>0?delta/previous*100:null};
}
