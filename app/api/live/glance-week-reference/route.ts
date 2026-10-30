import {getDb} from '../../../../db';
import {isValidKstDay,kstDayOf} from '../../../../lib/kst';
import {readGlanceWeekReference} from '../../../../lib/glance-week-reference';
export const dynamic='force-dynamic';
/** Read-only, exact selected date. A missing pair stays null, never zero. */
export async function GET(request:Request){
 const day=new URL(request.url).searchParams.get('date')??kstDayOf(new Date().toISOString());
 if(!isValidKstDay(day))return Response.json({status:'INVALID_SELECTION',data:null},{status:400,headers:{'cache-control':'no-store','x-robots-tag':'noindex'}});
 const month=day.slice(0,7);
 try{
  const data=await readGlanceWeekReference((await getDb()).$client,day);
  return Response.json({status:'READY',month,data},{headers:{'cache-control':'public, max-age=120, s-maxage=300','x-robots-tag':'noindex'}});
 }catch{return Response.json({status:'UNAVAILABLE',month,data:null},{status:503,headers:{'cache-control':'no-store','x-robots-tag':'noindex'}});}
}
