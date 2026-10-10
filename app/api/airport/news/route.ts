import {getDb} from '../../../../db';
import {readOfficialNews} from '../../../../lib/airport-customs-news-store';
import {kstDayOf} from '../../../../lib/kst';
export const dynamic='force-dynamic';
export async function airportNewsResponse(db:Pick<D1Database,'prepare'>|null,now=new Date()){
 const today=kstDayOf(now.toISOString());let items:Awaited<ReturnType<typeof readOfficialNews>>=[],status='MISSING';
 try{if(db){items=await readOfficialNews(db,today);status=items.length?'STORED':'MISSING';}}catch{status='UNAVAILABLE';}
 return Response.json({status,today,items},{headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
}
/** Stored read only: never collect, migrate, access an upstream or write here. */
export async function GET(){try{return airportNewsResponse((await getDb()).$client);}catch{return Response.json({status:'UNAVAILABLE',today:kstDayOf(new Date().toISOString()),items:[]},{headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});}}
