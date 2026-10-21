import {getDb} from '../../../../db';
import {kstDayOf} from '../../../../lib/kst';
import {readAirportMonthlyStats} from '../../../../lib/airport-monthly-stats-read';
import {CONTENT_API_ROBOTS_TAG} from '../../../../lib/crawl-policy';
export const dynamic='force-dynamic';
/** 15095071 / 15095070 official monthly passenger statistics for the newest
 * stored month at or before `month`, and the month before it. At most four
 * compact rows on a primary-key range; written only by the daily Actions
 * collector, so a visitor never triggers a provider request. */
export async function airportPassengerStatsResponse(request:Request,readStats:(month:string)=>ReturnType<typeof readAirportMonthlyStats>){
 const month=new URL(request.url).searchParams.get('month')??kstDayOf(new Date().toISOString()).slice(0,7);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return Response.json({status:'INVALID_SELECTION'},{status:400,headers:{'x-robots-tag':CONTENT_API_ROBOTS_TAG}});
 try{
  const read=await readStats(month);
  const status=read.month?'READY':'MISSING';
  return Response.json({status,requestedMonth:month,month:read.month,previousMonth:read.previousMonth,current:read.current,previous:read.previous},
   {headers:{'cache-control':status==='READY'?'public, max-age=300, s-maxage=3600':'no-store','x-robots-tag':CONTENT_API_ROBOTS_TAG}});
 }catch{return Response.json({status:'UNAVAILABLE',requestedMonth:month,month:null,previousMonth:null,current:{},previous:{}},{headers:{'cache-control':'no-store','x-robots-tag':CONTENT_API_ROBOTS_TAG}});}
}
export async function GET(request:Request){
 return airportPassengerStatsResponse(request,async month=>readAirportMonthlyStats((await getDb()).$client,month));
}
