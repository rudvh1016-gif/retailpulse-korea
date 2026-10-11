import {getDb} from '../../../../db';
import {kstDayOf,shiftKstDay} from '../../../../lib/kst';
import {rollupsOf} from '../../../../lib/airport-monthly-store';
import {previousFlightMonth,type AirportMonthlyRollups} from '../../../../lib/airport-monthly-flights';
import {AIRPORT_SIDES_VERSION} from '../../../../lib/airport-sides';
import {DESTINATIONS_VERSION} from '../../../../lib/airport-destinations';
export const dynamic='force-dynamic';
/** A primary-key range reads <=63 compact JSON projections. Raw flights are
 * only aggregated in Actions; there is no visitor-triggered refresh. */
export async function readAirportMonths(db:Pick<D1Database,'prepare'>,month:string,today:string){
 const result=await db.prepare("SELECT day,json_extract(payload,'$.monthlyRollups') AS rollups,calculated_at AS calculatedAt FROM airport_daily_composition WHERE day>=? AND day<=? ORDER BY day DESC LIMIT 63")
  .bind(shiftKstDay(today,-62),today).all<{day:string;rollups:string|null;calculatedAt:string}>();
 if(result.success===false)throw Error('AIRPORT_MONTH_READ_FAILED');
 const rows=result.results??[];
 const prepared=rows.flatMap(row=>{try{const data=row.rollups?rollupsOf({monthlyRollups:JSON.parse(row.rollups)}):null;return data&&data.sidesVersion===AIRPORT_SIDES_VERSION&&data.destinationsVersion===DESTINATIONS_VERSION?[{data,calculatedAt:row.calculatedAt}]:[];}catch{return [];}});
 const current=prepared.find(row=>row.data.months.some(value=>value.month===month));
 const previous=prepared.find(row=>row.data.months.some(value=>value.month===previousFlightMonth(month)));
 const data:AirportMonthlyRollups|null=current?{...current.data,months:[current.data.months.find(value=>value.month===month)!,...(previous?[previous.data.months.find(value=>value.month===previousFlightMonth(month))!]:[])]}:null;
 const older=rows.flatMap(row=>{try{const value=JSON.parse(row.rollups??'null') as AirportMonthlyRollups|null;return value?.months?.some(item=>item.month===month)?[value]:[];}catch{return [];}})[0];
 return {status:data?'READY':older?'PENDING_UPDATE':'MISSING',month,calculatedAt:current?.data.preparedAt??null,
  lastPreparedAt:older?.preparedAt??null,months:[...new Set(prepared.flatMap(row=>row.data.months.map(value=>value.month)))].sort().reverse(),data,rowsRead:rows.length};
}
export async function GET(request:Request){
 const today=kstDayOf(new Date().toISOString()),month=new URL(request.url).searchParams.get('month')??today.slice(0,7);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return Response.json({status:'INVALID_SELECTION'},{status:400});
 try{const reply=await readAirportMonths((await getDb()).$client,month,today);return Response.json(reply,{headers:{'cache-control':reply.status==='READY'?'public, max-age=60, s-maxage=300':'no-store','x-robots-tag':'noindex'}});}
 catch{return Response.json({status:'UNAVAILABLE',month,months:[],data:null},{headers:{'cache-control':'no-store','x-robots-tag':'noindex'}});}
}
