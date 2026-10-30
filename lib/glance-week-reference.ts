import {isValidKstDay,kstDayOf,shiftKstDay} from './kst';
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
function glanceProfileTotals(payload:unknown,day:string,requireEndedDay:boolean):FlightTotals {
 const profile=profileOf(payload);
 if(!profile||profile.day!==day||typeof profile.complete!=='boolean'||(requireEndedDay&&profile.complete!==true)||profile.sidesVersion!==AIRPORT_SIDES_VERSION||!count(profile.unknownBuilding))return null;
 for(const area of ['T1','CONCOURSE','T2'] as const){
  const row=profile[area];
  if(!row||!count(row.total)||!Array.isArray(row.hours)||row.hours.length!==24||!row.hours.every(count)
   ||row.hours.reduce((a,b)=>a+b,0)!==row.total||!Array.isArray(row.sides)||row.sides.length!==4
   ||!row.sides.every(count)||row.sides.reduce((a,b)=>a+b,0)!==row.total)return null;
 }
 const all=profile.T1.total+profile.CONCOURSE.total+profile.T2.total+profile.unknownBuilding;
 return count(all)?{all,T1:profile.T1.total,CONCOURSE:profile.CONCOURSE.total,T2:profile.T2.total}:null;
}

export function completeGlanceProfile(payload:unknown,day:string):FlightTotals {
 return glanceProfileTotals(payload,day,true);
}
interface CurrentScanRow {startedAt:string;finishedAt:string|null;status:string;detail:string|null;healthStatus:string;healthRetrievedAt:string|null}
/** SUCCESS belongs only to the verified all-page scan. Legacy first-page
 * successes, partial/failed refreshes, old clocks and incomplete storage fail closed. */
export function currentGlanceSnapshot(payload:unknown,day:string,row:CurrentScanRow|undefined,nowIso:string){
 if(!Number.isFinite(Date.parse(nowIso))||day!==kstDayOf(nowIso)||!row||row.status!=='SUCCESS'||row.healthStatus!=='LIVE'||row.healthRetrievedAt!==row.startedAt)return null;
 const started=Date.parse(row.startedAt),finished=Date.parse(row.finishedAt??''),now=Date.parse(nowIso);
 if(!Number.isFinite(started)||!Number.isFinite(finished)||started>finished||finished>now||kstDayOf(row.startedAt)!==day)return null;
 const detail=typeof row.detail==='string'?row.detail:'',range=/^recent (\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2});/.exec(detail);
 const physical=/; today unique physical (\d+);/.exec(detail),expected=physical?Number(physical[1]):null;
 if(!range||!isValidKstDay(range[1])||range[1]>day||range[2]!==day||!count(expected)||expected===0||expected>1200)return null;
 const totals=glanceProfileTotals(payload,day,false),profile=profileOf(payload);
 if(!totals||!profile||!count(profile.cancelled)||totals.all+profile.cancelled!==expected)return null;
 return {totals,snapshot:{day,retrievedAt:row.startedAt,provisional:true as const}};
}

/** Three bounded existing-table reads, plus one indexed scan/health witness for
 * today only. No provider, inferred history, collection or storage write. */
export async function readGlanceWeekReference(db:Pick<D1Database,'prepare'>,day:string,nowIso=new Date().toISOString()):Promise<GlanceWeekReference>{
 if(!isValidKstDay(day))throw new RangeError('Exact date required');
 const previousDay=shiftKstDay(day,-7),isToday=day===kstDayOf(nowIso);
 const [forecasts,transfers,profiles,scan]=await Promise.all([
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
  isToday?Promise.resolve().then(()=>db.prepare(`SELECT c.started_at AS startedAt,c.finished_at AS finishedAt,c.status,c.detail,
   h.status AS healthStatus,h.last_retrieved_at AS healthRetrievedAt FROM collector_runs c
   JOIN source_health h ON h.source_id=c.source_id WHERE c.source_id='INCHEON_FLIGHT_DETAIL'
   AND c.started_at>=? AND c.started_at<=? ORDER BY c.started_at DESC LIMIT 1`)
   .bind(new Date(`${day}T00:00:00+09:00`).toISOString(),nowIso).all<CurrentScanRow>()).catch(()=>({success:false,results:[] as CurrentScanRow[]})):Promise.resolve(null),
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
 const payload=(date:string)=>{
  const matches=(profiles.results??[]).filter(row=>row.day===date);
  if(matches.length!==1)return null;
  try{return JSON.parse(matches[0].payload) as {profile:DayProfile};}catch{return null;}
 };
 const selectedPayload=payload(day),completed=completeGlanceProfile(selectedPayload,day);
 const current=isToday&&scan?.success!==false&&(scan?.results?.length??0)<=1?currentGlanceSnapshot(selectedPayload,day,scan?.results?.[0],nowIso):null;
 return {day,previousDay,passengers,flights:completeGlanceProfile(payload(previousDay),previousDay),
  selectedFlights:isToday?current?.totals??null:day<kstDayOf(nowIso)?completed:null,
  ...(current?{selectedFlightSnapshot:current.snapshot}:{})};
}
