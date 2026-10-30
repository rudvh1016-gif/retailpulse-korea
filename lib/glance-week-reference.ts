import {isValidKstDay,shiftKstDay} from './kst';
import {summarizePassengerForecast,type AirportForecastAggregateRow} from './airport-today-summary';
import {passengerReferenceSum} from './passenger-reference-sum';
import {profileOf,type DayProfile} from './airport-day-profile';
import {AIRPORT_SIDES_VERSION} from './airport-sides';
import type {TransferReferenceRow} from './passenger-reference-month';
import type {GlanceScope} from './airport-glance';
export type {GlanceWeekReference} from './glance-week-comparison';
import type {GlanceWeekReference} from './glance-week-comparison';

type FlightTotals=Record<GlanceScope,number>|null;

const count=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;

/** Same physical, noncancelled departures as glanceFlights. T1 is the MAIN
 * building here, not airport-days' combined T1+concourse terminal total. */
export function completeGlanceProfile(payload:unknown,day:string):FlightTotals {
 const profile=profileOf(payload);
 if(!profile||profile.day!==day||profile.complete!==true||profile.sidesVersion!==AIRPORT_SIDES_VERSION||!count(profile.unknownBuilding))return null;
 for(const area of ['T1','CONCOURSE','T2'] as const){
  const row=profile[area];
  if(!row||!count(row.total)||!Array.isArray(row.hours)||row.hours.length!==24||!row.hours.every(count)
   ||row.hours.reduce((a,b)=>a+b,0)!==row.total||!Array.isArray(row.sides)||row.sides.length!==4
   ||!row.sides.every(count)||row.sides.reduce((a,b)=>a+b,0)!==row.total)return null;
 }
 const all=profile.T1.total+profile.CONCOURSE.total+profile.T2.total+profile.unknownBuilding;
 return count(all)?{all,T1:profile.T1.total,CONCOURSE:profile.CONCOURSE.total,T2:profile.T2.total}:null;
}

/** Three bounded, existing-table indexed reads. No provider, collection,
 * inferred history, actual-passenger substitution or storage write. */
export async function readGlanceWeekReference(db:Pick<D1Database,'prepare'>,day:string):Promise<GlanceWeekReference>{
 if(!isValidKstDay(day))throw new RangeError('Exact date required');
 const previousDay=shiftKstDay(day,-7);
 const [forecasts,transfers,profiles]=await Promise.all([
  db.prepare(`SELECT terminal,direction,is_aggregate AS isAggregate,target_date AS targetDate,
   time_band_raw AS timeBandRaw,target_start_at AS targetStartAt,target_end_at AS targetEndAt,
   expected_passengers AS expectedPassengers,retrieved_at AS retrievedAt FROM airport_passenger_forecast
   WHERE direction='departure' AND is_aggregate=1 AND target_date=? ORDER BY terminal,target_start_at LIMIT 65`)
   .bind(previousDay).all<AirportForecastAggregateRow>(),
  db.prepare(`SELECT terminal,service_date AS serviceDate,expected_transfer_passengers AS expectedTransferPassengers
   FROM airport_transfer_forecast WHERE service_date=? AND quality_status='OFFICIAL_FORECAST' ORDER BY terminal LIMIT 3`)
   .bind(previousDay).all<TransferReferenceRow>(),
  db.prepare("SELECT day,json_object('profile',json_extract(payload,'$.profile')) AS payload FROM airport_daily_composition WHERE day IN (?,?) ORDER BY day LIMIT 3")
   .bind(day,previousDay).all<{day:string;payload:string}>(),
 ]);
 if([forecasts,transfers,profiles].some(row=>row.success===false)||(forecasts.results?.length??0)>64
  ||(transfers.results?.length??0)>2||(profiles.results?.length??0)>2)throw new Error('WEEK_REFERENCE_READ_INCOMPLETE');
 const rows=forecasts.results??[],summary=summarizePassengerForecast(rows,previousDay);
 const passengers=Object.fromEntries((['all','T1','T2'] as const).map(scope=>{
  const scoped=rows.filter(row=>scope==='all'?['T1','T2'].includes(row.terminal):row.terminal===scope);
  const valid=scoped.every(row=>count(row.expectedPassengers));
  const total=scope==='all'?summary.total:summary.totalByTerminal[scope],coverage=scope==='all'?summary.coverage.all:summary.coverage.byTerminal[scope];
  return [scope,valid?passengerReferenceSum(total,coverage,previousDay,scope,transfers.results??[])?.total??null:null];
 })) as GlanceWeekReference['passengers'];
 const profile=(date:string)=>{
  const matches=(profiles.results??[]).filter(row=>row.day===date);
  if(matches.length!==1)return null;
  try{return completeGlanceProfile(JSON.parse(matches[0].payload) as {profile:DayProfile},date);}catch{return null;}
 };
 return {day,previousDay,passengers,flights:profile(previousDay),selectedFlights:profile(day)};
}
