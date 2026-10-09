import {getDb} from '../../../../db';
import {publicAreaIds} from '../../../../lib/areas';
import {kstDayOf} from '../../../../lib/kst';
import {publicCommercialMonth,type CommercialMonth} from '../../../../lib/commercial-monthly';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const url=new URL(request.url),area=url.searchParams.get('area')??'myeongdong',month=url.searchParams.get('month')??kstDayOf(new Date().toISOString()).slice(0,7);
 if(!publicAreaIds.includes(area as typeof publicAreaIds[number])||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return Response.json({status:'INVALID_SELECTION'},{status:400});
 try{const db=(await getDb()).$client;
  const record=await db.prepare('SELECT payload,calculated_at AS calculatedAt FROM seoul_commercial_months WHERE area=? AND month=?').bind(area,month).first<{payload:string;calculatedAt:string}>();
  const months=(await db.prepare('SELECT month FROM seoul_commercial_months WHERE area=? ORDER BY month DESC LIMIT 24').bind(area).all<{month:string}>()).results??[];
  return Response.json({status:record?'READY':'MISSING',area,month,calculatedAt:record?.calculatedAt??null,months:months.map(row=>row.month),data:record?publicCommercialMonth(JSON.parse(record.payload) as CommercialMonth):null},
   {headers:{'cache-control':record?'public, max-age=60, s-maxage=300':'no-store','x-robots-tag':'noindex'}});
 }catch{return Response.json({status:'UNAVAILABLE',area,month,data:null,months:[]},{headers:{'cache-control':'no-store','x-robots-tag':'noindex'}});}
}
