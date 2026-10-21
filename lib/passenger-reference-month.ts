import {summarizePassengerForecast,type AirportForecastAggregateRow} from './airport-today-summary';
import {passengerReferenceSum} from './passenger-reference-sum';
import {datesBetween} from './airport-mtd';
import {isValidKstDay,shiftKstDay} from './kst';
import {nextFlightMonth,previousFlightMonth} from './airport-monthly-flights';
export type ReferenceScope='all'|'T1'|'T2';
export interface TransferReferenceRow {terminal:string;serviceDate:string;expectedTransferPassengers:number}
/** Complete service-date forecast pairs; "observed" means data availability,
 * not measured passenger actuals. Neither component is a flight count. */
export interface PassengerReferenceObservedDay {date:string;departures:number;transfers:number}
export interface PassengerReferenceMonth {month:string;start:string;end:string;expectedDays:number;completeDays:number;missingDates:string[];mean:number|null;status:'COMPLETE'|'PARTIAL'|'UNAVAILABLE';observedDays?:PassengerReferenceObservedDay[]}
/** Same arithmetic and same completeness definition as the selected day's display.
 * A previous-month mean is withheld until every calendar day has both components.
 * Missing transfer forecasts are not zero and departure actuals cannot replace forecasts. */
export function passengerReferenceMonth(month:string,forecast:AirportForecastAggregateRow[],transfers:TransferReferenceRow[],scope:ReferenceScope):PassengerReferenceMonth {
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!isValidKstDay(month+'-01'))throw new RangeError('Exact month required');
 const start=month+'-01',end=shiftKstDay(nextFlightMonth(month)+'-01',-1),days=datesBetween(start,end),missingDates:string[]=[];
 let total=0,completeDays=0;
 const observedDays:PassengerReferenceObservedDay[]=[];
 for(const day of days){
  const rows=forecast.filter(row=>row.targetDate===day&&row.direction==='departure'&&row.isAggregate===1&&(scope==='all'?['T1','T2'].includes(row.terminal):row.terminal===scope));
  // This reference never coerces an absent/invalid band to a zero passenger count.
  if(rows.some(row=>typeof row.expectedPassengers!=='number'||!Number.isSafeInteger(row.expectedPassengers)||row.expectedPassengers<0)){missingDates.push(day);continue;}
  const summary=summarizePassengerForecast(rows,day);
  const hall=scope==='all'?summary.total:summary.totalByTerminal[scope];
  const coverage=scope==='all'?summary.coverage.all:summary.coverage.byTerminal[scope];
  const sum=passengerReferenceSum(hall,coverage,day,scope,transfers);
  if(sum===null){missingDates.push(day);continue;}total+=sum.total;completeDays++;
  observedDays.push({date:day,departures:sum.hall,transfers:sum.transfer});
 }
 const complete=completeDays===days.length&&Number.isSafeInteger(total);
 // Keep the month-wide mean strict. The optional dated pairs separately prove
 // the numerator/denominator of an explicitly labelled observed-days reference.
 return {month,start,end,expectedDays:days.length,completeDays,missingDates,mean:complete?total/days.length:null,status:complete?'COMPLETE':completeDays?'PARTIAL':'UNAVAILABLE',observedDays};
}
/** Two bounded indexed reads, one per existing source. No providers, writes or new collection. */
export async function readPassengerReferenceMonth(db:Pick<D1Database,'prepare'>,month:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!isValidKstDay(month+'-01'))throw new RangeError('Exact month required');
 const days=datesBetween(month+'-01',shiftKstDay(nextFlightMonth(month)+'-01',-1));
 if(days.length<28||days.length>31)throw new RangeError('Invalid month');
 const [forecast,transfers]=await Promise.all([
  db.prepare(`SELECT terminal, direction, is_aggregate AS isAggregate, target_date AS targetDate,
   time_band_raw AS timeBandRaw, target_start_at AS targetStartAt, target_end_at AS targetEndAt,
   expected_passengers AS expectedPassengers, retrieved_at AS retrievedAt FROM airport_passenger_forecast
   WHERE direction='departure' AND is_aggregate=1 AND target_date IN (${days.map(()=>'?').join(',')})
   ORDER BY target_date,terminal,target_start_at LIMIT 1601`).bind(...days).all<AirportForecastAggregateRow>(),
  db.prepare(`SELECT terminal,service_date AS serviceDate,expected_transfer_passengers AS expectedTransferPassengers
   FROM airport_transfer_forecast WHERE service_date>=? AND service_date<=? AND quality_status='OFFICIAL_FORECAST'
   ORDER BY service_date,terminal LIMIT 63`).bind(days[0],days.at(-1)).all<TransferReferenceRow>(),
 ]);
 if(forecast.success===false||transfers.success===false||(forecast.results?.length??0)>1600||(transfers.results?.length??0)>62)throw new Error('REFERENCE_READ_INCOMPLETE');
 return Object.fromEntries((['all','T1','T2'] as const).map(scope=>[scope,passengerReferenceMonth(month,forecast.results??[],transfers.results??[],scope)])) as Record<ReferenceScope,PassengerReferenceMonth>;
}
export {previousFlightMonth};
