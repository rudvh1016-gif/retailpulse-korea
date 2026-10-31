import {isValidKstDay,shiftKstDay} from './kst';
import type {GlanceScope} from './airport-glance';
import type {ReferenceScope} from './passenger-reference-month';
type FlightTotals=Record<GlanceScope,number>|null;
export interface GlanceWeekReference {
 day:string;previousDay:string;
 passengers:Record<ReferenceScope,number|null>;
 flights:FlightTotals;selectedFlights:FlightTotals;
}
const count=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;

/** Two single-day counts, never daily-mean units. Both dates must be exact;
 * historical flight completion and matching displayed totals are mandatory. */
export function glanceWeekChange(total:number|null,day:string,reference:GlanceWeekReference|null|undefined,scope:GlanceScope,kind:'people'|'flights'){
 if(!count(total)||!isValidKstDay(day)||reference?.day!==day||reference.previousDay!==shiftKstDay(day,-7))return null;
 const previous=kind==='people'?reference.passengers?.[scope==='all'?'all':scope==='T2'?'T2':'T1']:reference.flights?.[scope];
 if(!count(previous)||(kind==='flights'&&reference.selectedFlights?.[scope]!==total))return null;
 const delta=total-previous;
 return {previous,delta,percent:previous>0?delta/previous*100:null};
}
